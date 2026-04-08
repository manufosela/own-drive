import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('../../../lib/db.js', () => ({
  query: mockQuery,
}));

const mockIndexer = {
  running: false,
  indexAll: vi.fn(),
  abort: vi.fn(),
};
vi.mock('../../../lib/indexer.js', () => ({
  indexer: mockIndexer,
}));

const mockGetMountPoints = vi.fn(() => [
  { virtualPath: '/datosnas', realPath: '/mnt/datosnas' },
  { virtualPath: '/no-comun', realPath: '/mnt/nocomun' },
]);
vi.mock('../../../lib/path-sanitizer.js', () => ({
  getMountPoints: mockGetMountPoints,
}));

const { GET, POST, DELETE } = await import('./reindex.js');

describe('/api/admin/reindex', () => {
  const admin = { id: 1, is_admin: true };
  const normalUser = { id: 2, is_admin: false };

  beforeEach(() => {
    vi.clearAllMocks();
    mockIndexer.running = false;
    mockIndexer.indexAll.mockResolvedValue(undefined);
  });

  function createContext(user) {
    return {
      locals: { user },
      request: { url: 'http://localhost:3000/api/admin/reindex' },
    };
  }

  describe('GET', () => {
    it('should reject unauthenticated requests', async () => {
      const res = await GET({ locals: {} });
      expect(res.status).toBe(401);
    });

    it('should reject non-admin users', async () => {
      const res = await GET(createContext(normalUser));
      expect(res.status).toBe(403);
    });

    it('should return index status for admin', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { mount_point: '/datosnas', status: 'done', total_files: 50000, indexed_files: 50000 },
          { mount_point: '/no-comun', status: 'idle', total_files: 0, indexed_files: 0 },
        ],
      });

      const res = await GET(createContext(admin));
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.status).toHaveLength(2);
      expect(body.status[0].mount_point).toBe('/datosnas');
      expect(body.status[0].status).toBe('done');
    });
  });

  describe('POST', () => {
    it('should reject unauthenticated requests', async () => {
      const res = await POST({ locals: {} });
      expect(res.status).toBe(401);
    });

    it('should reject non-admin users', async () => {
      const res = await POST(createContext(normalUser));
      expect(res.status).toBe(403);
    });

    it('should start reindexation and return 202', async () => {
      const res = await POST(createContext(admin));
      expect(res.status).toBe(202);

      const body = await res.json();
      expect(body.message).toBe('Reindexation started');
      expect(body.mounts).toContain('/datosnas');
      expect(mockIndexer.indexAll).toHaveBeenCalled();
    });

    it('should return 409 if indexation is already running', async () => {
      mockIndexer.running = true;

      const res = await POST(createContext(admin));
      expect(res.status).toBe(409);
    });
  });

  describe('DELETE', () => {
    it('should reject unauthenticated requests', async () => {
      const res = await DELETE({ locals: {} });
      expect(res.status).toBe(401);
    });

    it('should reject non-admin users', async () => {
      const res = await DELETE(createContext(normalUser));
      expect(res.status).toBe(403);
    });

    it('should cancel running indexation', async () => {
      mockIndexer.running = true;

      const res = await DELETE(createContext(admin));
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.message).toBe('Indexation cancelled');
      expect(mockIndexer.abort).toHaveBeenCalled();
    });

    it('should return OK when no indexation is running', async () => {
      const res = await DELETE(createContext(admin));
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.message).toBe('No indexation in progress');
      expect(mockIndexer.abort).not.toHaveBeenCalled();
    });
  });
});
