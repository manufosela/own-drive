import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { sanitizePath, PathError } from '../../../lib/path-sanitizer.js';
import { requirePermission } from '../../../lib/permission-middleware.js';

/** MIME types for image extensions */
const IMAGE_MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
};

/** Image extensions considered valid comic pages */
const IMAGE_EXTS = new Set(Object.keys(IMAGE_MIME));

/**
 * GET /api/files/comic-page?path=/media/raid5/COMICS/comic.cbz&page=0
 *
 * Extracts and serves a single image page from a CBZ or CBR archive.
 * The `page` parameter is the zero-based index into the alphabetically-sorted
 * list of image entries inside the archive.
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

  const pageParam = context.url.searchParams.get('page');
  if (pageParam === null) {
    return jsonResponse({ error: 'Query parameter "page" is required' }, 400);
  }

  const pageIndex = parseInt(pageParam, 10);
  if (!Number.isInteger(pageIndex) || pageIndex < 0) {
    return jsonResponse({ error: '"page" must be a non-negative integer' }, 400);
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

  if (pageIndex >= imageEntries.length) {
    return jsonResponse({ error: `Page ${pageIndex} out of range (total: ${imageEntries.length})` }, 404);
  }

  const entryName = imageEntries[pageIndex];
  const entryExt = path.extname(entryName).toLowerCase();
  const contentType = IMAGE_MIME[entryExt] || 'application/octet-stream';

  let imageBuffer;
  try {
    if (ext === '.cbz') {
      imageBuffer = extractCbzEntry(sanitized.realPath, entryName);
    } else {
      imageBuffer = extractCbrEntry(sanitized.realPath, entryName);
    }
  } catch (err) {
    return jsonResponse({ error: `Failed to extract page: ${err.message}` }, 500);
  }

  return new Response(imageBuffer, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(imageBuffer.length),
      'Cache-Control': 'private, max-age=3600',
    },
  });
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
 * Lists entries in a CBR (RAR) archive using `unrar lb`.
 * @param {string} filePath
 * @returns {string[]}
 */
function listCbrEntries(filePath) {
  const output = execFileSync('unrar', ['lb', filePath], { encoding: 'utf8' });
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Extracts a single entry from a CBZ (ZIP) archive using `unzip -p`.
 * @param {string} filePath
 * @param {string} entryName
 * @returns {Buffer}
 */
function extractCbzEntry(filePath, entryName) {
  return execFileSync('unzip', ['-p', filePath, entryName], { maxBuffer: 50 * 1024 * 1024 });
}

/**
 * Extracts a single entry from a CBR (RAR) archive using `unrar p -inul`.
 * @param {string} filePath
 * @param {string} entryName
 * @returns {Buffer}
 */
function extractCbrEntry(filePath, entryName) {
  return execFileSync('unrar', ['p', '-inul', filePath, entryName], { maxBuffer: 50 * 1024 * 1024 });
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
