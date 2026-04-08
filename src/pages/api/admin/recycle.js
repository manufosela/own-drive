import fs from 'node:fs';
import path from 'node:path';
import { getMountPoints } from '../../../lib/path-sanitizer.js';
import { logAudit, getClientIp } from '../../../lib/audit-logger.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/**
 * @param {object} context
 * @returns {Response|null}
 */
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
 * Parse a recycled file name to extract original name and deletion timestamp.
 * Format: originalName.timestamp (e.g. "report.pdf.1709913600000")
 *
 * @param {string} recycledName
 * @returns {{ originalName: string, deletedAt: string, timestamp: number }}
 */
function parseRecycledName(recycledName) {
  const match = recycledName.match(/^(.+)\.(\d{13})$/);
  if (match) {
    const timestamp = parseInt(match[2], 10);
    return {
      originalName: match[1],
      deletedAt: new Date(timestamp).toISOString(),
      timestamp,
    };
  }
  // Fallback if no timestamp suffix found
  return {
    originalName: recycledName,
    deletedAt: '',
    timestamp: 0,
  };
}

/**
 * GET /api/admin/recycle?mount=/datosnas
 *
 * Lists contents of the #recycle folder for a given mount point.
 * Admin-only.
 */
export async function GET(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const mountVirtual = context.url.searchParams.get('mount');
  const mounts = await getMountPoints();

  if (mountVirtual) {
    // List recycle for specific mount
    const mount = mounts.find(m => m.virtualPath === mountVirtual);
    if (!mount) {
      return new Response(JSON.stringify({ error: 'Mount point not found' }), {
        status: 404, headers: JSON_HEADERS,
      });
    }

    const items = listRecycleBin(mount.realPath, mount.virtualPath);
    return new Response(JSON.stringify({ mount: mount.virtualPath, items }), {
      status: 200, headers: JSON_HEADERS,
    });
  }

  // List all mounts with their recycle counts
  const result = mounts.map(mount => {
    const recyclePath = path.join(mount.realPath, '#recycle');
    let count = 0;
    if (fs.existsSync(recyclePath)) {
      try {
        count = fs.readdirSync(recyclePath).filter(n => !n.startsWith('@')).length;
      } catch { /* ignore permission errors */ }
    }
    return {
      mount: mount.virtualPath,
      realPath: mount.realPath,
      recycleCount: count,
    };
  });

  return new Response(JSON.stringify({ mounts: result }), {
    status: 200, headers: JSON_HEADERS,
  });
}

/**
 * POST /api/admin/recycle
 * Body: { mount, recycledName, destination }
 *
 * Restores a file from #recycle to the given destination path.
 * The destination is a virtual directory path where the file will be placed.
 */
export async function POST(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const body = await context.request.json();
  const { mount, recycledName, destination } = body;

  if (!mount || !recycledName || !destination) {
    return new Response(JSON.stringify({
      error: 'mount, recycledName, and destination are required',
    }), { status: 400, headers: JSON_HEADERS });
  }

  const mounts = await getMountPoints();
  const mountInfo = mounts.find(m => m.virtualPath === mount);
  if (!mountInfo) {
    return new Response(JSON.stringify({ error: 'Mount point not found' }), {
      status: 404, headers: JSON_HEADERS,
    });
  }

  const recyclePath = path.join(mountInfo.realPath, '#recycle', recycledName);
  if (!fs.existsSync(recyclePath)) {
    return new Response(JSON.stringify({ error: 'Recycled item not found' }), {
      status: 404, headers: JSON_HEADERS,
    });
  }

  // Parse original name
  const { originalName } = parseRecycledName(recycledName);

  // Resolve destination to real path
  const destMount = mounts.find(m => destination === m.virtualPath || destination.startsWith(m.virtualPath + '/'));
  if (!destMount) {
    return new Response(JSON.stringify({ error: 'Invalid destination path' }), {
      status: 400, headers: JSON_HEADERS,
    });
  }

  const relativeDest = destination.slice(destMount.virtualPath.length) || '/';
  const realDest = path.join(destMount.realPath, relativeDest);

  if (!fs.existsSync(realDest) || !fs.statSync(realDest).isDirectory()) {
    return new Response(JSON.stringify({ error: 'Destination directory not found' }), {
      status: 404, headers: JSON_HEADERS,
    });
  }

  // Prevent path traversal
  const resolvedDest = path.resolve(realDest);
  const resolvedMount = path.resolve(destMount.realPath);
  if (!resolvedDest.startsWith(resolvedMount)) {
    return new Response(JSON.stringify({ error: 'Invalid destination path' }), {
      status: 400, headers: JSON_HEADERS,
    });
  }

  const targetPath = path.join(resolvedDest, originalName);
  if (fs.existsSync(targetPath)) {
    return new Response(JSON.stringify({
      error: `"${originalName}" already exists in destination`,
    }), { status: 409, headers: JSON_HEADERS });
  }

  try {
    fs.renameSync(recyclePath, targetPath);
  } catch (err) {
    return new Response(JSON.stringify({ error: `Restore failed: ${err.message}` }), {
      status: 500, headers: JSON_HEADERS,
    });
  }

  logAudit({
    userId: context.locals.user?.id,
    action: 'restore',
    path: `${destination}/${originalName}`,
    details: `Restored from #recycle (was: ${recycledName})`,
    ipAddress: getClientIp(context),
  });

  return new Response(JSON.stringify({
    restored: true,
    path: `${destination}/${originalName}`,
  }), { status: 200, headers: JSON_HEADERS });
}

/**
 * DELETE /api/admin/recycle
 * Body: { mount, recycledName }
 *
 * Permanently deletes an item from #recycle.
 */
export async function DELETE(context) {
  const denied = requireAdmin(context);
  if (denied) return denied;

  const body = await context.request.json();
  const { mount, recycledName } = body;

  if (!mount || !recycledName) {
    return new Response(JSON.stringify({
      error: 'mount and recycledName are required',
    }), { status: 400, headers: JSON_HEADERS });
  }

  const mounts = await getMountPoints();
  const mountInfo = mounts.find(m => m.virtualPath === mount);
  if (!mountInfo) {
    return new Response(JSON.stringify({ error: 'Mount point not found' }), {
      status: 404, headers: JSON_HEADERS,
    });
  }

  const recyclePath = path.join(mountInfo.realPath, '#recycle', recycledName);
  if (!fs.existsSync(recyclePath)) {
    return new Response(JSON.stringify({ error: 'Recycled item not found' }), {
      status: 404, headers: JSON_HEADERS,
    });
  }

  // Prevent path traversal in recycledName
  if (recycledName.includes('/') || recycledName.includes('\\') || recycledName.includes('..')) {
    return new Response(JSON.stringify({ error: 'Invalid name' }), {
      status: 400, headers: JSON_HEADERS,
    });
  }

  try {
    const stat = fs.statSync(recyclePath);
    if (stat.isDirectory()) {
      fs.rmSync(recyclePath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(recyclePath);
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: `Delete failed: ${err.message}` }), {
      status: 500, headers: JSON_HEADERS,
    });
  }

  logAudit({
    userId: context.locals.user?.id,
    action: 'permanent_delete',
    path: `#recycle/${recycledName}`,
    ipAddress: getClientIp(context),
  });

  return new Response(JSON.stringify({ deleted: true }), {
    status: 200, headers: JSON_HEADERS,
  });
}

/**
 * List items in #recycle for a given real mount path.
 *
 * @param {string} realMountPath
 * @param {string} virtualMount
 * @returns {Array}
 */
function listRecycleBin(realMountPath, virtualMount) {
  const recyclePath = path.join(realMountPath, '#recycle');
  if (!fs.existsSync(recyclePath)) return [];

  let entries;
  try {
    entries = fs.readdirSync(recyclePath, { withFileTypes: true });
  } catch {
    return [];
  }

  // Filter out Synology metadata (@eaDir)
  const filtered = entries.filter(e => !e.name.startsWith('@'));

  return filtered.map(entry => {
    const fullPath = path.join(recyclePath, entry.name);
    const { originalName, deletedAt, timestamp } = parseRecycledName(entry.name);

    let size = 0;
    try {
      const stat = fs.statSync(fullPath);
      size = stat.size;
    } catch { /* ignore */ }

    return {
      recycledName: entry.name,
      originalName,
      type: entry.isDirectory() ? 'directory' : 'file',
      size,
      deletedAt,
      timestamp,
      mount: virtualMount,
    };
  }).sort((a, b) => b.timestamp - a.timestamp); // Most recent first
}
