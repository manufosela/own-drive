import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';

// Mock dependencies
vi.mock('node:fs');

const mockRequirePermission = vi.fn();
vi.mock('../../lib/permission-middleware.js', () => ({
  requirePermission: mockRequirePermission,
}));

const mockSanitizePath = vi.fn();
vi.mock('../../lib/path-sanitizer.js', () => ({
  sanitizePath: mockSanitizePath,
  PathError: class PathError extends Error {
    constructor(message, statusCode) {
      super(message);
      this.name = 'PathError';
      this.statusCode = statusCode;
    }
  },
}));

const mockDeleteItem = vi.fn();
vi.mock('../../lib/file-operations.js', () => ({
  deleteItem: mockDeleteItem,
}));

const mockListDirectorySorted = vi.fn();
vi.mock('../../lib/file-lister.js', () => ({
  listDirectorySorted: mockListDirectorySorted,
}));

vi.mock('../../lib/permission-checker.js', () => ({
  resolveAliasPermissions: vi.fn(),
}));

vi.mock('../../lib/audit-logger.js', () => ({
  logAudit: vi.fn(),
  logAccessDedup: vi.fn(),
  getClientIp: vi.fn(() => '127.0.0.1'),
}));

const { GET, DELETE } = await import('./files.js');

describe('GET /api/files', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: DB returns null → fallback to filesystem
    mockListDirectorySorted.mockResolvedValue(null);
  });

  function createContext(queryParams = {}, user = { id: 10, is_admin: false }) {
    const params = new URLSearchParams(queryParams);
    return {
      url: new URL(`http://localhost:3000/api/files?${params}`),
      locals: { user },
    };
  }

  it('should return 400 when path param is missing', async () => {
    const ctx = createContext({});
    const response = await GET(ctx);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('path');
  });

  it('should return 403 when user lacks read permission', async () => {
    mockSanitizePath.mockReturnValueOnce({
      virtualPath: '/datosnas/private',
      realPath: '/mnt/datosnas/private',
      mountPoint: '/datosnas',
      realMountPoint: '/mnt/datosnas',
    });
    mockRequirePermission.mockResolvedValueOnce({
      granted: false,
      status: 403,
      reason: 'Others lacks required flags',
    });

    const ctx = createContext({ path: '/datosnas/private' });
    const response = await GET(ctx);
    expect(response.status).toBe(403);
  });

  it('should return 400 for invalid paths (path traversal)', async () => {
    mockSanitizePath.mockImplementationOnce(() => {
      const err = new Error('Invalid path: directory traversal detected');
      err.name = 'PathError';
      err.statusCode = 400;
      throw err;
    });

    const ctx = createContext({ path: '/datosnas/../../etc/passwd' });
    const response = await GET(ctx);
    expect(response.status).toBe(400);
  });

  it('should return 404 when directory does not exist', async () => {
    mockSanitizePath.mockReturnValueOnce({
      virtualPath: '/datosnas/nonexistent',
      realPath: '/mnt/datosnas/nonexistent',
      mountPoint: '/datosnas',
      realMountPoint: '/mnt/datosnas',
    });
    mockRequirePermission.mockResolvedValueOnce({ granted: true, role: 'owner' });
    vi.mocked(fs.existsSync).mockReturnValueOnce(false);

    const ctx = createContext({ path: '/datosnas/nonexistent' });
    const response = await GET(ctx);
    expect(response.status).toBe(404);
  });

  it('should return 400 when path is not a directory', async () => {
    mockSanitizePath.mockReturnValueOnce({
      virtualPath: '/datosnas/file.txt',
      realPath: '/mnt/datosnas/file.txt',
      mountPoint: '/datosnas',
      realMountPoint: '/mnt/datosnas',
    });
    mockRequirePermission.mockResolvedValueOnce({ granted: true, role: 'owner' });
    vi.mocked(fs.existsSync).mockReturnValueOnce(true);
    vi.mocked(fs.statSync).mockReturnValueOnce(/** @type {any} */ ({
      isDirectory: () => false,
    }));

    const ctx = createContext({ path: '/datosnas/file.txt' });
    const response = await GET(ctx);
    expect(response.status).toBe(400);
  });

  it('should list directory contents with metadata', async () => {
    mockSanitizePath.mockReturnValueOnce({
      virtualPath: '/datosnas/stls',
      realPath: '/mnt/datosnas/stls',
      mountPoint: '/datosnas',
      realMountPoint: '/mnt/datosnas',
    });
    mockRequirePermission.mockResolvedValueOnce({ granted: true, role: 'owner' });
    vi.mocked(fs.existsSync).mockReturnValueOnce(true);
    vi.mocked(fs.statSync).mockReturnValueOnce(/** @type {any} */ ({
      isDirectory: () => true,
    }));

    const mockEntries = [
      { name: 'model.stl', isDirectory: () => false, isFile: () => true },
      { name: 'subfolder', isDirectory: () => true, isFile: () => false },
      { name: '.hidden', isDirectory: () => false, isFile: () => true },
    ];
    vi.mocked(fs.readdirSync).mockReturnValueOnce(/** @type {any} */ (mockEntries));

    // stat for each entry (in sorted order: subfolder (dir), .hidden (file), model.stl (file))
    vi.mocked(fs.statSync)
      .mockReturnValueOnce(/** @type {any} */ ({
        size: 4096,
        mtimeMs: 1708200000000,
        isDirectory: () => true,
      }))
      .mockReturnValueOnce(/** @type {any} */ ({
        size: 512,
        mtimeMs: 1708100000000,
        isDirectory: () => false,
      }))
      .mockReturnValueOnce(/** @type {any} */ ({
        size: 1024000,
        mtimeMs: 1708300000000,
        isDirectory: () => false,
      }));

    const ctx = createContext({ path: '/datosnas/stls' });
    const response = await GET(ctx);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.path).toBe('/datosnas/stls');
    expect(body.items).toHaveLength(3);
    expect(body.total).toBe(3);

    // Verify structure
    const file = body.items.find((i) => i.name === 'model.stl');
    expect(file.type).toBe('file');
    expect(file.size).toBe(1024000);

    const folder = body.items.find((i) => i.name === 'subfolder');
    expect(folder.type).toBe('directory');
  });

  it('should support pagination with page and limit', async () => {
    mockSanitizePath.mockReturnValueOnce({
      virtualPath: '/datosnas/stls',
      realPath: '/mnt/datosnas/stls',
      mountPoint: '/datosnas',
      realMountPoint: '/mnt/datosnas',
    });
    mockRequirePermission.mockResolvedValueOnce({ granted: true, role: 'owner' });
    vi.mocked(fs.existsSync).mockReturnValueOnce(true);
    vi.mocked(fs.statSync).mockReturnValueOnce(/** @type {any} */ ({
      isDirectory: () => true,
    }));

    // Create 5 entries
    const mockEntries = Array.from({ length: 5 }, (_, i) => ({
      name: `file${i}.stl`,
      isDirectory: () => false,
      isFile: () => true,
    }));
    vi.mocked(fs.readdirSync).mockReturnValueOnce(/** @type {any} */ (mockEntries));

    // stat for only page 1 (2 entries: index 0 and 1)
    vi.mocked(fs.statSync)
      .mockReturnValueOnce(/** @type {any} */ ({ size: 100, mtimeMs: Date.now(), isDirectory: () => false }))
      .mockReturnValueOnce(/** @type {any} */ ({ size: 200, mtimeMs: Date.now(), isDirectory: () => false }));

    const ctx = createContext({ path: '/datosnas/stls', page: '1', limit: '2' });
    const response = await GET(ctx);
    const body = await response.json();

    expect(body.items).toHaveLength(2);
    expect(body.total).toBe(5);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(2);
    expect(body.pages).toBe(3); // ceil(5/2)
  });

  it('should filter out #recycle and @eaDir Synology folders', async () => {
    mockSanitizePath.mockReturnValueOnce({
      virtualPath: '/datosnas',
      realPath: '/mnt/datosnas',
      mountPoint: '/datosnas',
      realMountPoint: '/mnt/datosnas',
    });
    mockRequirePermission.mockResolvedValueOnce({ granted: true, role: 'admin' });
    vi.mocked(fs.existsSync).mockReturnValueOnce(true);
    vi.mocked(fs.statSync).mockReturnValueOnce(/** @type {any} */ ({
      isDirectory: () => true,
    }));

    const mockEntries = [
      { name: 'docs', isDirectory: () => true, isFile: () => false },
      { name: '#recycle', isDirectory: () => true, isFile: () => false },
      { name: '@eaDir', isDirectory: () => true, isFile: () => false },
    ];
    vi.mocked(fs.readdirSync).mockReturnValueOnce(/** @type {any} */ (mockEntries));

    vi.mocked(fs.statSync)
      .mockReturnValueOnce(/** @type {any} */ ({ size: 4096, mtimeMs: Date.now(), isDirectory: () => true }));

    const ctx = createContext({ path: '/datosnas' });
    const response = await GET(ctx);
    const body = await response.json();

    expect(body.items).toHaveLength(1);
    expect(body.items[0].name).toBe('docs');
    expect(body.total).toBe(1);
  });

  describe('permissions field in response', () => {
    function setupDirectoryMocks({ role = 'owner', aliasPerms } = {}) {
      mockSanitizePath.mockReturnValueOnce({
        virtualPath: '/datosnas/docs',
        realPath: '/mnt/datosnas/docs',
        mountPoint: '/datosnas',
        realMountPoint: '/mnt/datosnas',
      });
      const permResult = { granted: true, role };
      if (aliasPerms !== undefined) {
        permResult.aliasPerms = aliasPerms;
      }
      mockRequirePermission.mockResolvedValueOnce(permResult);
      vi.mocked(fs.existsSync).mockReturnValueOnce(true);
      vi.mocked(fs.statSync).mockReturnValueOnce(/** @type {any} */ ({
        isDirectory: () => true,
      }));
      vi.mocked(fs.readdirSync).mockReturnValueOnce(/** @type {any} */ ([]));
    }

    it('should return all permissions true for admin user', async () => {
      setupDirectoryMocks({ role: 'admin' });
      const ctx = createContext({ path: '/datosnas/docs' }, { id: 1, is_admin: true });
      const response = await GET(ctx);
      const body = await response.json();

      expect(body.permissions).toEqual({
        read: true,
        write: true,
        delete: true,
        move: true,
      });
    });

    it('should return alias-based permissions for regular user', async () => {
      setupDirectoryMocks({
        role: 'alias',
        aliasPerms: {
          can_read: true,
          can_write: true,
          can_delete: false,
          can_move: false,
        },
      });

      const ctx = createContext({ path: '/datosnas/docs' }, { id: 10, is_admin: false });
      const response = await GET(ctx);
      const body = await response.json();

      expect(body.permissions).toEqual({
        read: true,
        write: true,
        delete: false,
        move: false,
      });
    });

    it('should return delete=false when user lacks delete permission', async () => {
      setupDirectoryMocks({
        role: 'alias',
        aliasPerms: {
          can_read: true,
          can_write: true,
          can_delete: false,
          can_move: true,
        },
      });

      const ctx = createContext({ path: '/datosnas/docs' }, { id: 10, is_admin: false });
      const response = await GET(ctx);
      const body = await response.json();

      expect(body.permissions.delete).toBe(false);
      expect(body.permissions.read).toBe(true);
    });

    it('should return default permissions when no alias matches', async () => {
      setupDirectoryMocks({ role: 'alias', aliasPerms: null });

      const ctx = createContext({ path: '/datosnas/docs' }, { id: 10, is_admin: false });
      const response = await GET(ctx);
      const body = await response.json();

      expect(body.permissions).toEqual({
        read: true,
        write: false,
        delete: false,
        move: false,
      });
    });
  });

  it('should sort directories first, then files alphabetically', async () => {
    mockSanitizePath.mockReturnValueOnce({
      virtualPath: '/datosnas/mixed',
      realPath: '/mnt/datosnas/mixed',
      mountPoint: '/datosnas',
      realMountPoint: '/mnt/datosnas',
    });
    mockRequirePermission.mockResolvedValueOnce({ granted: true, role: 'owner' });
    vi.mocked(fs.existsSync).mockReturnValueOnce(true);
    vi.mocked(fs.statSync).mockReturnValueOnce(/** @type {any} */ ({
      isDirectory: () => true,
    }));

    const mockEntries = [
      { name: 'zebra.txt', isDirectory: () => false, isFile: () => true },
      { name: 'beta', isDirectory: () => true, isFile: () => false },
      { name: 'alpha.stl', isDirectory: () => false, isFile: () => true },
      { name: 'alpha', isDirectory: () => true, isFile: () => false },
    ];
    vi.mocked(fs.readdirSync).mockReturnValueOnce(/** @type {any} */ (mockEntries));

    vi.mocked(fs.statSync)
      .mockReturnValueOnce(/** @type {any} */ ({ size: 4096, mtimeMs: Date.now(), isDirectory: () => true }))
      .mockReturnValueOnce(/** @type {any} */ ({ size: 4096, mtimeMs: Date.now(), isDirectory: () => true }))
      .mockReturnValueOnce(/** @type {any} */ ({ size: 100, mtimeMs: Date.now(), isDirectory: () => false }))
      .mockReturnValueOnce(/** @type {any} */ ({ size: 200, mtimeMs: Date.now(), isDirectory: () => false }));

    const ctx = createContext({ path: '/datosnas/mixed' });
    const response = await GET(ctx);
    const body = await response.json();

    expect(body.items[0].name).toBe('alpha');    // dir
    expect(body.items[1].name).toBe('beta');      // dir
    expect(body.items[2].name).toBe('alpha.stl'); // file
    expect(body.items[3].name).toBe('zebra.txt'); // file
  });
});

describe('DELETE /api/files', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createDeleteContext(queryParams = {}) {
    const params = new URLSearchParams(queryParams);
    return {
      url: new URL(`http://localhost:3000/api/files?${params}`),
      locals: { user: { id: 10, is_admin: false } },
    };
  }

  it('should return 400 when path param is missing', async () => {
    const res = await DELETE(createDeleteContext({}));
    expect(res.status).toBe(400);
  });

  it('should return success when deleteItem succeeds', async () => {
    mockDeleteItem.mockResolvedValueOnce({ success: true });
    const res = await DELETE(createDeleteContext({ path: '/datosnas/file.txt' }));
    expect(res.status).toBe(200);
  });

  it('should return error status when deleteItem fails', async () => {
    mockDeleteItem.mockResolvedValueOnce({ success: false, status: 403, error: 'Access denied' });
    const res = await DELETE(createDeleteContext({ path: '/datosnas/file.txt' }));
    expect(res.status).toBe(403);
  });
});
