import { verifyToken, resolveUser } from '../../../lib/auth-middleware.js';
import { logAudit, getClientIp } from '../../../lib/audit-logger.js';

/**
 * POST /api/auth/logout
 * Clears the httpOnly auth_token cookie and returns a JSON response.
 */
export async function POST(context) {
  const token = context.cookies.get('auth_token')?.value;
  if (token) {
    try {
      const payload = await verifyToken(token);
      if (payload) {
        const user = await resolveUser(payload);
        if (user) logAudit({ userId: user.id, action: 'logout', path: '/', ipAddress: getClientIp(context) });
      }
    } catch { /* best-effort */ }
  }

  context.cookies.delete('auth_token', { path: '/' });
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
