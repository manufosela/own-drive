import { query } from './db.js';

/**
 * @typedef {object} PermissionResult
 * @property {boolean} granted
 * @property {string} [role] - 'admin' | 'alias'
 * @property {string} [reason]
 */

/**
 * @typedef {object} AliasPermissions
 * @property {boolean} can_read
 * @property {boolean} can_write
 * @property {boolean} can_delete
 * @property {boolean} can_move
 * @property {number} alias_id
 * @property {string} alias_name
 */

/**
 * @typedef {object} User
 * @property {number} id
 * @property {boolean} is_admin
 */

/**
 * Map permission flags to alias boolean permission fields.
 * @type {Record<string, keyof AliasPermissions>}
 */
const FLAG_TO_ALIAS = {
  r: 'can_read',
  w: 'can_write',
  d: 'can_delete',
  x: 'can_read', // 'execute' on folders maps to read/navigate
};

/**
 * Resolve granular alias-based permissions for a user on a virtual path.
 * Finds the matching folder_alias by real_path prefix, then queries
 * folder_permissions for ALL groups the user belongs to, merging with OR.
 *
 * @param {User} user
 * @param {string} virtualPath
 * @returns {Promise<AliasPermissions | null>} null if no alias matches
 */
export async function resolveAliasPermissions(user, virtualPath) {
  // Find the alias whose real_path is a prefix of the virtualPath
  const aliasResult = await query(
    `SELECT id, alias_name, real_path
     FROM folder_aliases
     WHERE $1 = real_path OR $1 LIKE real_path || '/%'
     ORDER BY LENGTH(real_path) DESC
     LIMIT 1`,
    [virtualPath]
  );

  if (aliasResult.rows.length === 0) {
    return null;
  }

  const alias = aliasResult.rows[0];

  // Query merged permissions for all groups the user belongs to
  const permsResult = await query(
    `SELECT
       BOOL_OR(fp.can_read) AS can_read,
       BOOL_OR(fp.can_write) AS can_write,
       BOOL_OR(fp.can_delete) AS can_delete,
       BOOL_OR(fp.can_move) AS can_move
     FROM folder_permissions fp
     JOIN user_groups gm ON gm.group_id = fp.group_id
     WHERE fp.alias_id = $1 AND gm.user_id = $2`,
    [alias.id, user.id]
  );

  const row = permsResult.rows[0];

  return {
    can_read: row?.can_read ?? false,
    can_write: row?.can_write ?? false,
    can_delete: row?.can_delete ?? false,
    can_move: row?.can_move ?? false,
    alias_id: alias.id,
    alias_name: alias.alias_name,
  };
}

/**
 * Check if a user has the requested permission flags on a path.
 * Uses alias-based granular permissions only.
 *
 * @param {User} user
 * @param {string} virtualPath
 * @param {string} flags - permission flags to check, e.g. 'r', 'rw', 'rwxd'
 * @returns {Promise<PermissionResult>}
 */
export async function checkPermission(user, virtualPath, flags) {
  // Admin bypass
  if (user.is_admin) {
    return { granted: true, role: 'admin', reason: 'User is admin' };
  }

  const aliasPerms = await resolveAliasPermissions(user, virtualPath);

  if (!aliasPerms) {
    return { granted: false, reason: 'Path is not under any alias' };
  }

  const granted = checkAliasFlags(aliasPerms, flags);
  return {
    granted,
    role: 'alias',
    aliasPerms,
    reason: granted
      ? `Alias "${aliasPerms.alias_name}" grants required permissions`
      : `Alias "${aliasPerms.alias_name}" denies required permissions`,
  };
}

/**
 * Simple boolean wrapper around checkPermission.
 *
 * @param {User} user
 * @param {string} virtualPath
 * @param {string} flags
 * @returns {Promise<boolean>}
 */
export async function hasPermission(user, virtualPath, flags) {
  const result = await checkPermission(user, virtualPath, flags);
  return result.granted;
}

/**
 * Check that all requested flags map to granted alias permissions.
 *
 * @param {AliasPermissions} aliasPerms
 * @param {string} flags - e.g. 'r', 'rw', 'rwxd'
 * @returns {boolean}
 */
function checkAliasFlags(aliasPerms, flags) {
  for (const flag of flags) {
    const field = FLAG_TO_ALIAS[flag];
    if (!field) return false;
    if (!aliasPerms[field]) return false;
  }
  return true;
}
