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
 * GET /api/admin/aliases?id=<optional>
 *
 * Without id: returns all aliases with permission count per group.
 * With id: returns single alias with its group permissions.
 * Admin-only endpoint.
 */
export async function GET(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');

  if (id) {
    const aliasResult = await query(
      `SELECT fa.*, u.display_name AS created_by_name
       FROM folder_aliases fa
       LEFT JOIN users u ON u.id = fa.created_by
       WHERE fa.id = $1`,
      [id],
    );
    if (aliasResult.rows.length === 0) {
      return new Response(JSON.stringify({ error: 'Alias not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const permsResult = await query(
      `SELECT fp.id, fp.group_id, g.name AS group_name,
              fp.can_read, fp.can_write, fp.can_delete, fp.can_move
       FROM folder_permissions fp
       JOIN groups g ON g.id = fp.group_id
       WHERE fp.alias_id = $1
       ORDER BY g.name`,
      [id],
    );

    return new Response(JSON.stringify({
      ...aliasResult.rows[0],
      permissions: permsResult.rows,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = await query(
    `SELECT fa.id, fa.alias_name, fa.real_path, fa.description, fa.visible,
            fa.created_at, fa.updated_at,
            COUNT(fp.id)::int AS permission_count
     FROM folder_aliases fa
     LEFT JOIN folder_permissions fp ON fp.alias_id = fa.id
     GROUP BY fa.id
     ORDER BY fa.alias_name`,
  );

  return new Response(JSON.stringify({ aliases: result.rows }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * POST /api/admin/aliases
 *
 * Create a new folder alias.
 * Body: { alias_name, real_path, description?, visible? }
 */
export async function POST(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const body = await context.request.json();
  const user = context.locals.user;

  if (!body.alias_name || typeof body.alias_name !== 'string' || !body.alias_name.trim()) {
    return new Response(JSON.stringify({ error: 'alias_name is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!body.real_path || typeof body.real_path !== 'string' || !body.real_path.trim()) {
    return new Response(JSON.stringify({ error: 'real_path is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const aliasName = body.alias_name.trim();
  const realPath = body.real_path.trim();
  const description = body.description?.trim() ?? null;
  const visible = body.visible ?? true;

  const existing = await query(
    'SELECT id FROM folder_aliases WHERE alias_name = $1',
    [aliasName],
  );
  if (existing.rows.length > 0) {
    return new Response(JSON.stringify({ error: 'An alias with this name already exists' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = await query(
    `INSERT INTO folder_aliases (alias_name, real_path, description, visible, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [aliasName, realPath, description, visible, user.id],
  );

  return new Response(JSON.stringify(result.rows[0]), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * PUT /api/admin/aliases
 *
 * Update an existing folder alias.
 * Body: { id, alias_name?, real_path?, description?, visible? }
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

  if (body.alias_name !== undefined) {
    if (typeof body.alias_name !== 'string' || !body.alias_name.trim()) {
      return new Response(JSON.stringify({ error: 'alias_name cannot be empty' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const aliasName = body.alias_name.trim();
    const dup = await query(
      'SELECT id FROM folder_aliases WHERE alias_name = $1 AND id != $2',
      [aliasName, body.id],
    );
    if (dup.rows.length > 0) {
      return new Response(JSON.stringify({ error: 'An alias with this name already exists' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    updates.push(`alias_name = $${idx}`);
    values.push(aliasName);
    idx++;
  }

  if (body.real_path !== undefined) {
    if (typeof body.real_path !== 'string' || !body.real_path.trim()) {
      return new Response(JSON.stringify({ error: 'real_path cannot be empty' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    updates.push(`real_path = $${idx}`);
    values.push(body.real_path.trim());
    idx++;
  }

  if (body.description !== undefined) {
    updates.push(`description = $${idx}`);
    values.push(body.description?.trim() ?? null);
    idx++;
  }

  if (body.visible !== undefined) {
    updates.push(`visible = $${idx}`);
    values.push(Boolean(body.visible));
    idx++;
  }

  if (updates.length === 0) {
    return new Response(JSON.stringify({ error: 'No fields to update' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  values.push(body.id);
  const sql = `UPDATE folder_aliases SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`;
  const result = await query(sql, values);

  if (result.rows.length === 0) {
    return new Response(JSON.stringify({ error: 'Alias not found' }), {
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
 * DELETE /api/admin/aliases
 *
 * Delete a folder alias. Cascades to folder_permissions.
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
    'DELETE FROM folder_aliases WHERE id = $1 RETURNING id, alias_name',
    [body.id],
  );

  if (result.rows.length === 0) {
    return new Response(JSON.stringify({ error: 'Alias not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ deleted: result.rows[0] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
