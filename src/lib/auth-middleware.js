import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from './config.js';
import { query } from './db.js';

/** Routes that skip authentication */
const PUBLIC_ROUTES = ['/api/health', '/auth/callback', '/api/auth/logout'];

/** Default quota for JIT-provisioned users: 10 GB */
const DEFAULT_QUOTA_BYTES = 10_737_418_240;

const USER_COLUMNS = 'id, email, display_name, is_admin, is_active, external_id';

/** Google JWKS endpoint for verifying ID tokens */
const GOOGLE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/oauth2/v3/certs')
);

/**
 * Verify a Google ID token (JWT signed with RS256).
 *
 * @param {string} token - raw JWT string (Google ID token)
 * @returns {Promise<object | null>} decoded payload or null if invalid
 */
export async function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;

  try {
    const { payload } = await jwtVerify(token, GOOGLE_JWKS, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: config.auth.googleClientId,
    });
    return payload;
  } catch {
    return null;
  }
}

/**
 * Resolve or provision a user from Google ID token payload (JIT provisioning).
 *
 * 1. Find by external_id (Google sub) → sync display_name
 * 2. Find by email (seed users) → link external_id + sync display_name
 * 3. Not found → create user with default quota
 *
 * @param {object} payload - decoded Google ID token payload
 * @returns {Promise<object | null>}
 */
export async function resolveUser(payload) {
  if (!payload.sub || !payload.email) return null;

  const displayName = payload.name || payload.email.split('@')[0];

  // 1. Find by external_id (Google sub)
  let result = await query(
    `SELECT ${USER_COLUMNS} FROM users WHERE external_id = $1 LIMIT 1`,
    [payload.sub]
  );

  if (result.rows.length) {
    const user = result.rows[0];
    if (displayName !== user.display_name) {
      await query(
        'UPDATE users SET display_name = $1, updated_at = NOW() WHERE id = $2',
        [displayName, user.id]
      );
      user.display_name = displayName;
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
    const wasPreRegistered = user.external_id == null || user.external_id === 'auth_admin';
    await query(
      'UPDATE users SET external_id = $1, display_name = $2, updated_at = NOW() WHERE id = $3',
      [payload.sub, displayName, user.id]
    );
    user.external_id = payload.sub;
    user.display_name = displayName;

    if (wasPreRegistered) {
      query(
        `INSERT INTO audit_log (user_id, action, path, details) VALUES ($1, $2, $3, $4)`,
        [user.id, 'google-linked', '/', JSON.stringify({ linked_sub: payload.sub })]
      ).catch(() => {});
    }

    return user.is_active ? user : null;
  }

  // 3. JIT provision: create new user (not admin by default)
  try {
    result = await query(
      `INSERT INTO users (external_id, email, display_name, is_admin) VALUES ($1, $2, $3, $4)
       RETURNING ${USER_COLUMNS}`,
      [payload.sub, payload.email, displayName, false]
    );
  } catch {
    result = await query(
      `SELECT ${USER_COLUMNS} FROM users WHERE external_id = $1 LIMIT 1`,
      [payload.sub]
    );
  }

  if (!result.rows.length) return null;

  const user = result.rows[0];

  await query(
    'INSERT INTO quotas (user_id, max_bytes) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING',
    [user.id, DEFAULT_QUOTA_BYTES]
  );

  return user.is_active ? user : null;
}

/**
 * Extract token from request (cookie or Authorization header).
 *
 * @param {object} context - Astro API context
 * @returns {string | null}
 */
function extractToken(context) {
  const authHeader = context.request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  const cookie = context.cookies.get('auth_token');
  if (cookie?.value) {
    return cookie.value;
  }

  return null;
}

/**
 * Build Google OAuth2 authorization URL.
 *
 * @param {string} redirectUri - callback URL
 * @param {string} state - original path to redirect after login
 * @returns {string}
 */
function buildGoogleAuthUrl(redirectUri, state) {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', config.auth.googleClientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'select_account');
  return url.toString();
}

/**
 * Astro middleware handler for authentication.
 *
 * @param {object} context - Astro middleware context
 * @param {Function} next - next middleware/handler
 * @returns {Promise<Response>}
 */
export async function authMiddleware(context, next) {
  const { pathname } = context.url;

  if (PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(route + '/'))) {
    return next();
  }

  // Dev bypass
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

  function getCallbackUrl() {
    const host = context.request.headers.get('host') || context.url.host;
    const proto = context.request.headers.get('x-forwarded-proto') || context.url.protocol.replace(':', '');
    return `${proto}://${host}/auth/callback`;
  }

  if (!token) {
    if (isApiRoute) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return context.redirect(buildGoogleAuthUrl(getCallbackUrl(), pathname));
  }

  const payload = await verifyToken(token);
  if (!payload) {
    if (isApiRoute) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return context.redirect(buildGoogleAuthUrl(getCallbackUrl(), pathname));
  }

  const user = await resolveUser(payload);
  if (!user) {
    if (isApiRoute) {
      return new Response(JSON.stringify({ error: 'User not found or inactive' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return context.redirect(buildGoogleAuthUrl(getCallbackUrl(), pathname));
  }

  context.locals.user = user;
  return next();
}
