import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreateDirectory = vi.fn();
vi.mock('../../../lib/file-operations.js', () => ({
  createDirectory: mockCreateDirectory,
}));

const { POST } = await import('./mkdir.js');

describe('POST /api/files/mkdir', () => {
  beforeEach(() => vi.clearAllMocks());

  function createContext(body) {
    return {
      request: { json: () => Promise.resolve(body) },
      locals: { user: { id: 1 } },
    };
  }

  it('should return 400 when path is missing', async () => {
    const res = await POST(createContext({}));
    expect(res.status).toBe(400);
  });

  it('should return 201 on successful directory creation', async () => {
    mockCreateDirectory.mockResolvedValueOnce({ success: true, path: '/datosnas/newfolder' });
    const res = await POST(createContext({ path: '/datosnas/newfolder' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.path).toBe('/datosnas/newfolder');
  });

  it('should return error status on failure', async () => {
    mockCreateDirectory.mockResolvedValueOnce({ success: false, status: 409, error: 'Directory already exists' });
    const res = await POST(createContext({ path: '/datosnas/existing' }));
    expect(res.status).toBe(409);
  });
});
