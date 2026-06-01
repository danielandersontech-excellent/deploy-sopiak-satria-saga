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
 * 1. Checks whether the schema is already present (looks for the core tables).
 * 2. If missing, executes the entire database/ptsss_db.sql against the live DB.
 * 3. Runs pending migrations from database/migrations/ via migrationRunner.
 * 4. Optionally seeds the default users (controlled by AUTO_BOOTSTRAP env var).
 *
 * Idempotent: safe to run on every boot. If schema is already there and all
 * migrations are applied, the only DB work is a few SELECTs.
 *
 * Logging policy (Tahap 10 Bug #2):
 * Diagnostic messages go through `logger` (winston-style write stream — async,
 * non-blocking, also written to logs/app.log). The ONE exception is the
 * "INITIAL SEED CREDENTIALS" block: those PINs are operator-facing one-time
 * output that MUST NOT end up in log files (PINs in log files = security
 * regression). That block stays as console.log with a clear comment.
 *
 * AUDIT FIX (P1-9): schemaExists() previously checked only `users` and
 * `geofence_izin`. If those two happened to exist but other core tables
 * (clients, lokasi, audit_log, ...) were missing — e.g. a partial schema
 * load that errored midway and was never retried — bootstrap would skip
 * the schema load on the next boot, leaving the system silently broken.
 *
 * The check now covers every CORE table the application actually depends on
 * for normal operation. `schema_migrations` is intentionally excluded:
 * that table is created by migrationRunner.ensureTableExists() AFTER
 * bootstrap loads the base schema, so it cannot be present before the
 * first full bootstrap completes — including it here would force an
 * unnecessary re-load of ptsss_db.sql on every fresh deploy.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool, queryOne } = require('../config/database');
const { logger } = require('./logger');
const { runMigrations } = require('./migrationRunner');

const SCHEMA_FILE = path.join(__dirname, '..', '..', 'database', 'ptsss_db.sql');

// P0-15: single source of truth for the bcrypt work factor across the
// backend. Anything that hashes a PIN must read it from here (or inline
// the same `parseInt(process.env.BCRYPT_ROUNDS || '12')` expression).
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12');

// AUDIT FIX (P1-9): tables the application cannot function without.
// All of these are defined in database/ptsss_db.sql and exist after the
// initial schema load. If ANY are missing, schema is partial/corrupt and
// must be re-loaded. Order is alphabetical for stable log output.
//
// We deliberately do NOT include every table from the 24-table schema —
// some are optional (e.g. report_exports, broadcasts, notifikasi work
// fine with empty rows but the app would just degrade gracefully). The
// list below is the "if-missing-the-app-throws-500" set.
const REQUIRED_TABLES = [
  'absensi',
  'audit_log',
  'clients',
  'geofence_izin',
  'laporan_harian',
  'laporan_kejadian',
  'lokasi',
  'patroli',
  'pos_jaga',
  'refresh_tokens',
  'users',
];

// P0-14: cryptographically random 6-digit PIN. Math.random() would work
// (and is what the issue ticket suggested) but crypto.randomInt is the
// same cost, available in Node ≥14, and removes any predictability around
// the seed PIN — a small but free improvement. Since must_change_pin
// forces rotation on first login, the temp PIN's strength matters mainly
// for the window between account creation and first successful login.
function randomPin() {
  return String(crypto.randomInt(100000, 1000000));
}

// P1-8: resolve BOOTSTRAP_STRICT into a definite boolean.
// Default policy:
//   - production: STRICT (fail-fast — better to crash-loop on Coolify
//                 than to silently serve a broken backend)
//   - everything else (development, test, undefined): NON-STRICT
// Operators can force either mode explicitly by setting BOOTSTRAP_STRICT
// to "true" or "false" (case-insensitive) in the environment.
function isStrictMode() {
  const raw = (process.env.BOOTSTRAP_STRICT || '').toLowerCase().trim();
  if (raw === 'true' || raw === '1' || raw === 'yes') return true;
  if (raw === 'false' || raw === '0' || raw === 'no') return false;
  return process.env.NODE_ENV === 'production';
}

/**
 * AUDIT FIX (P1-9): comprehensive schema presence check.
 *
 * Builds a single SELECT that probes every REQUIRED_TABLES entry with
 * to_regclass(). Postgres returns the table OID (truthy) when the
 * table exists, NULL otherwise. One round-trip, all answers.
 *
 * Returns:
 *   true  - every required table is present.
 *   false - at least one is missing (logged with the list for the operator).
 *           Bootstrap will treat this as "schema absent" and re-load
 *           ptsss_db.sql. The SQL is idempotent (CREATE TABLE IF NOT
 *           EXISTS etc.) so re-running over a partial schema is safe.
 */
async function schemaExists() {
  try {
    // Build "SELECT to_regclass('public.users') AS users, ..." dynamically.
    // We alias each column with the table name so the result object is
    // self-describing: r.users, r.clients, ... directly indicate presence.
    const cols = REQUIRED_TABLES
      .map(t => `to_regclass('public.${t}') AS ${t}`)
      .join(', ');
    const r = await queryOne(`SELECT ${cols}`);
    if (!r) return false;

    const missing = REQUIRED_TABLES.filter(t => !r[t]);
    if (missing.length > 0) {
      // Don't error — bootstrap will follow up with a re-load. Just
      // surface the list so the operator (and the log file) knows
      // which tables triggered the re-load. This makes diagnosing a
      // half-broken schema state much faster after the fact.
      logger.warn(
        `[BOOTSTRAP] schemaExists: ${missing.length}/${REQUIRED_TABLES.length} required table(s) missing: ${missing.join(', ')}`
      );
      return false;
    }
    return true;
  } catch (err) {
    logger.error(`[BOOTSTRAP] schemaExists check failed: ${err.message}`);
    return false;
  }
}

async function loadSchemaFile() {
  if (!fs.existsSync(SCHEMA_FILE)) {
    logger.warn(`[BOOTSTRAP] Schema file not found at ${SCHEMA_FILE} — skipping.`);
    return false;
  }
  const sql = fs.readFileSync(SCHEMA_FILE, 'utf8');
  logger.info(`[BOOTSTRAP] Executing schema (${(sql.length / 1024).toFixed(1)} KB)...`);

  // Run inside one connection so SET statements stay scoped.
  const client = await pool.connect();
  try {
    await client.query(sql);
    logger.info('[BOOTSTRAP] ✓ Schema loaded successfully');
    return true;
  } catch (err) {
    logger.error(`[BOOTSTRAP] ✗ Schema load failed: ${err.message}`);
    throw err;
  } finally {
    client.release();
  }
}

async function seedDefaultUsers() {
  const existing = await queryOne('SELECT COUNT(*)::int AS c FROM users');
  if (existing && existing.c > 0) {
    logger.info(`[BOOTSTRAP] Users table already has ${existing.c} rows — skipping seed.`);
    return;
  }

  logger.info('[BOOTSTRAP] Users table empty — seeding default users with RANDOM PINs');
  const users = [
    { nrp: 'ADM001', nama: 'Admin System',     role: 'admin',      shift: '08:00-16:00' },
    { nrp: 'SPV001', nama: 'Budi Supervisor',  role: 'supervisor', shift: '08:00-16:00' },
    { nrp: 'KMD001', nama: 'Andi Komandan',    role: 'komandan',   shift: '06:00-14:00' },
    { nrp: 'AGT001', nama: 'Rudi Satpam',      role: 'anggota',    shift: '06:00-14:00' },
    { nrp: 'AGT002', nama: 'Siti Security',    role: 'anggota',    shift: '14:00-22:00' },
    { nrp: 'AGT003', nama: 'Joko Patrol',      role: 'anggota',    shift: '22:00-06:00' },
  ];

  // Collect (nrp, pin) pairs so we can print them in one block at the end.
  // Printing as we go would interleave with the per-user log line and the
  // operator would have to grep both halves back together.
  const printedCreds = [];

  for (const u of users) {
    // P0-14: per-user random PIN — no shared default. If two accounts get
    // the same PIN by chance, that's fine: NRP+PIN together still
    // authenticates uniquely, and both accounts will be force-rotated.
    const pin = randomPin();
    const pinHash = await bcrypt.hash(pin, BCRYPT_ROUNDS);
    await pool.query(
      `INSERT INTO users (nrp, nama, role, shift, pin_hash, status, must_change_pin)
       VALUES ($1,$2,$3,$4,$5,$6, TRUE)
       ON CONFLICT (nrp) DO NOTHING`,
      [u.nrp, u.nama, u.role, u.shift, pinHash, 'off_duty']
    );
    printedCreds.push({ nrp: u.nrp, role: u.role, pin });
    logger.info(`[BOOTSTRAP]   ✓ ${u.nrp} (${u.role}) seeded`);
  }

  // P0-14: SECURITY-CRITICAL — print credentials ONCE to STDOUT only.
  // Tahap 10 Bug #2 note: this block intentionally uses console.log
  // INSTEAD OF logger.info because:
  //   1. logger.info also writes to logs/app.log — we do NOT want plain-text
  //      PINs persisted to disk, even briefly. The whole point of
  //      must_change_pin is to keep the temp PIN window short.
  //   2. The output is operator-facing one-time display. Capturing from
  //      `docker logs` (stdout) and distributing out-of-band is the
  //      intended workflow.
  // DO NOT convert this block to logger.* — that would be a security
  // regression.
  console.log('');
  console.log('==============================================================');
  console.log(' INITIAL SEED CREDENTIALS — FORCED ROTATION ON FIRST LOGIN');
  console.log('==============================================================');
  for (const c of printedCreds) {
    console.log(`   ${c.nrp.padEnd(8)} (${c.role.padEnd(10)})  PIN: ${c.pin}`);
  }
  console.log('==============================================================');
  console.log(' Capture these PINs now. They will not be re-printed.');
  console.log(' Each user must change their PIN on first login.');
  console.log('==============================================================');
  console.log('');
}

/**
 * Main bootstrap entrypoint.
 * Call this once after the DB pool is connected, before app.listen().
 *
 * Order of operations:
 *   1. Schema check — load ptsss_db.sql kalau tables belum ada
 *   2. Migration runner — apply migration baru dari database/migrations/
 *   3. Seed users — kalau tabel users kosong
 *
 * Behavior is controlled by AUTO_BOOTSTRAP env var:
 *   - "true"  (default): full bootstrap (schema + migrations + seed)
 *   - "false": skip everything (production with manual schema management).
 *             NOTE: bahkan dalam mode false, migrations TETAP perlu di-run
 *             manual via `node database/migrate.js` — kalau tidak, migration
 *             baru tidak akan ke-apply.
 *   - "schema-only": load schema + run migrations, tapi SKIP seed users
 *
 * P1-8: Failure handling is controlled by BOOTSTRAP_STRICT (see
 * isStrictMode() above). In strict mode the process exits with code 1
 * so the orchestrator (Coolify) can restart the container; the previous
 * behaviour swallowed the error and let the backend keep serving 500s.
 */
async function bootstrap() {
  const mode = (process.env.AUTO_BOOTSTRAP || 'true').toLowerCase();
  if (mode === 'false') {
    logger.info('[BOOTSTRAP] Disabled (AUTO_BOOTSTRAP=false)');
    return;
  }

  try {
    const ok = await schemaExists();
    if (!ok) {
      logger.info('[BOOTSTRAP] Schema not detected (or partial) — initializing from database/ptsss_db.sql');
      await loadSchemaFile();
    } else {
      logger.info(`[BOOTSTRAP] Schema complete (${REQUIRED_TABLES.length} required tables present) — skipping schema load`);
    }

    // Tahap 10 Bug #1 (P1-22): run migrations sebelum seed.
    // Kenapa di sini? Migration mungkin add column ke users — kalau
    // seed jalan dulu dengan INSERT yang belum tahu kolom baru, akan
    // pakai default (atau gagal kalau NOT NULL tanpa default).
    // migrationRunner internally pakai logger context yang sama.
    const migResult = await runMigrations(pool, { logger });
    logger.info(
      `[BOOTSTRAP] Migrations — applied: ${migResult.applied.length}, ` +
      `skipped: ${migResult.skipped.length}, total: ${migResult.total}`
    );

    if (mode !== 'schema-only') {
      await seedDefaultUsers();
    }

    logger.info('[BOOTSTRAP] ✓ Done');
  } catch (err) {
    const strict = isStrictMode();
    if (strict) {
      // FATAL: backend cannot be trusted to serve traffic. Log loudly,
      // then exit so the container restarts and the operator sees a
      // crash-loop in Coolify instead of a silent corruption.
      // NOTE: console.error here (not logger.error) — logger is async via
      // write streams, and we're about to process.exit(1). console.error
      // is synchronous to stderr, so the operator actually sees the
      // reason in Coolify logs before the container exits.
      console.error('[BOOTSTRAP] ✗ FATAL — bootstrap failed in strict mode, exiting');
      console.error('[BOOTSTRAP]   reason:', err && err.message ? err.message : err);
      if (err && err.stack) console.error(err.stack);
      console.error('[BOOTSTRAP]   set BOOTSTRAP_STRICT=false to keep the process alive (development only).');
      // Give stderr a tick to flush before exiting on PaaS log shippers
      // that buffer on the writable side of stderr.
      process.exit(1);
    }
    // NON-strict (dev / opt-out): keep the process alive so the
    // developer can diagnose. Logged as ERROR so it stands out.
    logger.error(`[BOOTSTRAP] ✗ Failed (non-strict mode — process kept alive): ${err.message}`);
    if (err && err.stack) logger.error(err.stack);
  }
}

module.exports = { bootstrap, schemaExists, REQUIRED_TABLES };