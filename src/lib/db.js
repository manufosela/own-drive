import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;

/** @type {pg.Pool | null} */
let pool = null;

/** @returns {pg.Pool} */
export function getPool() {
  if (!pool) {
    pool = new Pool({
      host: config.postgres.host,
      port: config.postgres.port,
      database: config.postgres.database,
      user: config.postgres.user,
      password: config.postgres.password,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err) => {
      console.error('[DB] Unexpected pool error:', err);
    });
  }
  return pool;
}

/**
 * @param {string} text
 * @param {unknown[]} [params]
 * @returns {Promise<pg.QueryResult>}
 */
export async function query(text, params) {
  const p = getPool();
  return p.query(text, params);
}

/**
 * Acquire a client from the pool for manual transaction control.
 * Caller is responsible for calling client.release().
 * @returns {Promise<pg.PoolClient>}
 */
export async function getClient() {
  const p = getPool();
  return p.connect();
}

/** @returns {Promise<boolean>} */
export async function checkConnection() {
  try {
    const p = getPool();
    const client = await p.connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch {
    return false;
  }
}
