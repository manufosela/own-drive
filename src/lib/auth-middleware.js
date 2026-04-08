import { GeniovaAuthServer } from '@geniova/auth/server';
import { config } from './config.js';
import { query } from './db.js';

/** Routes that skip authentication */
const PUBLIC_ROUTES = ['/api/health', '/auth/callback', '/api/auth/logout'];

/** Default quota for JIT-provisioned users: 10 GB */
const DEFAULT_QUOTA_BYTES = 10_737_418_240;

const USER_COLUMNS = 'id, email, display_name, is_admin, is_active, external_id';

/** @type {GeniovaAuthServer | null} */
let authServer = null;

/**
 * Get or create the GeniovaAuthServer instance.
 * @returns {GeniovaAuthServer}
 */
function getAuthServer() {
  if (!authServer) {
    const jwksUrl = new URL('/.well-known/jwks.json', config.auth.url).toString();
    authServer = GeniovaAuthServer.init({
      appId: config.auth.appId,
      jwksUrl,
    });
  }
  return authServer;
}

/**
 * Verify a JWT token signed with RS256 by Auth&Sign.
 *
 * @param {string} token - raw JWT string
 * @returns {Promise<object | null>} decoded payload or null if invalid
 */
export async function verifyToken(token) {
  const server = getAuthServer();
  return server.verifyToken(token);
}

/**
 * Resolve or provision a user from JWT payload (JIT provisioning).
 *
 * 1. Find by external_id (Firebase UID) → sync display_name + is_admin
 * 2. Find by email (seed users) → link external_id + sync display_name + is_admin
 * 3. Not found → create user with is_admin from roles + default quota
 *
 * @param {object} payload - decoded JWT payload from Auth&Sign session
 * @returns {Promise<object | null>}
 */
export async function resolveUser(payload) {
  if (!payload.uid || !payload.email) return null;

  const roles = payload.roles ?? [];
  const displayName = payload.displayName || payload.email.split('@')[0];
  const isAdmin = roles.includes('admin');

  // 1. Find by external_id (Firebase UID)
  let result = await query(
    `SELECT ${USER_COLUMNS} FROM users WHERE external_id = $1 LIMIT 1`,
    [payload.uid]
  );

  if (result.rows.length) {
    const user = result.rows[0];
    if (displayName !== user.display_name || isAdmin !== user.is_admin) {
      await query(
        'UPDATE users SET display_name = $1, is_admin = $2, updated_at = NOW() WHERE id = $3',
        [displayName, isAdmin, user.id]
      );
      user.display_name = displayName;
      user.is_admin = isAdmin;
    }
    return user.is_active ? user : null;
  }

  // 2. Find by email (handles seed users and pre-registered users)
  result = await query(
    `SELECT ${USER_COLUMNS} FROM users WHERE email = $1 LIMIT 1`,
    [payload.email]
  );

  if (result.rows.length) {
    const user = result.rows[0];
    const wasPreRegistered = user.external_id == null;
    await query(
      'UPDATE users SET external_id = $1, display_name = $2, is_admin = $3, updated_at = NOW() WHERE id = $4',
      [payload.uid, displayName, isAdmin, user.id]
    );
    user.external_id = payload.uid;
    user.display_name = displayName;
    user.is_admin = isAdmin;

    // Audit log when linking a pre-registered user (groups are preserved)
    if (wasPreRegistered) {
      query(
        `INSERT INTO audit_log (user_id, action, path, details) VALUES ($1, $2, $3, $4)`,
        [user.id, 'pre-register-linked', '/', JSON.stringify({ linked_uid: payload.uid })]
      ).catch(() => {});
    }

    return user.is_active ? user : null;
  }

  // 3. JIT provision: create new user
  try {
    result = await query(
      `INSERT INTO users (external_id, email, display_name, is_admin) VALUES ($1, $2, $3, $4)
       RETURNING ${USER_COLUMNS}`,
      [payload.uid, payload.email, displayName, isAdmin]
    );
  } catch {
    // Race condition: user created between SELECT and INSERT
    result = await query(
      `SELECT ${USER_COLUMNS} FROM users WHERE external_id = $1 LIMIT 1`,
      [payload.uid]
    );
  }

  if (!result.rows.length) return null;

  const user = result.rows[0];

  // Ensure default quota exists
  await query(
    'INSERT INTO quotas (user_id, max_bytes) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING',
    [user.id, DEFAULT_QUOTA_BYTES]
  );

  return user.is_active ? user : null;
}

/**
 * Extract JWT token from request.
 * Checks Authorization header first, then auth_token cookie.
 *
 * @param {object} context - Astro API context
 * @returns {string | null}
 */
function extractToken(context) {
  // Authorization: Bearer <token>
  const authHeader = context.request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Cookie: auth_token=<token>
  const cookie = context.cookies.get('auth_token');
  if (cookie?.value) {
    return cookie.value;
  }

  return null;
}

/**
 * Astro middleware handler for authentication.
 * - Public routes are allowed through
 * - API routes return 401 JSON response if not authenticated
 * - Page routes redirect to Auth&Sign login
 *
 * @param {object} context - Astro middleware context
 * @param {Function} next - next middleware/handler
 * @returns {Promise<Response>}
 */
export async function authMiddleware(context, next) {
  const { pathname } = context.url;

  // Skip auth for public routes
  if (PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(route + '/'))) {
    return next();
  }

  // Dev bypass: inject first admin user without token
  if (process.env.DEV_BYPASS_AUTH === 'true') {
    const devUser = await query(
      `SELECT ${USER_COLUMNS} FROM users WHERE is_admin = true LIMIT 1`,
    );
    if (devUser.rows.length > 0) {
      context.locals.user = devUser.rows[0];
      return next();
    }
  }

  const isApiRoute = pathname.startsWith('/api/');
  const token = extractToken(context);

  /**
   * Build the Auth&Sign authorize redirect URL.
   * Derives the origin from the request Host header so the callback URL
   * matches the hostname/IP the user is actually accessing from.
   * @param {string} pathname - the path the user was trying to access
   */
  function buildAuthRedirect(pathname) {
    const host = context.request.headers.get('host') || context.url.host;
    const proto = context.request.headers.get('x-forwarded-proto') || context.url.protocol.replace(':', '');
    const origin = `${proto}://${host}`;
    const callbackUrl = new URL('/auth/callback', origin).toString();
    const stateUrl = new URL(pathname, origin).toString();
    const authorizeUrl = new URL('/authorize', config.auth.url);
    authorizeUrl.searchParams.set('redirect_uri', callbackUrl);
    authorizeUrl.searchParams.set('client_id', config.auth.appId);
    authorizeUrl.searchParams.set('state', stateUrl);
    return authorizeUrl.toString();
  }

  if (!token) {
    if (isApiRoute) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return context.redirect(buildAuthRedirect(pathname));
  }

  const payload = await verifyToken(token);
  if (!payload) {
    if (isApiRoute) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return context.redirect(buildAuthRedirect(pathname));
  }

  const user = await resolveUser(payload);
  if (!user) {
    if (isApiRoute) {
      return new Response(JSON.stringify({ error: 'User not found or inactive' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return context.redirect(buildAuthRedirect(pathname));
  }

  context.locals.user = user;
  return next();
}
