import { query } from '../../../lib/db.js';
import { getMountPoints, invalidateMountMap } from '../../../lib/path-sanitizer.js';

/**
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

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/**
 * GET /api/admin/volumes
 * List all registered volumes with alias count.
 */
export const GET = async (context) => {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const result = await query(`
    SELECT v.*, COUNT(fa.id)::int AS alias_count
    FROM volumes v
    LEFT JOIN folder_aliases fa ON fa.real_path LIKE v.mount_path || '%'
    GROUP BY v.id
    ORDER BY v.name
  `);

  // Enrich with virtual_path from mount point map
  const mounts = await getMountPoints();
  const volumes = result.rows.map(v => {
    const mount = mounts.find(m => m.realPath === v.mount_path);
    return { ...v, virtual_path: mount?.virtualPath || null };
  });

  return new Response(JSON.stringify({ volumes }), {
    status: 200, headers: JSON_HEADERS,
  });
};

/**
 * POST /api/admin/volumes
 * Register a new volume. Body: { name, mount_path }
 */
export const POST = async (context) => {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const body = await context.request.json();
  const { name, mount_path } = body;

  if (!name?.trim() || !mount_path?.trim()) {
    return new Response(JSON.stringify({ error: 'name and mount_path are required' }), {
      status: 400, headers: JSON_HEADERS,
    });
  }

  const result = await query(
    'INSERT INTO volumes (name, mount_path) VALUES ($1, $2) RETURNING *',
    [name.trim(), mount_path.trim()]
  );

  invalidateMountMap();

  return new Response(JSON.stringify(result.rows[0]), {
    status: 201, headers: JSON_HEADERS,
  });
};

/**
 * PUT /api/admin/volumes
 * Update a volume. Body: { id, name?, mount_path?, active? }
 * When active changes to false, all aliases under this volume become invisible.
 * When active changes to true, all aliases under this volume become visible.
 */
export const PUT = async (context) => {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const body = await context.request.json();
  const { id, name, mount_path, active } = body;

  if (!id) {
    return new Response(JSON.stringify({ error: 'id is required' }), {
      status: 400, headers: JSON_HEADERS,
    });
  }

  // Fetch current volume to detect active change
  const current = await query('SELECT * FROM volumes WHERE id = $1', [id]);
  if (current.rows.length === 0) {
    return new Response(JSON.stringify({ error: 'Volume not found' }), {
      status: 404, headers: JSON_HEADERS,
    });
  }

  const sets = [];
  const params = [];
  let idx = 1;

  if (name !== undefined) { sets.push(`name = $${idx++}`); params.push(name.trim()); }
  if (mount_path !== undefined) { sets.push(`mount_path = $${idx++}`); params.push(mount_path.trim()); }
  if (active !== undefined) { sets.push(`active = $${idx++}`); params.push(active); }

  if (sets.length === 0) {
    return new Response(JSON.stringify({ error: 'No fields to update' }), {
      status: 400, headers: JSON_HEADERS,
    });
  }

  params.push(id);
  const result = await query(
    `UPDATE volumes SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    params
  );

  const updated = result.rows[0];

  // Cascade visibility to aliases when active state changes
  if (active !== undefined && active !== current.rows[0].active) {
    const volumePath = updated.mount_path;
    await query(
      `UPDATE folder_aliases SET visible = $1 WHERE real_path LIKE $2 || '%'`,
      [active, volumePath]
    );
  }

  invalidateMountMap();

  return new Response(JSON.stringify(updated), {
    status: 200, headers: JSON_HEADERS,
  });
};

/**
 * DELETE /api/admin/volumes
 * Remove a volume. Body: { id }
 * Only allowed if no aliases reference this volume.
 */
export const DELETE = async (context) => {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const body = await context.request.json();
  const { id } = body;

  if (!id) {
    return new Response(JSON.stringify({ error: 'id is required' }), {
      status: 400, headers: JSON_HEADERS,
    });
  }

  // Check for aliases referencing this volume
  const vol = await query('SELECT mount_path FROM volumes WHERE id = $1', [id]);
  if (vol.rows.length === 0) {
    return new Response(JSON.stringify({ error: 'Volume not found' }), {
      status: 404, headers: JSON_HEADERS,
    });
  }

  const aliases = await query(
    `SELECT COUNT(*)::int AS count FROM folder_aliases WHERE real_path LIKE $1 || '%'`,
    [vol.rows[0].mount_path]
  );

  if (aliases.rows[0].count > 0) {
    return new Response(JSON.stringify({
      error: `Cannot delete: ${aliases.rows[0].count} alias(es) reference this volume. Remove aliases first.`,
    }), { status: 409, headers: JSON_HEADERS });
  }

  await query('DELETE FROM volumes WHERE id = $1', [id]);

  invalidateMountMap();

  return new Response(JSON.stringify({ deleted: { id } }), {
    status: 200, headers: JSON_HEADERS,
  });
};
