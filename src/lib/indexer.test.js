import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('./db.js', () => ({
  query: mockQuery,
}));

const mockGetMountPoints = vi.fn();
vi.mock('./path-sanitizer.js', () => ({
  getMountPoints: mockGetMountPoints,
}));

const mockReaddir = vi.fn();
const mockStat = vi.fn();
vi.mock('node:fs/promises', () => ({
  default: { readdir: (...args) => mockReaddir(...args), stat: (...args) => mockStat(...args) },
  readdir: (...args) => mockReaddir(...args),
  stat: (...args) => mockStat(...args),
}));

const { NasIndexer } = await import('./indexer.js');

describe('NasIndexer', () => {
  /** @type {NasIndexer} */
  let indexer;

  beforeEach(() => {
    vi.clearAllMocks();
    indexer = new NasIndexer();
    mockQuery.mockResolvedValue({ rows: [] });
  });

  it('should index files and directories in batches', async () => {
    mockReaddir.mockResolvedValueOnce([
      { name: 'file1.stl', isDirectory: () => false },
      { name: 'subdir', isDirectory: () => true },
    ]);

    // stat for file1.stl
    mockStat.mockResolvedValueOnce({ size: 1000, mtimeMs: Date.parse('2026-01-10T00:00:00Z') });
    // stat for subdir (directory entry)
    mockStat.mockResolvedValueOnce({ size: 4096, mtimeMs: Date.parse('2026-01-09T00:00:00Z') });

    // readdir for subdir
    mockReaddir.mockResolvedValueOnce([
      { name: 'file2.obj', isDirectory: () => false },
    ]);

    // stat for file2.obj
    mockStat.mockResolvedValueOnce({ size: 2000, mtimeMs: Date.parse('2026-01-11T00:00:00Z') });

    await indexer.indexMount('/datosnas', '/mnt/datosnas');

    const insertCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO file_index'),
    );
    expect(insertCall).toBeDefined();

    const values = insertCall[1];
    expect(values).toContain('/datosnas/file1.stl');
    expect(values).toContain('/datosnas/subdir');
    expect(values).toContain('/datosnas/subdir/file2.obj');
  });

  it('should filter hidden entries (#recycle, @eaDir)', async () => {
    mockReaddir.mockResolvedValueOnce([
      { name: '#recycle', isDirectory: () => true },
      { name: '@eaDir', isDirectory: () => true },
      { name: 'visible.txt', isDirectory: () => false },
    ]);

    mockStat.mockResolvedValueOnce({ size: 100, mtimeMs: Date.now() });

    await indexer.indexMount('/datosnas', '/mnt/datosnas');

    const insertCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO file_index'),
    );
    expect(insertCall).toBeDefined();

    const values = insertCall[1];
    expect(values).toContain('/datosnas/visible.txt');
    expect(values).not.toContain('/datosnas/#recycle');
    expect(values).not.toContain('/datosnas/@eaDir');
  });

  it('should clean stale entries after indexation', async () => {
    mockReaddir.mockResolvedValueOnce([
      { name: 'file.txt', isDirectory: () => false },
    ]);
    mockStat.mockResolvedValueOnce({ size: 50, mtimeMs: Date.now() });

    await indexer.indexMount('/datosnas', '/mnt/datosnas');

    const deleteCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('DELETE FROM file_index'),
    );
    expect(deleteCall).toBeDefined();
    expect(deleteCall[1][0]).toBe('/datosnas');
  });

  it('should abort indexation when abort() is called', async () => {
    mockReaddir.mockImplementationOnce(async () => {
      indexer.abort();
      return [
        { name: 'file.txt', isDirectory: () => false },
      ];
    });

    await indexer.indexMount('/datosnas', '/mnt/datosnas');

    const insertCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO file_index'),
    );
    expect(insertCall).toBeUndefined();

    const idleCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes("status = 'idle'"),
    );
    expect(idleCall).toBeDefined();
  });

  it('should throw if indexation already running', async () => {
    let resolveReaddir;
    mockReaddir.mockImplementationOnce(
      () => new Promise((resolve) => { resolveReaddir = resolve; }),
    );

    const p = indexer.indexMount('/datosnas', '/mnt/datosnas');

    await expect(
      indexer.indexMount('/datosnas', '/mnt/datosnas'),
    ).rejects.toThrow('Indexation already in progress');

    resolveReaddir([]);
    await p;
  });

  it('should update index_status on error', async () => {
    // Clear default mock and set explicit sequence
    mockQuery.mockReset();
    mockQuery
      .mockResolvedValueOnce({ rows: [] })  // UPDATE index_status SET status='running'
      .mockRejectedValueOnce(new Error('DB connection lost')) // flush batch INSERT fails
      .mockResolvedValueOnce({ rows: [] }); // UPDATE index_status SET status='error' (in catch)

    mockReaddir.mockResolvedValueOnce([
      { name: 'file.txt', isDirectory: () => false },
    ]);
    mockStat.mockResolvedValueOnce({ size: 100, mtimeMs: Date.now() });

    await expect(
      indexer.indexMount('/datosnas', '/mnt/datosnas'),
    ).rejects.toThrow('DB connection lost');

    const errorCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes("status = 'error'"),
    );
    expect(errorCall).toBeDefined();
  });

  it('should index all mount points via indexAll()', async () => {
    mockGetMountPoints.mockReturnValueOnce([
      { virtualPath: '/datosnas', realPath: '/mnt/datosnas' },
      { virtualPath: '/no-comun', realPath: '/mnt/nocomun' },
    ]);

    // First mount - empty
    mockReaddir.mockResolvedValueOnce([]);
    // Second mount - empty
    mockReaddir.mockResolvedValueOnce([]);

    await indexer.indexAll();

    const runningCalls = mockQuery.mock.calls.filter(
      ([sql]) => typeof sql === 'string' && sql.includes("status = 'running'"),
    );
    expect(runningCalls.length).toBe(2);
  });

  it('should skip unreadable directories gracefully', async () => {
    mockReaddir.mockResolvedValueOnce([
      { name: 'protected', isDirectory: () => true },
      { name: 'ok.txt', isDirectory: () => false },
    ]);

    // stat for protected dir
    mockStat.mockResolvedValueOnce({ size: 4096, mtimeMs: Date.now() });
    // stat for ok.txt
    mockStat.mockResolvedValueOnce({ size: 10, mtimeMs: Date.now() });

    // readdir for protected dir fails
    mockReaddir.mockRejectedValueOnce(new Error('EACCES'));

    await indexer.indexMount('/datosnas', '/mnt/datosnas');

    const insertCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO file_index'),
    );
    expect(insertCall).toBeDefined();
    expect(insertCall[1]).toContain('/datosnas/ok.txt');
  });
});
