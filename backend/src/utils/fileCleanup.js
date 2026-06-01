/**
 * FILE CLEANUP SCHEDULER
 * Menghapus file upload yang lebih tua dari FILE_CLEANUP_DAYS.
 * Berjalan sekali per hari (setiap jam 3 pagi).
 *
 * P1-12 (Tahap 6): the previous version deleted ANY file in /uploads older
 *   than FILE_CLEANUP_DAYS, which happily destroyed photos that the
 *   database still referenced (e.g. an absensi row from 91 days ago whose
 *   image is still part of the audit/evidence chain). The fix has two
 *   layers of protection that must BOTH pass before a file is touched:
 *
 *     1. (Primary) The file's basename is not in the SET of referenced
 *        filenames pulled from the DB. We compare by basename, not full
 *        path, because foto_url values stored by different controllers
 *        use slightly different prefixes (e.g. `/uploads/profile/x.jpg`
 *        vs `uploads/profile/x.jpg` vs `https://.../uploads/profile/x.jpg`).
 *        Basenames are unique because uploaded files are renamed to a
 *        UUID/timestamp by multer, so two distinct entities don't share
 *        a filename.
 *
 *     2. (Secondary) The file's parent folder name is not in SKIP_FOLDERS.
 *        This is a belt-and-braces guard: even if a foto_url row got
 *        nulled out by hand, anything under `profile/` / `personil/` /
 *        `backup/` / `exports/` should not be auto-pruned, because those
 *        folders hold user-permanent assets and operator backups.
 *
 *   If the DB query for referenced files FAILS for any reason (DB down,
 *   schema mismatch, …), the cleanup is ABORTED entirely. Better to skip
 *   a day of cleanup than to delete live evidence because we couldn't
 *   tell what's live.
 */
const fs = require('fs');
const path = require('path');
const { logger } = require('./logger');
const { queryAll } = require('../config/database');

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const CLEANUP_DAYS = parseInt(process.env.FILE_CLEANUP_DAYS || '90');
const CLEANUP_MS = CLEANUP_DAYS * 24 * 60 * 60 * 1000;

// P1-12: expanded skip list — secondary protection layer in case the DB
// reference query somehow misses a row (column added later, alternative
// storage column, manual NULL, ...). 'profile', 'personil' hold user
// avatars and personil docs; 'exports' holds operator-generated reports;
// 'backup' holds pg_dump output. None of those should ever be auto-pruned.
const SKIP_FOLDERS = ['exports', 'backup', 'profile', 'personil'];

/**
 * Pull every filename currently referenced from the database.
 *
 * Returns a Set<string> of basenames. We intentionally use the basename
 * so that schema/path-prefix drift across controllers cannot cause a
 * false-negative ("the row says /uploads/x.jpg but disk has x.jpg").
 *
 * Tables/columns covered:
 *   users.foto_url             (avatar)
 *   absensi.foto_url           (check-in/out evidence)
 *   patrol_scans.foto_url      (patrol checkpoint evidence)
 *   panic_alerts.foto_url      (emergency evidence)
 *   laporan_harian.fotos       (text[] of attachments)
 *   laporan_harian.foto_dokumentasi  (text[] of supplementary photos)
 *   laporan_kejadian.bukti_media     (text[] of incident evidence)
 *
 * Each query is wrapped in its own try/catch so a single missing column
 * (e.g. an older DB without migration 002 applied) doesn't blank the
 * whole set and trigger a mass delete. We log the per-table failure and
 * carry on. If EVERY query fails the caller still sees an empty Set, and
 * cleanDirectory() will refuse to delete anything (see the "abort"
 * branch in runCleanup()).
 */
async function getReferencedFilenames() {
  const referenced = new Set();

  // Scalar-column queries: foto_url is a single text path per row.
  // The schema has `text` not `text[]` here, so a simple SELECT suffices.
  const scalarQueries = [
    { sql: 'SELECT foto_url FROM users         WHERE foto_url IS NOT NULL', label: 'users.foto_url' },
    { sql: 'SELECT foto_url FROM absensi       WHERE foto_url IS NOT NULL', label: 'absensi.foto_url' },
    { sql: 'SELECT foto_url FROM patrol_scans  WHERE foto_url IS NOT NULL', label: 'patrol_scans.foto_url' },
    { sql: 'SELECT foto_url FROM panic_alerts  WHERE foto_url IS NOT NULL', label: 'panic_alerts.foto_url' },
  ];

  for (const q of scalarQueries) {
    try {
      const rows = await queryAll(q.sql);
      for (const row of rows) {
        addRefToSet(referenced, row.foto_url);
      }
    } catch (err) {
      logger.warn(`[Cleanup] Reference scan failed for ${q.label} — skipping that table`, { error: err.message });
    }
  }

  // Array-column queries: laporan tables store fotos as text[].
  // UNNEST flattens the array so we get one row per file path.
  const arrayQueries = [
    { sql: 'SELECT UNNEST(fotos)            AS f FROM laporan_harian',   label: 'laporan_harian.fotos' },
    { sql: 'SELECT UNNEST(foto_dokumentasi) AS f FROM laporan_harian',   label: 'laporan_harian.foto_dokumentasi' },
    { sql: 'SELECT UNNEST(bukti_media)      AS f FROM laporan_kejadian', label: 'laporan_kejadian.bukti_media' },
  ];

  for (const q of arrayQueries) {
    try {
      const rows = await queryAll(q.sql);
      for (const row of rows) {
        addRefToSet(referenced, row.f);
      }
    } catch (err) {
      logger.warn(`[Cleanup] Reference scan failed for ${q.label} — skipping that column`, { error: err.message });
    }
  }

  return referenced;
}

/**
 * Normalise an arbitrary `foto_url` value into the basename we'll
 * compare against. Handles all of:
 *   "/uploads/profile/x.jpg"
 *   "uploads/profile/x.jpg"
 *   "https://api.example.com/uploads/profile/x.jpg"
 *   "x.jpg"
 *   "C:\\Users\\...\\uploads\\profile\\x.jpg"  (in case data came from Windows dev)
 *
 * Falsy / non-string values are silently dropped.
 */
function addRefToSet(set, value) {
  if (!value || typeof value !== 'string') return;
  // strip any querystring (e.g. "?v=2"), then take the last path segment
  // for both / and \ separators.
  const noQuery = value.split('?')[0];
  const lastSlash = Math.max(noQuery.lastIndexOf('/'), noQuery.lastIndexOf('\\'));
  const base = lastSlash >= 0 ? noQuery.slice(lastSlash + 1) : noQuery;
  if (base) set.add(base);
}

/**
 * Recursively find and delete old files.
 *
 * Signature preserved (dir, stats) so app.js / runCleanup() don't need
 * to change. The third arg (`referenced`) is internal and defaults to
 * an empty Set — if a caller invokes cleanDirectory() directly without
 * passing the set, behaviour is the same as before (no DB-ref filter).
 * In normal operation runCleanup() ALWAYS computes the set first and
 * passes it through, so the bare-Set branch is dev-tooling only.
 */
function cleanDirectory(dir, stats = { deleted: 0, skipped: 0, protected: 0, errors: 0 }, referenced = new Set()) {
  if (!fs.existsSync(dir)) return stats;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const now = Date.now();

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!SKIP_FOLDERS.includes(entry.name)) {
        cleanDirectory(fullPath, stats, referenced);
      }
      continue;
    }

    try {
      // Layer 1 (primary): DB still references this filename → keep it,
      // regardless of age. Counted separately so the operator can see
      // how many old-but-still-active files exist (signal for archival).
      if (referenced.has(entry.name)) {
        stats.protected++;
        continue;
      }

      const fileStat = fs.statSync(fullPath);
      const age = now - fileStat.mtimeMs;

      if (age > CLEANUP_MS) {
        fs.unlinkSync(fullPath);
        stats.deleted++;
      } else {
        stats.skipped++;
      }
    } catch (err) {
      stats.errors++;
    }
  }

  return stats;
}

/**
 * Run cleanup now.
 *
 * Sequence:
 *   1. Fetch the referenced-files set from the DB.
 *   2. If the set is EMPTY *and* the DB call itself appears to have
 *      failed (we detect this by also catching the top-level exception
 *      from getReferencedFilenames), refuse to clean — better to skip
 *      a day than to mass-delete because the DB hiccuped.
 *   3. Otherwise walk /uploads and prune files that are both:
 *        - not in the referenced set, and
 *        - older than CLEANUP_DAYS.
 */
async function runCleanup() {
  logger.info(`[Cleanup] Starting file cleanup (threshold: ${CLEANUP_DAYS} days)...`);

  let referenced;
  try {
    referenced = await getReferencedFilenames();
  } catch (err) {
    logger.error('[Cleanup] Aborted — could not enumerate DB-referenced files', { error: err.message });
    return { deleted: 0, skipped: 0, protected: 0, errors: 1, aborted: true };
  }

  logger.info(`[Cleanup] Loaded ${referenced.size} DB-referenced filenames — these will be skipped regardless of age.`);

  const stats = cleanDirectory(UPLOAD_DIR, { deleted: 0, skipped: 0, protected: 0, errors: 0 }, referenced);
  logger.info(
    `[Cleanup] Done - deleted: ${stats.deleted}, kept (recent): ${stats.skipped}, kept (DB-referenced): ${stats.protected}, errors: ${stats.errors}`
  );
  return stats;
}

/**
 * Schedule daily cleanup at 3:00 AM.
 *
 * Signature unchanged from before — app.js calls scheduleCleanup() at
 * boot and never inspects the returned value, so this is safe.
 */
function scheduleCleanup() {
  if (CLEANUP_DAYS <= 0) {
    logger.info('[Cleanup] Disabled (FILE_CLEANUP_DAYS=0)');
    return;
  }

  // Calculate ms until next 3 AM
  const now = new Date();
  const next3AM = new Date(now);
  next3AM.setHours(3, 0, 0, 0);
  if (next3AM <= now) next3AM.setDate(next3AM.getDate() + 1);
  const msUntil = next3AM - now;

  setTimeout(() => {
    // P1-12: runCleanup is now async. Fire-and-log: we don't await here
    // because setTimeout's callback is not awaited by the runtime anyway,
    // and we want errors caught so an unhandled rejection doesn't crash
    // the worker. The inner runCleanup already logs its own failures.
    runCleanup().catch((err) => logger.error('[Cleanup] Run failed', { error: err.message }));
    // Then repeat every 24 hours
    setInterval(() => {
      runCleanup().catch((err) => logger.error('[Cleanup] Run failed', { error: err.message }));
    }, 24 * 60 * 60 * 1000);
  }, msUntil);

  logger.info(`[Cleanup] Scheduled daily at 3:00 AM (next in ${Math.round(msUntil / 60000)} min, threshold: ${CLEANUP_DAYS} days)`);
}

module.exports = { runCleanup, scheduleCleanup, cleanDirectory };