import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { sanitizeNewPath, PathError } from './path-sanitizer.js';
import { requirePermission } from './permission-middleware.js';
import { checkQuota, updateUsedBytes } from './quota-service.js';

const UPLOAD_DIR = process.env.UPLOAD_TMP_DIR || '/tmp/geniova-uploads';

/**
 * Initialize a chunked upload session.
 *
 * @param {object} context - Astro API context (needs locals.user)
 * @param {string} virtualPath - destination virtual path (including filename)
 * @param {string} fileName - original file name
 * @param {number} totalSize - total file size in bytes
 * @param {number} totalChunks - number of chunks
 * @returns {Promise<object>}
 */
export async function initUpload(context, virtualPath, fileName, totalSize, totalChunks) {
  let sanitized;
  try {
    sanitized = sanitizeNewPath(virtualPath);
  } catch (err) {
    if (err instanceof PathError || err.name === 'PathError') {
      return { success: false, status: err.statusCode, error: err.message };
    }
    throw err;
  }

  // Check write permission on parent directory
  const parentVirtual = path.posix.dirname(sanitized.virtualPath);
  const perm = await requirePermission(context, parentVirtual, 'w');
  if (!perm.granted) {
    return { success: false, status: perm.status, error: 'Access denied' };
  }

  // Check if file already exists
  if (fs.existsSync(sanitized.realPath)) {
    return { success: false, status: 409, error: 'File already exists at destination' };
  }

  // Check quota
  const quotaCheck = await checkQuota(context.locals.user.id, totalSize);
  if (!quotaCheck.allowed) {
    return {
      success: false,
      status: 413,
      error: `Quota exceeded. Available: ${quotaCheck.availableBytes} bytes`,
    };
  }

  // Create upload session
  const uploadId = crypto.randomUUID();
  const sessionDir = path.join(UPLOAD_DIR, uploadId);
  fs.mkdirSync(sessionDir, { recursive: true });

  // Save session metadata
  const metadata = {
    userId: context.locals.user.id,
    virtualPath: sanitized.virtualPath,
    realPath: sanitized.realPath,
    fileName,
    totalSize,
    totalChunks,
    createdAt: new Date().toISOString(),
  };

  fs.writeFileSync(path.join(sessionDir, 'metadata.json'), JSON.stringify(metadata));

  return { success: true, uploadId, totalChunks };
}

/**
 * Write a chunk to the upload session directory.
 *
 * @param {number} userId - authenticated user ID
 * @param {string} uploadId - upload session ID
 * @param {number} chunkIndex - zero-based chunk index
 * @param {Buffer} data - chunk data
 * @returns {Promise<object>}
 */
export async function writeChunk(userId, uploadId, chunkIndex, data) {
  const sessionDir = path.join(UPLOAD_DIR, uploadId);

  if (!fs.existsSync(sessionDir)) {
    return { success: false, status: 404, error: 'Upload session not found' };
  }

  const metadata = JSON.parse(fs.readFileSync(path.join(sessionDir, 'metadata.json'), 'utf-8'));

  if (metadata.userId !== userId) {
    return { success: false, status: 403, error: 'Not your upload session' };
  }

  if (chunkIndex < 0 || chunkIndex >= metadata.totalChunks) {
    return { success: false, status: 400, error: `Invalid chunk index: must be 0-${metadata.totalChunks - 1}` };
  }

  fs.writeFileSync(path.join(sessionDir, `chunk_${chunkIndex}`), data);

  return { success: true, chunkIndex };
}

/**
 * Assemble all chunks into the final file and clean up.
 *
 * @param {number} userId - authenticated user ID
 * @param {string} uploadId - upload session ID
 * @returns {Promise<object>}
 */
export async function completeUpload(userId, uploadId) {
  const sessionDir = path.join(UPLOAD_DIR, uploadId);

  if (!fs.existsSync(sessionDir)) {
    return { success: false, status: 404, error: 'Upload session not found' };
  }

  const metadata = JSON.parse(fs.readFileSync(path.join(sessionDir, 'metadata.json'), 'utf-8'));

  if (metadata.userId !== userId) {
    return { success: false, status: 403, error: 'Not your upload session' };
  }

  // Verify all chunks are present
  const missing = [];
  for (let i = 0; i < metadata.totalChunks; i++) {
    if (!fs.existsSync(path.join(sessionDir, `chunk_${i}`))) {
      missing.push(i);
    }
  }

  if (missing.length > 0) {
    return { success: false, status: 400, error: `Chunks missing: ${missing.join(', ')}` };
  }

  // Assemble chunks into final file
  const chunks = [];
  for (let i = 0; i < metadata.totalChunks; i++) {
    chunks.push(fs.readFileSync(path.join(sessionDir, `chunk_${i}`)));
  }

  const finalData = Buffer.concat(chunks);
  fs.writeFileSync(metadata.realPath, finalData);

  // Update quota usage
  await updateUsedBytes(metadata.userId, finalData.length);

  // Clean up session directory
  fs.rmSync(sessionDir, { recursive: true, force: true });

  return { success: true, path: metadata.virtualPath, size: finalData.length };
}

/**
 * Get the status of an upload session (which chunks are uploaded).
 *
 * @param {number} userId
 * @param {string} uploadId
 * @returns {Promise<object>}
 */
export async function getUploadStatus(userId, uploadId) {
  const sessionDir = path.join(UPLOAD_DIR, uploadId);

  if (!fs.existsSync(sessionDir)) {
    return { success: false, status: 404, error: 'Upload session not found' };
  }

  const metadata = JSON.parse(fs.readFileSync(path.join(sessionDir, 'metadata.json'), 'utf-8'));

  if (metadata.userId !== userId) {
    return { success: false, status: 403, error: 'Not your upload session' };
  }

  const uploadedChunks = [];
  const missingChunks = [];

  for (let i = 0; i < metadata.totalChunks; i++) {
    if (fs.existsSync(path.join(sessionDir, `chunk_${i}`))) {
      uploadedChunks.push(i);
    } else {
      missingChunks.push(i);
    }
  }

  return {
    success: true,
    fileName: metadata.fileName,
    totalChunks: metadata.totalChunks,
    uploadedChunks,
    missingChunks,
  };
}
