import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { Pool } = pg;

/**
 * @param {object} [options]
 * @param {string} [options.host]
 * @param {number} [options.port]
 * @param {string} [options.database]
 * @param {string} [options.user]
 * @param {string} [options.password]
 * @returns {pg.Pool}
 */
export function createPool(options) {
  return new Pool({
    host: options?.host || process.env.POSTGRES_HOST || 'localhost',
    port: options?.port || parseInt(process.env.POSTGRES_PORT || '5432'),
    database: options?.database || process.env.POSTGRES_DB || 'geniova_drive',
    user: options?.user || process.env.POSTGRES_USER || 'geniova',
    password: options?.password || process.env.POSTGRES_PASSWORD || 'changeme_in_production',
    connectionTimeoutMillis: 5000,
  });
}

/**
 * @param {pg.Pool} pool
 */
export async function ensureMigrationsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

/**
 * @param {pg.Pool} pool
 * @returns {Promise<Set<string>>}
 */
export async function getAppliedMigrations(pool) {
  const result = await pool.query(
    'SELECT filename FROM schema_migrations ORDER BY filename'
  );
  return new Set(result.rows.map((r) => r.filename));
}

/** @returns {string[]} */
export function getMigrationFiles() {
  const migrationsDir = path.join(__dirname, 'migrations');
  return fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

/**
 * @param {pg.Pool} pool
 * @returns {Promise<{applied: string[], skipped: string[]}>}
 */
export async function runMigrations(pool) {
  console.log('[migrate] Starting migrations...');

  await ensureMigrationsTable(pool);
  const appliedSet = await getAppliedMigrations(pool);
  const files = getMigrationFiles();

  const pending = files.filter((f) => !appliedSet.has(f));

  if (pending.length === 0) {
    console.log('[migrate] No pending migrations.');
    return { applied: [], skipped: files };
  }

  console.log(`[migrate] ${pending.length} pending migration(s):`);
  const applied = [];

  for (const file of pending) {
    console.log(`[migrate] Applying ${file}...`);
    const filePath = path.join(__dirname, 'migrations', file);
    const sql = fs.readFileSync(filePath, 'utf-8');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (filename) VALUES ($1)',
        [file]
      );
      await client.query('COMMIT');
      console.log(`[migrate] ✓ ${file} applied`);
      applied.push(file);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[migrate] ✗ ${file} failed:`, err);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log('[migrate] All migrations applied successfully.');
  return { applied, skipped: files.filter((f) => appliedSet.has(f)) };
}

/**
 * @param {pg.Pool} pool
 * @returns {Promise<{file: string, applied: boolean}[]>}
 */
export async function getStatus(pool) {
  await ensureMigrationsTable(pool);
  const applied = await getAppliedMigrations(pool);
  const files = getMigrationFiles();
  return files.map((f) => ({ file: f, applied: applied.has(f) }));
}

/* v8 ignore start - CLI entry point, tested via integration */
const isMainModule = process.argv[1] &&
  (process.argv[1].endsWith('migrate.js') || process.argv[1].endsWith('migrate'));

if (isMainModule) {
  const pool = createPool();
  const command = process.argv[2] || 'up';

  if (command === 'up') {
    runMigrations(pool)
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  } else if (command === 'status') {
    getStatus(pool)
      .then((statuses) => {
        for (const s of statuses) {
          console.log(`  ${s.applied ? '✓' : '○'} ${s.file}`);
        }
      })
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  } else {
    console.log('Usage: node migrate.js [up|status]');
    process.exit(1);
  }
}
