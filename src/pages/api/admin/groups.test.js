import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('../../../lib/db.js', () => ({
  query: mockQuery,
}));

const { GET, POST, PUT, DELETE: DEL } = await import('./groups.js');

const admin = { id: 1, is_admin: true };
const normalUser = { id: 2, is_admin: false };

function createContext(user, { body, searchParams } = {}) {
  const url = new URL('http://localhost/api/admin/groups');
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

describe('GET /api/admin/groups', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should reject non-admin users', async () => {
    const res = await GET(createContext(normalUser));
    expect(res.status).toBe(403);
  });

  it('should reject unauthenticated requests', async () => {
    const res = await GET({ locals: {}, request: { url: 'http://localhost/api/admin/groups' } });
    expect(res.status).toBe(401);
  });

  it('should return all groups with member count for admin', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 1, name: 'admins', description: 'Administrators', member_count: 2 },
        { id: 2, name: 'produccion', description: 'Production team', member_count: 5 },
      ],
    });

    const res = await GET(createContext(admin));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.groups).toHaveLength(2);
    expect(body.groups[0].member_count).toBe(2);
  });

  it('should return single group with members when id is provided', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'admins', description: 'Admins', created_at: '2026-01-01' }] })
      .mockResolvedValueOnce({ rows: [{ id: 10, email: 'a@b.com', display_name: 'Alice', joined_at: '2026-01-01' }] });

    const res = await GET(createContext(admin, { searchParams: { id: '1' } }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe('admins');
    expect(data.members).toHaveLength(1);
    expect(data.members[0].email).toBe('a@b.com');
  });

  it('should return 404 for non-existent group id', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await GET(createContext(admin, { searchParams: { id: '999' } }));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/admin/groups', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should reject non-admin', async () => {
    const res = await POST(createContext(normalUser, { body: { name: 'test' } }));
    expect(res.status).toBe(403);
  });

  it('should require name', async () => {
    const res = await POST(createContext(admin, { body: {} }));
    expect(res.status).toBe(400);
  });

  it('should reject empty name', async () => {
    const res = await POST(createContext(admin, { body: { name: '  ' } }));
    expect(res.status).toBe(400);
  });

  it('should reject duplicate name', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const res = await POST(createContext(admin, { body: { name: 'admins' } }));
    expect(res.status).toBe(409);
  });

  it('should create group successfully', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // no duplicate
      .mockResolvedValueOnce({ rows: [{ id: 3, name: 'new-group', description: null, created_at: '2026-02-19' }] });

    const res = await POST(createContext(admin, { body: { name: 'new-group' } }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.name).toBe('new-group');
  });
});

describe('PUT /api/admin/groups', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should require id', async () => {
    const res = await PUT(createContext(admin, { body: { name: 'test' } }));
    expect(res.status).toBe(400);
  });

  it('should require at least one field to update', async () => {
    const res = await PUT(createContext(admin, { body: { id: 1 } }));
    expect(res.status).toBe(400);
  });

  it('should reject empty name', async () => {
    const res = await PUT(createContext(admin, { body: { id: 1, name: '' } }));
    expect(res.status).toBe(400);
  });

  it('should reject duplicate name on update', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 2 }] }); // dup check
    const res = await PUT(createContext(admin, { body: { id: 1, name: 'taken-name' } }));
    expect(res.status).toBe(409);
  });

  it('should update group name', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // no dup
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'renamed', description: null }] });

    const res = await PUT(createContext(admin, { body: { id: 1, name: 'renamed' } }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe('renamed');
  });

  it('should return 404 for non-existent group', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // no dup
      .mockResolvedValueOnce({ rows: [] }); // not found

    const res = await PUT(createContext(admin, { body: { id: 999, name: 'x' } }));
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/admin/groups', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should require id', async () => {
    const res = await DEL(createContext(admin, { body: {} }));
    expect(res.status).toBe(400);
  });

  it('should delete group and return it', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, name: 'old-group' }] });
    const res = await DEL(createContext(admin, { body: { id: 1 } }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.deleted.name).toBe('old-group');
  });

  it('should return 404 for non-existent group', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await DEL(createContext(admin, { body: { id: 999 } }));
    expect(res.status).toBe(404);
  });
});
