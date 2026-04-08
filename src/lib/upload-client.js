/**
 * Client-side chunked upload logic.
 *
 * This module is designed to run in the browser. It splits a File into
 * chunks and uploads them sequentially via the chunked upload API.
 *
 * @module upload-client
 */

export const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB

/**
 * @typedef {object} UploadProgress
 * @property {number} chunkIndex - current chunk being uploaded (0-based)
 * @property {number} totalChunks - total number of chunks
 * @property {number} percent - 0-100 progress percentage
 * @property {number} bytesUploaded - bytes uploaded so far
 * @property {number} totalBytes - total file size
 */

/**
 * @typedef {object} UploadResult
 * @property {boolean} success
 * @property {string} [path] - virtual path of the uploaded file
 * @property {number} [size] - final file size
 * @property {string} [error] - error message on failure
 * @property {string} [uploadId] - session id (available if init succeeded)
 */

/**
 * @typedef {object} UploaderOptions
 * @property {typeof globalThis.fetch} [fetch] - fetch function (injectable for testing)
 * @property {number} [chunkSize] - chunk size in bytes
 */

export class ChunkedUploader {
  /** @type {typeof globalThis.fetch} */
  #fetch;

  /** @type {number} */
  #chunkSize;

  /**
   * @param {UploaderOptions} [options]
   */
  constructor(options = {}) {
    this.#fetch = options.fetch || globalThis.fetch.bind(globalThis);
    this.#chunkSize = options.chunkSize || DEFAULT_CHUNK_SIZE;
  }

  /**
   * Calculate the number of chunks needed for a given file size.
   *
   * @param {number} fileSize
   * @returns {number}
   */
  calculateChunks(fileSize) {
    return Math.ceil(fileSize / this.#chunkSize);
  }

  /**
   * Initialize an upload session on the server.
   *
   * @param {string} virtualPath - destination virtual path
   * @param {string} fileName - original file name
   * @param {number} totalSize - file size in bytes
   * @returns {Promise<{success: boolean, uploadId?: string, totalChunks?: number, error?: string}>}
   */
  async initSession(virtualPath, fileName, totalSize) {
    const totalChunks = this.calculateChunks(totalSize);

    const res = await this.#fetch('/api/files/upload/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: virtualPath, fileName, totalSize, totalChunks }),
    });

    return res.json();
  }

  /**
   * Upload a single chunk.
   *
   * @param {string} uploadId
   * @param {number} chunkIndex
   * @param {Blob} data
   * @returns {Promise<{success: boolean, chunkIndex?: number, error?: string}>}
   */
  async uploadChunk(uploadId, chunkIndex, data) {
    const res = await this.#fetch(
      `/api/files/upload/chunk?uploadId=${uploadId}&chunkIndex=${chunkIndex}`,
      { method: 'PUT', body: data },
    );

    return res.json();
  }

  /**
   * Complete an upload session (assemble chunks).
   *
   * @param {string} uploadId
   * @returns {Promise<{success: boolean, path?: string, size?: number, error?: string}>}
   */
  async completeSession(uploadId) {
    const res = await this.#fetch('/api/files/upload/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploadId }),
    });

    return res.json();
  }

  /**
   * Upload a file using chunked upload with progress tracking.
   *
   * @param {File} file - the file to upload
   * @param {string} virtualPath - destination virtual path (including filename)
   * @param {object} [options]
   * @param {(progress: UploadProgress) => void} [options.onProgress]
   * @returns {Promise<UploadResult>}
   */
  async upload(file, virtualPath, options = {}) {
    const { onProgress } = options;

    // Step 1: Init session
    const init = await this.initSession(virtualPath, file.name, file.size);
    if (!init.success) {
      return { success: false, error: init.error };
    }

    const { uploadId, totalChunks } = init;

    // Step 2: Upload chunks sequentially
    for (let i = 0; i < totalChunks; i++) {
      const start = i * this.#chunkSize;
      const end = Math.min(start + this.#chunkSize, file.size);
      const chunk = file.slice(start, end);

      const result = await this.uploadChunk(uploadId, i, chunk);
      if (!result.success) {
        return { success: false, error: result.error, uploadId };
      }

      if (onProgress) {
        onProgress({
          chunkIndex: i,
          totalChunks,
          percent: Math.round(((i + 1) / totalChunks) * 100),
          bytesUploaded: end,
          totalBytes: file.size,
        });
      }
    }

    // Step 3: Complete
    const complete = await this.completeSession(uploadId);
    if (!complete.success) {
      return { success: false, error: complete.error, uploadId };
    }

    return { success: true, path: complete.path, size: complete.size, uploadId };
  }
}
