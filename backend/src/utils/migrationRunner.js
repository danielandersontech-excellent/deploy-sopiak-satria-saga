/**
 * MIGRATION RUNNER — Tahap 10 Bug #1 (P1-22)
 * ============================================
 * Sebelumnya: tidak ada sistem tracker — setiap migration dijalankan
 * manual via SSH (sudo docker exec ... psql ... -f file.sql). Resiko:
 *   1. Migration jalan dua kali (idempotent macam CREATE INDEX IF NOT
 *      EXISTS masih aman, tapi DDL non-idempotent akan error/duplikat).
 *   2. Migration terlewat saat fresh deploy ke server baru.
 *   3. Tidak ada audit trail kapan setiap migration dijalankan.
 *
 * Sekarang: tabel `schema_migrations` mencatat filename + checksum +
 * timestamp. Setiap boot backend akan scan folder database/migrations/,
 * jalankan yang belum applied, log hasilnya.
 *
 * PRE-POPULATION (penting!):
 * Migration 002, 003, 004 SUDAH dijalankan manual di production sebelum
 * sistem ini ada. Saat tabel schema_migrations baru pertama kali dibuat
 * di server existing, kita masukkan semua file yang sudah ada di folder
 * migrations/ sebagai "already applied" (dengan checksum dari file aktual).
 * Ini supaya runMigrations() tidak coba jalankan ulang. Pre-population
 * HANYA dilakukan saat tabel schema_migrations baru saja dibuat — kalau
 * sudah pernah ada (boot kedua dan seterusnya), pre-population di-skip.
 *
 * Untuk SERVER BARU (fresh install): folder migrations/ tetap diperlukan,
 * tapi schema dasar di-load oleh bootstrap.js dari ptsss_db.sql DULU.
 * Setelah itu migrationRunner akan mark semua existing migrations sebagai
 * applied. Jadi: skema awal + migration tracker — bukan replay history.
 * Operator yang ingin replay dari nol harus DROP schema_migrations
 * manual, atau set MIGRATIONS_FORCE_REPLAY=true (escape hatch dev only).
 *
 * Idempotent: aman dipanggil setiap boot. Tidak akan re-run migration
 * yang sudah applied, tidak akan re-pre-populate kalau sudah pernah.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// MIGRATIONS_DIR: bisa override via env untuk testing. Default mengikuti
// struktur project: database/migrations/ di root project.
// Path resolusi: backend/src/utils/migrationRunner.js → ../../../database/migrations
const DEFAULT_MIGRATIONS_DIR = path.resolve(__dirname, '..', '..', 'database', 'migrations');

/**
 * SHA256 checksum dari isi file. Dipakai untuk deteksi perubahan migration
 * setelah ter-apply — kalau checksum berbeda, kita warning (jangan error,
 * karena format whitespace tweak masih boleh).
 */
function checksumOf(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Logger fallback: kalau caller passing logger custom, pakai itu;
 * kalau tidak, gunakan minimal stub yang kirim ke console.
 * Tahap 10 Bug #2: di module-level kita tidak require('./logger') supaya
 * migration runner bisa juga dipakai dari standalone script (migrate.js)
 * yang mungkin belum punya logger context yang sama.
 */
function makeLogger(customLogger) {
  if (customLogger && typeof customLogger.info === 'function') return customLogger;
  return {
    info: (msg) => console.log(`[MIGRATION] ${msg}`),
    warn: (msg) => console.warn(`[MIGRATION] ${msg}`),
    error: (msg) => console.error(`[MIGRATION] ${msg}`),
  };
}

/**
 * List semua file .sql di folder migrations/, sorted ascending by filename.
 * Konvensi: NNN_description.sql (001_init.sql, 002_add_column.sql, dst).
 * Filter file yang dimulai dengan '_' atau '.' (dianggap WIP/hidden).
 */
function listMigrationFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.sql'))
    .filter(f => !f.startsWith('_') && !f.startsWith('.'))
    .sort();
}

/**
 * Pastikan tabel schema_migrations ada. Kembalikan true kalau tabel baru
 * di-create di call ini (perlu pre-population), false kalau sudah ada.
 *
 * Kita pakai CREATE TABLE IF NOT EXISTS + cek lewat to_regclass untuk
 * detect freshness — `CREATE TABLE` tidak return info "was it created"
 * di postgres tanpa trick yang lebih ribet.
 */
async function ensureTableExists(client) {
  const r = await client.query(`SELECT to_regclass('public.schema_migrations') AS t`);
  const wasFresh = !r.rows[0].t;

  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      checksum VARCHAR(64) NOT NULL
    )
  `);

  return wasFresh;
}

/**
 * Pre-populate schema_migrations untuk server existing.
 *
 * Konteks: production sudah jalankan 002, 003, 004 secara manual sebelum
 * sistem ini ada. Kalau kita tidak pre-populate, runMigrations akan coba
 * apply ulang dan akan error (CREATE INDEX UNIQUE on duplicate data, ALTER
 * TYPE pada kolom yang sudah UUID, dst).
 *
 * Strategi: kalau schema_migrations BARU dibuat (wasFresh=true) DAN tabel
 * 'users' sudah ada (artinya bukan fresh server), maka semua file di
 * folder migrations/ kita anggap "already applied" — masukkan ke tracker
 * dengan checksum dari file aktual.
 *
 * Edge case: fresh server (users belum ada). Dalam kasus ini bootstrap.js
 * akan load ptsss_db.sql, yang isinya = schema akhir setelah semua migration.
 * Jadi tetap: semua migration di folder dianggap "already applied" —
 * tidak ada yang perlu di-run.
 *
 * SATU pengecualian: kalau MIGRATIONS_FORCE_REPLAY=true (env), skip
 * pre-population. Operator dev mungkin pakai ini untuk testing replay
 * di DB kosong (drop tables, set flag, restart).
 */
async function prePopulateIfNeeded(client, dir, log) {
  const force = (process.env.MIGRATIONS_FORCE_REPLAY || '').toLowerCase();
  if (force === 'true' || force === '1') {
    log.warn('MIGRATIONS_FORCE_REPLAY=true — skipping pre-population. All migrations will be re-applied.');
    return 0;
  }

  const files = listMigrationFiles(dir);
  if (files.length === 0) return 0;

  let count = 0;
  for (const filename of files) {
    const filepath = path.join(dir, filename);
    const content = fs.readFileSync(filepath, 'utf8');
    const checksum = checksumOf(content);
    // ON CONFLICT DO NOTHING karena dalam kondisi normal tidak akan
    // konflik (tabel baru, kosong), tapi defensive supaya tidak meledak
    // kalau dipanggil dua kali karena race.
    await client.query(
      `INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)
       ON CONFLICT (filename) DO NOTHING`,
      [filename, checksum]
    );
    count++;
  }
  log.info(`Pre-populated ${count} existing migration(s) as already-applied`);
  return count;
}

/**
 * Apply satu file migration di dalam transaction.
 * Kalau SQL error: rollback, throw — caller harus stop seluruh proses.
 * Kalau sukses: insert ke schema_migrations, commit.
 */
async function applyOne(client, filename, content, log) {
  const checksum = checksumOf(content);
  await client.query('BEGIN');
  try {
    // Jalankan SQL migration. Postgres bisa eksekusi multi-statement dalam
    // satu .query() call selama tidak ada parameter — pas untuk file .sql
    // yang isinya banyak statement.
    await client.query(content);
    await client.query(
      `INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)`,
      [filename, checksum]
    );
    await client.query('COMMIT');
    log.info(`✓ Applied: ${filename}`);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* rollback may fail if connection broke */ }
    log.error(`✗ FAILED: ${filename} — ${err.message}`);
    throw new Error(`Migration ${filename} failed: ${err.message}`);
  }
}

/**
 * Detect checksum drift: file migration yang sudah di-apply, tapi isinya
 * berubah setelah itu. Bukan error fatal (whitespace edit lumrah), tapi
 * worth a warning supaya operator sadar kalau ada migration yang silently
 * di-edit post-apply.
 */
async function checkChecksumDrift(client, applied, dir, log) {
  for (const row of applied) {
    const filepath = path.join(dir, row.filename);
    if (!fs.existsSync(filepath)) continue;
    const content = fs.readFileSync(filepath, 'utf8');
    const currentChecksum = checksumOf(content);
    if (currentChecksum !== row.checksum) {
      log.warn(
        `Checksum drift detected: ${row.filename} — file on disk differs from when it was applied. ` +
        `If this is an intentional edit (e.g. whitespace), update checksum manually. ` +
        `If unexpected, restore the original.`
      );
    }
  }
}

/**
 * Main entrypoint.
 *
 * @param {Pool} pool - pg Pool instance (from config/database.js)
 * @param {Object} [options]
 * @param {string} [options.dir] - override migrations directory
 * @param {Object} [options.logger] - custom logger (info/warn/error)
 * @returns {Promise<{applied: string[], skipped: string[], total: number}>}
 * @throws {Error} kalau ada migration yang gagal apply
 */
async function runMigrations(pool, options = {}) {
  const dir = options.dir || DEFAULT_MIGRATIONS_DIR;
  const log = makeLogger(options.logger);

  if (!fs.existsSync(dir)) {
    log.warn(`Migrations dir not found: ${dir} — skipping`);
    return { applied: [], skipped: [], total: 0 };
  }

  // Gunakan satu connection untuk seluruh proses agar locking konsisten.
  const client = await pool.connect();
  try {
    const wasFresh = await ensureTableExists(client);

    if (wasFresh) {
      // Pertama kali sistem ini jalan di DB ini — pre-populate.
      await prePopulateIfNeeded(client, dir, log);
    }

    // Ambil list yang sudah applied.
    const { rows: applied } = await client.query(
      `SELECT filename, checksum FROM schema_migrations ORDER BY filename`
    );
    const appliedSet = new Set(applied.map(r => r.filename));

    // Cek checksum drift (warning saja).
    await checkChecksumDrift(client, applied, dir, log);

    // Cari yang belum applied.
    const allFiles = listMigrationFiles(dir);
    const toApply = allFiles.filter(f => !appliedSet.has(f));
    const skipped = allFiles.filter(f => appliedSet.has(f));

    if (toApply.length === 0) {
      log.info(`All ${allFiles.length} migration(s) already applied. Nothing to do.`);
      return { applied: [], skipped, total: allFiles.length };
    }

    log.info(`Applying ${toApply.length} new migration(s)...`);

    const newlyApplied = [];
    for (const filename of toApply) {
      const filepath = path.join(dir, filename);
      const content = fs.readFileSync(filepath, 'utf8');
      // applyOne throws on failure — propagate to caller. Bootstrap policy
      // (strict mode) akan handle exit kalau ini production.
      await applyOne(client, filename, content, log);
      newlyApplied.push(filename);
    }

    log.info(`✓ Done. Applied: ${newlyApplied.length}, Skipped: ${skipped.length}, Total: ${allFiles.length}`);
    return { applied: newlyApplied, skipped, total: allFiles.length };
  } finally {
    client.release();
  }
}

module.exports = {
  runMigrations,
  // Exported for testing/inspection — not part of stable API.
  _internal: { checksumOf, listMigrationFiles },
};
