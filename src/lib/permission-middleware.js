import { checkPermission } from './permission-checker.js';

/**
 * @typedef {object} MiddlewareResult
 * @property {boolean} granted
 * @property {string} [role]
 * @property {string} [reason]
 * @property {number} [status] - HTTP status code when denied
 */

/**
 * Check permissions for an API request context.
 * Extracts the user from context.locals and delegates to checkPermission.
 *
 * @param {object} context - Astro API context
 * @param {string} virtualPath - virtual path to check
 * @param {string} flags - required permission flags (e.g. 'r', 'rw', 'rwxd')
 * @returns {Promise<MiddlewareResult>}
 */
export async function requirePermission(context, virtualPath, flags) {
  const user = context.locals?.user;

  if (!user) {
    return { granted: false, status: 401, reason: 'Not authenticated' };
  }

  try {
    const result = await checkPermission(user, virtualPath, flags);

    if (!result.granted) {
      return { ...result, status: 403 };
    }

    return result;
  } catch (err) {
    return { granted: false, status: 500, reason: 'Internal permission check error' };
  }
}
