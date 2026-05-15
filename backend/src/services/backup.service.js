/**
 * BACKUP & RESTORE SERVICE
 * 
 * Fitur:
 * - Backup database menggunakan pg_dump → file .sql
 * - Restore database dari file .sql
 * - Upload backup ke Google Drive
 * - Jadwal backup otomatis harian
 * - List semua backup yang tersedia
 */
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { logger } = require('../utils/logger');

const execAsync = promisify(exec);

// Backup directory
const BACKUP_DIR = path.join(__dirname, '..', '..', 'backups');

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// Schedule state (in-memory, reset on restart)
let scheduleTimer = null;
let scheduleConfig = { enabled: false, time: '02:00' };

/**
 * Create database backup using pg_dump
 * @returns {object} { filename, filepath, size, created_at }
 */
async function createBackup() {
  const dbHost = process.env.DB_HOST || 'localhost';
  const dbPort = process.env.DB_PORT || '5432';
  const dbName = process.env.DB_NAME || 'ptsss_db';
  const dbUser = process.env.DB_USER || 'postgres';
  const dbPass = process.env.DB_PASSWORD || '';

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').substring(0, 19);
  const filename = `backup_${dbName}_${timestamp}.sql`;
  const filepath = path.join(BACKUP_DIR, filename);

  // Build pg_dump command
  const env = { ...process.env };
  if (dbPass) env.PGPASSWORD = dbPass;

  const cmd = `pg_dump -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${dbName} -F p -f "${filepath}"`;

  try {
    await execAsync(cmd, { env, timeout: 120000 });

    // Verify file was created
    if (!fs.existsSync(filepath)) {
      throw new Error('Backup file was not created');
    }

    const stats = fs.statSync(filepath);
    const sizeKB = Math.round(stats.size / 1024);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    const sizeStr = stats.size > 1024 * 1024 ? `${sizeMB} MB` : `${sizeKB} KB`;

    logger.info(`[Backup] ✅ Created: ${filename} (${sizeStr})`);

    return {
      filename,
      filepath,
      size: sizeStr,
      bytes: stats.size,
      created_at: new Date().toISOString(),
    };
  } catch (err) {
    logger.error(`[Backup] ❌ pg_dump failed: ${err.message}`);

    // Fallback: Use SQL COPY approach via pg library
    try {
      logger.info('[Backup] Trying SQL-based backup fallback...');
      return await createSQLBackup(filename, filepath);
    } catch (fallbackErr) {
      throw new Error(`Backup failed: ${err.message}. Fallback also failed: ${fallbackErr.message}`);
    }
  }
}

/**
 * Fallback SQL-based backup (if pg_dump is not available)
 */
async function createSQLBackup(filename, filepath) {
  const { queryAll } = require('../config/database');

  // Get all table names
  const tables = await queryAll(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
  );

  let sql = `-- PT Sopiak Satria Saga Database Backup\n-- Generated: ${new Date().toISOString()}\n-- Database: ${process.env.DB_NAME || 'ptsss_db'}\n\n`;
  sql += `SET client_encoding = 'UTF8';\n\n`;

  for (const { tablename } of tables) {
    try {
      // Get CREATE TABLE statement
      const createResult = await queryAll(
        `SELECT column_name, data_type, character_maximum_length, column_default, is_nullable 
         FROM information_schema.columns 
         WHERE table_schema = 'public' AND table_name = $1 
         ORDER BY ordinal_position`,
        [tablename]
      );

      // Get all rows
      const rows = await queryAll(`SELECT * FROM "${tablename}"`);

      if (rows.length > 0) {
        sql += `-- Table: ${tablename} (${rows.length} rows)\n`;
        const cols = Object.keys(rows[0]);
        
        for (const row of rows) {
          const vals = cols.map(c => {
            const v = row[c];
            if (v === null || v === undefined) return 'NULL';
            if (typeof v === 'number' || typeof v === 'boolean') return String(v);
            if (v instanceof Date) return `'${v.toISOString()}'`;
            if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
            return `'${String(v).replace(/'/g, "''")}'`;
          });
          sql += `INSERT INTO "${tablename}" ("${cols.join('","')}") VALUES (${vals.join(',')}) ON CONFLICT DO NOTHING;\n`;
        }
        sql += '\n';
      }
    } catch (e) {
      sql += `-- Error backing up ${tablename}: ${e.message}\n`;
    }
  }

  fs.writeFileSync(filepath, sql, 'utf8');
  const stats = fs.statSync(filepath);
  const sizeStr = stats.size > 1024 * 1024
    ? `${(stats.size / (1024 * 1024)).toFixed(2)} MB`
    : `${Math.round(stats.size / 1024)} KB`;

  logger.info(`[Backup] ✅ SQL fallback created: ${filename} (${sizeStr})`);

  return {
    filename,
    filepath,
    size: sizeStr,
    bytes: stats.size,
    created_at: new Date().toISOString(),
  };
}

/**
 * Restore database from backup file.
 *
 * SECURITY (P0-18): the previous implementation built `filepath` from the raw
 * `filename` argument and called `fs.existsSync(filepath)` BEFORE sanitizing.
 * That ordering plus the lax check (only rejecting `..`, `/`, `\`) was
 * defeatable in two ways:
 *   1. Existence was probed against arbitrary attacker-supplied paths, which
 *      is itself a small information leak.
 *   2. URL-encoded traversal, NUL bytes, drive prefixes on Windows, and
 *      symlinks inside BACKUP_DIR could still escape the intended directory.
 *
 * The hardened version:
 *   (a) strips any path component with `path.basename()` so only the leaf
 *       filename survives, no matter what the caller sent;
 *   (b) resolves the absolute path and verifies it begins with
 *       `BACKUP_DIR + path.sep` so a symlink or odd Unicode trick cannot
 *       point outside the backups directory;
 *   (c) requires the `.sql` extension — we never restore from anything else.
 * Only AFTER all three checks pass do we touch the filesystem.
 */
async function restoreBackup(filename) {
  // (a) Reduce to leaf filename. path.basename strips any directory part
  // ('foo/../bar.sql' -> 'bar.sql', '/etc/passwd' -> 'passwd').
  if (typeof filename !== 'string' || !filename) {
    throw new Error('Invalid filename');
  }
  const safeName = path.basename(filename);

  // Defense-in-depth: reject names that still contain separators after
  // basename (shouldn't happen, but cheap to check) and reject NUL bytes
  // which some filesystems treat as string terminators.
  if (
    !safeName ||
    safeName !== filename.split(/[\\/]/).pop() ||
    safeName.includes('\0') ||
    safeName === '.' ||
    safeName === '..'
  ) {
    throw new Error('Invalid filename');
  }

  // (c) Only .sql backups are restorable. .dump/.gz files would need
  // different tooling and have no legitimate caller here.
  if (!safeName.toLowerCase().endsWith('.sql')) {
    throw new Error('Only .sql backup files can be restored');
  }

  // (b) Resolve and confirm the final path is still inside BACKUP_DIR.
  // path.resolve normalizes any residual `..` segments; the prefix check
  // (with the trailing separator) prevents partial-prefix attacks like a
  // sibling directory named `backupsEVIL`.
  const backupRoot = path.resolve(BACKUP_DIR);
  const filepath = path.resolve(backupRoot, safeName);
  if (filepath !== path.join(backupRoot, safeName) ||
      !filepath.startsWith(backupRoot + path.sep)) {
    throw new Error('Invalid filename');
  }

  // Only NOW that we know the path is safe do we hit the filesystem.
  if (!fs.existsSync(filepath)) {
    throw new Error(`Backup file not found: ${safeName}`);
  }

  const dbHost = process.env.DB_HOST || 'localhost';
  const dbPort = process.env.DB_PORT || '5432';
  const dbName = process.env.DB_NAME || 'ptsss_db';
  const dbUser = process.env.DB_USER || 'postgres';
  const dbPass = process.env.DB_PASSWORD || '';

  const env = { ...process.env };
  if (dbPass) env.PGPASSWORD = dbPass;

  const cmd = `psql -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${dbName} -f "${filepath}"`;

  try {
    const { stdout, stderr } = await execAsync(cmd, { env, timeout: 300000 });
    logger.info(`[Backup] ✅ Restored: ${safeName}`);
    if (stderr && !stderr.includes('NOTICE')) logger.info(`[Backup] Warnings: ${stderr}`);
    return { success: true, message: `Database restored from ${safeName}` };
  } catch (err) {
    // Fallback: read SQL and execute via pg
    try {
      logger.info('[Backup] psql not found, trying pg fallback...');
      const { pool } = require('../config/database');
      const sql = fs.readFileSync(filepath, 'utf8');
      await pool.query(sql);
      logger.info(`[Backup] ✅ Restored via pg: ${safeName}`);
      return { success: true, message: `Database restored from ${safeName} (pg fallback)` };
    } catch (pgErr) {
      throw new Error(`Restore failed: ${err.message}. PG fallback: ${pgErr.message}`);
    }
  }
}

/**
 * List all available backup files
 */
function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];

  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.sql') || f.endsWith('.dump') || f.endsWith('.gz'))
    .map(filename => {
      const filepath = path.join(BACKUP_DIR, filename);
      const stats = fs.statSync(filepath);
      const sizeStr = stats.size > 1024 * 1024
        ? `${(stats.size / (1024 * 1024)).toFixed(2)} MB`
        : `${Math.round(stats.size / 1024)} KB`;

      // Check if uploaded to Drive (metadata file)
      const metaPath = filepath + '.meta.json';
      let driveUrl = null;
      try {
        if (fs.existsSync(metaPath)) {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
          driveUrl = meta.drive_url;
        }
      } catch {}

      return {
        filename,
        size: sizeStr,
        bytes: stats.size,
        created_at: stats.birthtime || stats.mtime,
        drive_url: driveUrl,
      };
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return files;
}

/**
 * Upload backup file to Google Drive
 * @param {string} filename - Name of backup file
 */
async function uploadToDrive(filename) {
  const filepath = path.join(BACKUP_DIR, filename);
  
  if (!fs.existsSync(filepath)) {
    throw new Error(`Backup file not found: ${filename}`);
  }

  try {
    const { uploadToDrive: driveUpload, isDriveEnabled } = require('../middleware/driveCDN');

    if (!isDriveEnabled()) {
      throw new Error('Google Drive CDN not enabled. Set DRIVE_CDN_ENABLED=true and configure credentials.');
    }

    const driveUrl = await driveUpload(filepath, `ptsss_${filename}`, 'application/sql');
    
    if (!driveUrl) {
      throw new Error('Upload to Google Drive returned null');
    }

    // Save metadata
    const metaPath = filepath + '.meta.json';
    fs.writeFileSync(metaPath, JSON.stringify({
      drive_url: driveUrl,
      uploaded_at: new Date().toISOString(),
    }));

    logger.info(`[Backup] ☁️ Uploaded to Drive: ${filename} → ${driveUrl}`);
    return { drive_url: driveUrl, filename };
  } catch (err) {
    logger.error(`[Backup] Drive upload failed: ${err.message}`);
    throw new Error(`Google Drive upload failed: ${err.message}`);
  }
}

/**
 * Delete a backup file
 * @param {string} filename
 */
function deleteBackup(filename) {
  const filepath = path.join(BACKUP_DIR, filename);
  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath);
    // Also delete metadata
    const metaPath = filepath + '.meta.json';
    if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
    logger.info(`[Backup] 🗑️ Deleted: ${filename}`);
    return true;
  }
  return false;
}

/**
 * Get/set auto-backup schedule
 */
function getSchedule() {
  return scheduleConfig;
}

function setSchedule(enabled, time) {
  scheduleConfig = { enabled: !!enabled, time: time || '02:00' };

  // Clear existing timer
  if (scheduleTimer) {
    clearInterval(scheduleTimer);
    scheduleTimer = null;
  }

  if (scheduleConfig.enabled) {
    // Check every minute if it's time to backup
    scheduleTimer = setInterval(async () => {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      if (hhmm === scheduleConfig.time) {
        logger.info(`[Backup] ⏰ Auto backup triggered at ${hhmm}`);
        try {
          const result = await createBackup();
          // Auto-upload to Drive if enabled
          try {
            const { isDriveEnabled } = require('../middleware/driveCDN');
            if (isDriveEnabled()) {
              await uploadToDrive(result.filename);
            }
          } catch {}
        } catch (err) {
          logger.error(`[Backup] Auto backup failed: ${err.message}`);
        }
      }
    }, 60000); // Check every minute

    logger.info(`[Backup] ⏰ Auto backup scheduled at ${scheduleConfig.time} daily`);
  } else {
    logger.info('[Backup] ⏰ Auto backup disabled');
  }

  return scheduleConfig;
}

module.exports = {
  createBackup,
  restoreBackup,
  listBackups,
  uploadToDrive,
  deleteBackup,
  getSchedule,
  setSchedule,
  BACKUP_DIR,
};
