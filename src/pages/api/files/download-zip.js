import fs from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { Readable } from 'node:stream';
import archiver from 'archiver';
import { sanitizePath, PathError } from '../../../lib/path-sanitizer.js';
import { requirePermission } from '../../../lib/permission-middleware.js';
import { logAudit, getClientIp } from '../../../lib/audit-logger.js';

/**
 * POST /api/files/download-zip
 * Body: { paths: string[] }
 *
 * Downloads multiple files as a ZIP archive.
 * Requires read ('r') permission on each file.
 *
 * @param {object} context
 * @returns {Promise<Response>}
 */
export async function POST(context) {
  const body = await context.request.json();
  const { paths } = body;

  if (!Array.isArray(paths) || paths.length === 0) {
    return jsonResponse({ error: 'Field "paths" must be a non-empty array' }, 400);
  }

  // Validate all paths and permissions before starting the ZIP
  const resolved = [];
  for (const virtualPath of paths) {
    let sanitized;
    try {
      sanitized = sanitizePath(virtualPath);
    } catch (err) {
      if (err instanceof PathError || err.name === 'PathError') {
        return jsonResponse({ error: `${virtualPath}: ${err.message}` }, err.statusCode);
      }
      throw err;
    }

    const perm = await requirePermission(context, sanitized.virtualPath, 'r');
    if (!perm.granted) {
      return jsonResponse({ error: `Access denied: ${virtualPath}` }, perm.status);
    }

    if (!fs.existsSync(sanitized.realPath)) {
      return jsonResponse({ error: `File not found: ${virtualPath}` }, 404);
    }

    const stat = fs.statSync(sanitized.realPath);
    if (!stat.isFile()) {
      return jsonResponse({ error: `Not a file: ${virtualPath}` }, 400);
    }

    resolved.push(sanitized);
  }

  // Create ZIP stream
  const archive = archiver('zip', { zlib: { level: 6 } });
  const passthrough = new PassThrough();
  archive.pipe(passthrough);

  for (const sanitized of resolved) {
    const fileName = path.basename(sanitized.realPath);
    archive.file(sanitized.realPath, { name: fileName });
  }

  archive.finalize();

  logAudit({
    userId: context.locals.user?.id,
    action: 'download_zip',
    path: paths[0],
    details: { fileCount: paths.length, paths },
    ipAddress: getClientIp(context),
  });

  const webStream = Readable.toWeb(passthrough);
  const timestamp = new Date().toISOString().slice(0, 10);

  return new Response(webStream, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="geniova-drive-${timestamp}.zip"`,
    },
  });
}

/**
 * @param {object} data
 * @param {number} [status]
 */
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
