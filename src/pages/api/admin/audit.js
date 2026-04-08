import { query } from '../../../lib/db.js';

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
 * GET /api/admin/audit
 *
 * Query params:
 *   page (default 1), limit (default 50, max 200),
 *   user_id, action, path, from (ISO date), to (ISO date)
 *
 * Returns paginated audit log entries with user display name.
 */
export async function GET(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const url = new URL(context.request.url);
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 50));
  const offset = (page - 1) * limit;

  const userId = url.searchParams.get('user_id');
  const action = url.searchParams.get('action');
  const path = url.searchParams.get('path');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  const conditions = [];
  const params = [];
  let idx = 1;

  if (userId) {
    conditions.push(`al.user_id = $${idx++}`);
    params.push(Number(userId));
  }
  if (action) {
    conditions.push(`al.action = $${idx++}`);
    params.push(action);
  }
  if (path) {
    conditions.push(`al.path LIKE $${idx++}`);
    params.push(`${path}%`);
  }
  if (from) {
    conditions.push(`al.created_at >= $${idx++}`);
    params.push(from);
  }
  if (to) {
    conditions.push(`al.created_at < $${idx++}::date + 1`);
    params.push(to);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(
    `SELECT COUNT(*) AS total FROM audit_log al ${where}`,
    params,
  );
  const total = Number(countResult.rows[0].total);

  const dataResult = await query(
    `SELECT al.id, al.user_id, u.display_name AS user_name, al.action, al.path,
            al.target_path, al.file_size, al.details, al.ip_address,
            al.created_at
     FROM audit_log al
     LEFT JOIN users u ON u.id = al.user_id
     ${where}
     ORDER BY al.created_at DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, limit, offset],
  );

  return new Response(JSON.stringify({
    entries: dataResult.rows,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
