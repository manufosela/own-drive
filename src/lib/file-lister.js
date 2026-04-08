import fs from 'node:fs';
import path from 'node:path';
import { query } from './db.js';

/** Synology system folders to hide from listings */
const HIDDEN_ENTRIES = new Set(['#recycle', '@eaDir']);

/** Suffixes to hide from listings (e.g. Jellyfin trickplay metadata) */
const HIDDEN_SUFFIXES = ['.trickplay'];

/** Allowed sort columns mapped to SQL expressions */
const SORT_COLUMNS = {
  name: 'name_lower',
  size: 'size',
  modified: 'modified',
};

/**
 * List directory contents using PostgreSQL index with proper ORDER BY + LIMIT/OFFSET.
 * Returns null if the DB query fails, signaling the caller to fall back to filesystem.
 *
 * @param {object} params
 * @param {string} params.virtualPath - e.g. "/datosnas/test"
 * @param {string} params.realPath - e.g. "/volume1/datosnas/test"
 * @param {'name'|'size'|'modified'} params.sortBy
 * @param {'asc'|'desc'} params.sortDir
 * @param {number} params.page
 * @param {number} params.limit
 * @returns {Promise<{items: Array, total: number, page: number, pages: number, limit: number}|null>}
 */
export async function listDirectorySorted({ virtualPath, realPath, sortBy, sortDir, page, limit }) {
  try {
    // Read FS entries (fast, just names) for reconciliation check
    const fsEntries = fs.readdirSync(realPath, { withFileTypes: true });
    const filtered = fsEntries.filter((e) => !HIDDEN_ENTRIES.has(e.name) && !HIDDEN_SUFFIXES.some(s => e.name.endsWith(s)));
    const fsCount = filtered.length;

    // Build SQL exclusion clause for hidden suffixes
    const suffixClauses = HIDDEN_SUFFIXES.map((_, i) => `AND name NOT LIKE $${i + 2}`).join(' ');
    const suffixParams = HIDDEN_SUFFIXES.map(s => `%${s}`);

    // Fetch all indexed virtual_paths for this parent (used for set comparison + reconciliation)
    const indexedResult = await query(
      `SELECT virtual_path FROM file_index WHERE parent_path = $1 ${suffixClauses}`,
      [virtualPath, ...suffixParams]
    );
    const indexedSet = new Set(indexedResult.rows.map((r) => r.virtual_path));

    // Build FS virtual paths set for comparison
    const fsVirtualPaths = new Set(
      filtered.map((e) => joinVirtualPath(virtualPath, e.name))
    );

    // Reconcile if sets differ (handles additions, deletions, and swaps with same count)
    let total = indexedSet.size;
    const setsMatch = fsCount === indexedSet.size && [...fsVirtualPaths].every((vp) => indexedSet.has(vp));
    if (!setsMatch) {
      await reconcileEntries(virtualPath, realPath, filtered, indexedSet, fsVirtualPaths);
      total = fsCount;
    }

    // Build ORDER BY clause
    const col = SORT_COLUMNS[sortBy] || 'name_lower';
    const dir = sortDir === 'desc' ? 'DESC' : 'ASC';

    // For name sort: directories first, then alphabetical.
    // For size/modified: pure global sort so the first page shows the largest/most recent items.
    // All sorts include a deterministic tiebreaker to ensure consistent pagination.
    const orderClause = sortBy === 'name'
      ? `file_type = 'directory' DESC, ${col} ${dir}, virtual_path ${dir}`
      : `${col} ${dir}, name_lower ASC, virtual_path ASC`;

    const offset = (page - 1) * limit;
    const listParamOffset = suffixParams.length + 1;
    const listResult = await query(
      `SELECT name, file_type AS type, size, modified, virtual_path AS path
       FROM file_index
       WHERE parent_path = $1 ${suffixClauses}
       ORDER BY ${orderClause}
       LIMIT $${listParamOffset + 1} OFFSET $${listParamOffset + 2}`,
      [virtualPath, ...suffixParams, limit, offset]
    );

    const items = listResult.rows.map((row) => ({
      name: row.name,
      type: row.type,
      size: Number(row.size),
      modified: row.modified instanceof Date ? row.modified.toISOString() : row.modified,
      path: row.path,
    }));

    return {
      items,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  } catch (err) {
    console.error('[file-lister] DB query failed, signaling fallback:', err.message);
    return null;
  }
}

/**
 * Join a virtual parent path with a child name, avoiding double slashes.
 * @param {string} parentPath - e.g. "/datosnas/test" or "/"
 * @param {string} childName - e.g. "file.txt"
 * @returns {string} - e.g. "/datosnas/test/file.txt" or "/file.txt"
 */
function joinVirtualPath(parentPath, childName) {
  if (parentPath === '/') return `/${childName}`;
  return `${parentPath}/${childName}`;
}

/**
 * Derive mount_point from a virtual path (first path segment).
 * @param {string} virtualPath - e.g. "/datosnas/test" or "/"
 * @returns {string} - e.g. "/datosnas" or "/"
 */
function deriveMountPoint(virtualPath) {
  const firstSegment = virtualPath.split('/').filter(Boolean)[0];
  return firstSegment ? `/${firstSegment}` : '/';
}

/**
 * Reconcile filesystem entries with the database index.
 * Inserts missing entries and removes stale rows for deleted files.
 *
 * @param {string} virtualPath - parent virtual path
 * @param {string} realPath - parent real path
 * @param {import('node:fs').Dirent[]} fsEntries - filtered FS entries
 * @param {Set<string>} indexedSet - pre-fetched set of indexed virtual_paths
 * @param {Set<string>} fsVirtualPaths - pre-built set of FS virtual_paths
 */
async function reconcileEntries(virtualPath, realPath, fsEntries, indexedSet, fsVirtualPaths) {

  // Remove stale DB rows (exist in DB but not on filesystem)
  const stale = [...indexedSet].filter((vp) => !fsVirtualPaths.has(vp));
  if (stale.length > 0) {
    const stalePlaceholders = stale.map((_, i) => `$${i + 1}`).join(', ');
    await query(
      `DELETE FROM file_index WHERE virtual_path IN (${stalePlaceholders})`,
      stale
    );
  }

  // Find entries missing from index
  const missing = fsEntries.filter(
    (e) => !indexedSet.has(joinVirtualPath(virtualPath, e.name))
  );

  if (missing.length === 0) return;

  // Build batch INSERT for missing entries
  const mountPoint = deriveMountPoint(virtualPath);
  const values = [];
  const placeholders = [];
  let idx = 1;

  for (const entry of missing) {
    const entryRealPath = path.join(realPath, entry.name);
    try {
      const stat = fs.statSync(entryRealPath);
      const isDir = stat.isDirectory();
      const entryVirtualPath = joinVirtualPath(virtualPath, entry.name);

      placeholders.push(
        `($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, $${idx + 6}, $${idx + 7})`
      );
      values.push(
        entryVirtualPath,
        entry.name,
        entry.name.toLowerCase(),
        isDir ? 'directory' : 'file',
        isDir ? 0 : stat.size,
        new Date(stat.mtimeMs).toISOString(),
        virtualPath,
        mountPoint
      );
      idx += 8;
    } catch {
      // Skip entries we can't stat (permissions, broken symlinks)
    }
  }

  if (placeholders.length === 0) return;

  await query(
    `INSERT INTO file_index (virtual_path, name, name_lower, file_type, size, modified, parent_path, mount_point)
     VALUES ${placeholders.join(', ')}
     ON CONFLICT (virtual_path) DO UPDATE SET
       name = EXCLUDED.name,
       name_lower = EXCLUDED.name_lower,
       file_type = EXCLUDED.file_type,
       size = EXCLUDED.size,
       modified = EXCLUDED.modified,
       parent_path = EXCLUDED.parent_path,
       indexed_at = NOW()`,
    values
  );
}
