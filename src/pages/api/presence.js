import { setPresence, removePresence, getPresence, getPresenceChildren } from '../../lib/presence-store.js';

function requireAuth(context) {
  const user = context.locals?.user;
  if (!user) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return null;
}

/**
 * POST /api/presence
 * Heartbeat: register or update user presence in a folder.
 * Body: { path: string }
 */
export async function POST(context) {
  const denied = requireAuth(context);
  if (denied) return denied;

  const user = context.locals.user;
  const body = await context.request.json();
  const { path } = body;

  if (!path || typeof path !== 'string') {
    return new Response(JSON.stringify({ error: 'path is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  setPresence(user.id, user.display_name, path);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * GET /api/presence?path=...
 * Query active users in a folder.
 */
export async function GET(context) {
  const denied = requireAuth(context);
  if (denied) return denied;

  const user = context.locals.user;
  const url = new URL(context.request.url);
  const path = url.searchParams.get('path');

  if (!path) {
    return new Response(JSON.stringify({ error: 'path query param is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const children = url.searchParams.get('children') === 'true';

  if (children) {
    const grouped = getPresenceChildren(path, user.id);
    return new Response(JSON.stringify({ path, children: grouped }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const users = getPresence(path, user.id);

  return new Response(JSON.stringify({ path, users }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * DELETE /api/presence
 * Explicitly remove user presence (e.g. on tab close).
 */
export async function DELETE(context) {
  const denied = requireAuth(context);
  if (denied) return denied;

  removePresence(context.locals.user.id);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
