/**
 * BACKUP & RESTORE ROUTES - /api/backup
 * v15 - Fixed all endpoints with proper error handling, added download
 */
const router = require('express').Router();
const { auth, requireRole } = require('../middleware/auth');
const backupService = require('../services/backup.service');
const path = require('path');
const fs = require('fs');
const { logger } = require('../utils/logger');
// [1-10] audit sensitive backup operations via the existing audit mechanism.
const { logEvent } = require('../middleware/auditlog');

// [1-9] Whitelist of legitimate backup filenames. Used by /restore to reject
// anything that isn't a plain backup leaf-name before it reaches the service.
const SAFE_BACKUP_FILENAME = /^[\w.\-]+\.(sql|dump|backup)$/;

const guard = [auth, requireRole('admin', 'supervisor')];

// SECURITY (P0-18d): Restore is a destructive, full-database operation —
// supervisors should be able to create / list / download / delete backups,
// but only admins may overwrite the live database from a file on disk.
const adminGuard = [auth, requireRole('admin')];

// Create backup
router.post('/create', ...guard, async (req, res) => {
  try {
    const result = await backupService.createBackup();
    // [1-10] audit
    logEvent(req.user.id, req.user.nama || '', 'BACKUP_CREATE', 'backup', null, { filename: result && result.filename }).catch(() => {});
    res.json({ success: true, ...result });
  } catch (err) {
    logger.error(`[Backup Route] Create error: ${err.message}`);
    res.status(500).json({ error: err.message || 'Gagal membuat backup' });
  }
});

// List backups
router.get('/list', ...guard, async (req, res) => {
  try {
    const backups = backupService.listBackups();
    res.json(Array.isArray(backups) ? backups : []);
  } catch (err) {
    logger.error(`[Backup Route] List error: ${err.message}`);
    res.json([]);
  }
});

// Download backup
router.get('/download/:filename', ...guard, async (req, res) => {
  try {
    const filename = req.params.filename;
    if (!filename || filename.includes('..') || filename.includes('/')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    const backupDir = path.join(__dirname, '../../backups');
    const filePath = path.join(backupDir, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    res.download(filePath, filename);
  } catch (err) {
    logger.error(`[Backup Route] Download error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Restore from backup (admin-only — see adminGuard above)
router.post('/restore', ...adminGuard, async (req, res) => {
  try {
    const { filename } = req.body;
    if (!filename) return res.status(400).json({ error: 'filename is required' });
    // [1-9] Reject path-traversal / unexpected names at the route layer
    // (defense in depth — backup.service also basenames + confines to
    // BACKUP_DIR). Only plain backup leaf-names are accepted.
    if (typeof filename !== 'string' || filename.includes('..') || filename.includes('/') ||
        filename.includes('\\') || !SAFE_BACKUP_FILENAME.test(filename)) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    const result = await backupService.restoreBackup(filename);
    // [1-10] audit (destructive, full-DB operation)
    logEvent(req.user.id, req.user.nama || '', 'BACKUP_RESTORE', 'backup', null, { filename }).catch(() => {});
    res.json({ success: true, ...result });
  } catch (err) {
    logger.error(`[Backup Route] Restore error: ${err.message}`);
    res.status(500).json({ error: err.message || 'Gagal restore backup' });
  }
});

// Upload backup to Google Drive
router.post('/upload-drive', ...guard, async (req, res) => {
  try {
    const { filename } = req.body;
    if (!filename) return res.status(400).json({ error: 'filename is required' });
    const result = await backupService.uploadToDrive(filename);
    res.json({ success: true, ...result });
  } catch (err) {
    logger.error(`[Backup Route] Drive upload error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Delete backup
router.delete('/:filename', ...guard, async (req, res) => {
  try {
    const deleted = backupService.deleteBackup(req.params.filename);
    if (deleted) res.json({ success: true });
    else res.status(404).json({ error: 'File not found' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get schedule
router.get('/schedule', ...guard, async (req, res) => {
  try {
    res.json(backupService.getSchedule());
  } catch (err) {
    res.json({ enabled: false, time: '02:00' });
  }
});

// Set schedule
router.put('/schedule', ...guard, async (req, res) => {
  try {
    const { enabled, time } = req.body;
    const result = backupService.setSchedule(enabled, time);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;