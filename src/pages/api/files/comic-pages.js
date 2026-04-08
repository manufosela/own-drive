import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { sanitizePath, PathError } from '../../../lib/path-sanitizer.js';
import { requirePermission } from '../../../lib/permission-middleware.js';

/** Image extensions considered valid comic pages */
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']);

/**
 * GET /api/files/comic-pages?path=/media/raid5/COMICS/comic.cbz
 *
 * Lists image pages inside a CBZ or CBR comic archive.
 * Returns { pages: [{ index, name }], total } sorted alphabetically.
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
    sanitized = await sanitizePath(virtualPath);
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
    return jsonResponse({ error: 'Path is not a file' }, 400);
  }

  const ext = path.extname(sanitized.realPath).toLowerCase();
  if (ext !== '.cbz' && ext !== '.cbr') {
    return jsonResponse({ error: 'File must be a .cbz or .cbr archive' }, 400);
  }

  let entries;
  try {
    if (ext === '.cbz') {
      entries = listCbzEntries(sanitized.realPath);
    } else {
      entries = listCbrEntries(sanitized.realPath);
    }
  } catch (err) {
    return jsonResponse({ error: `Failed to read archive: ${err.message}` }, 500);
  }

  const imageEntries = entries
    .filter((name) => IMAGE_EXTS.has(path.extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

  const pages = imageEntries.map((name, index) => ({ index, name }));

  return jsonResponse({ pages, total: pages.length });
}

/**
 * Lists entries in a CBZ (ZIP) archive using `unzip -Z1`.
 * @param {string} filePath
 * @returns {string[]}
 */
function listCbzEntries(filePath) {
  const output = execFileSync('unzip', ['-Z1', filePath], { encoding: 'utf8' });
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Lists entries in a CBR (RAR) archive using `unrar --list` (unrar-free).
 * Output includes headers, so we filter to only lines that look like filenames.
 * @param {string} filePath
 * @returns {string[]}
 */
function listCbrEntries(filePath) {
  const output = execFileSync('unrar', ['--list', filePath], { encoding: 'utf8' });
  // unrar-free --list outputs headers + filenames + sizes mixed.
  // Filenames are lines that contain a dot and extension, not starting with spaces/dashes.
  const lines = output.split('\n').map((l) => l.trim()).filter(Boolean);
  // Filter: keep lines that have a file extension and are not header lines
  return lines.filter((line) =>
    /\.\w{2,4}$/.test(line) && !line.startsWith('-') && !line.startsWith('Pathname')
  );
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
