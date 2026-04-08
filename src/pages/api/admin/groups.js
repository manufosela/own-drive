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
 * GET /api/admin/groups?id=<optional>
 *
 * Without id: returns all groups with member count.
 * With id: returns single group with full member list.
 * Admin-only endpoint.
 */
export async function GET(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');

  if (id) {
    const groupResult = await query(
      'SELECT id, name, description, created_at FROM groups WHERE id = $1',
      [id],
    );
    if (groupResult.rows.length === 0) {
      return new Response(JSON.stringify({ error: 'Group not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const membersResult = await query(
      `SELECT u.id, u.email, u.display_name, ug.created_at AS joined_at
       FROM user_groups ug
       JOIN users u ON u.id = ug.user_id
       WHERE ug.group_id = $1
       ORDER BY u.display_name`,
      [id],
    );

    return new Response(JSON.stringify({
      ...groupResult.rows[0],
      members: membersResult.rows,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = await query(
    `SELECT g.id, g.name, g.description,
            COUNT(ug.user_id)::int AS member_count
     FROM groups g
     LEFT JOIN user_groups ug ON ug.group_id = g.id
     GROUP BY g.id
     ORDER BY g.name`,
  );

  return new Response(JSON.stringify({ groups: result.rows }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * POST /api/admin/groups
 *
 * Create a new group.
 * Body: { name, description? }
 */
export async function POST(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const body = await context.request.json();

  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    return new Response(JSON.stringify({ error: 'name is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const name = body.name.trim();
  const description = body.description?.trim() ?? null;

  const existing = await query('SELECT id FROM groups WHERE name = $1', [name]);
  if (existing.rows.length > 0) {
    return new Response(JSON.stringify({ error: 'A group with this name already exists' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = await query(
    'INSERT INTO groups (name, description) VALUES ($1, $2) RETURNING *',
    [name, description],
  );

  return new Response(JSON.stringify(result.rows[0]), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * PUT /api/admin/groups
 *
 * Update an existing group.
 * Body: { id, name?, description? }
 */
export async function PUT(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const body = await context.request.json();

  if (!body.id) {
    return new Response(JSON.stringify({ error: 'id is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const updates = [];
  const values = [];
  let idx = 1;

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return new Response(JSON.stringify({ error: 'name cannot be empty' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const name = body.name.trim();
    const dup = await query('SELECT id FROM groups WHERE name = $1 AND id != $2', [name, body.id]);
    if (dup.rows.length > 0) {
      return new Response(JSON.stringify({ error: 'A group with this name already exists' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    updates.push(`name = $${idx}`);
    values.push(name);
    idx++;
  }

  if (body.description !== undefined) {
    updates.push(`description = $${idx}`);
    values.push(body.description?.trim() ?? null);
    idx++;
  }

  if (updates.length === 0) {
    return new Response(JSON.stringify({ error: 'No fields to update' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  values.push(body.id);
  const sql = `UPDATE groups SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`;
  const result = await query(sql, values);

  if (result.rows.length === 0) {
    return new Response(JSON.stringify({ error: 'Group not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify(result.rows[0]), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * DELETE /api/admin/groups
 *
 * Delete a group. Cascades to user_groups and folder_permissions.
 * Body: { id }
 */
export async function DELETE(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const body = await context.request.json();

  if (!body.id) {
    return new Response(JSON.stringify({ error: 'id is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = await query(
    'DELETE FROM groups WHERE id = $1 RETURNING id, name',
    [body.id],
  );

  if (result.rows.length === 0) {
    return new Response(JSON.stringify({ error: 'Group not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ deleted: result.rows[0] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
