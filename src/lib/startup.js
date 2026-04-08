import { query } from './db.js';
import { indexer } from './indexer.js';
import cron from 'node-cron';

let _initialized = false;
let _cronScheduled = false;

/**
 * Run once on first request. Checks if the file index is empty
 * and launches background indexation if needed, then schedules
 * nightly reindex via cron.
 */
export async function initOnce() {
  if (_initialized) return;
  _initialized = true;

  try {
    const result = await query('SELECT COUNT(*)::int AS count FROM file_index');
    const count = result.rows[0]?.count ?? 0;

    if (count === 0) {
      console.log('[startup] file_index is empty, launching background indexation...');
      indexer.indexAll().catch((err) => {
        console.error('[startup] Background indexation error:', err.message);
      });
    } else {
      console.log(`[startup] file_index has ${count} entries, skipping indexation`);
    }
  } catch (err) {
    // Table may not exist yet (migration not applied), skip silently
    console.warn('[startup] Could not check file_index:', err.message);
  }

  _scheduleCron();
}

/**
 * Schedule nightly reindex cron job. Runs only once.
 */
function _scheduleCron() {
  if (_cronScheduled) return;
  _cronScheduled = true;

  const schedule = process.env.REINDEX_CRON || '0 2 * * *';

  cron.schedule(schedule, () => {
    if (indexer.running) {
      console.log('[cron] Indexer already running, skipping nightly reindex');
      return;
    }
    console.log('[cron] Starting nightly reindex...');
    indexer.indexAll().catch((err) => {
      console.error('[cron] Nightly reindex error:', err.message);
    });
  });

  console.log(`[cron] Nightly reindex scheduled (${schedule})`);
}

/**
 * Reset initialization flag (for testing).
 */
export function _resetForTest() {
  _initialized = false;
}
