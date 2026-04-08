import { query, getClient } from '../../../lib/db.js';

/** Default quota for pre-registered users: 10 GB */
const DEFAULT_QUOTA_BYTES = 10_737_418_240;

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** @param {object} context */
function requireAdmin(context) {
  const user = context.locals?.user;
  if (!user) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401, headers: JSON_HEADERS,
    });
  }
  if (!user.is_admin) {
    return new Response(JSON.stringify({ error: 'Admin access required' }), {
      status: 403, headers: JSON_HEADERS,
    });
  }
  return null;
}

/**
 * GET /api/admin/users
 *
 * Returns all users with their group memberships and derived status.
 * Admin-only endpoint.
 */
export async function GET(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const result = await query(
    `SELECT u.id, u.email, u.display_name, u.is_admin, u.is_active, u.external_id,
            COALESCE(
              json_agg(json_build_object('id', g.id, 'name', g.name))
              FILTER (WHERE g.id IS NOT NULL), '[]'
            ) AS groups
     FROM users u
     LEFT JOIN user_groups ug ON ug.user_id = u.id
     LEFT JOIN groups g ON g.id = ug.group_id
     GROUP BY u.id
     ORDER BY u.display_name`,
  );

  const users = result.rows.map(u => ({
    ...u,
    status: u.external_id == null ? 'pending' : u.is_active ? 'active' : 'inactive',
    external_id: undefined,
  }));

  return new Response(JSON.stringify({ users }), {
    status: 200, headers: JSON_HEADERS,
  });
}

/**
 * POST /api/admin/users
 *
 * Pre-register a user with email and optional group assignments.
 * Creates a user record with external_id = NULL (linked on first login).
 * Admin-only endpoint.
 *
 * Body: { email: string, display_name?: string, group_ids?: number[] }
 */
export async function POST(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const body = await context.request.json();
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const displayName = typeof body.display_name === 'string' && body.display_name.trim()
    ? body.display_name.trim()
    : email.split('@')[0];
  const groupIds = Array.isArray(body.group_ids) ? body.group_ids.filter(id => Number.isInteger(id)) : [];

  if (!email || !email.includes('@')) {
    return new Response(JSON.stringify({ error: 'Se requiere un email válido' }), {
      status: 400, headers: JSON_HEADERS,
    });
  }

  if (groupIds.length === 0) {
    return new Response(JSON.stringify({ error: 'Se requiere al menos un grupo' }), {
      status: 400, headers: JSON_HEADERS,
    });
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    let result;
    try {
      result = await client.query(
        `INSERT INTO users (external_id, email, display_name, is_admin)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, display_name, is_admin, is_active, external_id`,
        [null, email, displayName, false],
      );
    } catch (err) {
      if (err.code === '23505') {
        await client.query('ROLLBACK');
        return new Response(JSON.stringify({ error: 'Ya existe un usuario con ese email' }), {
          status: 409, headers: JSON_HEADERS,
        });
      }
      throw err;
    }

    const user = result.rows[0];

    // Create default quota
    await client.query(
      'INSERT INTO quotas (user_id, max_bytes) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING',
      [user.id, DEFAULT_QUOTA_BYTES],
    );

    // Assign groups
    for (const gid of groupIds) {
      await client.query(
        'INSERT INTO user_groups (user_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [user.id, gid],
      );
    }

    await client.query('COMMIT');

    return new Response(JSON.stringify({ user }), {
      status: 201, headers: JSON_HEADERS,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
