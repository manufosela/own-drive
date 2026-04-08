import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('../../../lib/db.js', () => ({ query: mockQuery }));

const { GET } = await import('./audit.js');

function createContext(overrides = {}) {
  return {
    locals: { user: { id: 1, is_admin: true }, ...overrides.locals },
    request: { url: overrides.url || 'http://localhost/api/admin/audit' },
  };
}

describe('GET /api/admin/audit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should return 401 when no user', async () => {
    const res = await GET(createContext({ locals: { user: null } }));
    expect(res.status).toBe(401);
  });

  it('should return 403 when not admin', async () => {
    const res = await GET(createContext({ locals: { user: { id: 2, is_admin: false } } }));
    expect(res.status).toBe(403);
  });

  it('should return paginated audit entries', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: '2' }] })
      .mockResolvedValueOnce({
        rows: [
          { id: 1, user_id: 1, user_name: 'Admin', action: 'download', path: '/datosnas/f.stl', created_at: '2026-02-19T10:00:00Z' },
          { id: 2, user_id: 1, user_name: 'Admin', action: 'list', path: '/datosnas', created_at: '2026-02-19T09:00:00Z' },
        ],
      });

    const res = await GET(createContext());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.page).toBe(1);
  });

  it('should apply user_id and action filters', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: '1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, action: 'download' }] });

    await GET(createContext({ url: 'http://localhost/api/admin/audit?user_id=5&action=download' }));

    const countSql = mockQuery.mock.calls[0][0];
    expect(countSql).toContain('al.user_id = $1');
    expect(countSql).toContain('al.action = $2');
    expect(mockQuery.mock.calls[0][1]).toEqual([5, 'download']);
  });

  it('should apply date range filters', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    await GET(createContext({ url: 'http://localhost/api/admin/audit?from=2026-02-01&to=2026-02-19' }));

    const countSql = mockQuery.mock.calls[0][0];
    expect(countSql).toContain('al.created_at >= $1');
    expect(countSql).toContain('al.created_at < $2::date + 1');
  });
});
