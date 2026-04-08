import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChunkedUploader, DEFAULT_CHUNK_SIZE } from './upload-client.js';

describe('upload-client', () => {
  /** @type {ChunkedUploader} */
  let uploader;
  /** @type {ReturnType<typeof vi.fn>} */
  let mockFetch;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch = vi.fn();
    uploader = new ChunkedUploader({ fetch: mockFetch });
  });

  describe('DEFAULT_CHUNK_SIZE', () => {
    it('should be 5MB', () => {
      expect(DEFAULT_CHUNK_SIZE).toBe(5 * 1024 * 1024);
    });
  });

  describe('calculateChunks', () => {
    it('should calculate correct number of chunks', () => {
      expect(uploader.calculateChunks(10 * 1024 * 1024)).toBe(2); // 10MB / 5MB = 2
    });

    it('should round up for partial chunks', () => {
      expect(uploader.calculateChunks(7 * 1024 * 1024)).toBe(2); // 7MB / 5MB = 1.4 → 2
    });

    it('should return 1 for files smaller than chunk size', () => {
      expect(uploader.calculateChunks(100)).toBe(1);
    });

    it('should handle exact multiples', () => {
      expect(uploader.calculateChunks(15 * 1024 * 1024)).toBe(3); // 15MB / 5MB = 3
    });
  });

  describe('initSession', () => {
    it('should call init endpoint and return uploadId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, uploadId: 'abc-123', totalChunks: 2 }),
      });

      const result = await uploader.initSession('/datosnas/stls/model.stl', 'model.stl', 10485760);

      expect(mockFetch).toHaveBeenCalledWith('/api/files/upload/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: '/datosnas/stls/model.stl',
          fileName: 'model.stl',
          totalSize: 10485760,
          totalChunks: 2,
        }),
      });
      expect(result).toEqual({ success: true, uploadId: 'abc-123', totalChunks: 2 });
    });

    it('should return error on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ success: false, error: 'File already exists' }),
      });

      const result = await uploader.initSession('/datosnas/dup.stl', 'dup.stl', 100);
      expect(result.success).toBe(false);
      expect(result.error).toBe('File already exists');
    });
  });

  describe('uploadChunk', () => {
    it('should PUT chunk data with correct query params', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, chunkIndex: 0 }),
      });

      const blob = new Blob(['chunk data']);
      const result = await uploader.uploadChunk('abc-123', 0, blob);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/files/upload/chunk?uploadId=abc-123&chunkIndex=0',
        { method: 'PUT', body: blob },
      );
      expect(result.success).toBe(true);
    });

    it('should return error on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ success: false, error: 'Session not found' }),
      });

      const result = await uploader.uploadChunk('bad-id', 0, new Blob(['data']));
      expect(result.success).toBe(false);
    });
  });

  describe('completeSession', () => {
    it('should POST complete endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, path: '/datosnas/model.stl', size: 10485760 }),
      });

      const result = await uploader.completeSession('abc-123');

      expect(mockFetch).toHaveBeenCalledWith('/api/files/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId: 'abc-123' }),
      });
      expect(result.success).toBe(true);
      expect(result.path).toBe('/datosnas/model.stl');
    });
  });

  describe('upload (full flow)', () => {
    it('should execute init → chunks → complete and track progress', async () => {
      const fileContent = new Uint8Array(12 * 1024 * 1024); // 12MB → 3 chunks
      const file = new File([fileContent], 'model.stl', { type: 'application/octet-stream' });

      // Init response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, uploadId: 'upload-1', totalChunks: 3 }),
      });

      // Chunk 0, 1, 2 responses
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, chunkIndex: 0 }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, chunkIndex: 1 }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, chunkIndex: 2 }),
      });

      // Complete response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, path: '/datosnas/model.stl', size: file.size }),
      });

      const onProgress = vi.fn();
      const result = await uploader.upload(file, '/datosnas/model.stl', { onProgress });

      expect(result.success).toBe(true);
      expect(result.path).toBe('/datosnas/model.stl');
      expect(mockFetch).toHaveBeenCalledTimes(5); // init + 3 chunks + complete
      expect(onProgress).toHaveBeenCalled();

      // Verify progress calls (at least called with increasing percentages)
      const calls = onProgress.mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(3);
    });

    it('should abort if init fails', async () => {
      const file = new File(['data'], 'test.stl');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ success: false, error: 'Access denied' }),
      });

      const result = await uploader.upload(file, '/datosnas/test.stl');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Access denied');
      expect(mockFetch).toHaveBeenCalledTimes(1); // only init
    });

    it('should abort if a chunk upload fails', async () => {
      const fileContent = new Uint8Array(12 * 1024 * 1024);
      const file = new File([fileContent], 'model.stl');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, uploadId: 'upload-1', totalChunks: 3 }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, chunkIndex: 0 }),
      });

      // Chunk 1 fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ success: false, error: 'Server error' }),
      });

      const result = await uploader.upload(file, '/datosnas/model.stl');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Server error');
    });

    it('should support custom chunk size', () => {
      const custom = new ChunkedUploader({ fetch: mockFetch, chunkSize: 1024 * 1024 });
      expect(custom.calculateChunks(3 * 1024 * 1024)).toBe(3);
    });
  });
});
