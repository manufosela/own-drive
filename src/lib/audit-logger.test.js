import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('./db.js', () => ({
  query: mockQuery,
}));

const { logAudit, getClientIp, logAccessDedup, _resetAccessCache, ACCESS_DEDUP_MS } = await import('./audit-logger.js');

describe('logAudit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should insert a basic audit log entry', async () => {
    mockQuery.mockResolvedValueOnce({});

    await logAudit({
      userId: 1,
      action: 'download',
      path: '/datosnas/stls/model.stl',
    });

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO audit_log');
    expect(params[0]).toBe(1); // userId
    expect(params[1]).toBe('download'); // action
    expect(params[2]).toBe('/datosnas/stls/model.stl'); // path
    expect(params[3]).toBeNull(); // targetPath
    expect(params[4]).toBeNull(); // fileSize
    expect(params[5]).toBeNull(); // details
    expect(params[6]).toBeNull(); // ipAddress
  });

  it('should include optional fields when provided', async () => {
    mockQuery.mockResolvedValueOnce({});

    await logAudit({
      userId: 2,
      action: 'move',
      path: '/datosnas/old/file.txt',
      targetPath: '/datosnas/new/file.txt',
      fileSize: 2048,
      details: { reason: 'reorganization' },
      ipAddress: '192.168.1.100',
    });

    const params = mockQuery.mock.calls[0][1];
    expect(params[0]).toBe(2);
    expect(params[1]).toBe('move');
    expect(params[2]).toBe('/datosnas/old/file.txt');
    expect(params[3]).toBe('/datosnas/new/file.txt');
    expect(params[4]).toBe(2048);
    expect(params[5]).toBe('{"reason":"reorganization"}');
    expect(params[6]).toBe('192.168.1.100');
  });

  it('should not throw when query fails (best-effort)', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockQuery.mockRejectedValueOnce(new Error('DB connection lost'));

    await logAudit({
      userId: 1,
      action: 'download',
      path: '/datosnas/file.txt',
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      '[audit] Failed to log action:',
      'download',
      '/datosnas/file.txt',
      'DB connection lost',
    );
    consoleSpy.mockRestore();
  });
});

describe('logAccessDedup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetAccessCache();
  });

  it('should log access on first call', () => {
    mockQuery.mockResolvedValueOnce({});
    logAccessDedup({ userId: 1, path: '/datosnas/folder' });
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const params = mockQuery.mock.calls[0][1];
    expect(params[1]).toBe('access');
    expect(params[2]).toBe('/datosnas/folder');
  });

  it('should deduplicate same user+path within window', () => {
    mockQuery.mockResolvedValue({});
    logAccessDedup({ userId: 1, path: '/datosnas/folder' });
    logAccessDedup({ userId: 1, path: '/datosnas/folder' });
    logAccessDedup({ userId: 1, path: '/datosnas/folder' });
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('should allow different paths for same user', () => {
    mockQuery.mockResolvedValue({});
    logAccessDedup({ userId: 1, path: '/datosnas/a' });
    logAccessDedup({ userId: 1, path: '/datosnas/b' });
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('should allow same path for different users', () => {
    mockQuery.mockResolvedValue({});
    logAccessDedup({ userId: 1, path: '/datosnas/folder' });
    logAccessDedup({ userId: 2, path: '/datosnas/folder' });
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('should log again after dedup window expires', () => {
    mockQuery.mockResolvedValue({});
    logAccessDedup({ userId: 1, path: '/datosnas/folder' });
    expect(mockQuery).toHaveBeenCalledTimes(1);

    // Advance time past dedup window
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + ACCESS_DEDUP_MS + 1);
    _resetAccessCache();
    logAccessDedup({ userId: 1, path: '/datosnas/folder' });
    expect(mockQuery).toHaveBeenCalledTimes(2);
    vi.restoreAllMocks();
  });

  it('should not log when userId is missing', () => {
    logAccessDedup({ userId: null, path: '/datosnas/folder' });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('should not log when path is missing', () => {
    logAccessDedup({ userId: 1, path: '' });
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('getClientIp', () => {
  it('should extract IP from x-forwarded-for header', () => {
    const context = {
      request: {
        headers: new Map([['x-forwarded-for', '10.0.0.1, 172.16.0.1']]),
      },
    };
    // Use a Headers-like interface
    context.request.headers.get = (name) => {
      const map = { 'x-forwarded-for': '10.0.0.1, 172.16.0.1' };
      return map[name] ?? null;
    };

    expect(getClientIp(context)).toBe('10.0.0.1');
  });

  it('should extract IP from x-real-ip header', () => {
    const context = {
      request: {
        headers: { get: (name) => name === 'x-real-ip' ? '192.168.1.50' : null },
      },
    };

    expect(getClientIp(context)).toBe('192.168.1.50');
  });

  it('should return null when no IP headers present', () => {
    const context = {
      request: {
        headers: { get: () => null },
      },
    };

    expect(getClientIp(context)).toBeNull();
  });
});
