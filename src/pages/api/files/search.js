import { sanitizePath, PathError } from '../../../lib/path-sanitizer.js';
import { requirePermission } from '../../../lib/permission-middleware.js';
import { query as dbQuery } from '../../../lib/db.js';

const MAX_RESULTS = 100;
const MIN_QUERY_LENGTH = 2;
const VALID_MODES = new Set(['contains', 'starts', 'ends']);

/**
 * GET /api/files/search?path=/datosnas&q=model&mode=contains
 *
 * Searches for files/directories whose name matches the query string
 * (case-insensitive) using the PostgreSQL file_index table with pg_trgm.
 * Respects read permissions on the root path. Returns up to MAX_RESULTS matches.
 *
 * Supported modes:
 * - contains (default): name contains the query
 * - starts: name starts with the query
 * - ends: name ends with the query
 *
 * @param {object} context
 * @returns {Promise<Response>}
 */
export async function GET(context) {
  const searchQuery = context.url.searchParams.get('q');
  const virtualPath = context.url.searchParams.get('path');
  const mode = context.url.searchParams.get('mode') || 'contains';

  if (!searchQuery) {
    return jsonResponse({ error: 'Query parameter "q" is required' }, 400);
  }

  if (!virtualPath) {
    return jsonResponse({ error: 'Query parameter "path" is required' }, 400);
  }

  if (searchQuery.length < MIN_QUERY_LENGTH) {
    return jsonResponse({ error: `Query must be at least ${MIN_QUERY_LENGTH} characters` }, 400);
  }

  if (!VALID_MODES.has(mode)) {
    return jsonResponse({ error: `Invalid mode "${mode}". Valid: contains, starts, ends` }, 400);
  }

  let sanitized;
  try {
    sanitized = await sanitizePath(virtualPath);
  } catch (err) {
    if (err instanceof PathError || err.name === 'PathError') {
      return jsonResponse({ error: err.message }, err.statusCode);
    }
    throw err;
  }

  const perm = await requirePermission(context, sanitized.virtualPath, 'r');
  if (!perm.granted) {
    return jsonResponse({ error: 'Access denied' }, perm.status);
  }

  const lowerQuery = searchQuery.toLowerCase();
  const namePattern = mode === 'starts'
    ? `$1 || '%'`
    : mode === 'ends'
      ? `'%' || $1`
      : `'%' || $1 || '%'`;

  try {
    const result = await dbQuery(
      `SELECT name, file_type AS type, size, modified, virtual_path AS path
       FROM file_index
       WHERE name_lower LIKE ${namePattern}
         AND virtual_path LIKE $2 || '%'
       ORDER BY file_type = 'directory' DESC, name_lower
       LIMIT $3`,
      [lowerQuery, sanitized.virtualPath, MAX_RESULTS],
    );

    const results = result.rows.map((row) => ({
      name: row.name,
      type: row.type,
      size: Number(row.size),
      modified: row.modified ? new Date(row.modified).toISOString() : null,
      path: row.path,
    }));

    return jsonResponse({
      query: searchQuery,
      path: sanitized.virtualPath,
      results,
      total: results.length,
    });
  } catch (err) {
    console.error('[search] SQL error:', err.message);
    return jsonResponse({
      query: searchQuery,
      path: sanitized.virtualPath,
      results: [],
      total: 0,
      warning: 'Search index unavailable, results may be incomplete',
    });
  }
}

/**
 * @param {object} data
 * @param {number} [status]
 * @returns {Response}
 */
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
