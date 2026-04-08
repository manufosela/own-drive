import fs from 'node:fs';
import path from 'node:path';
import { sanitizePath, PathError } from '../../lib/path-sanitizer.js';
import { requirePermission } from '../../lib/permission-middleware.js';
import { deleteItem } from '../../lib/file-operations.js';
import { logAudit, logAccessDedup, getClientIp } from '../../lib/audit-logger.js';
import { listDirectorySorted } from '../../lib/file-lister.js';

/** Synology system folders to hide from listings */
const HIDDEN_ENTRIES = new Set(['#recycle', '@eaDir']);

/** Suffixes to hide from listings (e.g. Jellyfin trickplay metadata) */
const HIDDEN_SUFFIXES = ['.trickplay'];

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * GET /api/files?path=/datosnas/carpeta&page=1&limit=50
 *
 * Lists directory contents with metadata.
 * Requires read ('r') permission on the virtual path.
 *
 * @param {object} context - Astro API context
 * @returns {Promise<Response>}
 */
export async function GET(context) {
  const virtualPath = context.url.searchParams.get('path');
  if (!virtualPath) {
    return jsonResponse({ error: 'Query parameter "path" is required' }, 400);
  }

  // Sanitize path
  let sanitized;
  try {
    sanitized = await sanitizePath(virtualPath);
  } catch (err) {
    if (err instanceof PathError || err.name === 'PathError') {
      return jsonResponse({ error: err.message }, err.statusCode);
    }
    throw err;
  }

  // Check read permission
  const perm = await requirePermission(context, sanitized.virtualPath, 'r');
  if (!perm.granted) {
    return jsonResponse({ error: 'Access denied' }, perm.status);
  }

  // Verify directory exists
  if (!fs.existsSync(sanitized.realPath)) {
    return jsonResponse({ error: 'Directory not found' }, 404);
  }

  const stat = fs.statSync(sanitized.realPath);
  if (!stat.isDirectory()) {
    return jsonResponse({ error: 'Path is not a directory' }, 400);
  }

  // Pagination & sorting params
  const page = Math.max(1, parseInt(context.url.searchParams.get('page') || '1'));
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(context.url.searchParams.get('limit') || String(DEFAULT_LIMIT))));

  const VALID_SORT_COLS = new Set(['name', 'size', 'modified']);
  const sortBy = VALID_SORT_COLS.has(context.url.searchParams.get('sortBy'))
    ? context.url.searchParams.get('sortBy')
    : 'name';
  const sortDir = context.url.searchParams.get('sortDir') === 'desc' ? 'desc' : 'asc';

  // Try database-backed sorted listing first
  const dbResult = await listDirectorySorted({
    virtualPath: sanitized.virtualPath,
    realPath: sanitized.realPath,
    sortBy,
    sortDir,
    page,
    limit,
  });

  let items, total;

  if (dbResult) {
    items = dbResult.items;
    total = dbResult.total;
  } else {
    // Fallback: filesystem-based listing (original logic)
    const entries = fs.readdirSync(sanitized.realPath, { withFileTypes: true });
    const filtered = entries.filter((entry) => !HIDDEN_ENTRIES.has(entry.name) && !HIDDEN_SUFFIXES.some(s => entry.name.endsWith(s)));

    filtered.sort((a, b) => {
      const aIsDir = a.isDirectory();
      const bIsDir = b.isDirectory();
      if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    total = filtered.length;
    const start = (page - 1) * limit;
    const paged = filtered.slice(start, start + limit);

    items = paged.map((entry) => {
      const entryPath = path.join(sanitized.realPath, entry.name);
      const entryStat = fs.statSync(entryPath);
      return {
        name: entry.name,
        type: entryStat.isDirectory() ? 'directory' : 'file',
        size: entryStat.size,
        modified: new Date(entryStat.mtimeMs).toISOString(),
        path: sanitized.virtualPath === '/' ? `/${entry.name}` : `${sanitized.virtualPath}/${entry.name}`,
      };
    });
  }

  // Build user permissions for this folder from the middleware result
  let permissions = { read: true, write: false, delete: false, move: false };
  if (context.locals.user?.is_admin) {
    permissions = { read: true, write: true, delete: true, move: true };
  } else if (perm.aliasPerms) {
    permissions = {
      read: perm.aliasPerms.can_read,
      write: perm.aliasPerms.can_write,
      delete: perm.aliasPerms.can_delete,
      move: perm.aliasPerms.can_move,
    };
  }

  // Audit: log directory access (deduplicated, fire-and-forget)
  logAccessDedup({ userId: context.locals.user?.id, path: sanitized.virtualPath, ipAddress: getClientIp(context) });

  return jsonResponse({
    path: sanitized.virtualPath,
    items,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
    permissions,
  });
}

/**
 * DELETE /api/files?path=/datosnas/carpeta/file.txt
 *
 * Moves item to Synology's #recycle bin.
 * Requires delete ('d') permission.
 *
 * @param {object} context
 * @returns {Promise<Response>}
 */
export async function DELETE(context) {
  const virtualPath = context.url.searchParams.get('path');
  if (!virtualPath) {
    return jsonResponse({ error: 'Query parameter "path" is required' }, 400);
  }

  let result;
  try {
    result = await deleteItem(context, virtualPath);
  } catch (err) {
    return jsonResponse({ error: `Delete failed: ${err.message}` }, 500);
  }

  if (!result.success) {
    return jsonResponse({ error: result.error }, result.status);
  }

  logAudit({
    userId: context.locals.user?.id,
    action: 'delete',
    path: virtualPath,
    ipAddress: getClientIp(context),
  });

  return jsonResponse({ message: 'Item moved to recycle bin' });
}

/**
 * @param {object} data
 * @param {number} [status]
 * @returns {Response}
 */
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
