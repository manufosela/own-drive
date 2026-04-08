import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('node:fs');

const mockSanitizePath = vi.fn();
const mockSanitizeNewPath = vi.fn();
vi.mock('./path-sanitizer.js', () => ({
  sanitizePath: mockSanitizePath,
  sanitizeNewPath: mockSanitizeNewPath,
  PathError: class PathError extends Error {
    constructor(message, statusCode) {
      super(message);
      this.name = 'PathError';
      this.statusCode = statusCode;
    }
  },
}));

const mockRequirePermission = vi.fn();
vi.mock('./permission-middleware.js', () => ({
  requirePermission: mockRequirePermission,
}));

const { renameItem, moveItem, createDirectory, deleteItem } = await import('./file-operations.js');

describe('file-operations', () => {
  /** @type {any} */
  const mockCtx = { locals: { user: { id: 10, is_admin: false } } };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ========================================
  // renameItem
  // ========================================
  describe('renameItem', () => {
    it('should rename a file successfully', async () => {
      mockSanitizePath.mockReturnValueOnce({
        virtualPath: '/datosnas/docs/old.txt',
        realPath: '/mnt/datosnas/docs/old.txt',
        mountPoint: '/datosnas',
      });
      mockRequirePermission.mockResolvedValueOnce({ granted: true });
      vi.mocked(fs.existsSync).mockReturnValueOnce(true);  // source exists
      vi.mocked(fs.existsSync).mockReturnValueOnce(false); // target doesn't exist
      vi.mocked(fs.renameSync).mockReturnValueOnce(undefined);

      const result = await renameItem(mockCtx, '/datosnas/docs/old.txt', 'new.txt');
      expect(result.success).toBe(true);
      expect(result.newPath).toBe('/datosnas/docs/new.txt');
    });

    it('should reject invalid new names (path separator)', async () => {
      const result = await renameItem(mockCtx, '/datosnas/file.txt', 'sub/name.txt');
      expect(result.success).toBe(false);
      expect(result.status).toBe(400);
    });

    it('should reject when source does not exist', async () => {
      mockSanitizePath.mockReturnValueOnce({
        virtualPath: '/datosnas/ghost.txt',
        realPath: '/mnt/datosnas/ghost.txt',
        mountPoint: '/datosnas',
      });
      mockRequirePermission.mockResolvedValueOnce({ granted: true });
      vi.mocked(fs.existsSync).mockReturnValueOnce(false);

      const result = await renameItem(mockCtx, '/datosnas/ghost.txt', 'new.txt');
      expect(result.success).toBe(false);
      expect(result.status).toBe(404);
    });

    it('should reject when target already exists', async () => {
      mockSanitizePath.mockReturnValueOnce({
        virtualPath: '/datosnas/old.txt',
        realPath: '/mnt/datosnas/old.txt',
        mountPoint: '/datosnas',
      });
      mockRequirePermission.mockResolvedValueOnce({ granted: true });
      vi.mocked(fs.existsSync).mockReturnValueOnce(true); // source exists
      vi.mocked(fs.existsSync).mockReturnValueOnce(true); // target exists too

      const result = await renameItem(mockCtx, '/datosnas/old.txt', 'new.txt');
      expect(result.success).toBe(false);
      expect(result.status).toBe(409);
    });

    it('should reject when user lacks write permission', async () => {
      mockSanitizePath.mockReturnValueOnce({
        virtualPath: '/datosnas/file.txt',
        realPath: '/mnt/datosnas/file.txt',
        mountPoint: '/datosnas',
      });
      mockRequirePermission.mockResolvedValueOnce({ granted: false, status: 403 });

      const result = await renameItem(mockCtx, '/datosnas/file.txt', 'new.txt');
      expect(result.success).toBe(false);
      expect(result.status).toBe(403);
    });

    it('should handle path errors from sanitizer', async () => {
      mockSanitizePath.mockImplementationOnce(() => {
        const err = new Error('traversal');
        err.name = 'PathError';
        err.statusCode = 400;
        throw err;
      });

      const result = await renameItem(mockCtx, '/datosnas/../../etc', 'new.txt');
      expect(result.success).toBe(false);
      expect(result.status).toBe(400);
    });
  });

  // ========================================
  // moveItem
  // ========================================
  describe('moveItem', () => {
    it('should move a file to a new directory', async () => {
      // Source
      mockSanitizePath.mockReturnValueOnce({
        virtualPath: '/datosnas/docs/file.txt',
        realPath: '/mnt/datosnas/docs/file.txt',
        mountPoint: '/datosnas',
      });
      mockRequirePermission.mockResolvedValueOnce({ granted: true }); // write on source
      // Destination
      mockSanitizePath.mockReturnValueOnce({
        virtualPath: '/datosnas/archive',
        realPath: '/mnt/datosnas/archive',
        mountPoint: '/datosnas',
      });
      mockRequirePermission.mockResolvedValueOnce({ granted: true }); // write on dest
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(true)   // source exists
        .mockReturnValueOnce(true)   // dest dir exists
        .mockReturnValueOnce(false); // target in dest doesn't exist
      vi.mocked(fs.statSync).mockReturnValueOnce(/** @type {any} */ ({
        isDirectory: () => true,
      }));
      vi.mocked(fs.renameSync).mockReturnValueOnce(undefined);

      const result = await moveItem(mockCtx, '/datosnas/docs/file.txt', '/datosnas/archive');
      expect(result.success).toBe(true);
      expect(result.newPath).toBe('/datosnas/archive/file.txt');
    });

    it('should reject when destination is not a directory', async () => {
      mockSanitizePath.mockReturnValueOnce({
        virtualPath: '/datosnas/file.txt',
        realPath: '/mnt/datosnas/file.txt',
        mountPoint: '/datosnas',
      });
      mockRequirePermission.mockResolvedValueOnce({ granted: true });
      mockSanitizePath.mockReturnValueOnce({
        virtualPath: '/datosnas/other.txt',
        realPath: '/mnt/datosnas/other.txt',
        mountPoint: '/datosnas',
      });
      mockRequirePermission.mockResolvedValueOnce({ granted: true });
      vi.mocked(fs.existsSync).mockReturnValueOnce(true).mockReturnValueOnce(true);
      vi.mocked(fs.statSync).mockReturnValueOnce(/** @type {any} */ ({
        isDirectory: () => false,
      }));

      const result = await moveItem(mockCtx, '/datosnas/file.txt', '/datosnas/other.txt');
      expect(result.success).toBe(false);
      expect(result.status).toBe(400);
    });

    it('should reject when source does not exist', async () => {
      mockSanitizePath.mockReturnValueOnce({
        virtualPath: '/datosnas/ghost.txt',
        realPath: '/mnt/datosnas/ghost.txt',
        mountPoint: '/datosnas',
      });
      mockRequirePermission.mockResolvedValueOnce({ granted: true });
      mockSanitizePath.mockReturnValueOnce({
        virtualPath: '/datosnas/archive',
        realPath: '/mnt/datosnas/archive',
        mountPoint: '/datosnas',
      });
      mockRequirePermission.mockResolvedValueOnce({ granted: true });
      vi.mocked(fs.existsSync).mockReturnValueOnce(false); // source doesn't exist

      const result = await moveItem(mockCtx, '/datosnas/ghost.txt', '/datosnas/archive');
      expect(result.success).toBe(false);
      expect(result.status).toBe(404);
    });

    it('should reject when destination does not exist', async () => {
      mockSanitizePath.mockReturnValueOnce({
        virtualPath: '/datosnas/file.txt',
        realPath: '/mnt/datosnas/file.txt',
        mountPoint: '/datosnas',
      });
      mockRequirePermission.mockResolvedValueOnce({ granted: true });
      mockSanitizePath.mockReturnValueOnce({
        virtualPath: '/datosnas/nope',
        realPath: '/mnt/datosnas/nope',
        mountPoint: '/datosnas',
      });
      mockRequirePermission.mockResolvedValueOnce({ granted: true });
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(true)    // source exists
        .mockReturnValueOnce(false);  // dest doesn't exist

      const result = await moveItem(mockCtx, '/datosnas/file.txt', '/datosnas/nope');
      expect(result.success).toBe(false);
      expect(result.status).toBe(404);
    });

    it('should reject when target name already exists in destination', async () => {
      mockSanitizePath.mockReturnValueOnce({
        virtualPath: '/datosnas/file.txt',
        realPath: '/mnt/datosnas/file.txt',
        mountPoint: '/datosnas',
      });
      mockRequirePermission.mockResolvedValueOnce({ granted: true });
      mockSanitizePath.mockReturnValueOnce({
        virtualPath: '/datosnas/archive',
        realPath: '/mnt/datosnas/archive',
        mountPoint: '/datosnas',
      });
      mockRequirePermission.mockResolvedValueOnce({ granted: true });
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(true)   // source exists
        .mockReturnValueOnce(true)   // dest exists
        .mockReturnValueOnce(true);  // file.txt already in archive
      vi.mocked(fs.statSync).mockReturnValueOnce(/** @type {any} */ ({
        isDirectory: () => true,
      }));

      const result = await moveItem(mockCtx, '/datosnas/file.txt', '/datosnas/archive');
      expect(result.success).toBe(false);
      expect(result.status).toBe(409);
    });

    it('should handle path errors from sanitizer', async () => {
      mockSanitizePath.mockImplementationOnce(() => {
        const err = new Error('traversal');
        err.name = 'PathError';
        err.statusCode = 400;
        throw err;
      });

      const result = await moveItem(mockCtx, '/datosnas/../../etc/passwd', '/datosnas/archive');
      expect(result.success).toBe(false);
      expect(result.status).toBe(400);
    });

    it('should reject when user lacks write on destination', async () => {
      mockSanitizePath.mockReturnValueOnce({
        virtualPath: '/datosnas/file.txt',
        realPath: '/mnt/datosnas/file.txt',
        mountPoint: '/datosnas',
      });
      mockRequirePermission.mockResolvedValueOnce({ granted: true }); // source ok
      mockSanitizePath.mockReturnValueOnce({
        virtualPath: '/datosnas/restricted',
        realPath: '/mnt/datosnas/restricted',
        mountPoint: '/datosnas',
      });
      mockRequirePermission.mockResolvedValueOnce({ granted: false, status: 403 }); // dest denied

      const result = await moveItem(mockCtx, '/datosnas/file.txt', '/datosnas/restricted');
      expect(result.success).toBe(false);
      expect(result.status).toBe(403);
    });
  });

  // ========================================
  // createDirectory
  // ========================================
  describe('createDirectory', () => {
    it('should create a new directory', async () => {
      mockSanitizeNewPath.mockReturnValueOnce({
        virtualPath: '/datosnas/docs/newfolder',
        realPath: '/mnt/datosnas/docs/newfolder',
        mountPoint: '/datosnas',
      });
      // Check write permission on parent
      mockRequirePermission.mockResolvedValueOnce({ granted: true });
      vi.mocked(fs.existsSync).mockReturnValueOnce(false); // doesn't exist yet
      vi.mocked(fs.mkdirSync).mockReturnValueOnce(undefined);

      const result = await createDirectory(mockCtx, '/datosnas/docs/newfolder');
      expect(result.success).toBe(true);
      expect(result.path).toBe('/datosnas/docs/newfolder');
    });

    it('should reject when directory already exists', async () => {
      mockSanitizeNewPath.mockReturnValueOnce({
        virtualPath: '/datosnas/docs/existing',
        realPath: '/mnt/datosnas/docs/existing',
        mountPoint: '/datosnas',
      });
      mockRequirePermission.mockResolvedValueOnce({ granted: true });
      vi.mocked(fs.existsSync).mockReturnValueOnce(true);

      const result = await createDirectory(mockCtx, '/datosnas/docs/existing');
      expect(result.success).toBe(false);
      expect(result.status).toBe(409);
    });

    it('should reject when user lacks write permission on parent', async () => {
      mockSanitizeNewPath.mockReturnValueOnce({
        virtualPath: '/datosnas/restricted/newfolder',
        realPath: '/mnt/datosnas/restricted/newfolder',
        mountPoint: '/datosnas',
      });
      mockRequirePermission.mockResolvedValueOnce({ granted: false, status: 403 });

      const result = await createDirectory(mockCtx, '/datosnas/restricted/newfolder');
      expect(result.success).toBe(false);
      expect(result.status).toBe(403);
    });
  });

  // ========================================
  // deleteItem
  // ========================================
  describe('deleteItem', () => {
    it('should move item to #recycle folder', async () => {
      mockSanitizePath.mockReturnValueOnce({
        virtualPath: '/datosnas/docs/file.txt',
        realPath: '/mnt/datosnas/docs/file.txt',
        mountPoint: '/datosnas',
        realMountPoint: '/mnt/datosnas',
      });
      mockRequirePermission.mockResolvedValueOnce({ granted: true });
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(true)    // source exists
        .mockReturnValueOnce(true);   // #recycle exists
      vi.mocked(fs.renameSync).mockReturnValueOnce(undefined);

      const result = await deleteItem(mockCtx, '/datosnas/docs/file.txt');
      expect(result.success).toBe(true);
      expect(vi.mocked(fs.renameSync)).toHaveBeenCalledWith(
        '/mnt/datosnas/docs/file.txt',
        expect.stringContaining('#recycle')
      );
    });

    it('should create #recycle folder if it does not exist', async () => {
      mockSanitizePath.mockReturnValueOnce({
        virtualPath: '/datosnas/docs/file.txt',
        realPath: '/mnt/datosnas/docs/file.txt',
        mountPoint: '/datosnas',
        realMountPoint: '/mnt/datosnas',
      });
      mockRequirePermission.mockResolvedValueOnce({ granted: true });
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(true)    // source exists
        .mockReturnValueOnce(false);  // #recycle doesn't exist
      vi.mocked(fs.mkdirSync).mockReturnValueOnce(undefined);
      vi.mocked(fs.renameSync).mockReturnValueOnce(undefined);

      const result = await deleteItem(mockCtx, '/datosnas/docs/file.txt');
      expect(result.success).toBe(true);
      expect(vi.mocked(fs.mkdirSync)).toHaveBeenCalledWith(
        expect.stringContaining('#recycle'),
        { recursive: true }
      );
    });

    it('should reject when user lacks delete permission', async () => {
      mockSanitizePath.mockReturnValueOnce({
        virtualPath: '/datosnas/file.txt',
        realPath: '/mnt/datosnas/file.txt',
        mountPoint: '/datosnas',
        realMountPoint: '/mnt/datosnas',
      });
      mockRequirePermission.mockResolvedValueOnce({ granted: false, status: 403 });

      const result = await deleteItem(mockCtx, '/datosnas/file.txt');
      expect(result.success).toBe(false);
      expect(result.status).toBe(403);
    });

    it('should reject when source does not exist', async () => {
      mockSanitizePath.mockReturnValueOnce({
        virtualPath: '/datosnas/ghost.txt',
        realPath: '/mnt/datosnas/ghost.txt',
        mountPoint: '/datosnas',
        realMountPoint: '/mnt/datosnas',
      });
      mockRequirePermission.mockResolvedValueOnce({ granted: true });
      vi.mocked(fs.existsSync).mockReturnValueOnce(false);

      const result = await deleteItem(mockCtx, '/datosnas/ghost.txt');
      expect(result.success).toBe(false);
      expect(result.status).toBe(404);
    });
  });
});
