import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRenameItem = vi.fn();
vi.mock('../../../lib/file-operations.js', () => ({
  renameItem: mockRenameItem,
}));

const { PUT } = await import('./rename.js');

describe('PUT /api/files/rename', () => {
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

  it('should return result from renameItem on success', async () => {
    mockRenameItem.mockResolvedValueOnce({ success: true, newPath: '/datosnas/new.txt' });
    const res = await PUT(createContext({ path: '/datosnas/old.txt', newName: 'new.txt' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.path).toBe('/datosnas/new.txt');
  });

  it('should return error status on failure', async () => {
    mockRenameItem.mockResolvedValueOnce({ success: false, status: 409, error: 'Target already exists' });
    const res = await PUT(createContext({ path: '/datosnas/old.txt', newName: 'dup.txt' }));
    expect(res.status).toBe(409);
  });
});
