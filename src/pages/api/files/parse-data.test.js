import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';

vi.mock('node:fs');

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

const mockRequirePermission = vi.fn();
vi.mock('../../../lib/permission-middleware.js', () => ({
  requirePermission: mockRequirePermission,
}));

const mockParseMysqlDump = vi.fn();
vi.mock('../../../lib/parsers/mysql-parser.js', () => ({
  parseMysqlDump: mockParseMysqlDump,
}));

const mockParseCsv = vi.fn();
vi.mock('../../../lib/parsers/csv-parser.js', () => ({
  parseCsv: mockParseCsv,
}));

const { POST } = await import('./parse-data.js');

describe('POST /api/files/parse-data', () => {
  beforeEach(() => vi.clearAllMocks());

  function createContext(body) {
    return {
      request: { json: () => Promise.resolve(body) },
      locals: { user: { id: 1 } },
    };
  }

  it('should return 400 when path is missing', async () => {
    const res = await POST(createContext({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('path');
  });

  it('should return 403 when user lacks read permission', async () => {
    mockSanitizePath.mockReturnValueOnce({
      virtualPath: '/datosnas/file.sql',
      realPath: '/mnt/datosnas/file.sql',
    });
    mockRequirePermission.mockResolvedValueOnce({ granted: false, status: 403 });

    const res = await POST(createContext({ path: '/datosnas/file.sql' }));
    expect(res.status).toBe(403);
  });

  it('should return 404 when file does not exist', async () => {
    mockSanitizePath.mockReturnValueOnce({
      virtualPath: '/datosnas/missing.sql',
      realPath: '/mnt/datosnas/missing.sql',
    });
    mockRequirePermission.mockResolvedValueOnce({ granted: true });
    fs.existsSync.mockReturnValueOnce(false);

    const res = await POST(createContext({ path: '/datosnas/missing.sql' }));
    expect(res.status).toBe(404);
  });

  it('should return 400 for unsupported file extension', async () => {
    mockSanitizePath.mockReturnValueOnce({
      virtualPath: '/datosnas/file.xlsx',
      realPath: '/mnt/datosnas/file.xlsx',
    });
    mockRequirePermission.mockResolvedValueOnce({ granted: true });
    fs.existsSync.mockReturnValueOnce(true);
    fs.statSync.mockReturnValueOnce({ isDirectory: () => false, size: 100 });

    const res = await POST(createContext({ path: '/datosnas/file.xlsx' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Unsupported');
  });

  it('should parse SQL file successfully', async () => {
    mockSanitizePath.mockReturnValueOnce({
      virtualPath: '/datosnas/dump.sql',
      realPath: '/mnt/datosnas/dump.sql',
    });
    mockRequirePermission.mockResolvedValueOnce({ granted: true });
    fs.existsSync.mockReturnValueOnce(true);
    fs.statSync.mockReturnValueOnce({ isDirectory: () => false, size: 500 });
    fs.readFileSync.mockReturnValueOnce('INSERT INTO `t` VALUES (1);');
    mockParseMysqlDump.mockReturnValueOnce({
      format: 'sql',
      tables: [{
        name: 't',
        columns: [{ name: 'id', type: 'int', nullable: false }],
        rows: [['1']],
      }],
    });

    const res = await POST(createContext({ path: '/datosnas/dump.sql' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.format).toBe('sql');
    expect(body.tables).toHaveLength(1);
    expect(body.tables[0].name).toBe('t');
    expect(body.tables[0].sampleRows).toEqual([['1']]);
  });

  it('should parse CSV file successfully', async () => {
    mockSanitizePath.mockReturnValueOnce({
      virtualPath: '/datosnas/data.csv',
      realPath: '/mnt/datosnas/data.csv',
    });
    mockRequirePermission.mockResolvedValueOnce({ granted: true });
    fs.existsSync.mockReturnValueOnce(true);
    fs.statSync.mockReturnValueOnce({ isDirectory: () => false, size: 100 });
    fs.readFileSync.mockReturnValueOnce('name,age\nAlice,30\n');
    mockParseCsv.mockReturnValueOnce({
      format: 'csv',
      delimiter: ',',
      columns: [
        { name: 'name', inferredType: 'string' },
        { name: 'age', inferredType: 'number' },
      ],
      rows: [['Alice', '30']],
    });

    const res = await POST(createContext({ path: '/datosnas/data.csv' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.format).toBe('csv');
    expect(body.columns).toHaveLength(2);
    expect(body.sampleRows).toEqual([['Alice', '30']]);
  });
});
