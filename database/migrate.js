#!/usr/bin/env node
/**
 * STANDALONE MIGRATION RUNNER — Tahap 10 Bug #1 (P1-22)
 * ======================================================
 * Jalankan migration dari command line, di luar boot backend:
 *
 *   node database/migrate.js
 *   # atau dari root project:
 *   node ./database/migrate.js
 *
 * Pakai env vars yang sama dengan backend (DB_HOST, DB_PORT, dst).
 * Sumber env: file .env di root project ATAU backend/.env.
 *
 * Kapan ini berguna:
 *   - Setelah `git pull` migration baru, sebelum restart backend.
 *   - Manual run di server existing untuk verifikasi semua migration applied.
 *   - Sebagai bagian dari CI/CD step yang explicit (bukan implicit di boot).
 *
 * Exit code: 0 kalau semua sukses (atau tidak ada yang perlu di-apply),
 * 1 kalau ada error. Operator/CI bisa rely pada exit code untuk gating.
 *
 * Catatan: file ini sengaja TIDAK pakai logger dari backend/src/utils/logger.js
 * karena (1) standalone script tidak butuh write ke logs/app.log dan
 * (2) menghindari side effect (logger membuka write streams). console.*
 * di file ini DIPERTAHANKAN sesuai pengecualian di Tahap 10 Bug #2.
 */
const path = require('path');
const { Pool } = require('pg');

// Load .env dari root project DULU, kalau ada juga di backend/, override.
// Kedua-duanya optional — env bisa juga di-set lewat docker-compose.
try { require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') }); } catch { /* no dotenv */ }
try { require('dotenv').config({ path: path.resolve(__dirname, '..', 'backend', '.env') }); } catch { /* no dotenv */ }

const { runMigrations } = require(path.resolve(__dirname, '..', 'backend', 'src', 'utils', 'migrationRunner'));

function envOrFail(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') {
    if (fallback !== undefined) return fallback;
    console.error(`[migrate] Missing required env: ${name}`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const useSSL = String(process.env.DB_SSL || '').toLowerCase() === 'true';

  const pool = new Pool({
    host: envOrFail('DB_HOST', 'localhost'),
    port: parseInt(envOrFail('DB_PORT', '5432'), 10),
    database: envOrFail('DB_NAME', 'ptsss_db'),
    user: envOrFail('DB_USER', 'ptsss_user'),
    password: envOrFail('DB_PASSWORD', ''),
    max: 2, // standalone — tidak butuh banyak connection
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 5000,
    ssl: useSSL ? { rejectUnauthorized: false } : false,
  });

  console.log('[migrate] Starting migration runner...');
  console.log(`[migrate] Target DB: ${process.env.DB_NAME}@${process.env.DB_HOST}:${process.env.DB_PORT}`);

  try {
    const result = await runMigrations(pool, {
      dir: path.resolve(__dirname, 'migrations'),
    });

    console.log('');
    console.log('==============================================================');
    console.log(` MIGRATION SUMMARY`);
    console.log('==============================================================');
    console.log(`  Total migrations  : ${result.total}`);
    console.log(`  Newly applied     : ${result.applied.length}`);
    if (result.applied.length > 0) {
      for (const f of result.applied) console.log(`     ✓ ${f}`);
    }
    console.log(`  Already applied   : ${result.skipped.length}`);
    console.log('==============================================================');
    console.log('');

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('');
    console.error('==============================================================');
    console.error(' MIGRATION FAILED');
    console.error('==============================================================');
    console.error(`  Reason: ${err.message}`);
    if (err.stack) console.error(err.stack);
    console.error('==============================================================');
    console.error('');
    try { await pool.end(); } catch { /* ignore */ }
    process.exit(1);
  }
}

main();
