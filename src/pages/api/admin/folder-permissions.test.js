import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('../../../lib/db.js', () => ({
  query: mockQuery,
}));

const { GET, POST, DELETE: DEL } = await import('./folder-permissions.js');

const admin = { id: 1, is_admin: true };
const normalUser = { id: 2, is_admin: false };

function createContext(user, { body, searchParams } = {}) {
  const url = new URL('http://localhost/api/admin/folder-permissions');
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      url.searchParams.set(k, v);
    }
  }
  return {
    locals: { user },
    request: {
      url: url.toString(),
      json: () => Promise.resolve(body),
    },
  };
}

describe('GET /api/admin/folder-permissions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should reject non-admin', async () => {
    const res = await GET(createContext(normalUser));
    expect(res.status).toBe(403);
  });

  it('should return all permissions when no filters', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 1, alias_id: 1, alias_name: 'STLs', group_id: 1, group_name: 'prod', can_read: true, can_write: false, can_delete: false, can_move: false },
      ],
    });
    const res = await GET(createContext(admin));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.permissions).toHaveLength(1);
  });

  it('should filter by alias_id', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await GET(createContext(admin, { searchParams: { alias_id: '1' } }));
    expect(mockQuery.mock.calls[0][1]).toEqual(['1']);
  });

  it('should filter by both alias_id and group_id', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await GET(createContext(admin, { searchParams: { alias_id: '1', group_id: '2' } }));
    expect(mockQuery.mock.calls[0][1]).toEqual(['1', '2']);
  });
});

describe('POST /api/admin/folder-permissions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should reject non-admin', async () => {
    const res = await POST(createContext(normalUser, { body: { alias_id: 1, group_id: 1 } }));
    expect(res.status).toBe(403);
  });

  it('should require alias_id and group_id', async () => {
    const res = await POST(createContext(admin, { body: { alias_id: 1 } }));
    expect(res.status).toBe(400);
  });

  it('should return 404 for non-existent alias', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await POST(createContext(admin, { body: { alias_id: 999, group_id: 1 } }));
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain('Alias');
  });

  it('should return 404 for non-existent group', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // alias exists
      .mockResolvedValueOnce({ rows: [] }); // group not found
    const res = await POST(createContext(admin, { body: { alias_id: 1, group_id: 999 } }));
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain('Group');
  });

  it('should create/upsert permissions successfully', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // alias exists
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // group exists
      .mockResolvedValueOnce({
        rows: [{ id: 1, alias_id: 1, group_id: 1, can_read: true, can_write: true, can_delete: false, can_move: false }],
      });

    const res = await POST(createContext(admin, {
      body: { alias_id: 1, group_id: 1, can_read: true, can_write: true },
    }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.can_read).toBe(true);
    expect(data.can_write).toBe(true);
    expect(data.can_delete).toBe(false);
  });

  it('should default boolean permissions to false', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, alias_id: 1, group_id: 1, can_read: false, can_write: false, can_delete: false, can_move: false }] });

    await POST(createContext(admin, { body: { alias_id: 1, group_id: 1 } }));
    const insertCall = mockQuery.mock.calls[2];
    // Verify the values passed: alias_id, group_id, can_read, can_write, can_delete, can_move
    expect(insertCall[1]).toEqual([1, 1, false, false, false, false]);
  });
});

describe('DELETE /api/admin/folder-permissions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should require alias_id and group_id', async () => {
    const res = await DEL(createContext(admin, { body: { alias_id: 1 } }));
    expect(res.status).toBe(400);
  });

  it('should delete permission entry', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ alias_id: 1, group_id: 1, can_read: true, can_write: false }],
    });
    const res = await DEL(createContext(admin, { body: { alias_id: 1, group_id: 1 } }));
    expect(res.status).toBe(200);
  });

  it('should return 404 if entry not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await DEL(createContext(admin, { body: { alias_id: 999, group_id: 1 } }));
    expect(res.status).toBe(404);
  });
});
