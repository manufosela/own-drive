import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCompleteUpload = vi.fn();
vi.mock('../../../../lib/upload-service.js', () => ({
  completeUpload: mockCompleteUpload,
}));

const { POST } = await import('./complete.js');

describe('POST /api/files/upload/complete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createContext(body, user = { id: 10, is_admin: false }) {
    return {
      request: { json: () => Promise.resolve(body) },
      locals: { user },
    };
  }

  it('should return 400 when uploadId is missing', async () => {
    const res = await POST(createContext({}));
    expect(res.status).toBe(400);
  });

  it('should delegate to completeUpload and return success', async () => {
    mockCompleteUpload.mockResolvedValueOnce({
      success: true,
      path: '/datosnas/stls/model.stl',
      size: 50000000,
    });

    const res = await POST(createContext({ uploadId: 'abc-123' }));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.path).toBe('/datosnas/stls/model.stl');
    expect(json.size).toBe(50000000);
    expect(mockCompleteUpload).toHaveBeenCalledWith(10, 'abc-123');
  });

  it('should return error status from completeUpload', async () => {
    mockCompleteUpload.mockResolvedValueOnce({
      success: false,
      status: 400,
      error: 'Chunks missing: 2, 5',
    });

    const res = await POST(createContext({ uploadId: 'abc-123' }));
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toContain('missing');
  });

  it('should return 404 when session does not exist', async () => {
    mockCompleteUpload.mockResolvedValueOnce({
      success: false,
      status: 404,
      error: 'Upload session not found',
    });

    const res = await POST(createContext({ uploadId: 'nonexistent' }));
    expect(res.status).toBe(404);
  });
});
