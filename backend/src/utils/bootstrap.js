/**
 * BOOTSTRAP - Auto-init database schema on startup
 *
 * Why this exists:
 * The Postgres init-via-volume-mount (`/docker-entrypoint-initdb.d/`) only runs
 * the FIRST time a fresh data volume is created. In Coolify, named volumes are
 * persisted across redeploys, so if the schema fails to load on first boot
 * (or if the schema file is updated), the DB stays empty / out of sync forever.
 *
 * This script runs on every backend startup. It:
 * 1. Checks whether the schema is already present (looks for the `users` table).
 * 2. If missing, executes the entire database/ptsss_db.sql against the live DB.
 * 3. Optionally seeds the default users (controlled by AUTO_BOOTSTRAP env var).
 *
 * Idempotent: safe to run on every boot. If schema is already there, it does nothing.
 */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool, queryOne } = require('../config/database');

const SCHEMA_FILE = path.join(__dirname, '..', '..', 'database', 'ptsss_db.sql');

async function schemaExists() {
  try {
    const r = await queryOne(
      `SELECT to_regclass('public.users') AS t, to_regclass('public.geofence_izin') AS g`
    );
    // Both tables must exist for schema to be considered "loaded".
    return !!(r && r.t && r.g);
  } catch (err) {
    console.error('[BOOTSTRAP] schemaExists check failed:', err.message);
    return false;
  }
}

async function loadSchemaFile() {
  if (!fs.existsSync(SCHEMA_FILE)) {
    console.warn(`[BOOTSTRAP] Schema file not found at ${SCHEMA_FILE} — skipping.`);
    return false;
  }
  const sql = fs.readFileSync(SCHEMA_FILE, 'utf8');
  console.log(`[BOOTSTRAP] Executing schema (${(sql.length / 1024).toFixed(1)} KB)...`);

  // Run inside one connection so SET statements stay scoped.
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log('[BOOTSTRAP] ✓ Schema loaded successfully');
    return true;
  } catch (err) {
    console.error('[BOOTSTRAP] ✗ Schema load failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

async function seedDefaultUsers() {
  const existing = await queryOne('SELECT COUNT(*)::int AS c FROM users');
  if (existing && existing.c > 0) {
    console.log(`[BOOTSTRAP] Users table already has ${existing.c} rows — skipping seed.`);
    return;
  }

  console.log('[BOOTSTRAP] Users table empty — seeding default users (PIN: 123456)');
  const pinHash = await bcrypt.hash('123456', 10);
  const users = [
    { nrp: 'ADM001', nama: 'Admin System',     role: 'admin',      shift: '08:00-16:00' },
    { nrp: 'SPV001', nama: 'Budi Supervisor',  role: 'supervisor', shift: '08:00-16:00' },
    { nrp: 'KMD001', nama: 'Andi Komandan',    role: 'komandan',   shift: '06:00-14:00' },
    { nrp: 'AGT001', nama: 'Rudi Satpam',      role: 'anggota',    shift: '06:00-14:00' },
    { nrp: 'AGT002', nama: 'Siti Security',    role: 'anggota',    shift: '14:00-22:00' },
    { nrp: 'AGT003', nama: 'Joko Patrol',      role: 'anggota',    shift: '22:00-06:00' },
  ];

  for (const u of users) {
    await pool.query(
      'INSERT INTO users (nrp, nama, role, shift, pin_hash, status) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (nrp) DO NOTHING',
      [u.nrp, u.nama, u.role, u.shift, pinHash, 'off_duty']
    );
    console.log(`[BOOTSTRAP]   ✓ ${u.nrp} (${u.role}) PIN=123456`);
  }

  console.log('[BOOTSTRAP] ⚠️  GANTI PIN default setelah login pertama!');
}

/**
 * Main bootstrap entrypoint.
 * Call this once after the DB pool is connected, before app.listen().
 *
 * Behavior is controlled by AUTO_BOOTSTRAP env var:
 *   - "true"  (default): load schema if missing + seed default users if empty
 *   - "false": skip everything (production with manual schema management)
 *   - "schema-only": load schema if missing but DON'T seed users
 */
async function bootstrap() {
  const mode = (process.env.AUTO_BOOTSTRAP || 'true').toLowerCase();
  if (mode === 'false') {
    console.log('[BOOTSTRAP] Disabled (AUTO_BOOTSTRAP=false)');
    return;
  }

  try {
    const ok = await schemaExists();
    if (!ok) {
      console.log('[BOOTSTRAP] Schema not detected — initializing from database/ptsss_db.sql');
      await loadSchemaFile();
    } else {
      console.log('[BOOTSTRAP] Schema already present — skipping schema load');
    }

    if (mode !== 'schema-only') {
      await seedDefaultUsers();
    }

    console.log('[BOOTSTRAP] ✓ Done');
  } catch (err) {
    console.error('[BOOTSTRAP] ✗ Failed:', err.message);
    // Don't kill the process — backend can still serve /ping etc.
    // The operator will see the error in logs and can fix it manually.
  }
}

module.exports = { bootstrap, schemaExists };
