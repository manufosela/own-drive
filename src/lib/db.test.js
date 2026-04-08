import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
const mockRelease = vi.fn();
const mockConnect = vi.fn();
const mockOn = vi.fn();

vi.mock('pg', () => {
  return {
    default: {
      Pool: function MockPool() {
        this.query = mockQuery;
        this.connect = mockConnect;
        this.on = mockOn;
      },
    },
  };
});

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  mockConnect.mockResolvedValue({ query: mockQuery, release: mockRelease });
});

describe('db', () => {
  describe('getPool', () => {
    it('should return a Pool instance', async () => {
      const { getPool } = await import('./db.js');
      const pool = getPool();
      expect(pool).toBeDefined();
      expect(typeof pool.query).toBe('function');
      expect(typeof pool.connect).toBe('function');
    });

    it('should return the same pool on multiple calls (singleton)', async () => {
      const { getPool } = await import('./db.js');
      const pool1 = getPool();
      const pool2 = getPool();
      expect(pool1).toBe(pool2);
    });

    it('should register error handler on pool', async () => {
      const { getPool } = await import('./db.js');
      getPool();
      expect(mockOn).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('error handler should log to console.error', async () => {
      const { getPool } = await import('./db.js');
      getPool();
      const errorHandler = mockOn.mock.calls.find((c) => c[0] === 'error')[1];
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      errorHandler(new Error('pool crash'));
      expect(spy).toHaveBeenCalledWith('[DB] Unexpected pool error:', expect.any(Error));
      spy.mockRestore();
    });
  });

  describe('query', () => {
    it('should execute a query through the pool', async () => {
      const { query } = await import('./db.js');
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 });
      const result = await query('SELECT 1');
      expect(mockQuery).toHaveBeenCalledWith('SELECT 1', undefined);
      expect(result.rows).toEqual([{ id: 1 }]);
    });

    it('should pass params to the query', async () => {
      const { query } = await import('./db.js');
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await query('SELECT * FROM users WHERE id = $1', [42]);
      expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', [42]);
    });

    it('should propagate query errors', async () => {
      const { query } = await import('./db.js');
      mockQuery.mockRejectedValueOnce(new Error('connection refused'));
      await expect(query('SELECT 1')).rejects.toThrow('connection refused');
    });
  });

  describe('checkConnection', () => {
    it('should return true when DB is reachable', async () => {
      const { checkConnection } = await import('./db.js');
      mockConnect.mockResolvedValueOnce({ query: mockQuery, release: mockRelease });
      mockQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
      const result = await checkConnection();
      expect(result).toBe(true);
      expect(mockRelease).toHaveBeenCalled();
    });

    it('should return false when DB is unreachable', async () => {
      const { checkConnection } = await import('./db.js');
      mockConnect.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const result = await checkConnection();
      expect(result).toBe(false);
    });
  });
});
