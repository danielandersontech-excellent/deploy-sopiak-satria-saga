/**
 * LOGGING UTILITY - File-based logging with rotation
 * Mengganti console.log biasa dengan log ke file yang auto-rotate.
 *
 * Log files:
 *   logs/app.log       - General application logs
 *   logs/error.log     - Errors only
 *   logs/access.log    - HTTP access logs (Morgan)
 *
 * Rotation: File di-rename saat > MAX_SIZE, max MAX_FILES history.
 */
const fs = require('fs');
const path = require('path');

const LOG_DIR = process.env.LOG_DIR || './logs';
const MAX_SIZE_MB = parseInt(process.env.LOG_MAX_SIZE || '10');
const MAX_SIZE = MAX_SIZE_MB * 1024 * 1024;
const MAX_FILES = parseInt(process.env.LOG_MAX_FILES || '30');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

/**
 * Rotate a log file if it exceeds MAX_SIZE
 */
function rotateIfNeeded(filepath) {
  try {
    if (!fs.existsSync(filepath)) return;
    const stats = fs.statSync(filepath);
    if (stats.size < MAX_SIZE) return;

    // Shift existing rotated files
    for (let i = MAX_FILES - 1; i >= 1; i--) {
      const old = `${filepath}.${i}`;
      const newer = `${filepath}.${i + 1}`;
      if (fs.existsSync(old)) {
        if (i + 1 > MAX_FILES) fs.unlinkSync(old);
        else fs.renameSync(old, newer);
      }
    }
    // Rotate current file
    fs.renameSync(filepath, `${filepath}.1`);
  } catch (err) {
    // Ignore rotation errors
  }
}

/**
 * Append a log line to a file
 */
function appendLog(filename, level, message, meta = {}) {
  const filepath = path.join(LOG_DIR, filename);
  const timestamp = new Date().toISOString();
  const metaStr = Object.keys(meta).length > 0 ? ' ' + JSON.stringify(meta) : '';
  const line = `[${timestamp}] [${level}] ${message}${metaStr}\n`;

  rotateIfNeeded(filepath);
  fs.appendFileSync(filepath, line);
}

const logger = {
  info: (msg, meta) => {
    appendLog('app.log', 'INFO', msg, meta);
    if (process.env.NODE_ENV !== 'production') console.log(`[INFO] ${msg}`);
  },
  warn: (msg, meta) => {
    appendLog('app.log', 'WARN', msg, meta);
    appendLog('error.log', 'WARN', msg, meta);
    console.warn(`[WARN] ${msg}`);
  },
  error: (msg, meta) => {
    appendLog('app.log', 'ERROR', msg, meta);
    appendLog('error.log', 'ERROR', msg, meta);
    console.error(`[ERROR] ${msg}`);
  },
  access: (msg) => {
    appendLog('access.log', 'ACCESS', msg);
  },
};

/**
 * Morgan stream for access logs - writes to logs/access.log
 */
const morganStream = {
  write: (message) => {
    const clean = message.trim();
    logger.access(clean);
  },
};

module.exports = { logger, morganStream };
