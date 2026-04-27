/**
 * FILE CLEANUP SCHEDULER
 * Menghapus file upload yang lebih tua dari FILE_CLEANUP_DAYS.
 * Berjalan sekali per hari (setiap jam 3 pagi).
 */
const fs = require('fs');
const path = require('path');
const { logger } = require('./logger');

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const CLEANUP_DAYS = parseInt(process.env.FILE_CLEANUP_DAYS || '90');
const CLEANUP_MS = CLEANUP_DAYS * 24 * 60 * 60 * 1000;

// Folders to skip
const SKIP_FOLDERS = ['exports']; // Don't auto-delete exports

/**
 * Recursively find and delete old files
 */
function cleanDirectory(dir, stats = { deleted: 0, skipped: 0, errors: 0 }) {
  if (!fs.existsSync(dir)) return stats;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const now = Date.now();

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!SKIP_FOLDERS.includes(entry.name)) {
        cleanDirectory(fullPath, stats);
      }
      continue;
    }

    try {
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
 * Run cleanup now
 */
function runCleanup() {
  logger.info(`[Cleanup] Starting file cleanup (threshold: ${CLEANUP_DAYS} days)...`);
  const stats = cleanDirectory(UPLOAD_DIR);
  logger.info(`[Cleanup] Done - deleted: ${stats.deleted}, kept: ${stats.skipped}, errors: ${stats.errors}`);
  return stats;
}

/**
 * Schedule daily cleanup at 3:00 AM
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
    runCleanup();
    // Then repeat every 24 hours
    setInterval(runCleanup, 24 * 60 * 60 * 1000);
  }, msUntil);

  logger.info(`[Cleanup] Scheduled daily at 3:00 AM (next in ${Math.round(msUntil / 60000)} min, threshold: ${CLEANUP_DAYS} days)`);
}

module.exports = { runCleanup, scheduleCleanup };
