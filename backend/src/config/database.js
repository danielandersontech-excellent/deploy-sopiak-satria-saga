/**
 * DATABASE CONFIG - PostgreSQL connection pool
 *
 * Connects to whatever Postgres is reachable via the env vars:
 *   DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, DB_SSL, DB_POOL_MAX
 *
 * In Coolify the host will be the compose service name (e.g. `postgres`),
 * which resolves on the internal compose network.
 */
const { Pool } = require('pg');
const { logger } = require('../utils/logger');

const useSSL = String(process.env.DB_SSL || '').toLowerCase() === 'true';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'ptsss_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  max: parseInt(process.env.DB_POOL_MAX || '10', 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
});

let _dbConnectCount = 0;
pool.on('connect', () => {
  _dbConnectCount++;
  // Only log the first connection — subsequent ones add noise.
  if (_dbConnectCount === 1) {
    logger.info(`[DB] Connected to PostgreSQL → ${pool.options.host}:${pool.options.port}/${pool.options.database}`);
  }
});

pool.on('error', (err) => {
  logger.error(`[DB] Unexpected error: ${err.message}`);
});

/** Run a parameterized query. Logs slow queries (>1s). */
async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (duration > 1000) logger.info(`[DB] Slow query (${duration}ms): ${text.substring(0, 80)}`);
  return res;
}

/** Get a single row (or null). */
async function queryOne(text, params) {
  const res = await query(text, params);
  return res.rows[0] || null;
}

/** Get all rows. */
async function queryAll(text, params) {
  const res = await query(text, params);
  return res.rows;
}

/** Test connectivity once on boot. */
async function testConnection() {
  try {
    const res = await pool.query('SELECT NOW() AS time, current_database() AS db');
    logger.info(`[DB] ✓ Connected to "${res.rows[0].db}" at ${res.rows[0].time}`);
    return true;
  } catch (err) {
    logger.error(`[DB] ✗ Connection failed: ${err.message}`);
    return false;
  }
}

/** Get pool stats for /api/health. */
function getPoolStats() {
  return {
    totalConnections: pool.totalCount,
    idleConnections: pool.idleCount,
    waitingClients: pool.waitingCount,
    max: pool.options.max || 10,
  };
}

module.exports = { pool, query, queryOne, queryAll, testConnection, getPoolStats };
