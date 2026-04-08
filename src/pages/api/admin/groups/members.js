import { query } from '../../../../lib/db.js';

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
 * POST /api/admin/groups/members
 *
 * Add a user to a group.
 * Body: { group_id, user_id }
 */
export async function POST(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const body = await context.request.json();

  if (!body.group_id || !body.user_id) {
    return new Response(JSON.stringify({ error: 'group_id and user_id are required' }), {
      status: 400,
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

  const userExists = await query('SELECT id FROM users WHERE id = $1', [body.user_id]);
  if (userExists.rows.length === 0) {
    return new Response(JSON.stringify({ error: 'User not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const existing = await query(
    'SELECT 1 FROM user_groups WHERE group_id = $1 AND user_id = $2',
    [body.group_id, body.user_id],
  );
  if (existing.rows.length > 0) {
    return new Response(JSON.stringify({ error: 'User is already a member of this group' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  await query(
    'INSERT INTO user_groups (group_id, user_id) VALUES ($1, $2)',
    [body.group_id, body.user_id],
  );

  return new Response(JSON.stringify({ added: { group_id: body.group_id, user_id: body.user_id } }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * DELETE /api/admin/groups/members
 *
 * Remove a user from a group.
 * Body: { group_id, user_id }
 */
export async function DELETE(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const body = await context.request.json();

  if (!body.group_id || !body.user_id) {
    return new Response(JSON.stringify({ error: 'group_id and user_id are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = await query(
    'DELETE FROM user_groups WHERE group_id = $1 AND user_id = $2 RETURNING *',
    [body.group_id, body.user_id],
  );

  if (result.rows.length === 0) {
    return new Response(JSON.stringify({ error: 'Membership not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ removed: { group_id: body.group_id, user_id: body.user_id } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
