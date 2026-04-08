import fs from 'node:fs';
import path from 'node:path';
import { sanitizePath, sanitizeNewPath, PathError } from './path-sanitizer.js';
import { requirePermission } from './permission-middleware.js';

/**
 * @typedef {object} OperationResult
 * @property {boolean} success
 * @property {string} [newPath]
 * @property {string} [path]
 * @property {string} [error]
 * @property {number} [status]
 */

/**
 * Rename a file or directory.
 *
 * @param {object} context - Astro API context (needs locals.user)
 * @param {string} virtualPath - current virtual path
 * @param {string} newName - new file/folder name (just the name, no slashes)
 * @returns {Promise<OperationResult>}
 */
export async function renameItem(context, virtualPath, newName) {
  // Validate new name
  if (!newName || newName.includes('/') || newName.includes('\\')) {
    return { success: false, status: 400, error: 'Invalid name: must not contain path separators' };
  }

  let sanitized;
  try {
    sanitized = await sanitizePath(virtualPath);
  } catch (err) {
    return handlePathError(err);
  }

  // Check write permission on parent directory
  const parentVirtual = path.posix.dirname(sanitized.virtualPath);
  const perm = await requirePermission(context, parentVirtual, 'w');
  if (!perm.granted) {
    return { success: false, status: perm.status, error: 'Access denied' };
  }

  if (!fs.existsSync(sanitized.realPath)) {
    return { success: false, status: 404, error: 'Source not found' };
  }

  // Build target path
  const targetReal = path.join(path.dirname(sanitized.realPath), newName);
  if (fs.existsSync(targetReal)) {
    return { success: false, status: 409, error: 'Target already exists' };
  }

  fs.renameSync(sanitized.realPath, targetReal);

  const newVirtualPath = `${parentVirtual}/${newName}`;
  return { success: true, newPath: newVirtualPath };
}

/**
 * Move a file or directory to a different directory.
 *
 * @param {object} context
 * @param {string} sourcePath - virtual path of item to move
 * @param {string} destPath - virtual path of destination directory
 * @returns {Promise<OperationResult>}
 */
export async function moveItem(context, sourcePath, destPath) {
  let srcSanitized;
  try {
    srcSanitized = await sanitizePath(sourcePath);
  } catch (err) {
    return handlePathError(err);
  }

  // Write permission on source parent (to remove from there)
  const srcParent = path.posix.dirname(srcSanitized.virtualPath);
  const srcPerm = await requirePermission(context, srcParent, 'w');
  if (!srcPerm.granted) {
    return { success: false, status: srcPerm.status, error: 'Access denied on source' };
  }

  let destSanitized;
  try {
    destSanitized = await sanitizePath(destPath);
  } catch (err) {
    return handlePathError(err);
  }

  // Write permission on destination
  const destPerm = await requirePermission(context, destSanitized.virtualPath, 'w');
  if (!destPerm.granted) {
    return { success: false, status: destPerm.status, error: 'Access denied on destination' };
  }

  if (!fs.existsSync(srcSanitized.realPath)) {
    return { success: false, status: 404, error: 'Source not found' };
  }

  if (!fs.existsSync(destSanitized.realPath)) {
    return { success: false, status: 404, error: 'Destination not found' };
  }

  const destStat = fs.statSync(destSanitized.realPath);
  if (!destStat.isDirectory()) {
    return { success: false, status: 400, error: 'Destination must be a directory' };
  }

  const fileName = path.basename(srcSanitized.realPath);
  const targetReal = path.join(destSanitized.realPath, fileName);
  if (fs.existsSync(targetReal)) {
    return { success: false, status: 409, error: 'Item with same name already exists in destination' };
  }

  try {
    fs.renameSync(srcSanitized.realPath, targetReal);
  } catch (err) {
    if (err.code === 'EXDEV') {
      // Cross-device move: copy then delete
      copyRecursiveSync(srcSanitized.realPath, targetReal);
      fs.rmSync(srcSanitized.realPath, { recursive: true, force: true });
    } else {
      throw err;
    }
  }

  const newVirtualPath = `${destSanitized.virtualPath}/${fileName}`;
  return { success: true, newPath: newVirtualPath };
}

/**
 * Create a new directory.
 *
 * @param {object} context
 * @param {string} virtualPath - virtual path for the new directory
 * @returns {Promise<OperationResult>}
 */
export async function createDirectory(context, virtualPath) {
  let sanitized;
  try {
    sanitized = await sanitizeNewPath(virtualPath);
  } catch (err) {
    return handlePathError(err);
  }

  // Write permission on parent
  const parentVirtual = path.posix.dirname(sanitized.virtualPath);
  const perm = await requirePermission(context, parentVirtual, 'w');
  if (!perm.granted) {
    return { success: false, status: perm.status, error: 'Access denied' };
  }

  if (fs.existsSync(sanitized.realPath)) {
    return { success: false, status: 409, error: 'Directory already exists' };
  }

  fs.mkdirSync(sanitized.realPath, { recursive: true });

  return { success: true, path: sanitized.virtualPath };
}

/**
 * Delete an item by moving it to the Synology #recycle bin.
 *
 * @param {object} context
 * @param {string} virtualPath - virtual path of item to delete
 * @returns {Promise<OperationResult>}
 */
export async function deleteItem(context, virtualPath) {
  let sanitized;
  try {
    sanitized = await sanitizePath(virtualPath);
  } catch (err) {
    return handlePathError(err);
  }

  // Delete permission ('d')
  const parentVirtual = path.posix.dirname(sanitized.virtualPath);
  const perm = await requirePermission(context, parentVirtual, 'd');
  if (!perm.granted) {
    return { success: false, status: perm.status, error: 'Access denied' };
  }

  if (!fs.existsSync(sanitized.realPath)) {
    return { success: false, status: 404, error: 'Item not found' };
  }

  // Move to #recycle in the mount point root
  const recyclePath = path.join(sanitized.realMountPoint, '#recycle');
  if (!fs.existsSync(recyclePath)) {
    fs.mkdirSync(recyclePath, { recursive: true });
  }

  const fileName = path.basename(sanitized.realPath);
  const timestamp = Date.now();
  const recycledName = `${fileName}.${timestamp}`;
  const targetPath = path.join(recyclePath, recycledName);

  try {
    fs.renameSync(sanitized.realPath, targetPath);
  } catch (err) {
    if (err.code === 'EXDEV') {
      console.log(`[delete] EXDEV on rename, using copy+delete for "${virtualPath}"`);
      copyRecursiveSync(sanitized.realPath, targetPath);
      fs.rmSync(sanitized.realPath, { recursive: true, force: true });
    } else {
      console.error(`[delete] rename failed for "${virtualPath}": ${err.code} ${err.message}`);
      return { success: false, status: 500, error: `Delete failed: ${err.message}` };
    }
  }

  return { success: true };
}

/**
 * Recursively copy a file or directory.
 * Used as fallback when fs.renameSync fails with EXDEV (cross-device move).
 *
 * @param {string} src
 * @param {string} dest
 */
function copyRecursiveSync(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursiveSync(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

/**
 * @param {any} err
 * @returns {OperationResult}
 */
function handlePathError(err) {
  if (err instanceof PathError || err.name === 'PathError') {
    return { success: false, status: err.statusCode, error: err.message };
  }
  throw err;
}
