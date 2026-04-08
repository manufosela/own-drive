import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCheckPermission = vi.fn();
vi.mock('./permission-checker.js', () => ({
  checkPermission: mockCheckPermission,
}));

const { requirePermission } = await import('./permission-middleware.js');

describe('permission-middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Helper to create a mock Astro API context.
   * @param {object} [overrides]
   */
  function createContext(overrides = {}) {
    return {
      locals: {
        user: { id: 10, is_admin: false },
        ...overrides.locals,
      },
      params: overrides.params || {},
      url: new URL(overrides.url || 'http://localhost/api/files/datosnas/stls'),
      ...overrides,
    };
  }

  it('should return 401 when no user in context', async () => {
    const ctx = createContext({ locals: { user: null } });
    const result = await requirePermission(ctx, '/datosnas/stls', 'r');
    expect(result.granted).toBe(false);
    expect(result.status).toBe(401);
  });

  it('should delegate to checkPermission and return granted=true', async () => {
    mockCheckPermission.mockResolvedValueOnce({
      granted: true,
      role: 'owner',
      reason: 'Owner has required flags',
    });

    const ctx = createContext();
    const result = await requirePermission(ctx, '/datosnas/stls', 'r');
    expect(result.granted).toBe(true);
    expect(result.role).toBe('owner');
    expect(mockCheckPermission).toHaveBeenCalledWith(
      { id: 10, is_admin: false },
      '/datosnas/stls',
      'r'
    );
  });

  it('should return 403 when permission denied', async () => {
    mockCheckPermission.mockResolvedValueOnce({
      granted: false,
      role: 'others',
      reason: 'Others lacks required flags',
    });

    const ctx = createContext();
    const result = await requirePermission(ctx, '/datosnas/restricted', 'w');
    expect(result.granted).toBe(false);
    expect(result.status).toBe(403);
  });

  it('should return 500 on unexpected errors', async () => {
    mockCheckPermission.mockRejectedValueOnce(new Error('DB down'));

    const ctx = createContext();
    const result = await requirePermission(ctx, '/datosnas/stls', 'r');
    expect(result.granted).toBe(false);
    expect(result.status).toBe(500);
  });

  it('should pass admin user directly through checkPermission', async () => {
    mockCheckPermission.mockResolvedValueOnce({
      granted: true,
      role: 'admin',
      reason: 'User is admin',
    });

    const ctx = createContext({
      locals: { user: { id: 1, is_admin: true } },
    });
    const result = await requirePermission(ctx, '/datosnas/anything', 'rwxd');
    expect(result.granted).toBe(true);
    expect(mockCheckPermission).toHaveBeenCalledWith(
      { id: 1, is_admin: true },
      '/datosnas/anything',
      'rwxd'
    );
  });
});
