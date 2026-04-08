import path from 'node:path';
import fs from 'node:fs';
import { query } from './db.js';

/**
 * Dynamic mount map loaded from the volumes table.
 * Each active volume's mount_path acts as both virtual and real path.
 * @type {Record<string, string>}
 */
let MOUNT_MAP = {};

/** @type {string[]} */
let ALLOWED_PREFIXES = [];

/** @type {number} */
let _lastLoad = 0;

/** Cache TTL: reload volumes every 30 seconds */
const CACHE_TTL = 30_000;

/**
 * Load active volumes from DB and build the mount map.
 * Cached with TTL to avoid querying on every request.
 */
export async function loadMountMap() {
  const now = Date.now();
  if (now - _lastLoad < CACHE_TTL && Object.keys(MOUNT_MAP).length > 0) return;

  try {
    const result = await query(
      'SELECT mount_path FROM volumes WHERE active = true ORDER BY mount_path'
    );
    const map = {};
    for (const row of result.rows) {
      map[row.mount_path] = row.mount_path;
    }
    MOUNT_MAP = map;
    ALLOWED_PREFIXES = Object.values(map);
    _lastLoad = now;
  } catch {
    // If DB is unavailable, keep existing map
  }
}

/**
 * Force reload of mount map (e.g. after adding a volume).
 */
export function invalidateMountMap() {
  _lastLoad = 0;
}

/**
 * @typedef {Object} SanitizedPath
 * @property {string} virtualPath - Normalized virtual path
 * @property {string} realPath - Resolved real path on the filesystem
 * @property {string} mountPoint - Virtual mount point
 * @property {string} realMountPoint - Real mount point
 */

/**
 * Sanitize and validate a virtual path, returning the real filesystem path.
 * Prevents path traversal, null bytes, and symlink escapes.
 *
 * @param {string} virtualPath - Virtual path from the API
 * @returns {Promise<SanitizedPath>}
 * @throws {PathError}
 */
export async function sanitizePath(virtualPath) {
  if (!virtualPath || typeof virtualPath !== 'string') {
    throw new PathError('Path is required', 400);
  }

  if (virtualPath.includes('\0')) {
    throw new PathError('Invalid path: null bytes not allowed', 400);
  }

  await loadMountMap();

  const normalized = path.posix.normalize(virtualPath).replace(/\/+$/, '') || '/';

  const mountEntry = Object.entries(MOUNT_MAP).find(([prefix]) =>
    normalized === prefix || normalized.startsWith(prefix + '/')
  );

  if (!mountEntry) {
    const available = Object.keys(MOUNT_MAP);
    throw new PathError(
      available.length > 0
        ? `Invalid path: must start with ${available.join(' or ')}`
        : 'No volumes configured',
      400
    );
  }

  const [virtualMount, realMount] = mountEntry;
  const relativePath = normalized.slice(virtualMount.length) || '/';
  const realPath = path.join(realMount, relativePath);
  const resolvedReal = path.resolve(realPath);
  const resolvedMount = path.resolve(realMount);

  if (!resolvedReal.startsWith(resolvedMount)) {
    throw new PathError('Invalid path: directory traversal detected', 400);
  }

  if (fs.existsSync(resolvedReal)) {
    const realResolved = fs.realpathSync(resolvedReal);
    const isInsideAnyMount = ALLOWED_PREFIXES.some((prefix) =>
      realResolved.startsWith(path.resolve(prefix))
    );
    if (!isInsideAnyMount) {
      throw new PathError('Invalid path: symlink escapes allowed mount points', 400);
    }
  }

  return {
    virtualPath: normalized,
    realPath: resolvedReal,
    mountPoint: virtualMount,
    realMountPoint: resolvedMount,
  };
}

/**
 * Sanitize a path for new file/directory creation (no symlink check).
 *
 * @param {string} virtualPath
 * @returns {Promise<SanitizedPath>}
 * @throws {PathError}
 */
export async function sanitizeNewPath(virtualPath) {
  if (!virtualPath || typeof virtualPath !== 'string') {
    throw new PathError('Path is required', 400);
  }

  if (virtualPath.includes('\0')) {
    throw new PathError('Invalid path: null bytes not allowed', 400);
  }

  await loadMountMap();

  const normalized = path.posix.normalize(virtualPath);

  const mountEntry = Object.entries(MOUNT_MAP).find(([prefix]) =>
    normalized === prefix || normalized.startsWith(prefix + '/')
  );

  if (!mountEntry) {
    const available = Object.keys(MOUNT_MAP);
    throw new PathError(
      available.length > 0
        ? `Invalid path: must start with ${available.join(' or ')}`
        : 'No volumes configured',
      400
    );
  }

  const [virtualMount, realMount] = mountEntry;
  const relativePath = normalized.slice(virtualMount.length) || '/';
  const realPath = path.join(realMount, relativePath);
  const resolvedReal = path.resolve(realPath);
  const resolvedMount = path.resolve(realMount);

  if (!resolvedReal.startsWith(resolvedMount)) {
    throw new PathError('Invalid path: directory traversal detected', 400);
  }

  return {
    virtualPath: normalized,
    realPath: resolvedReal,
    mountPoint: virtualMount,
    realMountPoint: resolvedMount,
  };
}

/**
 * Return configured mount points (from volumes table).
 * @returns {Promise<{ virtualPath: string, realPath: string }[]>}
 */
export async function getMountPoints() {
  await loadMountMap();
  return Object.entries(MOUNT_MAP).map(([virtualPath, realPath]) => ({
    virtualPath,
    realPath,
  }));
}

export class PathError extends Error {
  /** @param {string} message @param {number} statusCode */
  constructor(message, statusCode) {
    super(message);
    this.name = 'PathError';
    /** @type {number} */
    this.statusCode = statusCode;
  }
}
