import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInitUpload = vi.fn();
vi.mock('../../../../lib/upload-service.js', () => ({
  initUpload: mockInitUpload,
}));

const { POST } = await import('./init.js');

describe('POST /api/files/upload/init', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createContext(body, user = { id: 10, is_admin: false }) {
    return {
      request: { json: () => Promise.resolve(body) },
      locals: { user },
    };
  }

  it('should return 400 when required fields are missing', async () => {
    const res = await POST(createContext({ fileName: 'test.stl' }));
    expect(res.status).toBe(400);
  });

  it('should return 400 when totalSize is not a positive number', async () => {
    const res = await POST(createContext({
      path: '/datosnas/stls/model.stl',
      fileName: 'model.stl',
      totalSize: -1,
      totalChunks: 10,
    }));
    expect(res.status).toBe(400);
  });

  it('should return 400 when totalChunks is not a positive integer', async () => {
    const res = await POST(createContext({
      path: '/datosnas/stls/model.stl',
      fileName: 'model.stl',
      totalSize: 5000000,
      totalChunks: 0,
    }));
    expect(res.status).toBe(400);
  });

  it('should delegate to initUpload and return success', async () => {
    mockInitUpload.mockResolvedValueOnce({
      success: true,
      uploadId: 'abc-123',
      totalChunks: 10,
    });

    const ctx = createContext({
      path: '/datosnas/stls/model.stl',
      fileName: 'model.stl',
      totalSize: 50000000,
      totalChunks: 10,
    });

    const res = await POST(ctx);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.uploadId).toBe('abc-123');
    expect(mockInitUpload).toHaveBeenCalledWith(ctx, '/datosnas/stls/model.stl', 'model.stl', 50000000, 10);
  });

  it('should return error status from initUpload', async () => {
    mockInitUpload.mockResolvedValueOnce({
      success: false,
      status: 409,
      error: 'File already exists at destination',
    });

    const res = await POST(createContext({
      path: '/datosnas/stls/model.stl',
      fileName: 'model.stl',
      totalSize: 50000000,
      totalChunks: 10,
    }));

    expect(res.status).toBe(409);
  });
});
