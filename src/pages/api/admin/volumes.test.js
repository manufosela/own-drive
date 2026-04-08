import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('../../../lib/db.js', () => ({
  query: mockQuery,
}));

const { GET, POST, PUT, DELETE: DEL } = await import('./volumes.js');

const admin = { id: 1, is_admin: true };
const normalUser = { id: 2, is_admin: false };

function createContext(user, { body } = {}) {
  return {
    locals: { user },
    request: { json: () => Promise.resolve(body) },
  };
}

describe('GET /api/admin/volumes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should reject non-admin users', async () => {
    const res = await GET(createContext(normalUser));
    expect(res.status).toBe(403);
  });

  it('should list volumes with alias count', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 1, name: 'datosnas', mount_path: '/mnt/datosnas', active: true, alias_count: 3 },
        { id: 2, name: 'nocomun', mount_path: '/mnt/nocomun', active: true, alias_count: 1 },
      ],
    });
    const res = await GET(createContext(admin));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.volumes).toHaveLength(2);
    expect(data.volumes[0].alias_count).toBe(3);
  });
});

describe('POST /api/admin/volumes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should create a volume', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 3, name: 'backup', mount_path: '/mnt/backup', active: true }],
    });
    const res = await POST(createContext(admin, { body: { name: 'backup', mount_path: '/mnt/backup' } }));
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data.name).toBe('backup');
  });

  it('should require name and mount_path', async () => {
    const res = await POST(createContext(admin, { body: { name: '' } }));
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/admin/volumes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should update volume and cascade visibility', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 1, active: true, mount_path: '/mnt/datosnas' }] }) // current
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'datosnas', mount_path: '/mnt/datosnas', active: false }] }) // update
      .mockResolvedValueOnce({ rowCount: 2 }); // cascade

    const res = await PUT(createContext(admin, { body: { id: 1, active: false } }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.active).toBe(false);
    // Verify cascade query was called
    expect(mockQuery).toHaveBeenCalledTimes(3);
    expect(mockQuery.mock.calls[2][1]).toEqual([false, '/mnt/datosnas']);
  });

  it('should return 404 for unknown volume', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await PUT(createContext(admin, { body: { id: 999, active: false } }));
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/admin/volumes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should delete volume without aliases', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ mount_path: '/mnt/backup' }] })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })
      .mockResolvedValueOnce({ rowCount: 1 });

    const res = await DEL(createContext(admin, { body: { id: 3 } }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.deleted.id).toBe(3);
  });

  it('should reject delete when aliases exist', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ mount_path: '/mnt/datosnas' }] })
      .mockResolvedValueOnce({ rows: [{ count: 5 }] });

    const res = await DEL(createContext(admin, { body: { id: 1 } }));
    expect(res.status).toBe(409);
  });
});
