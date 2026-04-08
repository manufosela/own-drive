import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock db module
const mockQuery = vi.fn();
vi.mock('./db.js', () => ({
  query: mockQuery,
}));

// Mock config module
vi.mock('./config.js', () => ({
  config: {
    auth: {
      googleClientId: 'test-client-id.apps.googleusercontent.com',
      googleClientSecret: 'test-client-secret',
    },
  },
}));

// Mock jose
const mockJwtVerify = vi.fn();
vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => 'mock-jwks'),
  jwtVerify: (...args) => mockJwtVerify(...args),
}));

const { verifyToken, resolveUser, authMiddleware } = await import('./auth-middleware.js');

describe('auth-middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ========================================
  // verifyToken: validate Google ID token
  // ========================================
  describe('verifyToken', () => {
    it('should return payload for a valid Google ID token', async () => {
      const expectedPayload = {
        sub: 'google-uid-123',
        email: 'user@gmail.com',
        name: 'Test User',
      };
      mockJwtVerify.mockResolvedValueOnce({ payload: expectedPayload });

      const payload = await verifyToken('valid.jwt.token');
      expect(payload).toEqual(expectedPayload);
      expect(mockJwtVerify).toHaveBeenCalledWith(
        'valid.jwt.token',
        'mock-jwks',
        {
          issuer: ['https://accounts.google.com', 'accounts.google.com'],
          audience: 'test-client-id.apps.googleusercontent.com',
        }
      );
    });

    it('should return null when token is expired', async () => {
      mockJwtVerify.mockRejectedValueOnce(new Error('token expired'));

      const payload = await verifyToken('expired.jwt.token');
      expect(payload).toBeNull();
    });

    it('should return null for invalid signature', async () => {
      mockJwtVerify.mockRejectedValueOnce(new Error('invalid signature'));

      const payload = await verifyToken('bad-signature.jwt.token');
      expect(payload).toBeNull();
    });

    it('should return null for empty or malformed token', async () => {
      expect(await verifyToken('')).toBeNull();
      expect(await verifyToken(null)).toBeNull();
    });
  });

  // ========================================
  // resolveUser: look up user in DB from Google payload
  // ========================================
  describe('resolveUser', () => {
    it('should return null when sub and email are missing', async () => {
      expect(await resolveUser({})).toBeNull();
      expect(await resolveUser({ sub: 'abc' })).toBeNull();
      expect(await resolveUser({ email: 'a@b.com' })).toBeNull();
    });

    it('should find user by external_id and sync display_name', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 3, email: 'user@gmail.com', display_name: 'Old Name',
          is_admin: false, is_active: true, external_id: 'google-sub-3',
        }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const user = await resolveUser({ sub: 'google-sub-3', email: 'user@gmail.com', name: 'New Name' });
      expect(user).toBeDefined();
      expect(user.display_name).toBe('New Name');
      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(mockQuery.mock.calls[1][0]).toContain('UPDATE');
    });

    it('should skip update when display_name unchanged', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 3, email: 'user@gmail.com', display_name: 'Same Name',
          is_admin: false, is_active: true, external_id: 'google-sub-3',
        }],
      });

      const user = await resolveUser({ sub: 'google-sub-3', email: 'user@gmail.com', name: 'Same Name' });
      expect(user).toBeDefined();
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should return null for inactive user found by external_id', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 5, email: 'disabled@gmail.com', display_name: 'Disabled',
          is_admin: false, is_active: false, external_id: 'google-sub-5',
        }],
      });

      const user = await resolveUser({ sub: 'google-sub-5', email: 'disabled@gmail.com' });
      expect(user).toBeNull();
    });

    it('should find by email and link external_id (seed user scenario)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 1, email: 'mjfosela@gmail.com', display_name: 'Mánu Fosela',
          is_admin: true, is_active: true, external_id: 'auth_admin',
        }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // audit log for google-linked
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const user = await resolveUser({ sub: 'real-google-sub', email: 'mjfosela@gmail.com', name: 'Mánu Fosela' });
      expect(user).toBeDefined();
      expect(user.external_id).toBe('real-google-sub');
      expect(mockQuery).toHaveBeenCalledTimes(4);
      expect(mockQuery.mock.calls[2][1]).toEqual(['real-google-sub', 'Mánu Fosela', 1]);
    });

    it('should JIT provision new user when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 10, email: 'new@gmail.com', display_name: 'New User',
          is_admin: false, is_active: true, external_id: 'new-sub',
        }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const user = await resolveUser({ sub: 'new-sub', email: 'new@gmail.com', name: 'New User' });
      expect(user).toBeDefined();
      expect(user.id).toBe(10);
      expect(user.is_admin).toBe(false);
      expect(mockQuery.mock.calls[2][0]).toContain('INSERT INTO users');
      expect(mockQuery.mock.calls[2][1]).toEqual(['new-sub', 'new@gmail.com', 'New User', false]);
      expect(mockQuery.mock.calls[3][0]).toContain('INSERT INTO quotas');
    });

    it('should use email prefix as displayName when name not provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 11, email: 'john@gmail.com', display_name: 'john',
          is_admin: false, is_active: true, external_id: 'sub-11',
        }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const user = await resolveUser({ sub: 'sub-11', email: 'john@gmail.com' });
      expect(user).toBeDefined();
      expect(mockQuery.mock.calls[2][1]).toEqual(['sub-11', 'john@gmail.com', 'john', false]);
    });

    it('should log audit event when linking pre-registered user', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 20, email: 'preregistered@gmail.com', display_name: 'preregistered',
          is_admin: false, is_active: true, external_id: null,
        }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await resolveUser({
        sub: 'real-sub-20', email: 'preregistered@gmail.com', name: 'Pre Registered',
      });

      expect(mockQuery.mock.calls[3][0]).toContain('INSERT INTO audit_log');
      expect(mockQuery.mock.calls[3][1]).toContain('google-linked');
    });

    it('should handle race condition on INSERT gracefully', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockRejectedValueOnce(new Error('unique_violation'));
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 10, email: 'race@gmail.com', display_name: 'Race User',
          is_admin: false, is_active: true, external_id: 'race-sub',
        }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const user = await resolveUser({ sub: 'race-sub', email: 'race@gmail.com', name: 'Race User' });
      expect(user).toBeDefined();
      expect(user.id).toBe(10);
    });
  });

  // ========================================
  // authMiddleware: Astro middleware handler
  // ========================================
  describe('authMiddleware', () => {
    function createMockContext(overrides = {}) {
      const url = new URL(overrides.url || 'http://localhost:3000/api/files');
      return {
        url,
        request: {
          headers: new Map(Object.entries(overrides.headers || {})),
        },
        cookies: {
          get: vi.fn((name) => {
            const cookies = overrides.cookies || {};
            return cookies[name] ? { value: cookies[name] } : undefined;
          }),
        },
        locals: {},
        redirect: vi.fn((location) => ({
          status: 302,
          headers: { location },
        })),
        ...overrides.extra,
      };
    }

    const mockNext = vi.fn(() => new Response('OK'));

    it('should allow access to public routes (health check)', async () => {
      const ctx = createMockContext({
        url: 'http://localhost:3000/api/health',
      });

      await authMiddleware(ctx, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should extract token from Authorization header', async () => {
      const googlePayload = { sub: 'uid-10', email: 'user@gmail.com', name: 'Test User' };
      mockJwtVerify.mockResolvedValueOnce({ payload: googlePayload });
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 10, email: 'user@gmail.com', display_name: 'Test User',
          is_admin: false, is_active: true, external_id: 'uid-10',
        }],
      });

      const ctx = createMockContext({
        headers: { authorization: 'Bearer valid-jwt-token' },
      });

      await authMiddleware(ctx, mockNext);
      expect(ctx.locals.user).toBeDefined();
      expect(ctx.locals.user.email).toBe('user@gmail.com');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should extract token from auth_token cookie', async () => {
      const googlePayload = { sub: 'uid-10', email: 'user@gmail.com', name: 'Test User' };
      mockJwtVerify.mockResolvedValueOnce({ payload: googlePayload });
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 10, email: 'user@gmail.com', display_name: 'Test User',
          is_admin: false, is_active: true, external_id: 'uid-10',
        }],
      });

      const ctx = createMockContext({
        cookies: { auth_token: 'valid-jwt-token' },
      });

      await authMiddleware(ctx, mockNext);
      expect(ctx.locals.user).toBeDefined();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 401 for API routes without token', async () => {
      const ctx = createMockContext({
        url: 'http://localhost:3000/api/files',
      });

      const response = await authMiddleware(ctx, mockNext);
      expect(response.status).toBe(401);
    });

    it('should return 401 for API routes with invalid token', async () => {
      mockJwtVerify.mockRejectedValueOnce(new Error('invalid'));

      const ctx = createMockContext({
        url: 'http://localhost:3000/api/files',
        headers: { authorization: 'Bearer invalid-token' },
      });

      const response = await authMiddleware(ctx, mockNext);
      expect(response.status).toBe(401);
    });

    it('should redirect pages to Google OAuth when no token', async () => {
      const ctx = createMockContext({
        url: 'http://localhost:3000/',
      });

      await authMiddleware(ctx, mockNext);
      expect(ctx.redirect).toHaveBeenCalled();
      const redirectUrl = ctx.redirect.mock.calls[0][0];
      expect(redirectUrl).toContain('accounts.google.com/o/oauth2/v2/auth');
      expect(redirectUrl).toContain('client_id=test-client-id.apps.googleusercontent.com');
      expect(redirectUrl).toContain('redirect_uri=');
    });

    it('should use request origin for redirect_uri', async () => {
      const ctx = createMockContext({
        url: 'http://localhost:3000/dashboard',
      });

      await authMiddleware(ctx, mockNext);
      expect(ctx.redirect).toHaveBeenCalled();
      const redirectUrl = new URL(ctx.redirect.mock.calls[0][0]);
      const state = redirectUrl.searchParams.get('state');
      const redirectUri = redirectUrl.searchParams.get('redirect_uri');
      expect(state).toBe('/dashboard');
      expect(redirectUri).toBe('http://localhost:3000/auth/callback');
    });

    it('should return 401 for API when user not found in DB', async () => {
      const googlePayload = { sub: 'ghost-sub', email: 'ghost@gmail.com', name: 'Ghost' };
      mockJwtVerify.mockResolvedValueOnce({ payload: googlePayload });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockRejectedValueOnce(new Error('unique_violation'));
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const ctx = createMockContext({
        url: 'http://localhost:3000/api/files',
        headers: { authorization: 'Bearer valid-token' },
      });

      const response = await authMiddleware(ctx, mockNext);
      expect(response.status).toBe(401);
    });

    it('should redirect page when token is invalid (not API)', async () => {
      mockJwtVerify.mockRejectedValueOnce(new Error('invalid'));

      const ctx = createMockContext({
        url: 'http://localhost:3000/dashboard',
        headers: { authorization: 'Bearer invalid-token' },
      });

      await authMiddleware(ctx, mockNext);
      expect(ctx.redirect).toHaveBeenCalled();
      const redirectUrl = ctx.redirect.mock.calls[0][0];
      expect(redirectUrl).toContain('accounts.google.com');
    });

    it('should allow access to /auth/callback without token', async () => {
      const ctx = createMockContext({
        url: 'http://localhost:3000/auth/callback?code=abc',
      });

      await authMiddleware(ctx, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });
  });
});
