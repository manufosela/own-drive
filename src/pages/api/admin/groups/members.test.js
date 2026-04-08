import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('../../../../lib/db.js', () => ({
  query: mockQuery,
}));

const { POST, DELETE: DEL } = await import('./members.js');

const admin = { id: 1, is_admin: true };
const normalUser = { id: 2, is_admin: false };

function createContext(user, body) {
  return {
    locals: { user },
    request: { json: () => Promise.resolve(body) },
  };
}

describe('POST /api/admin/groups/members', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should reject non-admin', async () => {
    const res = await POST(createContext(normalUser, { group_id: 1, user_id: 1 }));
    expect(res.status).toBe(403);
  });

  it('should require group_id and user_id', async () => {
    const res = await POST(createContext(admin, { group_id: 1 }));
    expect(res.status).toBe(400);
  });

  it('should return 404 for non-existent group', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // group not found
    const res = await POST(createContext(admin, { group_id: 999, user_id: 1 }));
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain('Group');
  });

  it('should return 404 for non-existent user', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // group exists
      .mockResolvedValueOnce({ rows: [] }); // user not found
    const res = await POST(createContext(admin, { group_id: 1, user_id: 999 }));
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain('User');
  });

  it('should return 409 if user already a member', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // group exists
      .mockResolvedValueOnce({ rows: [{ id: 10 }] }) // user exists
      .mockResolvedValueOnce({ rows: [{}] }); // already member
    const res = await POST(createContext(admin, { group_id: 1, user_id: 10 }));
    expect(res.status).toBe(409);
  });

  it('should add member successfully', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // group exists
      .mockResolvedValueOnce({ rows: [{ id: 10 }] }) // user exists
      .mockResolvedValueOnce({ rows: [] }) // not already member
      .mockResolvedValueOnce({ rows: [] }); // insert
    const res = await POST(createContext(admin, { group_id: 1, user_id: 10 }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.added.group_id).toBe(1);
    expect(data.added.user_id).toBe(10);
  });
});

describe('DELETE /api/admin/groups/members', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should require group_id and user_id', async () => {
    const res = await DEL(createContext(admin, { group_id: 1 }));
    expect(res.status).toBe(400);
  });

  it('should remove member and return 200', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ group_id: 1, user_id: 10 }] });
    const res = await DEL(createContext(admin, { group_id: 1, user_id: 10 }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.removed.user_id).toBe(10);
  });

  it('should return 404 if membership not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await DEL(createContext(admin, { group_id: 1, user_id: 999 }));
    expect(res.status).toBe(404);
  });
});
