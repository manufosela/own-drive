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

describe('POST /api/admin/users (pre-register)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClient.mockResolvedValue(mockClient);
    // Default: BEGIN resolves
    mockClientQuery.mockResolvedValue({ rows: [] });
  });

  const admin = { id: 1, is_admin: true };
  const normalUser = { id: 2, is_admin: false };

  function createContext(user, body = {}) {
    return {
      locals: { user },
      request: {
        json: () => Promise.resolve(body),
      },
    };
  }

  it('should reject unauthenticated requests', async () => {
    const res = await POST({ locals: {}, request: { json: () => Promise.resolve({}) } });
    expect(res.status).toBe(401);
  });

  it('should reject non-admin users', async () => {
    const res = await POST(createContext(normalUser, { email: 'new@geniova.com', group_ids: [1] }));
    expect(res.status).toBe(403);
  });

  it('should require email', async () => {
    const res = await POST(createContext(admin, { group_ids: [1] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('email');
  });

  it('should reject invalid email format', async () => {
    const res = await POST(createContext(admin, { email: 'not-an-email', group_ids: [1] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('email');
  });

  it('should require at least one group', async () => {
    const res = await POST(createContext(admin, { email: 'new@geniova.com' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('grupo');
  });

  it('should reject empty group_ids array', async () => {
    const res = await POST(createContext(admin, { email: 'new@geniova.com', group_ids: [] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('grupo');
  });

  it('should reject group_ids with only invalid entries', async () => {
    const res = await POST(createContext(admin, { email: 'new@geniova.com', group_ids: ['a', null, 1.5] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('grupo');
  });

  it('should reject duplicate email', async () => {
    // BEGIN
    mockClientQuery.mockResolvedValueOnce({ rows: [] });
    // INSERT user -> unique violation
    mockClientQuery.mockRejectedValueOnce({ code: '23505', constraint: 'users_email_key' });
    // ROLLBACK
    mockClientQuery.mockResolvedValueOnce({ rows: [] });

    const res = await POST(createContext(admin, { email: 'existing@geniova.com', group_ids: [1] }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain('existe');
  });

  it('should create pre-registered user with groups inside a transaction', async () => {
    // BEGIN
    mockClientQuery.mockResolvedValueOnce({ rows: [] });
    // INSERT user
    mockClientQuery.mockResolvedValueOnce({
      rows: [{ id: 10, email: 'new@geniova.com', display_name: 'new', is_admin: false, is_active: true, external_id: null }],
    });
    // Quota insert
    mockClientQuery.mockResolvedValueOnce({ rows: [] });
    // Group assignment
    mockClientQuery.mockResolvedValueOnce({ rows: [] });
    // COMMIT
    mockClientQuery.mockResolvedValueOnce({ rows: [] });

    const res = await POST(createContext(admin, { email: 'new@geniova.com', group_ids: [1] }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.user.id).toBe(10);
    expect(body.user.email).toBe('new@geniova.com');

    // Verify transaction: BEGIN ... COMMIT
    expect(mockClientQuery.mock.calls[0][0]).toBe('BEGIN');
    expect(mockClientQuery.mock.calls[1][0]).toContain('INSERT INTO users');
    expect(mockClientQuery.mock.calls[1][1][0]).toBeNull(); // external_id = NULL
    expect(mockClientQuery.mock.calls[mockClientQuery.mock.calls.length - 1][0]).toBe('COMMIT');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('should normalize email to lowercase and trim', async () => {
    // BEGIN
    mockClientQuery.mockResolvedValueOnce({ rows: [] });
    // INSERT user
    mockClientQuery.mockResolvedValueOnce({
      rows: [{ id: 11, email: 'upper@geniova.com', display_name: 'upper', is_admin: false, is_active: true, external_id: null }],
    });
    // Quota
    mockClientQuery.mockResolvedValueOnce({ rows: [] });
    // Group
    mockClientQuery.mockResolvedValueOnce({ rows: [] });
    // COMMIT
    mockClientQuery.mockResolvedValueOnce({ rows: [] });

    const res = await POST(createContext(admin, { email: '  Upper@Geniova.COM  ', group_ids: [1] }));
    expect(res.status).toBe(201);
    // The INSERT call is at index 1 (after BEGIN)
    expect(mockClientQuery.mock.calls[1][1][1]).toBe('upper@geniova.com');
  });

  it('should create user with display_name', async () => {
    // BEGIN
    mockClientQuery.mockResolvedValueOnce({ rows: [] });
    // INSERT user
    mockClientQuery.mockResolvedValueOnce({
      rows: [{ id: 12, email: 'named@geniova.com', display_name: 'John Doe', is_admin: false, is_active: true, external_id: null }],
    });
    // Quota
    mockClientQuery.mockResolvedValueOnce({ rows: [] });
    // Group
    mockClientQuery.mockResolvedValueOnce({ rows: [] });
    // COMMIT
    mockClientQuery.mockResolvedValueOnce({ rows: [] });

    const res = await POST(createContext(admin, { email: 'named@geniova.com', display_name: 'John Doe', group_ids: [1] }));
    expect(res.status).toBe(201);
    expect(mockClientQuery.mock.calls[1][1][2]).toBe('John Doe');
  });

  it('should assign multiple groups', async () => {
    // BEGIN
    mockClientQuery.mockResolvedValueOnce({ rows: [] });
    // INSERT user
    mockClientQuery.mockResolvedValueOnce({
      rows: [{ id: 13, email: 'grouped@geniova.com', display_name: 'grouped', is_admin: false, is_active: true, external_id: null }],
    });
    // Quota insert
    mockClientQuery.mockResolvedValueOnce({ rows: [] });
    // Group assignments (one INSERT per group)
    mockClientQuery.mockResolvedValueOnce({ rows: [] });
    mockClientQuery.mockResolvedValueOnce({ rows: [] });
    // COMMIT
    mockClientQuery.mockResolvedValueOnce({ rows: [] });

    const res = await POST(createContext(admin, { email: 'grouped@geniova.com', group_ids: [1, 2] }));
    expect(res.status).toBe(201);

    // Verify group INSERT calls
    const groupCalls = mockClientQuery.mock.calls.filter(c => c[0].includes?.('INSERT INTO user_groups'));
    expect(groupCalls).toHaveLength(2);
    expect(groupCalls[0][1]).toEqual([13, 1]);
    expect(groupCalls[1][1]).toEqual([13, 2]);
  });

  it('should use email prefix as display_name when not provided', async () => {
    // BEGIN
    mockClientQuery.mockResolvedValueOnce({ rows: [] });
    // INSERT user
    mockClientQuery.mockResolvedValueOnce({
      rows: [{ id: 14, email: 'john.doe@geniova.com', display_name: 'john.doe', is_admin: false, is_active: true, external_id: null }],
    });
    // Quota
    mockClientQuery.mockResolvedValueOnce({ rows: [] });
    // Group
    mockClientQuery.mockResolvedValueOnce({ rows: [] });
    // COMMIT
    mockClientQuery.mockResolvedValueOnce({ rows: [] });

    await POST(createContext(admin, { email: 'john.doe@geniova.com', group_ids: [1] }));
    expect(mockClientQuery.mock.calls[1][1][2]).toBe('john.doe');
  });

  it('should rollback transaction on unexpected error', async () => {
    // BEGIN
    mockClientQuery.mockResolvedValueOnce({ rows: [] });
    // INSERT user
    mockClientQuery.mockResolvedValueOnce({
      rows: [{ id: 15, email: 'fail@geniova.com', display_name: 'fail', is_admin: false, is_active: true, external_id: null }],
    });
    // Quota insert -> unexpected failure
    mockClientQuery.mockRejectedValueOnce(new Error('connection lost'));
    // ROLLBACK
    mockClientQuery.mockResolvedValueOnce({ rows: [] });

    await expect(POST(createContext(admin, { email: 'fail@geniova.com', group_ids: [1] }))).rejects.toThrow('connection lost');

    const rollbackCalls = mockClientQuery.mock.calls.filter(c => c[0] === 'ROLLBACK');
    expect(rollbackCalls).toHaveLength(1);
    expect(mockClient.release).toHaveBeenCalled();
  });
});

describe('GET /api/admin/users (status field)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const admin = { id: 1, is_admin: true };

  it('should include status field derived from external_id and is_active', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 1, email: 'active@test.com', display_name: 'Active', is_admin: false, is_active: true, external_id: 'uid-1', groups: [] },
        { id: 2, email: 'pending@test.com', display_name: 'Pending', is_admin: false, is_active: true, external_id: null, groups: [] },
        { id: 3, email: 'inactive@test.com', display_name: 'Inactive', is_admin: false, is_active: false, external_id: 'uid-3', groups: [] },
      ],
    });

    const res = await GET({ locals: { user: admin } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.users[0].status).toBe('active');
    expect(body.users[1].status).toBe('pending');
    expect(body.users[2].status).toBe('inactive');
  });
});
