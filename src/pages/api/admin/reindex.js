import { query } from '../../../lib/db.js';
import { indexer } from '../../../lib/indexer.js';
import { getMountPoints } from '../../../lib/path-sanitizer.js';

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

/**
 * GET /api/admin/reindex
 *
 * Returns current indexation status for all mount points.
 */
export async function GET(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const result = await query(
    `SELECT mount_point, status, total_files, indexed_files, error_message,
            started_at, finished_at, updated_at
     FROM index_status
     ORDER BY mount_point`,
  );

  return new Response(JSON.stringify({ status: result.rows }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * POST /api/admin/reindex
 *
 * Launches a full reindexation in background. Returns immediately with 202.
 */
export async function POST(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  if (indexer.running) {
    return new Response(JSON.stringify({ error: 'Indexation already in progress' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const mounts = await getMountPoints();

  // Launch in background — do not await
  indexer.indexAll().catch((err) => {
    console.error('[reindex] Background indexation error:', err.message);
  });

  return new Response(
    JSON.stringify({
      message: 'Reindexation started',
      mounts: mounts.map((m) => m.virtualPath),
    }),
    {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}

/**
 * DELETE /api/admin/reindex
 *
 * Cancels the current indexation if one is running.
 */
export async function DELETE(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  if (!indexer.running) {
    return new Response(JSON.stringify({ message: 'No indexation in progress' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  indexer.abort();

  return new Response(JSON.stringify({ message: 'Indexation cancelled' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
