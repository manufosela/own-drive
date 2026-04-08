import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('../../../lib/db.js', () => ({
  query: mockQuery,
}));

const { GET, POST, PUT, DELETE: DEL } = await import('./aliases.js');

const admin = { id: 1, is_admin: true };
const normalUser = { id: 2, is_admin: false };

function createContext(user, { body, searchParams } = {}) {
  const url = new URL('http://localhost/api/admin/aliases');
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

describe('GET /api/admin/aliases', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should reject non-admin users', async () => {
    const res = await GET(createContext(normalUser));
    expect(res.status).toBe(403);
  });

  it('should reject unauthenticated requests', async () => {
    const res = await GET({ locals: {}, request: { url: 'http://localhost/api/admin/aliases' } });
    expect(res.status).toBe(401);
  });

  it('should return all aliases with permission count', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 1, alias_name: 'STLs', real_path: '/datosnas/stls', description: 'STL files', visible: true, permission_count: 2 },
      ],
    });

    const res = await GET(createContext(admin));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.aliases).toHaveLength(1);
    expect(data.aliases[0].permission_count).toBe(2);
  });

  it('should return single alias with permissions when id is provided', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 1, alias_name: 'STLs', real_path: '/datosnas/stls', created_by_name: 'Admin' }] })
      .mockResolvedValueOnce({ rows: [{ id: 10, group_id: 1, group_name: 'produccion', can_read: true, can_write: false, can_delete: false, can_move: false }] });

    const res = await GET(createContext(admin, { searchParams: { id: '1' } }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.alias_name).toBe('STLs');
    expect(data.permissions).toHaveLength(1);
    expect(data.permissions[0].group_name).toBe('produccion');
  });

  it('should return 404 for non-existent alias id', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await GET(createContext(admin, { searchParams: { id: '999' } }));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/admin/aliases', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should reject non-admin', async () => {
    const res = await POST(createContext(normalUser, { body: { alias_name: 'x', real_path: '/y' } }));
    expect(res.status).toBe(403);
  });

  it('should require alias_name', async () => {
    const res = await POST(createContext(admin, { body: { real_path: '/y' } }));
    expect(res.status).toBe(400);
  });

  it('should require real_path', async () => {
    const res = await POST(createContext(admin, { body: { alias_name: 'test' } }));
    expect(res.status).toBe(400);
  });

  it('should reject duplicate alias_name', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const res = await POST(createContext(admin, { body: { alias_name: 'STLs', real_path: '/datosnas/stls' } }));
    expect(res.status).toBe(409);
  });

  it('should create alias successfully', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // no dup
      .mockResolvedValueOnce({ rows: [{ id: 1, alias_name: 'STLs', real_path: '/datosnas/stls', visible: true }] });

    const res = await POST(createContext(admin, { body: { alias_name: 'STLs', real_path: '/datosnas/stls' } }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.alias_name).toBe('STLs');
  });

  it('should set visible to true by default', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 2, alias_name: 'Docs', real_path: '/datosnas/docs', visible: true }] });

    await POST(createContext(admin, { body: { alias_name: 'Docs', real_path: '/datosnas/docs' } }));
    const insertCall = mockQuery.mock.calls[1];
    expect(insertCall[1][3]).toBe(true); // visible param
  });
});

describe('PUT /api/admin/aliases', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should require id', async () => {
    const res = await PUT(createContext(admin, { body: { alias_name: 'x' } }));
    expect(res.status).toBe(400);
  });

  it('should require at least one field', async () => {
    const res = await PUT(createContext(admin, { body: { id: 1 } }));
    expect(res.status).toBe(400);
  });

  it('should reject empty alias_name', async () => {
    const res = await PUT(createContext(admin, { body: { id: 1, alias_name: '' } }));
    expect(res.status).toBe(400);
  });

  it('should reject duplicate alias_name on update', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 2 }] });
    const res = await PUT(createContext(admin, { body: { id: 1, alias_name: 'taken' } }));
    expect(res.status).toBe(409);
  });

  it('should update alias successfully', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // no dup
      .mockResolvedValueOnce({ rows: [{ id: 1, alias_name: 'NewName', real_path: '/datosnas/stls' }] });

    const res = await PUT(createContext(admin, { body: { id: 1, alias_name: 'NewName' } }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.alias_name).toBe('NewName');
  });

  it('should return 404 for non-existent alias', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await PUT(createContext(admin, { body: { id: 999, visible: false } }));
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/admin/aliases', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should require id', async () => {
    const res = await DEL(createContext(admin, { body: {} }));
    expect(res.status).toBe(400);
  });

  it('should delete alias and return it', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, alias_name: 'STLs' }] });
    const res = await DEL(createContext(admin, { body: { id: 1 } }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.deleted.alias_name).toBe('STLs');
  });

  it('should return 404 for non-existent alias', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await DEL(createContext(admin, { body: { id: 999 } }));
    expect(res.status).toBe(404);
  });
});
