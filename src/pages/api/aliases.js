import { query } from '../../lib/db.js';

/**
 * GET /api/aliases
 *
 * Returns visible folder aliases the authenticated user has access to.
 * - Admin users: all visible aliases.
 * - Normal users: only aliases where they have can_read via at least one group.
 */
export async function GET(context) {
  const user = context.locals?.user;

  if (!user) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (user.is_admin) {
    const result = await query(
      `SELECT id, alias_name, real_path, description
       FROM folder_aliases
       WHERE visible = true
       ORDER BY alias_name`,
    );
    return new Response(JSON.stringify({ aliases: result.rows }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = await query(
    `SELECT DISTINCT fa.id, fa.alias_name, fa.real_path, fa.description
     FROM folder_aliases fa
     JOIN folder_permissions fp ON fp.alias_id = fa.id
     JOIN user_groups gm ON gm.group_id = fp.group_id
     WHERE fa.visible = true
       AND gm.user_id = $1
       AND fp.can_read = true
     ORDER BY fa.alias_name`,
    [user.id],
  );

  return new Response(JSON.stringify({ aliases: result.rows }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
