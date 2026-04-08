import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockMoveItem = vi.fn();
vi.mock('../../../lib/file-operations.js', () => ({
  moveItem: mockMoveItem,
}));

const { PUT } = await import('./move.js');

describe('PUT /api/files/move', () => {
  beforeEach(() => vi.clearAllMocks());

  function createContext(body) {
    return {
      request: { json: () => Promise.resolve(body) },
      locals: { user: { id: 1 } },
    };
  }

  it('should return 400 when fields are missing', async () => {
    const res = await PUT(createContext({}));
    expect(res.status).toBe(400);
  });

  it('should return result from moveItem on success', async () => {
    mockMoveItem.mockResolvedValueOnce({ success: true, newPath: '/datosnas/archive/file.txt' });
    const res = await PUT(createContext({ source: '/datosnas/file.txt', destination: '/datosnas/archive' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.path).toBe('/datosnas/archive/file.txt');
  });

  it('should return error status on failure', async () => {
    mockMoveItem.mockResolvedValueOnce({ success: false, status: 403, error: 'Access denied' });
    const res = await PUT(createContext({ source: '/datosnas/file.txt', destination: '/datosnas/restricted' }));
    expect(res.status).toBe(403);
  });
});
