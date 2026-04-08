import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDbQuery = vi.fn();
vi.mock('../../../lib/db.js', () => ({
  query: mockDbQuery,
}));

const mockRequirePermission = vi.fn();
vi.mock('../../../lib/permission-middleware.js', () => ({
  requirePermission: mockRequirePermission,
}));

const mockSanitizePath = vi.fn();
vi.mock('../../../lib/path-sanitizer.js', () => ({
  sanitizePath: mockSanitizePath,
  PathError: class PathError extends Error {
    constructor(message, statusCode) {
      super(message);
      this.name = 'PathError';
      this.statusCode = statusCode;
    }
  },
}));

const { GET } = await import('./search.js');

describe('GET /api/files/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createContext(params = {}, user = { id: 10, is_admin: false }) {
    const url = new URL('http://localhost:3000/api/files/search');
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
    return { url, locals: { user } };
  }

  it('should return 400 when query param is missing', async () => {
    const res = await GET(createContext({ path: '/datosnas' }));
    expect(res.status).toBe(400);
  });

  it('should return 400 when path param is missing', async () => {
    const res = await GET(createContext({ q: 'model' }));
    expect(res.status).toBe(400);
  });

  it('should return 400 when query is too short', async () => {
    const res = await GET(createContext({ path: '/datosnas', q: 'a' }));
    expect(res.status).toBe(400);
  });

  it('should return 400 for invalid path', async () => {
    mockSanitizePath.mockImplementationOnce(() => {
      const err = new Error('traversal');
      err.name = 'PathError';
      err.statusCode = 400;
      throw err;
    });

    const res = await GET(createContext({ path: '/datosnas/../../etc', q: 'passwd' }));
    expect(res.status).toBe(400);
  });

  it('should return 403 when user lacks read permission', async () => {
    mockSanitizePath.mockReturnValueOnce({
      virtualPath: '/datosnas/secret',
      realPath: '/mnt/datosnas/secret',
    });
    mockRequirePermission.mockResolvedValueOnce({ granted: false, status: 403 });

    const res = await GET(createContext({ path: '/datosnas/secret', q: 'file' }));
    expect(res.status).toBe(403);
  });

  it('should search via SQL and return matching files', async () => {
    mockSanitizePath.mockReturnValueOnce({
      virtualPath: '/datosnas',
      realPath: '/mnt/datosnas',
    });
    mockRequirePermission.mockResolvedValueOnce({ granted: true });

    mockDbQuery.mockResolvedValueOnce({
      rows: [
        {
          name: 'model.stl',
          type: 'file',
          size: '5000',
          modified: '2026-01-15T10:00:00.000Z',
          path: '/datosnas/model.stl',
        },
        {
          name: 'model_v2.stl',
          type: 'file',
          size: '8000',
          modified: '2026-02-01T14:30:00.000Z',
          path: '/datosnas/subfolder/model_v2.stl',
        },
      ],
    });

    const res = await GET(createContext({ path: '/datosnas', q: 'model' }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.results).toHaveLength(2);
    expect(body.results[0].name).toBe('model.stl');
    expect(body.results[0].path).toBe('/datosnas/model.stl');
    expect(body.results[0].size).toBe(5000);
    expect(body.results[1].name).toBe('model_v2.stl');
    expect(body.results[1].path).toBe('/datosnas/subfolder/model_v2.stl');
    expect(body.query).toBe('model');
  });

  it('should return empty results when nothing matches', async () => {
    mockSanitizePath.mockReturnValueOnce({
      virtualPath: '/datosnas',
      realPath: '/mnt/datosnas',
    });
    mockRequirePermission.mockResolvedValueOnce({ granted: true });

    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    const res = await GET(createContext({ path: '/datosnas', q: 'model' }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.results).toHaveLength(0);
  });

  it('should scope search to the given virtual path', async () => {
    mockSanitizePath.mockReturnValueOnce({
      virtualPath: '/datosnas/deep/folder',
      realPath: '/mnt/datosnas/deep/folder',
    });
    mockRequirePermission.mockResolvedValueOnce({ granted: true });

    mockDbQuery.mockResolvedValueOnce({ rows: [] });

    await GET(createContext({ path: '/datosnas/deep/folder', q: 'test' }));

    // Verify the SQL params include the scoped path
    const [, params] = mockDbQuery.mock.calls[0];
    expect(params[0]).toBe('test');
    expect(params[1]).toBe('/datosnas/deep/folder');
    expect(params[2]).toBe(100); // MAX_RESULTS
  });

  it('should return empty results with warning on SQL error', async () => {
    mockSanitizePath.mockReturnValueOnce({
      virtualPath: '/datosnas',
      realPath: '/mnt/datosnas',
    });
    mockRequirePermission.mockResolvedValueOnce({ granted: true });

    mockDbQuery.mockRejectedValueOnce(new Error('relation "file_index" does not exist'));

    const res = await GET(createContext({ path: '/datosnas', q: 'model' }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.results).toHaveLength(0);
    expect(body.warning).toBeDefined();
  });

  it('should convert size from string to number', async () => {
    mockSanitizePath.mockReturnValueOnce({
      virtualPath: '/datosnas',
      realPath: '/mnt/datosnas',
    });
    mockRequirePermission.mockResolvedValueOnce({ granted: true });

    mockDbQuery.mockResolvedValueOnce({
      rows: [
        {
          name: 'big.zip',
          type: 'file',
          size: '9876543210',
          modified: null,
          path: '/datosnas/big.zip',
        },
      ],
    });

    const res = await GET(createContext({ path: '/datosnas', q: 'big' }));
    const body = await res.json();
    expect(typeof body.results[0].size).toBe('number');
    expect(body.results[0].size).toBe(9876543210);
    expect(body.results[0].modified).toBeNull();
  });
});
