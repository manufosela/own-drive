import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockWriteChunk = vi.fn();
vi.mock('../../../../lib/upload-service.js', () => ({
  writeChunk: mockWriteChunk,
}));

const { PUT } = await import('./chunk.js');

describe('PUT /api/files/upload/chunk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createContext(params = {}, body = null, user = { id: 10, is_admin: false }) {
    const url = new URL('http://localhost:3000/api/files/upload/chunk');
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
    return {
      url,
      request: {
        arrayBuffer: () => Promise.resolve(body ? body.buffer : new ArrayBuffer(0)),
      },
      locals: { user },
    };
  }

  it('should return 400 when uploadId is missing', async () => {
    const res = await PUT(createContext({ chunkIndex: '0' }, Buffer.from('data')));
    expect(res.status).toBe(400);
  });

  it('should return 400 when chunkIndex is missing', async () => {
    const res = await PUT(createContext({ uploadId: 'abc-123' }, Buffer.from('data')));
    expect(res.status).toBe(400);
  });

  it('should return 400 when chunkIndex is not a number', async () => {
    const res = await PUT(createContext({ uploadId: 'abc-123', chunkIndex: 'abc' }, Buffer.from('data')));
    expect(res.status).toBe(400);
  });

  it('should delegate to writeChunk and return success', async () => {
    mockWriteChunk.mockResolvedValueOnce({ success: true, chunkIndex: 3 });

    const chunkData = Buffer.from('chunk content here');
    const res = await PUT(createContext(
      { uploadId: 'abc-123', chunkIndex: '3' },
      chunkData,
    ));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.chunkIndex).toBe(3);
    expect(mockWriteChunk).toHaveBeenCalledWith(10, 'abc-123', 3, expect.any(Buffer));
  });

  it('should return error status from writeChunk', async () => {
    mockWriteChunk.mockResolvedValueOnce({
      success: false,
      status: 404,
      error: 'Upload session not found',
    });

    const res = await PUT(createContext(
      { uploadId: 'nonexistent', chunkIndex: '0' },
      Buffer.from('data'),
    ));

    expect(res.status).toBe(404);
  });
});
