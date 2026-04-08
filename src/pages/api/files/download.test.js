import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import { Readable } from 'node:stream';

vi.mock('node:fs');

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

const { GET } = await import('./download.js');

describe('GET /api/files/download', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createContext(queryParams = {}, user = { id: 10, is_admin: false }, headers = {}) {
    const params = new URLSearchParams(queryParams);
    return {
      url: new URL(`http://localhost:3000/api/files/download?${params}`),
      locals: { user },
      request: { headers: new Map(Object.entries(headers)) },
    };
  }

  it('should return 400 when path param is missing', async () => {
    const res = await GET(createContext({}));
    expect(res.status).toBe(400);
  });

  it('should return 400 for path traversal attempts', async () => {
    mockSanitizePath.mockImplementationOnce(() => {
      const err = new Error('traversal detected');
      err.name = 'PathError';
      err.statusCode = 400;
      throw err;
    });

    const res = await GET(createContext({ path: '/datosnas/../../etc/passwd' }));
    expect(res.status).toBe(400);
  });

  it('should return 403 when user lacks read permission', async () => {
    mockSanitizePath.mockReturnValueOnce({
      virtualPath: '/datosnas/secret.pdf',
      realPath: '/mnt/datosnas/secret.pdf',
    });
    mockRequirePermission.mockResolvedValueOnce({ granted: false, status: 403 });

    const res = await GET(createContext({ path: '/datosnas/secret.pdf' }));
    expect(res.status).toBe(403);
  });

  it('should return 404 when file does not exist', async () => {
    mockSanitizePath.mockReturnValueOnce({
      virtualPath: '/datosnas/ghost.stl',
      realPath: '/mnt/datosnas/ghost.stl',
    });
    mockRequirePermission.mockResolvedValueOnce({ granted: true });
    vi.mocked(fs.existsSync).mockReturnValueOnce(false);

    const res = await GET(createContext({ path: '/datosnas/ghost.stl' }));
    expect(res.status).toBe(404);
  });

  it('should return 400 when path is a directory', async () => {
    mockSanitizePath.mockReturnValueOnce({
      virtualPath: '/datosnas/folder',
      realPath: '/mnt/datosnas/folder',
    });
    mockRequirePermission.mockResolvedValueOnce({ granted: true });
    vi.mocked(fs.existsSync).mockReturnValueOnce(true);
    vi.mocked(fs.statSync).mockReturnValueOnce(/** @type {any} */ ({
      isFile: () => false,
      size: 4096,
    }));

    const res = await GET(createContext({ path: '/datosnas/folder' }));
    expect(res.status).toBe(400);
  });

  it('should stream file with correct headers for STL', async () => {
    mockSanitizePath.mockReturnValueOnce({
      virtualPath: '/datosnas/model.stl',
      realPath: '/mnt/datosnas/model.stl',
    });
    mockRequirePermission.mockResolvedValueOnce({ granted: true });
    vi.mocked(fs.existsSync).mockReturnValueOnce(true);
    vi.mocked(fs.statSync).mockReturnValueOnce(/** @type {any} */ ({
      isFile: () => true,
      size: 5000000,
    }));

    const mockStream = new Readable({ read() { this.push(null); } });
    vi.mocked(fs.createReadStream).mockReturnValueOnce(/** @type {any} */ (mockStream));

    const res = await GET(createContext({ path: '/datosnas/model.stl' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toContain('model.stl');
    expect(res.headers.get('Content-Length')).toBe('5000000');
  });

  it('should set correct mime type for common extensions', async () => {
    mockSanitizePath.mockReturnValueOnce({
      virtualPath: '/datosnas/doc.pdf',
      realPath: '/mnt/datosnas/doc.pdf',
    });
    mockRequirePermission.mockResolvedValueOnce({ granted: true });
    vi.mocked(fs.existsSync).mockReturnValueOnce(true);
    vi.mocked(fs.statSync).mockReturnValueOnce(/** @type {any} */ ({
      isFile: () => true,
      size: 1024,
    }));

    const mockStream = new Readable({ read() { this.push(null); } });
    vi.mocked(fs.createReadStream).mockReturnValueOnce(/** @type {any} */ (mockStream));

    const res = await GET(createContext({ path: '/datosnas/doc.pdf' }));
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
  });
});
