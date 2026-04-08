/**
 * In-memory presence store with automatic TTL expiration.
 *
 * Each entry tracks which folder a user is currently browsing.
 * Entries expire after TTL_MS milliseconds without a heartbeat.
 *
 * @module presence-store
 */

const TTL_MS = 60_000;

/**
 * @typedef {object} PresenceEntry
 * @property {number} userId
 * @property {string} displayName
 * @property {string} path
 * @property {number} lastSeen - Date.now() timestamp
 */

/** @type {Map<number, PresenceEntry>} userId → entry */
const store = new Map();

/**
 * Update or create presence for a user.
 * @param {number} userId
 * @param {string} displayName
 * @param {string} path
 */
export function setPresence(userId, displayName, path) {
  store.set(userId, {
    userId,
    displayName,
    path,
    lastSeen: Date.now(),
  });
}

/**
 * Remove presence for a user.
 * @param {number} userId
 */
export function removePresence(userId) {
  store.delete(userId);
}

/**
 * Get all active users in a given path (non-expired).
 * Cleans up expired entries as a side effect.
 * @param {string} path
 * @param {number} [excludeUserId] - user to exclude (typically the requester)
 * @returns {Array<{user_id: number, display_name: string, since: string}>}
 */
export function getPresence(path, excludeUserId) {
  const now = Date.now();
  const result = [];

  for (const [uid, entry] of store) {
    if (now - entry.lastSeen > TTL_MS) {
      store.delete(uid);
      continue;
    }
    if (entry.path === path && uid !== excludeUserId) {
      result.push({
        user_id: entry.userId,
        display_name: entry.displayName,
        since: new Date(entry.lastSeen).toISOString(),
      });
    }
  }

  return result;
}

/**
 * Get active users grouped by path for all sub-paths of a parent.
 * Useful for showing presence badges on folder listings.
 * @param {string} parentPath - e.g. "/datosnas/stls"
 * @param {number} [excludeUserId]
 * @returns {Object<string, Array<{user_id: number, display_name: string, since: string}>>}
 */
export function getPresenceChildren(parentPath, excludeUserId) {
  const now = Date.now();
  const prefix = parentPath.endsWith('/') ? parentPath : parentPath + '/';
  /** @type {Object<string, Array<{user_id: number, display_name: string, since: string}>>} */
  const result = {};

  for (const [uid, entry] of store) {
    if (now - entry.lastSeen > TTL_MS) {
      store.delete(uid);
      continue;
    }
    if (uid !== excludeUserId && entry.path.startsWith(prefix)) {
      if (!result[entry.path]) result[entry.path] = [];
      result[entry.path].push({
        user_id: entry.userId,
        display_name: entry.displayName,
        since: new Date(entry.lastSeen).toISOString(),
      });
    }
  }

  return result;
}

/**
 * Clear all entries (for testing).
 */
export function clearAll() {
  store.clear();
}
