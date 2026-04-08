import { query } from '../../../lib/db.js';

/**
 * Ensure the requesting user is an admin.
 * @param {object} context
 * @returns {Response|null}
 */
function requireAdmin(context) {
  const user = context.locals?.user;
  if (!user) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!user.is_admin) {
    return new Response(JSON.stringify({ error: 'Admin access required' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return null;
}

/**
 * GET /api/admin/folder-permissions?alias_id=<optional>&group_id=<optional>
 *
 * Returns folder permissions, optionally filtered by alias_id and/or group_id.
 * Admin-only endpoint.
 */
export async function GET(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const url = new URL(context.request.url);
  const aliasId = url.searchParams.get('alias_id');
  const groupId = url.searchParams.get('group_id');

  const conditions = [];
  const values = [];
  let idx = 1;

  if (aliasId) {
    conditions.push(`fp.alias_id = $${idx}`);
    values.push(aliasId);
    idx++;
  }
  if (groupId) {
    conditions.push(`fp.group_id = $${idx}`);
    values.push(groupId);
    idx++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await query(
    `SELECT fp.id, fp.alias_id, fa.alias_name, fp.group_id, g.name AS group_name,
            fp.can_read, fp.can_write, fp.can_delete, fp.can_move,
            fp.created_at, fp.updated_at
     FROM folder_permissions fp
     JOIN folder_aliases fa ON fa.id = fp.alias_id
     JOIN groups g ON g.id = fp.group_id
     ${where}
     ORDER BY fa.alias_name, g.name`,
    values,
  );

  return new Response(JSON.stringify({ permissions: result.rows }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * POST /api/admin/folder-permissions
 *
 * Create or update permissions for a group on an alias (upsert).
 * Body: { alias_id, group_id, can_read?, can_write?, can_delete?, can_move? }
 */
export async function POST(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const body = await context.request.json();

  if (!body.alias_id || !body.group_id) {
    return new Response(JSON.stringify({ error: 'alias_id and group_id are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const aliasExists = await query('SELECT id FROM folder_aliases WHERE id = $1', [body.alias_id]);
  if (aliasExists.rows.length === 0) {
    return new Response(JSON.stringify({ error: 'Alias not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const groupExists = await query('SELECT id FROM groups WHERE id = $1', [body.group_id]);
  if (groupExists.rows.length === 0) {
    return new Response(JSON.stringify({ error: 'Group not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const canRead = body.can_read ?? false;
  const canWrite = body.can_write ?? false;
  const canDelete = body.can_delete ?? false;
  const canMove = body.can_move ?? false;

  const result = await query(
    `INSERT INTO folder_permissions (alias_id, group_id, can_read, can_write, can_delete, can_move)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (alias_id, group_id) DO UPDATE SET
       can_read = EXCLUDED.can_read,
       can_write = EXCLUDED.can_write,
       can_delete = EXCLUDED.can_delete,
       can_move = EXCLUDED.can_move
     RETURNING *`,
    [body.alias_id, body.group_id, canRead, canWrite, canDelete, canMove],
  );

  return new Response(JSON.stringify(result.rows[0]), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * DELETE /api/admin/folder-permissions
 *
 * Remove permissions for a group on an alias.
 * Body: { alias_id, group_id }
 */
export async function DELETE(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const body = await context.request.json();

  if (!body.alias_id || !body.group_id) {
    return new Response(JSON.stringify({ error: 'alias_id and group_id are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = await query(
    'DELETE FROM folder_permissions WHERE alias_id = $1 AND group_id = $2 RETURNING *',
    [body.alias_id, body.group_id],
  );

  if (result.rows.length === 0) {
    return new Response(JSON.stringify({ error: 'Permission entry not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ deleted: result.rows[0] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
