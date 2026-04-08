import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../lib/auth-middleware.js', () => ({
  verifyToken: vi.fn().mockResolvedValue(null),
  resolveUser: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../../lib/audit-logger.js', () => ({
  logAudit: vi.fn(),
  getClientIp: vi.fn().mockReturnValue(null),
}));

const { POST } = await import('./logout.js');

describe('POST /api/auth/logout', () => {
  it('should delete auth_token cookie and return ok', async () => {
    const deleteCookie = vi.fn();
    const context = {
      cookies: { get: vi.fn().mockReturnValue(null), delete: deleteCookie },
    };

    const response = await POST(context);
    const body = await response.json();

    expect(deleteCookie).toHaveBeenCalledWith('auth_token', { path: '/' });
    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
  });

  it('should return JSON content type', async () => {
    const context = {
      cookies: { get: vi.fn().mockReturnValue(null), delete: vi.fn() },
    };

    const response = await POST(context);

    expect(response.headers.get('Content-Type')).toBe('application/json');
  });
});
