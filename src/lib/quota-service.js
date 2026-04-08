import { query } from './db.js';

/**
 * @typedef {object} QuotaInfo
 * @property {number} userId
 * @property {number} maxBytes
 * @property {number} usedBytes
 * @property {number} availableBytes
 * @property {number} percentUsed - 0-100
 */

/**
 * Get the quota information for a user.
 *
 * @param {number} userId
 * @returns {Promise<QuotaInfo|null>}
 */
export async function getQuota(userId) {
  const result = await query(
    'SELECT user_id, max_bytes, used_bytes FROM quotas WHERE user_id = $1',
    [userId],
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  const available = row.max_bytes - row.used_bytes;

  return {
    userId: row.user_id,
    maxBytes: row.max_bytes,
    usedBytes: row.used_bytes,
    availableBytes: Math.max(0, available),
    percentUsed: row.max_bytes > 0
      ? Math.round((row.used_bytes / row.max_bytes) * 100)
      : 0,
  };
}

/**
 * Check whether a user has enough quota for a file of the given size.
 *
 * Returns { allowed: true } if the user has no quota row (no limit).
 *
 * @param {number} userId
 * @param {number} fileSize - size in bytes of the file to upload
 * @returns {Promise<{allowed: boolean, availableBytes?: number}>}
 */
export async function checkQuota(userId, fileSize) {
  const quota = await getQuota(userId);
  if (!quota) return { allowed: true };

  if (quota.usedBytes + fileSize > quota.maxBytes) {
    return { allowed: false, availableBytes: quota.availableBytes };
  }

  return { allowed: true };
}

/**
 * Increment (or decrement) the used_bytes for a user.
 *
 * @param {number} userId
 * @param {number} delta - positive to add, negative to subtract
 * @returns {Promise<number|null>} - new used_bytes, or null if no quota row
 */
export async function updateUsedBytes(userId, delta) {
  const result = await query(
    'UPDATE quotas SET used_bytes = GREATEST(0, used_bytes + $1) WHERE user_id = $2 RETURNING used_bytes',
    [delta, userId],
  );

  if (result.rows.length === 0) return null;
  return result.rows[0].used_bytes;
}
