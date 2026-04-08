import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import crypto from 'node:crypto';

vi.mock('node:fs');

const mockSanitizeNewPath = vi.fn();
vi.mock('./path-sanitizer.js', () => ({
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

const mockCheckQuota = vi.fn();
const mockUpdateUsedBytes = vi.fn();
vi.mock('./quota-service.js', () => ({
  checkQuota: mockCheckQuota,
  updateUsedBytes: mockUpdateUsedBytes,
}));

const { initUpload, writeChunk, completeUpload, getUploadStatus } = await import('./upload-service.js');

describe('upload-service', () => {
  /** @type {any} */
  const mockCtx = { locals: { user: { id: 10, is_admin: false } } };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ========================================
  // initUpload
  // ========================================
  describe('initUpload', () => {
    it('should create upload session with uploadId', async () => {
      mockSanitizeNewPath.mockReturnValueOnce({
        virtualPath: '/datosnas/stls/model.stl',
        realPath: '/mnt/datosnas/stls/model.stl',
        mountPoint: '/datosnas',
      });
      mockRequirePermission.mockResolvedValueOnce({ granted: true });
      mockCheckQuota.mockResolvedValueOnce({ allowed: true });
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

      const result = await initUpload(mockCtx, '/datosnas/stls/model.stl', 'model.stl', 50000000, 10);
      expect(result.success).toBe(true);
      expect(result.uploadId).toBeDefined();
      expect(result.uploadId.length).toBeGreaterThan(0);
      expect(mockCheckQuota).toHaveBeenCalledWith(10, 50000000);
    });

    it('should reject when user lacks write permission', async () => {
      mockSanitizeNewPath.mockReturnValueOnce({
        virtualPath: '/datosnas/stls/model.stl',
        realPath: '/mnt/datosnas/stls/model.stl',
        mountPoint: '/datosnas',
      });
      mockRequirePermission.mockResolvedValueOnce({ granted: false, status: 403 });

      const result = await initUpload(mockCtx, '/datosnas/stls/model.stl', 'model.stl', 50000000, 10);
      expect(result.success).toBe(false);
      expect(result.status).toBe(403);
    });

    it('should reject when target file already exists', async () => {
      mockSanitizeNewPath.mockReturnValueOnce({
        virtualPath: '/datosnas/stls/existing.stl',
        realPath: '/mnt/datosnas/stls/existing.stl',
        mountPoint: '/datosnas',
      });
      mockRequirePermission.mockResolvedValueOnce({ granted: true });
      vi.mocked(fs.existsSync).mockReturnValueOnce(true); // file already exists

      const result = await initUpload(mockCtx, '/datosnas/stls/existing.stl', 'existing.stl', 50000000, 10);
      expect(result.success).toBe(false);
      expect(result.status).toBe(409);
    });

    it('should reject when quota is exceeded', async () => {
      mockSanitizeNewPath.mockReturnValueOnce({
        virtualPath: '/datosnas/stls/big.stl',
        realPath: '/mnt/datosnas/stls/big.stl',
        mountPoint: '/datosnas',
      });
      mockRequirePermission.mockResolvedValueOnce({ granted: true });
      vi.mocked(fs.existsSync).mockReturnValueOnce(false); // file does not exist
      mockCheckQuota.mockResolvedValueOnce({ allowed: false, availableBytes: 1024 });

      const result = await initUpload(mockCtx, '/datosnas/stls/big.stl', 'big.stl', 999999999, 200);
      expect(result.success).toBe(false);
      expect(result.status).toBe(413);
      expect(result.error).toContain('Quota exceeded');
      expect(result.error).toContain('1024');
    });

    it('should reject invalid path', async () => {
      mockSanitizeNewPath.mockImplementationOnce(() => {
        const err = new Error('traversal');
        err.name = 'PathError';
        err.statusCode = 400;
        throw err;
      });

      const result = await initUpload(mockCtx, '/datosnas/../../etc/hack', 'hack', 100, 1);
      expect(result.success).toBe(false);
      expect(result.status).toBe(400);
    });
  });

  // ========================================
  // writeChunk
  // ========================================
  describe('writeChunk', () => {
    it('should write a chunk to the upload directory', async () => {
      // Mock reading the session metadata
      vi.mocked(fs.existsSync).mockReturnValueOnce(true); // session dir exists
      vi.mocked(fs.readFileSync).mockReturnValueOnce(JSON.stringify({
        userId: 10,
        virtualPath: '/datosnas/stls/model.stl',
        realPath: '/mnt/datosnas/stls/model.stl',
        fileName: 'model.stl',
        totalSize: 50000000,
        totalChunks: 10,
      }));
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

      const chunkData = Buffer.from('chunk content');
      const result = await writeChunk(10, 'upload-123', 0, chunkData);
      expect(result.success).toBe(true);
      expect(result.chunkIndex).toBe(0);
    });

    it('should reject when session does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValueOnce(false);

      const result = await writeChunk(10, 'nonexistent', 0, Buffer.from('data'));
      expect(result.success).toBe(false);
      expect(result.status).toBe(404);
    });

    it('should reject when user does not own the upload session', async () => {
      vi.mocked(fs.existsSync).mockReturnValueOnce(true);
      vi.mocked(fs.readFileSync).mockReturnValueOnce(JSON.stringify({
        userId: 99, // different user
        totalChunks: 5,
      }));

      const result = await writeChunk(10, 'upload-123', 0, Buffer.from('data'));
      expect(result.success).toBe(false);
      expect(result.status).toBe(403);
    });

    it('should reject invalid chunk index', async () => {
      vi.mocked(fs.existsSync).mockReturnValueOnce(true);
      vi.mocked(fs.readFileSync).mockReturnValueOnce(JSON.stringify({
        userId: 10,
        totalChunks: 5,
      }));

      const result = await writeChunk(10, 'upload-123', 10, Buffer.from('data'));
      expect(result.success).toBe(false);
      expect(result.status).toBe(400);
    });
  });

  // ========================================
  // completeUpload
  // ========================================
  describe('completeUpload', () => {
    it('should assemble chunks and move to final destination', async () => {
      vi.mocked(fs.existsSync).mockReturnValueOnce(true); // session dir
      vi.mocked(fs.readFileSync).mockReturnValueOnce(JSON.stringify({
        userId: 10,
        virtualPath: '/datosnas/stls/model.stl',
        realPath: '/mnt/datosnas/stls/model.stl',
        fileName: 'model.stl',
        totalSize: 100,
        totalChunks: 2,
      }));

      // Check all chunks exist
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(true)  // chunk 0
        .mockReturnValueOnce(true); // chunk 1

      // Read chunks
      vi.mocked(fs.readFileSync)
        .mockReturnValueOnce(Buffer.from('chunk0'))
        .mockReturnValueOnce(Buffer.from('chunk1'));

      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
      vi.mocked(fs.rmSync).mockReturnValue(undefined);
      mockUpdateUsedBytes.mockResolvedValueOnce(12);

      const result = await completeUpload(10, 'upload-123');
      expect(result.success).toBe(true);
      expect(result.path).toBe('/datosnas/stls/model.stl');
      expect(mockUpdateUsedBytes).toHaveBeenCalledWith(10, 12); // 'chunk0' + 'chunk1' = 12 bytes
    });

    it('should reject when not all chunks are uploaded', async () => {
      vi.mocked(fs.existsSync).mockReturnValueOnce(true);
      vi.mocked(fs.readFileSync).mockReturnValueOnce(JSON.stringify({
        userId: 10,
        totalChunks: 3,
      }));

      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(true)   // chunk 0
        .mockReturnValueOnce(true)   // chunk 1
        .mockReturnValueOnce(false); // chunk 2 missing

      const result = await completeUpload(10, 'upload-123');
      expect(result.success).toBe(false);
      expect(result.status).toBe(400);
      expect(result.error).toContain('missing');
    });

    it('should reject when session does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValueOnce(false);

      const result = await completeUpload(10, 'nonexistent');
      expect(result.success).toBe(false);
      expect(result.status).toBe(404);
    });
  });

  // ========================================
  // getUploadStatus
  // ========================================
  describe('getUploadStatus', () => {
    it('should return which chunks have been uploaded', async () => {
      vi.mocked(fs.existsSync).mockReturnValueOnce(true); // session dir
      vi.mocked(fs.readFileSync).mockReturnValueOnce(JSON.stringify({
        userId: 10,
        fileName: 'model.stl',
        totalChunks: 3,
      }));

      // Check each chunk
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(true)   // chunk 0
        .mockReturnValueOnce(false)  // chunk 1 missing
        .mockReturnValueOnce(true);  // chunk 2

      const result = await getUploadStatus(10, 'upload-123');
      expect(result.success).toBe(true);
      expect(result.uploadedChunks).toEqual([0, 2]);
      expect(result.missingChunks).toEqual([1]);
    });

    it('should return 404 for non-existent session', async () => {
      vi.mocked(fs.existsSync).mockReturnValueOnce(false);

      const result = await getUploadStatus(10, 'nonexistent');
      expect(result.success).toBe(false);
      expect(result.status).toBe(404);
    });
  });
});
