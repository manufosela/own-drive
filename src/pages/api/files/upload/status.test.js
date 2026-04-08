import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetUploadStatus = vi.fn();
vi.mock('../../../../lib/upload-service.js', () => ({
  getUploadStatus: mockGetUploadStatus,
}));

const { GET } = await import('./status.js');

describe('GET /api/files/upload/status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createContext(params = {}, user = { id: 10, is_admin: false }) {
    const url = new URL('http://localhost:3000/api/files/upload/status');
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
    return { url, locals: { user } };
  }

  it('should return 400 when uploadId is missing', async () => {
    const res = await GET(createContext({}));
    expect(res.status).toBe(400);
  });

  it('should delegate to getUploadStatus and return result', async () => {
    mockGetUploadStatus.mockResolvedValueOnce({
      success: true,
      fileName: 'model.stl',
      totalChunks: 5,
      uploadedChunks: [0, 1, 3],
      missingChunks: [2, 4],
    });

    const res = await GET(createContext({ uploadId: 'abc-123' }));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.uploadedChunks).toEqual([0, 1, 3]);
    expect(json.missingChunks).toEqual([2, 4]);
    expect(mockGetUploadStatus).toHaveBeenCalledWith(10, 'abc-123');
  });

  it('should return 404 for non-existent session', async () => {
    mockGetUploadStatus.mockResolvedValueOnce({
      success: false,
      status: 404,
      error: 'Upload session not found',
    });

    const res = await GET(createContext({ uploadId: 'nonexistent' }));
    expect(res.status).toBe(404);
  });
});
