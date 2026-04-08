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
      url: 'https://auth.geniova.com',
      appId: 'geniova-drive',
    },
    app: {
      publicUrl: 'http://192.168.63.124:3000',
    },
  },
}));

// Mock @geniova/auth/server
const mockVerifyToken = vi.fn();
vi.mock('@geniova/auth/server', () => ({
  GeniovaAuthServer: {
    init: vi.fn(() => ({
      verifyToken: (...args) => mockVerifyToken(...args),
    })),
  },
}));

const { verifyToken, resolveUser, authMiddleware } = await import('./auth-middleware.js');

describe('auth-middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ========================================
  // verifyToken: validate JWT signature and expiry
  // ========================================
  describe('verifyToken', () => {
    it('should return payload for a valid token', async () => {
      const expectedPayload = {
        uid: 'firebase-uid-123',
        email: 'user@geniova.com',
        roles: ['user'],
        appId: 'geniova-drive',
      };
      mockVerifyToken.mockResolvedValueOnce(expectedPayload);

      const payload = await verifyToken('valid.jwt.token');
      expect(payload).toEqual(expectedPayload);
      expect(mockVerifyToken).toHaveBeenCalledWith('valid.jwt.token');
    });

    it('should return null when token is expired', async () => {
      mockVerifyToken.mockResolvedValueOnce(null);

      const payload = await verifyToken('expired.jwt.token');
      expect(payload).toBeNull();
    });

    it('should return null for invalid signature', async () => {
      mockVerifyToken.mockResolvedValueOnce(null);

      const payload = await verifyToken('bad-signature.jwt.token');
      expect(payload).toBeNull();
    });

    it('should return null for empty or malformed token', async () => {
      mockVerifyToken.mockResolvedValueOnce(null);
      expect(await verifyToken('')).toBeNull();

      mockVerifyToken.mockResolvedValueOnce(null);
      expect(await verifyToken('onlyonepart')).toBeNull();
    });
  });

  // ========================================
  // resolveUser: look up user in DB from JWT payload
  // ========================================
  describe('resolveUser', () => {
    it('should return null when uid and email are missing', async () => {
      expect(await resolveUser({})).toBeNull();
      expect(await resolveUser({ uid: 'abc' })).toBeNull();
      expect(await resolveUser({ email: 'a@b.com' })).toBeNull();
    });

    it('should find user by external_id and sync display_name', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 3, email: 'ext@geniova.com', display_name: 'Old Name',
          is_admin: false, is_active: true, external_id: 'uid-3',
        }],
      });
      // UPDATE for display_name sync
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const user = await resolveUser({ uid: 'uid-3', email: 'ext@geniova.com', displayName: 'New Name', roles: ['user'] });
      expect(user).toBeDefined();
      expect(user.display_name).toBe('New Name');
      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(mockQuery.mock.calls[1][0]).toContain('UPDATE');
    });

    it('should skip update when display_name and is_admin unchanged', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 3, email: 'ext@geniova.com', display_name: 'Same Name',
          is_admin: false, is_active: true, external_id: 'uid-3',
        }],
      });

      const user = await resolveUser({ uid: 'uid-3', email: 'ext@geniova.com', displayName: 'Same Name', roles: ['user'] });
      expect(user).toBeDefined();
      expect(mockQuery).toHaveBeenCalledTimes(1); // No UPDATE
    });

    it('should sync is_admin=true when roles include admin', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 3, email: 'ext@geniova.com', display_name: 'Same Name',
          is_admin: false, is_active: true, external_id: 'uid-3',
        }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const user = await resolveUser({ uid: 'uid-3', email: 'ext@geniova.com', displayName: 'Same Name', roles: ['user', 'admin'] });
      expect(user.is_admin).toBe(true);
      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(mockQuery.mock.calls[1][1]).toEqual(['Same Name', true, 3]);
    });

    it('should sync is_admin=false when roles do not include admin', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 3, email: 'ext@geniova.com', display_name: 'Admin User',
          is_admin: true, is_active: true, external_id: 'uid-3',
        }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const user = await resolveUser({ uid: 'uid-3', email: 'ext@geniova.com', displayName: 'Admin User', roles: ['user'] });
      expect(user.is_admin).toBe(false);
      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(mockQuery.mock.calls[1][1]).toEqual(['Admin User', false, 3]);
    });

    it('should return null for inactive user found by external_id', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 5, email: 'disabled@geniova.com', display_name: 'Disabled',
          is_admin: false, is_active: false, external_id: 'uid-5',
        }],
      });

      const user = await resolveUser({ uid: 'uid-5', email: 'disabled@geniova.com' });
      expect(user).toBeNull();
    });

    it('should find by email and link external_id (seed user scenario)', async () => {
      // Not found by external_id
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Found by email
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 1, email: 'mfosela@geniova.com', display_name: 'Mánu Fosela',
          is_admin: true, is_active: true, external_id: 'auth_admin',
        }],
      });
      // UPDATE to link external_id + sync is_admin
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const user = await resolveUser({ uid: 'real-firebase-uid', email: 'mfosela@geniova.com', displayName: 'Mánu Fosela', roles: ['admin', 'user'] });
      expect(user).toBeDefined();
      expect(user.external_id).toBe('real-firebase-uid');
      expect(user.is_admin).toBe(true);
      expect(mockQuery).toHaveBeenCalledTimes(3);
      expect(mockQuery.mock.calls[2][1]).toEqual(['real-firebase-uid', 'Mánu Fosela', true, 1]);
    });

    it('should JIT provision new user when not found', async () => {
      // Not found by external_id
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Not found by email
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // INSERT new user
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 10, email: 'new@geniova.com', display_name: 'New User',
          is_admin: false, is_active: true, external_id: 'new-uid',
        }],
      });
      // INSERT quota
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const user = await resolveUser({ uid: 'new-uid', email: 'new@geniova.com', displayName: 'New User', roles: ['user'] });
      expect(user).toBeDefined();
      expect(user.id).toBe(10);
      expect(user.is_admin).toBe(false);
      // Verify INSERT includes is_admin
      expect(mockQuery.mock.calls[2][0]).toContain('INSERT INTO users');
      expect(mockQuery.mock.calls[2][1]).toEqual(['new-uid', 'new@geniova.com', 'New User', false]);
      // Verify quota was created
      expect(mockQuery.mock.calls[3][0]).toContain('INSERT INTO quotas');
    });

    it('should JIT provision admin user from roles', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 12, email: 'admin@geniova.com', display_name: 'New Admin',
          is_admin: true, is_active: true, external_id: 'admin-uid',
        }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const user = await resolveUser({ uid: 'admin-uid', email: 'admin@geniova.com', displayName: 'New Admin', roles: ['user', 'admin'] });
      expect(user.is_admin).toBe(true);
      expect(mockQuery.mock.calls[2][1]).toEqual(['admin-uid', 'admin@geniova.com', 'New Admin', true]);
    });

    it('should use email prefix as displayName when not provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 11, email: 'john@geniova.com', display_name: 'john',
          is_admin: false, is_active: true, external_id: 'uid-11',
        }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const user = await resolveUser({ uid: 'uid-11', email: 'john@geniova.com', roles: ['user'] });
      expect(user).toBeDefined();
      expect(mockQuery.mock.calls[2][1]).toEqual(['uid-11', 'john@geniova.com', 'john', false]);
    });

    it('should default is_admin to false when roles is missing', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 3, email: 'ext@geniova.com', display_name: 'User',
          is_admin: true, is_active: true, external_id: 'uid-3',
        }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const user = await resolveUser({ uid: 'uid-3', email: 'ext@geniova.com', displayName: 'User' });
      expect(user.is_admin).toBe(false);
    });

    it('should preserve pre-assigned groups when linking pre-registered user by email', async () => {
      // Not found by external_id
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Found by email (pre-registered: external_id IS NULL)
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 20, email: 'preregistered@geniova.com', display_name: 'preregistered',
          is_admin: false, is_active: true, external_id: null,
        }],
      });
      // UPDATE to link external_id + sync fields
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Audit log insert (pre-register-linked)
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const user = await resolveUser({
        uid: 'real-uid-20', email: 'preregistered@geniova.com',
        displayName: 'Pre Registered User', roles: ['user'],
      });

      expect(user).toBeDefined();
      expect(user.external_id).toBe('real-uid-20');
      expect(user.display_name).toBe('Pre Registered User');

      // Verify the UPDATE does NOT touch user_groups
      const updateCall = mockQuery.mock.calls[2];
      expect(updateCall[0]).toContain('UPDATE users SET');
      expect(updateCall[0]).not.toContain('user_groups');
      expect(updateCall[0]).not.toContain('DELETE');
    });

    it('should log audit event when linking pre-registered user', async () => {
      // Not found by external_id
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Found by email (pre-registered: external_id IS NULL)
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 20, email: 'preregistered@geniova.com', display_name: 'preregistered',
          is_admin: false, is_active: true, external_id: null,
        }],
      });
      // UPDATE to link external_id
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Audit log insert
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await resolveUser({
        uid: 'real-uid-20', email: 'preregistered@geniova.com',
        displayName: 'Pre Registered', roles: ['user'],
      });

      // The 4th call should be audit log
      expect(mockQuery.mock.calls[3][0]).toContain('INSERT INTO audit_log');
      expect(mockQuery.mock.calls[3][1]).toContain('pre-register-linked');
    });

    it('should handle race condition on INSERT gracefully', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Not found by uid
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Not found by email
      mockQuery.mockRejectedValueOnce(new Error('unique_violation')); // INSERT fails
      // Re-SELECT after race condition
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 10, email: 'race@geniova.com', display_name: 'Race User',
          is_admin: false, is_active: true, external_id: 'race-uid',
        }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Quota

      const user = await resolveUser({ uid: 'race-uid', email: 'race@geniova.com', displayName: 'Race User' });
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
      mockVerifyToken.mockResolvedValueOnce(
        { uid: 'uid-10', email: 'user@geniova.com', roles: ['user'] },
      );
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 10,
          email: 'user@geniova.com',
          display_name: 'Test User',
          is_admin: false,
          is_active: true,
        }],
      });

      const ctx = createMockContext({
        headers: { authorization: 'Bearer valid-jwt-token' },
      });

      await authMiddleware(ctx, mockNext);
      expect(ctx.locals.user).toBeDefined();
      expect(ctx.locals.user.email).toBe('user@geniova.com');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should extract token from auth_token cookie', async () => {
      mockVerifyToken.mockResolvedValueOnce(
        { uid: 'uid-10', email: 'user@geniova.com', roles: ['user'] },
      );
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 10,
          email: 'user@geniova.com',
          display_name: 'Test User',
          is_admin: false,
          is_active: true,
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
      mockVerifyToken.mockResolvedValueOnce(null);

      const ctx = createMockContext({
        url: 'http://localhost:3000/api/files',
        headers: { authorization: 'Bearer invalid-token' },
      });

      const response = await authMiddleware(ctx, mockNext);
      expect(response.status).toBe(401);
    });

    it('should redirect pages to Auth&Sign authorize when no token', async () => {
      const ctx = createMockContext({
        url: 'http://localhost:3000/',
      });

      await authMiddleware(ctx, mockNext);
      expect(ctx.redirect).toHaveBeenCalled();
      const redirectUrl = ctx.redirect.mock.calls[0][0];
      expect(redirectUrl).toContain('auth.geniova.com/authorize');
      expect(redirectUrl).toContain('client_id=geniova-drive');
      expect(redirectUrl).toContain('redirect_uri=');
    });

    it('should use request origin (not hardcoded publicUrl) for state and redirect_uri', async () => {
      const ctx = createMockContext({
        url: 'http://localhost:3000/dashboard',
      });

      await authMiddleware(ctx, mockNext);
      expect(ctx.redirect).toHaveBeenCalled();
      const redirectUrl = new URL(ctx.redirect.mock.calls[0][0]);
      const state = redirectUrl.searchParams.get('state');
      const redirectUri = redirectUrl.searchParams.get('redirect_uri');
      // state and redirect_uri must use the actual request origin
      expect(state).toBe('http://localhost:3000/dashboard');
      expect(redirectUri).toBe('http://localhost:3000/auth/callback');
    });

    it('should return 401 for API when user not found in DB', async () => {
      mockVerifyToken.mockResolvedValueOnce(
        { uid: 'ghost-uid', email: 'ghost@geniova.com' },
      );
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Not found by external_id
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Not found by email
      mockQuery.mockRejectedValueOnce(new Error('unique_violation')); // INSERT fails
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Re-SELECT also empty

      const ctx = createMockContext({
        url: 'http://localhost:3000/api/files',
        headers: { authorization: 'Bearer valid-token' },
      });

      const response = await authMiddleware(ctx, mockNext);
      expect(response.status).toBe(401);
    });

    it('should redirect page when token is invalid (not API)', async () => {
      mockVerifyToken.mockResolvedValueOnce(null);

      const ctx = createMockContext({
        url: 'http://localhost:3000/dashboard',
        headers: { authorization: 'Bearer invalid-token' },
      });

      await authMiddleware(ctx, mockNext);
      expect(ctx.redirect).toHaveBeenCalled();
      const redirectUrl = ctx.redirect.mock.calls[0][0];
      expect(redirectUrl).toContain('auth.geniova.com/authorize');
    });

    it('should redirect page when user not found in DB (not API)', async () => {
      mockVerifyToken.mockResolvedValueOnce(
        { uid: 'ghost-uid', email: 'ghost@geniova.com' },
      );
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Not found by external_id
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Not found by email
      mockQuery.mockRejectedValueOnce(new Error('unique_violation')); // INSERT fails
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Re-SELECT also empty

      const ctx = createMockContext({
        url: 'http://localhost:3000/dashboard',
        headers: { authorization: 'Bearer valid-token' },
      });

      await authMiddleware(ctx, mockNext);
      expect(ctx.redirect).toHaveBeenCalled();
      const redirectUrl = ctx.redirect.mock.calls[0][0];
      expect(redirectUrl).toContain('auth.geniova.com/authorize');
    });

    it('should allow access to /auth/callback without token', async () => {
      const ctx = createMockContext({
        url: 'http://localhost:3000/auth/callback?token=abc',
      });

      await authMiddleware(ctx, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });
  });
});
