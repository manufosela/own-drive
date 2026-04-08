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

vi.mock('../../../lib/audit-logger.js', () => ({
  logAudit: vi.fn(),
  getClientIp: vi.fn(() => '127.0.0.1'),
}));

const mockParseMysqlDump = vi.fn();
vi.mock('../../../lib/parsers/mysql-parser.js', () => ({
  parseMysqlDump: mockParseMysqlDump,
}));

const mockParseCsv = vi.fn();
vi.mock('../../../lib/parsers/csv-parser.js', () => ({
  parseCsv: mockParseCsv,
}));

const mockAnonymize = vi.fn();
vi.mock('../../../lib/anonymizer/anonymizer-engine.js', () => ({
  anonymize: mockAnonymize,
}));

const mockGenerateSql = vi.fn();
vi.mock('../../../lib/generators/sql-generator.js', () => ({
  generateSql: mockGenerateSql,
}));

const mockGenerateCsv = vi.fn();
vi.mock('../../../lib/generators/csv-generator.js', () => ({
  generateCsv: mockGenerateCsv,
}));

const { POST } = await import('./anonymize-data.js');

describe('POST /api/files/anonymize-data', () => {
  beforeEach(() => vi.clearAllMocks());

  function createContext(body) {
    return {
      request: { json: () => Promise.resolve(body) },
      locals: { user: { id: 1 } },
    };
  }

  const validConfig = [
    { name: 'id', strategy: 'preserve' },
    { name: 'name', strategy: 'fake', fakerType: 'name' },
  ];

  it('should return 400 when path is missing', async () => {
    const res = await POST(createContext({ config: validConfig }));
    expect(res.status).toBe(400);
  });

  it('should return 400 when config is missing', async () => {
    const res = await POST(createContext({ path: '/datosnas/file.sql' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('config');
  });

  it('should return 400 when config is empty', async () => {
    const res = await POST(createContext({ path: '/datosnas/file.sql', config: [] }));
    expect(res.status).toBe(400);
  });

  it('should return 403 when user lacks write permission', async () => {
    mockSanitizePath.mockReturnValueOnce({
      virtualPath: '/datosnas/file.sql',
      realPath: '/mnt/datosnas/file.sql',
    });
    mockRequirePermission.mockResolvedValueOnce({ granted: false, status: 403 });

    const res = await POST(createContext({ path: '/datosnas/file.sql', config: validConfig }));
    expect(res.status).toBe(403);
  });

  it('should anonymize SQL file and write output', async () => {
    mockSanitizePath.mockReturnValueOnce({
      virtualPath: '/datosnas/dump.sql',
      realPath: '/mnt/datosnas/dump.sql',
    });
    mockRequirePermission.mockResolvedValueOnce({ granted: true });
    fs.existsSync.mockReturnValueOnce(true);
    fs.statSync.mockReturnValueOnce({ isDirectory: () => false, size: 500 });
    fs.readFileSync.mockReturnValueOnce('SQL content');
    mockParseMysqlDump.mockReturnValueOnce({
      format: 'sql',
      tables: [{
        name: 't',
        columns: [
          { name: 'id', type: 'int' },
          { name: 'name', type: 'varchar' },
        ],
        rows: [['1', 'Alice']],
      }],
    });
    mockAnonymize.mockReturnValueOnce([['1', 'FakeAlice']]);
    mockGenerateSql.mockReturnValueOnce('-- anonymized SQL');

    const res = await POST(createContext({ path: '/datosnas/dump.sql', config: validConfig }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.outputPath).toContain('dump_anonymized.sql');
    expect(body.stats.rowsProcessed).toBe(1);
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('dump_anonymized.sql'),
      '-- anonymized SQL',
      'utf-8',
    );
  });

  it('should anonymize CSV file and write output', async () => {
    mockSanitizePath.mockReturnValueOnce({
      virtualPath: '/datosnas/data.csv',
      realPath: '/mnt/datosnas/data.csv',
    });
    mockRequirePermission.mockResolvedValueOnce({ granted: true });
    fs.existsSync.mockReturnValueOnce(true);
    fs.statSync.mockReturnValueOnce({ isDirectory: () => false, size: 100 });
    fs.readFileSync.mockReturnValueOnce('name,age\nAlice,30');
    mockParseCsv.mockReturnValueOnce({
      format: 'csv',
      delimiter: ',',
      columns: [
        { name: 'name', inferredType: 'string' },
        { name: 'age', inferredType: 'number' },
      ],
      rows: [['Alice', '30']],
    });
    mockAnonymize.mockReturnValueOnce([['FakeAlice', '30']]);
    mockGenerateCsv.mockReturnValueOnce('name,age\nFakeAlice,30\n');

    const res = await POST(createContext({ path: '/datosnas/data.csv', config: validConfig }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.outputPath).toContain('data_anonymized.csv');
  });

  it('should return 400 for unsupported file format', async () => {
    mockSanitizePath.mockReturnValueOnce({
      virtualPath: '/datosnas/file.xlsx',
      realPath: '/mnt/datosnas/file.xlsx',
    });
    mockRequirePermission.mockResolvedValueOnce({ granted: true });
    fs.existsSync.mockReturnValueOnce(true);
    fs.statSync.mockReturnValueOnce({ isDirectory: () => false, size: 100 });

    const res = await POST(createContext({ path: '/datosnas/file.xlsx', config: validConfig }));
    expect(res.status).toBe(400);
  });
});
