import { config } from '../../../lib/config.js';
import { logAudit, getClientIp } from '../../../lib/audit-logger.js';

/**
 * POST /api/auth/revoke-all-sessions
 *
 * Revokes all sessions for the current user by calling the Auth&Sign
 * HTTP revocation endpoint, then clears the local auth cookie.
 */
export async function POST(context) {
  const token = context.cookies.get('auth_token')?.value;

  if (token) {
    const revokeUrl = new URL('/api/revoke-session', config.auth.url);
    try {
      await fetch(revokeUrl.toString(), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // best-effort: Auth&Sign may be unreachable
    }
  }

  // Audit: log logout_all (this route is protected, so locals.user is set)
  logAudit({ userId: context.locals.user?.id, action: 'logout_all', path: '/', ipAddress: getClientIp(context) });

  context.cookies.delete('auth_token', { path: '/' });
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
