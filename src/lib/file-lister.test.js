import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('./db.js', () => ({
  query: (...args) => mockQuery(...args),
}));

const mockReaddirSync = vi.fn();
const mockStatSync = vi.fn();
const mockExistsSync = vi.fn();
vi.mock('node:fs', () => ({
  default: {
    readdirSync: (...args) => mockReaddirSync(...args),
    statSync: (...args) => mockStatSync(...args),
    existsSync: (...args) => mockExistsSync(...args),
  },
}));

const { listDirectorySorted } = await import('./file-lister.js');

describe('listDirectorySorted', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return items sorted by modified DESC from database', async () => {
    mockReaddirSync.mockReturnValue([
      { name: 'old.txt', isDirectory: () => false },
      { name: 'new.txt', isDirectory: () => false },
      { name: 'docs', isDirectory: () => true },
    ]);

    // Indexed virtual_paths query (sets match → no reconciliation)
    mockQuery.mockResolvedValueOnce({
      rows: [
        { virtual_path: '/datosnas/test/old.txt' },
        { virtual_path: '/datosnas/test/new.txt' },
        { virtual_path: '/datosnas/test/docs' },
      ],
    });

    // Main listing query
    mockQuery.mockResolvedValueOnce({
      rows: [
        { name: 'docs', type: 'directory', size: 0, modified: '2026-03-10T00:00:00Z', path: '/datosnas/test/docs' },
        { name: 'new.txt', type: 'file', size: 500, modified: '2026-03-09T00:00:00Z', path: '/datosnas/test/new.txt' },
        { name: 'old.txt', type: 'file', size: 100, modified: '2026-01-01T00:00:00Z', path: '/datosnas/test/old.txt' },
      ],
    });

    const result = await listDirectorySorted({
      virtualPath: '/datosnas/test',
      realPath: '/volume1/datosnas/test',
      sortBy: 'modified',
      sortDir: 'desc',
      page: 1,
      limit: 50,
    });

    expect(result.items).toHaveLength(3);
    expect(result.items[0].name).toBe('docs');
    expect(result.items[1].name).toBe('new.txt');
    expect(result.items[2].name).toBe('old.txt');
    expect(result.total).toBe(3);
  });

  it('should return items sorted by size DESC from database', async () => {
    mockReaddirSync.mockReturnValue([
      { name: 'small.txt', isDirectory: () => false },
      { name: 'big.txt', isDirectory: () => false },
    ]);

    mockQuery.mockResolvedValueOnce({
      rows: [
        { virtual_path: '/datosnas/test/small.txt' },
        { virtual_path: '/datosnas/test/big.txt' },
      ],
    });
    mockQuery.mockResolvedValueOnce({
      rows: [
        { name: 'big.txt', type: 'file', size: 10000, modified: '2026-01-01T00:00:00Z', path: '/datosnas/test/big.txt' },
        { name: 'small.txt', type: 'file', size: 100, modified: '2026-03-01T00:00:00Z', path: '/datosnas/test/small.txt' },
      ],
    });

    const result = await listDirectorySorted({
      virtualPath: '/datosnas/test',
      realPath: '/volume1/datosnas/test',
      sortBy: 'size',
      sortDir: 'desc',
      page: 1,
      limit: 50,
    });

    expect(result.items).toHaveLength(2);
    expect(result.items[0].name).toBe('big.txt');
    expect(result.items[1].name).toBe('small.txt');
    expect(result.total).toBe(2);
  });

  it('should return items sorted by name ASC from database', async () => {
    mockReaddirSync.mockReturnValue([
      { name: 'zebra.txt', isDirectory: () => false },
      { name: 'alpha.txt', isDirectory: () => false },
    ]);

    mockQuery.mockResolvedValueOnce({
      rows: [
        { virtual_path: '/datosnas/test/zebra.txt' },
        { virtual_path: '/datosnas/test/alpha.txt' },
      ],
    });
    mockQuery.mockResolvedValueOnce({
      rows: [
        { name: 'alpha.txt', type: 'file', size: 100, modified: '2026-01-01T00:00:00Z', path: '/datosnas/test/alpha.txt' },
        { name: 'zebra.txt', type: 'file', size: 200, modified: '2026-02-01T00:00:00Z', path: '/datosnas/test/zebra.txt' },
      ],
    });

    const result = await listDirectorySorted({
      virtualPath: '/datosnas/test',
      realPath: '/volume1/datosnas/test',
      sortBy: 'name',
      sortDir: 'asc',
      page: 1,
      limit: 50,
    });

    expect(result.items).toHaveLength(2);
    expect(result.items[0].name).toBe('alpha.txt');
    expect(result.items[1].name).toBe('zebra.txt');
  });

  it('should reconcile unindexed files when FS has entries not in DB', async () => {
    // FS has 3 entries, DB has only 2
    mockReaddirSync.mockReturnValue([
      { name: 'indexed.txt', isDirectory: () => false },
      { name: 'new-file.txt', isDirectory: () => false },
      { name: 'also-indexed.txt', isDirectory: () => false },
    ]);

    // Indexed virtual_paths (missing new-file.txt)
    mockQuery.mockResolvedValueOnce({
      rows: [
        { virtual_path: '/datosnas/test/indexed.txt' },
        { virtual_path: '/datosnas/test/also-indexed.txt' },
      ],
    });

    // stat for new-file.txt (the unindexed one)
    mockStatSync.mockReturnValue({
      isDirectory: () => false,
      size: 300,
      mtimeMs: Date.parse('2026-03-10T12:00:00Z'),
    });

    // INSERT for the missing file
    mockQuery.mockResolvedValueOnce({ rows: [] });

    // Main listing query after reconciliation
    mockQuery.mockResolvedValueOnce({
      rows: [
        { name: 'new-file.txt', type: 'file', size: 300, modified: '2026-03-10T12:00:00Z', path: '/datosnas/test/new-file.txt' },
        { name: 'indexed.txt', type: 'file', size: 100, modified: '2026-03-01T00:00:00Z', path: '/datosnas/test/indexed.txt' },
        { name: 'also-indexed.txt', type: 'file', size: 200, modified: '2026-02-01T00:00:00Z', path: '/datosnas/test/also-indexed.txt' },
      ],
    });

    const result = await listDirectorySorted({
      virtualPath: '/datosnas/test',
      realPath: '/volume1/datosnas/test',
      sortBy: 'modified',
      sortDir: 'desc',
      page: 1,
      limit: 50,
    });

    expect(result.items).toHaveLength(3);
    expect(result.total).toBe(3);
    // Queries: 1=indexed paths, 2=INSERT, 3=listing
    expect(mockQuery).toHaveBeenCalledTimes(3);
  });

  it('should handle pagination correctly with LIMIT/OFFSET', async () => {
    const fsEntries = Array.from({ length: 100 }, (_, i) => ({
      name: `file${i}.txt`,
      isDirectory: () => false,
    }));
    mockReaddirSync.mockReturnValue(fsEntries);

    // Indexed paths (all 100 match)
    mockQuery.mockResolvedValueOnce({
      rows: fsEntries.map((e) => ({ virtual_path: `/datosnas/test/${e.name}` })),
    });
    mockQuery.mockResolvedValueOnce({
      rows: Array.from({ length: 50 }, (_, i) => ({
        name: `file${i + 50}.txt`,
        type: 'file',
        size: 100,
        modified: '2026-01-01T00:00:00Z',
        path: `/datosnas/test/file${i + 50}.txt`,
      })),
    });

    const result = await listDirectorySorted({
      virtualPath: '/datosnas/test',
      realPath: '/volume1/datosnas/test',
      sortBy: 'name',
      sortDir: 'asc',
      page: 2,
      limit: 50,
    });

    expect(result.items).toHaveLength(50);
    expect(result.total).toBe(100);
    expect(result.page).toBe(2);
    expect(result.pages).toBe(2);

    // Verify OFFSET was passed correctly (page 2, limit 50 → offset 50)
    const listingCall = mockQuery.mock.calls[1];
    expect(listingCall[1]).toContain(50); // limit
    expect(listingCall[1]).toContain(50); // offset
  });

  it('should filter hidden entries during reconciliation', async () => {
    mockReaddirSync.mockReturnValue([
      { name: 'file.txt', isDirectory: () => false },
      { name: '#recycle', isDirectory: () => true },
      { name: '@eaDir', isDirectory: () => true },
    ]);

    // Indexed paths match filtered FS (only file.txt)
    mockQuery.mockResolvedValueOnce({
      rows: [{ virtual_path: '/datosnas/test/file.txt' }],
    });

    mockQuery.mockResolvedValueOnce({
      rows: [
        { name: 'file.txt', type: 'file', size: 100, modified: '2026-01-01T00:00:00Z', path: '/datosnas/test/file.txt' },
      ],
    });

    const result = await listDirectorySorted({
      virtualPath: '/datosnas/test',
      realPath: '/volume1/datosnas/test',
      sortBy: 'name',
      sortDir: 'asc',
      page: 1,
      limit: 50,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('file.txt');
    expect(result.total).toBe(1);
  });

  it('should sort directories first only for name sort', async () => {
    mockReaddirSync.mockReturnValue([
      { name: 'aaa-file.txt', isDirectory: () => false },
      { name: 'zzz-folder', isDirectory: () => true },
    ]);

    mockQuery.mockResolvedValueOnce({
      rows: [
        { virtual_path: '/datosnas/test/aaa-file.txt' },
        { virtual_path: '/datosnas/test/zzz-folder' },
      ],
    });
    mockQuery.mockResolvedValueOnce({
      rows: [
        { name: 'zzz-folder', type: 'directory', size: 0, modified: '2026-01-01T00:00:00Z', path: '/datosnas/test/zzz-folder' },
        { name: 'aaa-file.txt', type: 'file', size: 100, modified: '2026-03-10T00:00:00Z', path: '/datosnas/test/aaa-file.txt' },
      ],
    });

    const result = await listDirectorySorted({
      virtualPath: '/datosnas/test',
      realPath: '/volume1/datosnas/test',
      sortBy: 'name',
      sortDir: 'asc',
      page: 1,
      limit: 50,
    });

    // Directory should come first for name sort
    expect(result.items[0].type).toBe('directory');
    expect(result.items[0].name).toBe('zzz-folder');

    // Verify the SQL has directories-first ordering
    const selectCall = mockQuery.mock.calls[1];
    expect(selectCall[0]).toContain("file_type = 'directory' DESC");
  });

  it('should NOT sort directories first for modified sort (global sort)', async () => {
    mockReaddirSync.mockReturnValue([
      { name: 'old-folder', isDirectory: () => true },
      { name: 'recent-file.txt', isDirectory: () => false },
    ]);

    mockQuery.mockResolvedValueOnce({
      rows: [
        { virtual_path: '/datosnas/test/old-folder' },
        { virtual_path: '/datosnas/test/recent-file.txt' },
      ],
    });
    mockQuery.mockResolvedValueOnce({
      rows: [
        { name: 'recent-file.txt', type: 'file', size: 100, modified: '2026-03-10T00:00:00Z', path: '/datosnas/test/recent-file.txt' },
        { name: 'old-folder', type: 'directory', size: 0, modified: '2026-01-01T00:00:00Z', path: '/datosnas/test/old-folder' },
      ],
    });

    const result = await listDirectorySorted({
      virtualPath: '/datosnas/test',
      realPath: '/volume1/datosnas/test',
      sortBy: 'modified',
      sortDir: 'desc',
      page: 1,
      limit: 50,
    });

    // Recent file should come first (globally sorted, not dirs first)
    expect(result.items[0].name).toBe('recent-file.txt');
    expect(result.items[1].name).toBe('old-folder');

    // Verify the SQL does NOT have directories-first ordering
    const selectCall = mockQuery.mock.calls[1];
    expect(selectCall[0]).not.toContain("file_type = 'directory' DESC");
    // Verify deterministic tiebreaker is present
    expect(selectCall[0]).toContain('name_lower');
  });

  it('should NOT sort directories first for size sort (global sort)', async () => {
    mockReaddirSync.mockReturnValue([
      { name: 'small-folder', isDirectory: () => true },
      { name: 'huge-file.zip', isDirectory: () => false },
    ]);

    mockQuery.mockResolvedValueOnce({
      rows: [
        { virtual_path: '/datosnas/test/small-folder' },
        { virtual_path: '/datosnas/test/huge-file.zip' },
      ],
    });
    mockQuery.mockResolvedValueOnce({
      rows: [
        { name: 'huge-file.zip', type: 'file', size: 999999, modified: '2026-01-01T00:00:00Z', path: '/datosnas/test/huge-file.zip' },
        { name: 'small-folder', type: 'directory', size: 0, modified: '2026-03-01T00:00:00Z', path: '/datosnas/test/small-folder' },
      ],
    });

    const result = await listDirectorySorted({
      virtualPath: '/datosnas/test',
      realPath: '/volume1/datosnas/test',
      sortBy: 'size',
      sortDir: 'desc',
      page: 1,
      limit: 50,
    });

    // Huge file should come first (globally sorted, not dirs first)
    expect(result.items[0].name).toBe('huge-file.zip');
    expect(result.items[1].name).toBe('small-folder');

    // Verify the SQL does NOT have directories-first ordering
    const selectCall = mockQuery.mock.calls[1];
    expect(selectCall[0]).not.toContain("file_type = 'directory' DESC");
    // Verify deterministic tiebreaker is present
    expect(selectCall[0]).toContain('name_lower');
  });

  it('should include deterministic tiebreaker in name sort ORDER BY', async () => {
    mockReaddirSync.mockReturnValue([
      { name: 'file-a.txt', isDirectory: () => false },
      { name: 'file-b.txt', isDirectory: () => false },
    ]);

    mockQuery.mockResolvedValueOnce({
      rows: [
        { virtual_path: '/datosnas/test/file-a.txt' },
        { virtual_path: '/datosnas/test/file-b.txt' },
      ],
    });
    mockQuery.mockResolvedValueOnce({
      rows: [
        { name: 'file-a.txt', type: 'file', size: 100, modified: '2026-01-01T00:00:00Z', path: '/datosnas/test/file-a.txt' },
        { name: 'file-b.txt', type: 'file', size: 100, modified: '2026-01-01T00:00:00Z', path: '/datosnas/test/file-b.txt' },
      ],
    });

    await listDirectorySorted({
      virtualPath: '/datosnas/test',
      realPath: '/volume1/datosnas/test',
      sortBy: 'name',
      sortDir: 'asc',
      page: 1,
      limit: 50,
    });

    const selectCall = mockQuery.mock.calls[1];
    // Name sort should have dirs-first, then name_lower, then virtual_path tiebreaker
    expect(selectCall[0]).toContain("file_type = 'directory' DESC");
    expect(selectCall[0]).toContain('name_lower');
    expect(selectCall[0]).toContain('virtual_path');
  });

  it('should build correct virtual paths when virtualPath is root "/"', async () => {
    mockReaddirSync.mockReturnValue([
      { name: 'file.txt', isDirectory: () => false },
    ]);

    mockQuery.mockResolvedValueOnce({
      rows: [{ virtual_path: '/file.txt' }],
    });
    mockQuery.mockResolvedValueOnce({
      rows: [
        { name: 'file.txt', type: 'file', size: 100, modified: '2026-01-01T00:00:00Z', path: '/file.txt' },
      ],
    });

    const result = await listDirectorySorted({
      virtualPath: '/',
      realPath: '/mnt/root',
      sortBy: 'name',
      sortDir: 'asc',
      page: 1,
      limit: 50,
    });

    expect(result).not.toBeNull();
    expect(result.items[0].path).toBe('/file.txt');
  });

  it('should not produce double slashes in virtual paths during reconciliation', async () => {
    // FS has 1 entry, DB has 0 → reconciliation needed
    mockReaddirSync.mockReturnValue([
      { name: 'newfile.txt', isDirectory: () => false },
    ]);

    // Indexed paths query (empty → sets differ)
    mockQuery.mockResolvedValueOnce({ rows: [] });

    // stat for the file
    mockStatSync.mockReturnValue({
      isDirectory: () => false,
      size: 200,
      mtimeMs: Date.parse('2026-03-10T12:00:00Z'),
    });

    // INSERT query
    mockQuery.mockResolvedValueOnce({ rows: [] });

    // Main listing query
    mockQuery.mockResolvedValueOnce({
      rows: [
        { name: 'newfile.txt', type: 'file', size: 200, modified: '2026-03-10T12:00:00Z', path: '/datosnas/newfile.txt' },
      ],
    });

    await listDirectorySorted({
      virtualPath: '/datosnas',
      realPath: '/mnt/datosnas',
      sortBy: 'name',
      sortDir: 'asc',
      page: 1,
      limit: 50,
    });

    // The INSERT call is the 2nd query (index 1)
    const insertCall = mockQuery.mock.calls[1];
    const insertedVirtualPath = insertCall[1][0]; // first value param = virtual_path
    // Must NOT have double slashes
    expect(insertedVirtualPath).toBe('/datosnas/newfile.txt');
    expect(insertedVirtualPath).not.toMatch(/\/\//);

    // mount_point must be '/datosnas', not '/undefined'
    const insertedMountPoint = insertCall[1][7]; // 8th value param = mount_point
    expect(insertedMountPoint).toBe('/datosnas');
  });

  it('should handle root virtualPath without producing /undefined mount_point', async () => {
    mockReaddirSync.mockReturnValue([
      { name: 'rootfile.txt', isDirectory: () => false },
    ]);

    // Indexed paths (empty → reconciliation)
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockStatSync.mockReturnValue({
      isDirectory: () => false,
      size: 100,
      mtimeMs: Date.parse('2026-03-10T00:00:00Z'),
    });
    mockQuery.mockResolvedValueOnce({ rows: [] }); // INSERT

    // Main listing
    mockQuery.mockResolvedValueOnce({
      rows: [
        { name: 'rootfile.txt', type: 'file', size: 100, modified: '2026-03-10T00:00:00Z', path: '/rootfile.txt' },
      ],
    });

    const result = await listDirectorySorted({
      virtualPath: '/',
      realPath: '/mnt/root',
      sortBy: 'name',
      sortDir: 'asc',
      page: 1,
      limit: 50,
    });

    expect(result).not.toBeNull();

    // Check INSERT call values - virtual_path should be '/rootfile.txt' not '//rootfile.txt'
    const insertCall = mockQuery.mock.calls[1];
    const insertedVirtualPath = insertCall[1][0];
    expect(insertedVirtualPath).toBe('/rootfile.txt');

    // mount_point should be '/' not '/undefined'
    const insertedMountPoint = insertCall[1][7];
    expect(insertedMountPoint).toBe('/');
    expect(insertedMountPoint).not.toContain('undefined');
  });

  it('should remove stale DB rows for files deleted from filesystem', async () => {
    // FS has 1 entry, DB has 2 (one stale)
    mockReaddirSync.mockReturnValue([
      { name: 'existing.txt', isDirectory: () => false },
    ]);

    // Indexed paths (includes stale deleted.txt)
    mockQuery.mockResolvedValueOnce({
      rows: [
        { virtual_path: '/datosnas/test/existing.txt' },
        { virtual_path: '/datosnas/test/deleted.txt' },
      ],
    });

    // DELETE stale entries (deleted.txt no longer on FS)
    mockQuery.mockResolvedValueOnce({ rows: [{ count: 1 }] });

    // No missing entries to insert (existing.txt is already indexed)

    // Main listing query
    mockQuery.mockResolvedValueOnce({
      rows: [
        { name: 'existing.txt', type: 'file', size: 100, modified: '2026-01-01T00:00:00Z', path: '/datosnas/test/existing.txt' },
      ],
    });

    const result = await listDirectorySorted({
      virtualPath: '/datosnas/test',
      realPath: '/volume1/datosnas/test',
      sortBy: 'name',
      sortDir: 'asc',
      page: 1,
      limit: 50,
    });

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);

    // Verify DELETE was called for stale entries
    const deleteCall = mockQuery.mock.calls[1];
    expect(deleteCall[0]).toContain('DELETE FROM file_index');
    expect(deleteCall[1]).toContain('/datosnas/test/deleted.txt');
  });

  it('should handle both stale removals and missing inserts in same reconciliation', async () => {
    // FS: existing.txt + new-file.txt
    // DB: existing.txt + deleted1.txt + deleted2.txt
    mockReaddirSync.mockReturnValue([
      { name: 'existing.txt', isDirectory: () => false },
      { name: 'new-file.txt', isDirectory: () => false },
    ]);

    // Indexed virtual_paths (3 entries, 2 stale)
    mockQuery.mockResolvedValueOnce({
      rows: [
        { virtual_path: '/datosnas/test/existing.txt' },
        { virtual_path: '/datosnas/test/deleted1.txt' },
        { virtual_path: '/datosnas/test/deleted2.txt' },
      ],
    });

    // DELETE stale entries
    mockQuery.mockResolvedValueOnce({ rows: [{ count: 2 }] });

    // stat for new-file.txt
    mockStatSync.mockReturnValue({
      isDirectory: () => false,
      size: 500,
      mtimeMs: Date.parse('2026-03-10T00:00:00Z'),
    });

    // INSERT missing entries
    mockQuery.mockResolvedValueOnce({ rows: [] });

    // Main listing
    mockQuery.mockResolvedValueOnce({
      rows: [
        { name: 'existing.txt', type: 'file', size: 100, modified: '2026-01-01T00:00:00Z', path: '/datosnas/test/existing.txt' },
        { name: 'new-file.txt', type: 'file', size: 500, modified: '2026-03-10T00:00:00Z', path: '/datosnas/test/new-file.txt' },
      ],
    });

    const result = await listDirectorySorted({
      virtualPath: '/datosnas/test',
      realPath: '/volume1/datosnas/test',
      sortBy: 'name',
      sortDir: 'asc',
      page: 1,
      limit: 50,
    });

    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(2);

    // Verify DELETE was called for stale entries
    const deleteCall = mockQuery.mock.calls[1];
    expect(deleteCall[0]).toContain('DELETE FROM file_index');

    // Verify INSERT was called for missing entries
    const insertCall = mockQuery.mock.calls[2];
    expect(insertCall[0]).toContain('INSERT INTO file_index');
  });

  it('should reconcile when FS and DB have same count but different files', async () => {
    // R-1: One file deleted + one new file = same count, but content differs
    // FS has: existing.txt, new-file.txt (count=2)
    // DB has: existing.txt, deleted.txt (count=2)
    mockReaddirSync.mockReturnValue([
      { name: 'existing.txt', isDirectory: () => false },
      { name: 'new-file.txt', isDirectory: () => false },
    ]);

    // Indexed virtual_paths (same count=2 but different files)
    mockQuery.mockResolvedValueOnce({
      rows: [
        { virtual_path: '/datosnas/test/existing.txt' },
        { virtual_path: '/datosnas/test/deleted.txt' },
      ],
    });

    // DELETE stale entries (deleted.txt)
    mockQuery.mockResolvedValueOnce({ rows: [{ count: 1 }] });

    // stat for new-file.txt
    mockStatSync.mockReturnValue({
      isDirectory: () => false,
      size: 400,
      mtimeMs: Date.parse('2026-03-10T12:00:00Z'),
    });

    // INSERT missing entries (new-file.txt)
    mockQuery.mockResolvedValueOnce({ rows: [] });

    // Main listing query
    mockQuery.mockResolvedValueOnce({
      rows: [
        { name: 'existing.txt', type: 'file', size: 100, modified: '2026-01-01T00:00:00Z', path: '/datosnas/test/existing.txt' },
        { name: 'new-file.txt', type: 'file', size: 400, modified: '2026-03-10T12:00:00Z', path: '/datosnas/test/new-file.txt' },
      ],
    });

    const result = await listDirectorySorted({
      virtualPath: '/datosnas/test',
      realPath: '/volume1/datosnas/test',
      sortBy: 'name',
      sortDir: 'asc',
      page: 1,
      limit: 50,
    });

    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(2);

    // Verify DELETE was called for deleted.txt
    const deleteCall = mockQuery.mock.calls[1];
    expect(deleteCall[0]).toContain('DELETE FROM file_index');
    expect(deleteCall[1]).toContain('/datosnas/test/deleted.txt');

    // Verify INSERT was called for new-file.txt
    const insertCall = mockQuery.mock.calls[2];
    expect(insertCall[0]).toContain('INSERT INTO file_index');
  });

  it('should return null when DB query fails (fallback signal)', async () => {
    mockReaddirSync.mockReturnValue([]);
    mockQuery.mockRejectedValueOnce(new Error('Connection refused'));

    const result = await listDirectorySorted({
      virtualPath: '/datosnas/test',
      realPath: '/volume1/datosnas/test',
      sortBy: 'modified',
      sortDir: 'desc',
      page: 1,
      limit: 50,
    });

    expect(result).toBeNull();
  });
});
