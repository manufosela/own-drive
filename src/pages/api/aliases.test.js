import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('../../lib/db.js', () => ({ query: mockQuery }));

const { GET } = await import('./aliases.js');

function createContext(overrides = {}) {
  return {
    locals: { user: { id: 10, is_admin: false }, ...overrides.locals },
    request: { url: overrides.url || 'http://localhost/api/aliases' },
  };
}

async function jsonBody(res) {
  return res.json();
}

describe('GET /api/aliases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 when no user', async () => {
    const ctx = createContext({ locals: { user: null } });
    const res = await GET(ctx);
    expect(res.status).toBe(401);
  });

  it('should return all visible aliases for admin', async () => {
    const ctx = createContext({ locals: { user: { id: 1, is_admin: true } } });
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 1, alias_name: 'Documentos', real_path: '/datosnas/docs', description: 'Docs' },
        { id: 2, alias_name: 'STLs', real_path: '/datosnas/stls', description: null },
      ],
    });

    const res = await GET(ctx);
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.aliases).toHaveLength(2);
    expect(body.aliases[0].alias_name).toBe('Documentos');

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toContain('visible = true');
    expect(sql).not.toContain('user_groups');
  });

  it('should return only authorized aliases for normal user', async () => {
    const ctx = createContext();
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: 2, alias_name: 'STLs', real_path: '/datosnas/stls', description: null },
      ],
    });

    const res = await GET(ctx);
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.aliases).toHaveLength(1);
    expect(body.aliases[0].alias_name).toBe('STLs');

    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toContain('user_groups');
    expect(sql).toContain('can_read = true');
    expect(mockQuery.mock.calls[0][1]).toEqual([10]);
  });

  it('should return empty array when user has no groups', async () => {
    const ctx = createContext();
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await GET(ctx);
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.aliases).toEqual([]);
  });
});
