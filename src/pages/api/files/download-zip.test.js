import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';

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

// Mock archiver
const mockArchiver = {
  pipe: vi.fn(),
  file: vi.fn(),
  finalize: vi.fn(),
  on: vi.fn(),
};
vi.mock('archiver', () => ({
  default: vi.fn(() => mockArchiver),
}));

const { POST } = await import('./download-zip.js');

describe('POST /api/files/download-zip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockArchiver.on.mockImplementation((event, cb) => {
      if (event === 'end') setTimeout(cb, 0);
      return mockArchiver;
    });
  });

  function createContext(body, user = { id: 10, is_admin: false }) {
    return {
      request: { json: () => Promise.resolve(body) },
      locals: { user },
    };
  }

  it('should return 400 when paths array is missing', async () => {
    const res = await POST(createContext({}));
    expect(res.status).toBe(400);
  });

  it('should return 400 when paths is empty', async () => {
    const res = await POST(createContext({ paths: [] }));
    expect(res.status).toBe(400);
  });

  it('should return 400 for path traversal', async () => {
    mockSanitizePath.mockImplementationOnce(() => {
      const err = new Error('traversal');
      err.name = 'PathError';
      err.statusCode = 400;
      throw err;
    });

    const res = await POST(createContext({ paths: ['/datosnas/../../etc'] }));
    expect(res.status).toBe(400);
  });

  it('should return 400 when path is a directory', async () => {
    mockSanitizePath.mockReturnValueOnce({
      virtualPath: '/datosnas/folder',
      realPath: '/mnt/datosnas/folder',
    });
    mockRequirePermission.mockResolvedValueOnce({ granted: true });
    vi.mocked(fs.existsSync).mockReturnValueOnce(true);
    vi.mocked(fs.statSync).mockReturnValueOnce(/** @type {any} */ ({ isFile: () => false }));

    const res = await POST(createContext({ paths: ['/datosnas/folder'] }));
    expect(res.status).toBe(400);
  });

  it('should return 403 when user lacks permission on any file', async () => {
    mockSanitizePath.mockReturnValueOnce({
      virtualPath: '/datosnas/file1.stl',
      realPath: '/mnt/datosnas/file1.stl',
    });
    mockRequirePermission.mockResolvedValueOnce({ granted: false, status: 403 });

    const res = await POST(createContext({ paths: ['/datosnas/file1.stl'] }));
    expect(res.status).toBe(403);
  });

  it('should return 404 when any file does not exist', async () => {
    mockSanitizePath.mockReturnValueOnce({
      virtualPath: '/datosnas/ghost.stl',
      realPath: '/mnt/datosnas/ghost.stl',
    });
    mockRequirePermission.mockResolvedValueOnce({ granted: true });
    vi.mocked(fs.existsSync).mockReturnValueOnce(false);

    const res = await POST(createContext({ paths: ['/datosnas/ghost.stl'] }));
    expect(res.status).toBe(404);
  });

  it('should create a ZIP response for valid files', async () => {
    mockSanitizePath
      .mockReturnValueOnce({
        virtualPath: '/datosnas/file1.stl',
        realPath: '/mnt/datosnas/file1.stl',
      })
      .mockReturnValueOnce({
        virtualPath: '/datosnas/file2.pdf',
        realPath: '/mnt/datosnas/file2.pdf',
      });
    mockRequirePermission
      .mockResolvedValueOnce({ granted: true })
      .mockResolvedValueOnce({ granted: true });
    vi.mocked(fs.existsSync)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true);
    vi.mocked(fs.statSync)
      .mockReturnValueOnce(/** @type {any} */ ({ isFile: () => true }))
      .mockReturnValueOnce(/** @type {any} */ ({ isFile: () => true }));

    const res = await POST(createContext({
      paths: ['/datosnas/file1.stl', '/datosnas/file2.pdf'],
    }));

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/zip');
    expect(res.headers.get('Content-Disposition')).toContain('.zip');
    expect(mockArchiver.file).toHaveBeenCalledTimes(2);
    expect(mockArchiver.finalize).toHaveBeenCalled();
  });
});
