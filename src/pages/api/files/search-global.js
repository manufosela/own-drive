import { query as dbQuery } from '../../../lib/db.js';

const MAX_RESULTS = 100;
const MIN_QUERY_LENGTH = 2;

/**
 * GET /api/files/search-global?q=model
 *
 * Searches for files/directories across ALL aliases the authenticated user
 * can read. Results include the alias_name so the UI can display which
 * server folder the match belongs to.
 *
 * - Admin: searches all visible aliases.
 * - Normal user: searches aliases where can_read = true via group membership.
 */
export async function GET(context) {
  const user = context.locals?.user;

  if (!user) {
    return jsonResponse({ error: 'Not authenticated' }, 401);
  }

  const searchQuery = context.url.searchParams.get('q');

  if (!searchQuery) {
    return jsonResponse({ error: 'Query parameter "q" is required' }, 400);
  }

  if (searchQuery.length < MIN_QUERY_LENGTH) {
    return jsonResponse({ error: `Query must be at least ${MIN_QUERY_LENGTH} characters` }, 400);
  }

  try {
    // Get aliases the user can read
    const aliases = await getReadableAliases(user);

    if (aliases.length === 0) {
      return jsonResponse({ query: searchQuery, results: [], total: 0 });
    }

    const lowerQuery = searchQuery.toLowerCase();

    // Build OR conditions for each alias real_path
    const pathConditions = aliases.map((_, i) => `virtual_path LIKE $${i + 2} || '%'`);
    const pathParams = aliases.map(a => a.real_path);

    const result = await dbQuery(
      `SELECT name, file_type AS type, size, modified, virtual_path AS path
       FROM file_index
       WHERE name_lower LIKE '%' || $1 || '%'
         AND (${pathConditions.join(' OR ')})
       ORDER BY file_type = 'directory' DESC, name_lower
       LIMIT $${aliases.length + 2}`,
      [lowerQuery, ...pathParams, MAX_RESULTS],
    );

    // Map alias_name onto each result based on its virtual_path
    const results = result.rows.map((row) => {
      const alias = aliases.find(a =>
        row.path === a.real_path || row.path.startsWith(a.real_path + '/'),
      );

      return {
        name: row.name,
        type: row.type,
        size: Number(row.size),
        modified: row.modified ? new Date(row.modified).toISOString() : null,
        path: row.path,
        aliasName: alias?.alias_name || '',
        aliasRoot: alias?.real_path || '',
      };
    });

    return jsonResponse({ query: searchQuery, results, total: results.length });
  } catch (err) {
    console.error('[search-global] SQL error:', err.message);
    return jsonResponse({
      query: searchQuery,
      results: [],
      total: 0,
      warning: 'Search index unavailable, results may be incomplete',
    });
  }
}

/**
 * Get all visible aliases the user has read access to.
 * @param {{id: number, is_admin: boolean}} user
 * @returns {Promise<Array<{id: number, alias_name: string, real_path: string}>>}
 */
async function getReadableAliases(user) {
  if (user.is_admin) {
    const result = await dbQuery(
      `SELECT id, alias_name, real_path
       FROM folder_aliases
       WHERE visible = true
       ORDER BY alias_name`,
    );
    return result.rows;
  }

  const result = await dbQuery(
    `SELECT DISTINCT fa.id, fa.alias_name, fa.real_path
     FROM folder_aliases fa
     JOIN folder_permissions fp ON fp.alias_id = fa.id
     JOIN user_groups gm ON gm.group_id = fp.group_id
     WHERE fa.visible = true
       AND gm.user_id = $1
       AND fp.can_read = true
     ORDER BY fa.alias_name`,
    [user.id],
  );
  return result.rows;
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
