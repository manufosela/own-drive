import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock db module
const mockQuery = vi.fn();
vi.mock('./db.js', () => ({
  query: mockQuery,
}));

// Import after mock
const { resolveAliasPermissions, checkPermission, hasPermission } = await import('./permission-checker.js');

describe('permission-checker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ========================================
  // resolveAliasPermissions
  // ========================================
  describe('resolveAliasPermissions', () => {
    const user = { id: 10, is_admin: false };

    it('should return null when no alias matches the path', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await resolveAliasPermissions(user, '/datosnas/unknown');
      expect(result).toBeNull();
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should return merged permissions from all user groups', async () => {
      // Alias match
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 5, alias_name: 'STLs', real_path: '/datosnas/stls' }],
      });
      // Merged group permissions
      mockQuery.mockResolvedValueOnce({
        rows: [{ can_read: true, can_write: true, can_delete: false, can_move: false }],
      });

      const result = await resolveAliasPermissions(user, '/datosnas/stls');
      expect(result).toEqual({
        can_read: true,
        can_write: true,
        can_delete: false,
        can_move: false,
        alias_id: 5,
        alias_name: 'STLs',
      });
    });

    it('should match alias for subpath (child of alias real_path)', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 5, alias_name: 'STLs', real_path: '/datosnas/stls' }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ can_read: true, can_write: false, can_delete: false, can_move: false }],
      });

      const result = await resolveAliasPermissions(user, '/datosnas/stls/2026/feb/model.stl');
      expect(result).not.toBeNull();
      expect(result.alias_name).toBe('STLs');
      expect(result.can_read).toBe(true);
    });

    it('should default to false when user has no group permissions for alias', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 7, alias_name: 'Private', real_path: '/datosnas/private' }],
      });
      // BOOL_OR returns null when no rows match the JOIN
      mockQuery.mockResolvedValueOnce({
        rows: [{ can_read: null, can_write: null, can_delete: null, can_move: null }],
      });

      const result = await resolveAliasPermissions(user, '/datosnas/private');
      expect(result.can_read).toBe(false);
      expect(result.can_write).toBe(false);
      expect(result.can_delete).toBe(false);
      expect(result.can_move).toBe(false);
    });
  });

  // ========================================
  // checkPermission: alias-based flow
  // ========================================
  describe('checkPermission — alias-based', () => {
    const user = { id: 10, is_admin: false };

    it('should grant admin users all permissions', async () => {
      const adminUser = { id: 1, is_admin: true };
      const result = await checkPermission(adminUser, '/datosnas/anything', 'rwxd');
      expect(result.granted).toBe(true);
      expect(result.reason).toContain('admin');
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should grant via alias when user has required permissions', async () => {
      // Alias match
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 5, alias_name: 'STLs', real_path: '/datosnas/stls' }],
      });
      // Group permissions
      mockQuery.mockResolvedValueOnce({
        rows: [{ can_read: true, can_write: true, can_delete: false, can_move: false }],
      });

      const result = await checkPermission(user, '/datosnas/stls', 'rw');
      expect(result.granted).toBe(true);
      expect(result.role).toBe('alias');
      expect(result.reason).toContain('STLs');
    });

    it('should deny via alias when user lacks a required flag', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 5, alias_name: 'STLs', real_path: '/datosnas/stls' }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ can_read: true, can_write: false, can_delete: false, can_move: false }],
      });

      const result = await checkPermission(user, '/datosnas/stls', 'rw');
      expect(result.granted).toBe(false);
      expect(result.role).toBe('alias');
      expect(result.reason).toContain('denies');
    });

    it('should deny via alias for delete flag when can_delete is false', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 5, alias_name: 'STLs', real_path: '/datosnas/stls' }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ can_read: true, can_write: true, can_delete: false, can_move: false }],
      });

      const result = await checkPermission(user, '/datosnas/stls/file.stl', 'd');
      expect(result.granted).toBe(false);
      expect(result.role).toBe('alias');
    });

    it('should map x flag to can_read for alias', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 5, alias_name: 'STLs', real_path: '/datosnas/stls' }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ can_read: true, can_write: false, can_delete: false, can_move: false }],
      });

      const result = await checkPermission(user, '/datosnas/stls', 'x');
      expect(result.granted).toBe(true);
      expect(result.role).toBe('alias');
    });

    it('should deny for unknown flag even when alias has all permissions', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 5, alias_name: 'STLs', real_path: '/datosnas/stls' }],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ can_read: true, can_write: true, can_delete: true, can_move: true }],
      });

      const result = await checkPermission(user, '/datosnas/stls', 'z');
      expect(result.granted).toBe(false);
    });

    it('should deny when path is not under any alias', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // no alias match

      const result = await checkPermission(user, '/datosnas/nowhere', 'r');
      expect(result.granted).toBe(false);
      expect(result.reason).toContain('not under any alias');
    });
  });

  // ========================================
  // hasPermission: simple boolean wrapper
  // ========================================
  describe('hasPermission', () => {
    it('should return true when permission is granted', async () => {
      const adminUser = { id: 1, is_admin: true };
      const result = await hasPermission(adminUser, '/datosnas/test', 'r');
      expect(result).toBe(true);
    });

    it('should return false when permission is denied', async () => {
      const user = { id: 10, is_admin: false };
      mockQuery.mockResolvedValueOnce({ rows: [] }); // no alias match

      const result = await hasPermission(user, '/datosnas/test', 'r');
      expect(result).toBe(false);
    });
  });
});
