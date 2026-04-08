import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { sanitizePath, PathError } from '../../../lib/path-sanitizer.js';
import { requirePermission } from '../../../lib/permission-middleware.js';
import { logAudit, getClientIp } from '../../../lib/audit-logger.js';

/** Common MIME types by extension */
const MIME_TYPES = {
  '.dcm': 'application/dicom',
  '.stl': 'model/stl',
  '.obj': 'model/obj',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.md': 'text/plain',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.bat': 'text/plain',
  '.cmd': 'text/plain',
  '.sh': 'text/plain',
  '.bash': 'text/plain',
  '.zsh': 'text/plain',
  '.ps1': 'text/plain',
  '.py': 'text/plain',
  '.js': 'text/plain',
  '.ts': 'text/plain',
  '.jsx': 'text/plain',
  '.tsx': 'text/plain',
  '.css': 'text/plain',
  '.scss': 'text/plain',
  '.less': 'text/plain',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.yml': 'text/plain',
  '.yaml': 'text/plain',
  '.toml': 'text/plain',
  '.ini': 'text/plain',
  '.cfg': 'text/plain',
  '.conf': 'text/plain',
  '.log': 'text/plain',
  '.env': 'text/plain',
  '.properties': 'text/plain',
  '.sql': 'text/plain',
  '.java': 'text/plain',
  '.c': 'text/plain',
  '.cpp': 'text/plain',
  '.h': 'text/plain',
  '.hpp': 'text/plain',
  '.cs': 'text/plain',
  '.go': 'text/plain',
  '.rs': 'text/plain',
  '.rb': 'text/plain',
  '.php': 'text/plain',
  '.pl': 'text/plain',
  '.r': 'text/plain',
  '.swift': 'text/plain',
  '.kt': 'text/plain',
  '.scala': 'text/plain',
  '.lua': 'text/plain',
  '.vim': 'text/plain',
  '.gitignore': 'text/plain',
  '.dockerignore': 'text/plain',
  '.editorconfig': 'text/plain',
  '.htaccess': 'text/plain',
  '.reg': 'text/plain',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/**
 * GET /api/files/download?path=/datosnas/fichero.stl[&inline=true]
 *
 * Downloads or serves inline a single file with correct MIME type.
 * Use inline=true to open in browser (preview) instead of downloading.
 * Requires read ('r') permission.
 *
 * @param {object} context
 * @returns {Promise<Response>}
 */
export async function GET(context) {
  const virtualPath = context.url.searchParams.get('path');
  if (!virtualPath) {
    return jsonResponse({ error: 'Query parameter "path" is required' }, 400);
  }

  let sanitized;
  try {
    sanitized = sanitizePath(virtualPath);
  } catch (err) {
    if (err instanceof PathError || err.name === 'PathError') {
      return jsonResponse({ error: err.message }, err.statusCode);
    }
    throw err;
  }

  const perm = await requirePermission(context, sanitized.virtualPath, 'r');
  if (!perm.granted) {
    return jsonResponse({ error: 'Access denied' }, perm.status);
  }

  if (!fs.existsSync(sanitized.realPath)) {
    return jsonResponse({ error: 'File not found' }, 404);
  }

  const stat = fs.statSync(sanitized.realPath);
  if (!stat.isFile()) {
    return jsonResponse({ error: 'Path is not a file. Use /api/files to list directories' }, 400);
  }

  const fileName = path.basename(sanitized.realPath);
  const ext = path.extname(fileName).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  logAudit({
    userId: context.locals.user?.id,
    action: 'download',
    path: sanitized.virtualPath,
    fileSize: stat.size,
    ipAddress: getClientIp(context),
  });

  const inline = context.url.searchParams.get('inline') === 'true';
  const disposition = inline ? 'inline' : `attachment; filename="${fileName}"`;

  const stream = fs.createReadStream(sanitized.realPath);
  const webStream = Readable.toWeb(stream);

  return new Response(webStream, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': disposition,
      'Content-Length': String(stat.size),
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
