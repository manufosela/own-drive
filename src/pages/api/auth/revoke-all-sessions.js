import { logAudit, getClientIp } from '../../../lib/audit-logger.js';

/**
 * POST /api/auth/revoke-all-sessions
 *
 * Revokes the Google token and clears the local auth cookie.
 */
export async function POST(context) {
  const token = context.cookies.get('auth_token')?.value;

  if (token) {
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
    } catch {
      // best-effort: Google may be unreachable
    }
  }

  logAudit({ userId: context.locals.user?.id, action: 'logout_all', path: '/', ipAddress: getClientIp(context) });

  context.cookies.delete('auth_token', { path: '/' });
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
