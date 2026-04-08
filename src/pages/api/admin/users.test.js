import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
const mockClientQuery = vi.fn();
const mockClient = { query: mockClientQuery, release: vi.fn() };
const mockGetClient = vi.fn(() => Promise.resolve(mockClient));

vi.mock('../../../lib/db.js', () => ({
  query: mockQuery,
  getClient: mockGetClient,
}));

const { GET, POST } = await import('./users.js');

describe('GET /api/admin/users', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const admin = { id: 1, is_admin: true };
  const normalUser = { id: 2, is_admin: false };

  function createContext(user) {
    return { locals: { user } };
  }

  it('should reject non-admin users', async () => {
    const res = await GET(createContext(normalUser));
    expect(res.status).toBe(403);
  });

  it('should reject unauthenticated requests', async () => {
    const res = await GET({ locals: {} });
    expect(res.status).toBe(401);
  });

  it('should return all users with groups for admin', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 1, email: 'admin@test.com', display_name: 'Admin', is_admin: true, is_active: true, external_id: 'uid-1', groups: [{ id: 1, name: 'admins' }] },
        { id: 2, email: 'user@test.com', display_name: 'User', is_admin: false, is_active: true, external_id: 'uid-2', groups: [] },
      ],
    });

    const res = await GET(createContext(admin));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.users).toHaveLength(2);
    expect(body.users[0].groups).toHaveLength(1);
  });

  it('should derive status=pending for users with external_id=null', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 3, email: 'pending@test.com', display_name: 'Pending', is_admin: false, is_active: true, external_id: null, groups: [] },
      ],
    });

    const res = await GET(createContext(admin));
    const body = await res.json();
    expect(body.users[0].status).toBe('pending');
  });

  it('should derive status=active for users with external_id and is_active=true', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 1, email: 'active@test.com', display_name: 'Active', is_admin: false, is_active: true, external_id: 'uid-1', groups: [] },
      ],
    });

    const res = await GET(createContext(admin));
    const body = await res.json();
    expect(body.users[0].status).toBe('active');
  });

  it('should derive status=inactive for users with is_active=false', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 1, email: 'inactive@test.com', display_name: 'Inactive', is_admin: false, is_active: false, external_id: 'uid-1', groups: [] },
      ],
    });

    const res = await GET(createContext(admin));
    const body = await res.json();
    expect(body.users[0].status).toBe('inactive');
  });

  it('should not expose external_id in response', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 1, email: 'a@test.com', display_name: 'A', is_admin: false, is_active: true, external_id: 'uid-1', groups: [] },
      ],
    });

    const res = await GET(createContext(admin));
    const body = await res.json();
    expect(body.users[0].external_id).toBeUndefined();
  });
});

describe('POST /api/admin/users', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClient.mockResolvedValue(mockClient);
    mockClientQuery.mockResolvedValue({ rows: [] });
  });

  const admin = { id: 1, is_admin: true };

  function createPostContext(user, body) {
    return {
      locals: { user },
      request: { json: async () => body },
    };
  }

  it('should reject non-admin users', async () => {
    const res = await POST(createPostContext({ id: 2, is_admin: false }, {}));
    expect(res.status).toBe(403);
  });

  it('should reject invalid email', async () => {
    const res = await POST(createPostContext(admin, { email: 'not-an-email', group_ids: [1] }));
    expect(res.status).toBe(400);
  });

  it('should reject empty email', async () => {
    const res = await POST(createPostContext(admin, { email: '', group_ids: [1] }));
    expect(res.status).toBe(400);
  });

  it('should reject missing group_ids', async () => {
    const res = await POST(createPostContext(admin, { email: 'new@test.com' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('grupo');
  });

  it('should create pre-registered user with groups', async () => {
    // BEGIN
    mockClientQuery.mockResolvedValueOnce({ rows: [] });
    // INSERT user
    mockClientQuery.mockResolvedValueOnce({
      rows: [{ id: 10, email: 'new@test.com', display_name: 'new', is_admin: false, is_active: true, external_id: null }],
    });
    // quota
    mockClientQuery.mockResolvedValueOnce({ rows: [] });
    // group assignment
    mockClientQuery.mockResolvedValueOnce({ rows: [] });
    // COMMIT
    mockClientQuery.mockResolvedValueOnce({ rows: [] });

    const res = await POST(createPostContext(admin, {
      email: 'new@test.com',
      group_ids: [1],
    }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.user.email).toBe('new@test.com');
  });

  it('should return 409 for duplicate email', async () => {
    // BEGIN
    mockClientQuery.mockResolvedValueOnce({ rows: [] });
    // INSERT user -> unique violation
    mockClientQuery.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: '23505' }));
    // ROLLBACK
    mockClientQuery.mockResolvedValueOnce({ rows: [] });

    const res = await POST(createPostContext(admin, { email: 'dup@test.com', group_ids: [1] }));
    expect(res.status).toBe(409);
  });

  it('should normalize email to lowercase', async () => {
    // BEGIN
    mockClientQuery.mockResolvedValueOnce({ rows: [] });
    // INSERT user
    mockClientQuery.mockResolvedValueOnce({
      rows: [{ id: 11, email: 'upper@test.com', display_name: 'upper', is_admin: false, is_active: true, external_id: null }],
    });
    // quota
    mockClientQuery.mockResolvedValueOnce({ rows: [] });
    // group
    mockClientQuery.mockResolvedValueOnce({ rows: [] });
    // COMMIT
    mockClientQuery.mockResolvedValueOnce({ rows: [] });

    await POST(createPostContext(admin, { email: 'UPPER@Test.com', group_ids: [1] }));
    // INSERT call is at index 1 (after BEGIN)
    expect(mockClientQuery.mock.calls[1][1][1]).toBe('upper@test.com');
  });

  it('should use email prefix as display_name when not provided', async () => {
    // BEGIN
    mockClientQuery.mockResolvedValueOnce({ rows: [] });
    // INSERT user
    mockClientQuery.mockResolvedValueOnce({
      rows: [{ id: 12, email: 'john@test.com', display_name: 'john', is_admin: false, is_active: true, external_id: null }],
    });
    // quota
    mockClientQuery.mockResolvedValueOnce({ rows: [] });
    // group
    mockClientQuery.mockResolvedValueOnce({ rows: [] });
    // COMMIT
    mockClientQuery.mockResolvedValueOnce({ rows: [] });

    await POST(createPostContext(admin, { email: 'john@test.com', group_ids: [1] }));
    expect(mockClientQuery.mock.calls[1][1][2]).toBe('john');
  });
});
