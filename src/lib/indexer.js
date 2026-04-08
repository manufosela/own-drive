import fs from 'node:fs/promises';
import path from 'node:path';
import { query } from './db.js';
import { getMountPoints } from './path-sanitizer.js';

const BATCH_SIZE = 500;
const HIDDEN_ENTRIES = new Set(['#recycle', '@eaDir']);
const PROGRESS_INTERVAL = 1000;

/**
 * @typedef {Object} IndexEntry
 * @property {string} virtualPath
 * @property {string} name
 * @property {string} nameLower
 * @property {string} fileType
 * @property {number} size
 * @property {Date|null} modified
 * @property {string} parentPath
 * @property {string} mountPoint
 */

export class NasIndexer {
  /** @type {AbortController|null} */
  #controller = null;

  /** @type {boolean} */
  #running = false;

  get running() {
    return this.#running;
  }

  /**
   * Index a single mount point.
   * @param {string} mountPoint - Virtual mount point (e.g. '/datosnas')
   * @param {string} realPath - Real filesystem path (e.g. '/mnt/datosnas')
   * @param {AbortSignal} [signal] - Optional external abort signal
   */
  async indexMount(mountPoint, realPath, signal) {
    if (this.#running) {
      throw new Error('Indexation already in progress');
    }

    this.#controller = new AbortController();
    this.#running = true;

    const effectiveSignal = signal || this.#controller.signal;

    const startedAt = new Date();

    try {
      await query(
        `UPDATE index_status SET status = 'running', started_at = $1, finished_at = NULL,
         total_files = 0, indexed_files = 0, error_message = NULL, updated_at = NOW()
         WHERE mount_point = $2`,
        [startedAt.toISOString(), mountPoint],
      );

      /** @type {IndexEntry[]} */
      let batch = [];
      let totalIndexed = 0;
      let lastProgress = Date.now();

      /**
       * @param {string} realDir
       * @param {string} virtualDir
       */
      const walk = async (realDir, virtualDir) => {
        if (effectiveSignal.aborted) return;

        /** @type {import('node:fs').Dirent[]} */
        let entries;
        try {
          entries = await fs.readdir(realDir, { withFileTypes: true });
        } catch {
          return; // skip unreadable directories
        }

        for (const entry of entries) {
          if (effectiveSignal.aborted) return;
          if (HIDDEN_ENTRIES.has(entry.name)) continue;

          const entryRealPath = path.join(realDir, entry.name);
          const entryVirtualPath = `${virtualDir}/${entry.name}`;
          const isDir = entry.isDirectory();

          let size = 0;
          let modified = null;

          try {
            const stat = await fs.stat(entryRealPath);
            size = stat.size;
            modified = new Date(stat.mtimeMs);
          } catch {
            continue; // skip files we can't stat
          }

          batch.push({
            virtualPath: entryVirtualPath,
            name: entry.name,
            nameLower: entry.name.toLowerCase(),
            fileType: isDir ? 'directory' : 'file',
            size,
            modified,
            parentPath: virtualDir,
            mountPoint,
          });

          if (batch.length >= BATCH_SIZE) {
            await this.#flushBatch(batch);
            totalIndexed += batch.length;
            batch = [];

            if (Date.now() - lastProgress > PROGRESS_INTERVAL) {
              await this.#updateProgress(mountPoint, totalIndexed);
              lastProgress = Date.now();
            }
          }

          if (isDir) {
            await walk(entryRealPath, entryVirtualPath);
          }
        }
      };

      await walk(realPath, mountPoint);

      // Flush remaining entries
      if (batch.length > 0) {
        await this.#flushBatch(batch);
        totalIndexed += batch.length;
      }

      if (effectiveSignal.aborted) {
        await query(
          `UPDATE index_status SET status = 'idle', updated_at = NOW()
           WHERE mount_point = $1`,
          [mountPoint],
        );
        return;
      }

      // Clean stale entries (indexed before this run started)
      await query(
        `DELETE FROM file_index WHERE mount_point = $1 AND indexed_at < $2`,
        [mountPoint, startedAt.toISOString()],
      );

      await query(
        `UPDATE index_status SET status = 'done', indexed_files = $1, total_files = $1,
         finished_at = NOW(), updated_at = NOW()
         WHERE mount_point = $2`,
        [totalIndexed, mountPoint],
      );

      console.log(`[indexer] ${mountPoint}: indexed ${totalIndexed} entries`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[indexer] ${mountPoint}: error:`, message);

      await query(
        `UPDATE index_status SET status = 'error', error_message = $1, updated_at = NOW()
         WHERE mount_point = $2`,
        [message, mountPoint],
      ).catch(() => {});

      throw err;
    } finally {
      this.#running = false;
      this.#controller = null;
    }
  }

  /**
   * Index all configured mount points sequentially.
   */
  async indexAll() {
    const mounts = getMountPoints();
    for (const { virtualPath, realPath } of mounts) {
      if (this.#controller?.signal.aborted) break;
      await this.indexMount(virtualPath, realPath);
    }
  }

  /**
   * Abort the current indexation.
   */
  abort() {
    if (this.#controller) {
      this.#controller.abort();
    }
  }

  /**
   * Insert a batch of entries with upsert.
   * @param {IndexEntry[]} batch
   */
  async #flushBatch(batch) {
    if (batch.length === 0) return;

    const values = [];
    const placeholders = [];
    let idx = 1;

    for (const entry of batch) {
      placeholders.push(
        `($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, $${idx + 6}, $${idx + 7})`,
      );
      values.push(
        entry.virtualPath,
        entry.name,
        entry.nameLower,
        entry.fileType,
        entry.size,
        entry.modified?.toISOString() ?? null,
        entry.parentPath,
        entry.mountPoint,
      );
      idx += 8;
    }

    const sql = `
      INSERT INTO file_index (virtual_path, name, name_lower, file_type, size, modified, parent_path, mount_point)
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (virtual_path) DO UPDATE SET
        name = EXCLUDED.name,
        name_lower = EXCLUDED.name_lower,
        file_type = EXCLUDED.file_type,
        size = EXCLUDED.size,
        modified = EXCLUDED.modified,
        parent_path = EXCLUDED.parent_path,
        indexed_at = NOW()
    `;

    await query(sql, values);
  }

  /**
   * Update progress in index_status table.
   * @param {string} mountPoint
   * @param {number} indexed
   */
  async #updateProgress(mountPoint, indexed) {
    await query(
      `UPDATE index_status SET indexed_files = $1, updated_at = NOW() WHERE mount_point = $2`,
      [indexed, mountPoint],
    ).catch(() => {});
  }
}

/** Singleton instance for the application */
export const indexer = new NasIndexer();
