import { query } from './db.js';

/** Deduplication window for access events */
export const ACCESS_DEDUP_MS = 5 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60_000;

/** @type {Map<string, number>} key: "userId:path", value: timestamp */
const _accessCache = new Map();
let _lastCleanup = Date.now();

/**
 * Log a directory access event, deduplicated per user+path.
 * Same user accessing the same path within ACCESS_DEDUP_MS is ignored.
 *
 * @param {object} params
 * @param {number} params.userId
 * @param {string} params.path
 * @param {string} [params.ipAddress]
 */
export function logAccessDedup({ userId, path, ipAddress }) {
  if (!userId || !path) return;
  const key = `${userId}:${path}`;
  const now = Date.now();

  // Lazy cleanup of expired entries
  if (now - _lastCleanup > CLEANUP_INTERVAL_MS) {
    _lastCleanup = now;
    for (const [k, ts] of _accessCache) {
      if (now - ts > ACCESS_DEDUP_MS) _accessCache.delete(k);
    }
  }

  const last = _accessCache.get(key);
  if (last && now - last < ACCESS_DEDUP_MS) return;

  _accessCache.set(key, now);
  logAudit({ userId, action: 'access', path, ipAddress });
}

/** @internal Exposed for testing */
export function _resetAccessCache() {
  _accessCache.clear();
  _lastCleanup = Date.now();
}

/**
 * Log an action to the audit_log table.
 * Best-effort: never throws — errors are logged to console.
 *
 * @param {object} params
 * @param {number} params.userId - User performing the action
 * @param {string} params.action - Action type (access, login, logout, download, upload, delete, move, rename, mkdir, download_zip)
 * @param {string} params.path - Virtual path of the resource
 * @param {string} [params.targetPath] - Destination path (for move/rename)
 * @param {number} [params.fileSize] - File size in bytes
 * @param {object} [params.details] - Extra metadata (JSONB)
 * @param {string} [params.ipAddress] - Client IP address
 */
export async function logAudit({ userId, action, path, targetPath, fileSize, details, ipAddress }) {
  try {
    await query(
      `INSERT INTO audit_log (user_id, action, path, target_path, file_size, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId,
        action,
        path,
        targetPath ?? null,
        fileSize ?? null,
        details ? JSON.stringify(details) : null,
        ipAddress ?? null,
      ],
    );
  } catch (err) {
    console.error('[audit] Failed to log action:', action, path, err.message);
  }
}

/**
 * Extract client IP from the request context.
 * @param {object} context - Astro request context
 * @returns {string|null}
 */
export function getClientIp(context) {
  const headers = context?.request?.headers;
  if (!headers || typeof headers.get !== 'function') return null;
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIp = headers.get('x-real-ip');
  if (realIp) return realIp;
  return null;
}
