const router = require('express').Router();
const dataCtrl = require('../controllers/data.controller');
const opCtrl = require('../controllers/operasional.controller');
const dashCtrl = require('../controllers/dashboard.controller');
const { auth, requireRole } = require('../middleware/auth');
const { upload, getFileUrl } = require('../middleware/upload');
// TAHAP 9 BUG #1 (P2-9): rate limit upload — max 30 file / 15 menit per IP.
const { uploadLimiter } = require('../middleware/uploadLimit');
const { logEvent } = require('../middleware/auditlog');
const { query, queryOne } = require('../config/database');
const { logger } = require('../utils/logger');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// =============================================================================
// SECURITY (P0-16): Whitelist for upload subfolders.
// =============================================================================
const SAFE_FOLDERS = ['general', 'absensi', 'laporan', 'kejadian', 'patroli', 'kontrak', 'personil', 'profile'];
// [Audit 2A] Halaman Personil web-admin mengunggah ke `personil/<NRP>` (satu
// sub-folder per personil). Whitelist P0-16 hanya menerima nama folder tunggal
// sehingga upload foto/berkas personil selalu ditolak 400 di produksi.
// Sub-folder diizinkan HANYA di bawah `personil/` dengan segmen yang ketat
// (huruf/angka/_/-, maks 30) — tidak ada '.', '/', atau '\' → tanpa traversal.
const PERSONIL_SUBFOLDER_RE = /^personil\/[A-Za-z0-9_-]{1,30}$/;

function pickUploadFolder(req, res, next) {
  const requested = typeof req.query.folder === 'string' ? req.query.folder : 'general';
  if (!SAFE_FOLDERS.includes(requested) && !PERSONIL_SUBFOLDER_RE.test(requested)) {
    return res.status(400).json({ error: `Folder upload tidak valid. Pilih salah satu: ${SAFE_FOLDERS.join(', ')} (atau personil/<NRP>)` });
  }
  req.uploadFolder = requested;
  next();
}

// =============================================================================
// TAHAP 7 BUG #8 (P2-7): Reset PIN for a client.
//
// POST /api/data/clients/:id/reset-pin
//
// Generates a fresh 6-digit PIN, stores only its bcrypt hash, sets
// must_change_pin so the client is forced to rotate on first login, and
// returns the plaintext PIN ONCE in the JSON response so the admin can
// hand it off. The plaintext is never written to disk and the audit log
// records only the action (not the PIN itself).
//
// Authorization: admin or supervisor only. Klien themselves cannot trigger
// this (they should use change-PIN with their existing one); komandan and
// anggota have no business resetting client credentials.
//
// We use crypto.randomInt for a uniform distribution across 100000..999999
// (Math.random would be predictable). The cost factor matches the rest of
// the auth surface — BCRYPT_ROUNDS env, default 12.
// =============================================================================
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.post(
  '/clients/:id/reset-pin',
  auth,
  requireRole('admin', 'supervisor'),
  async (req, res) => {
    const clientId = req.params.id;
    if (!clientId || !UUID_RE.test(String(clientId))) {
      return res.status(400).json({ error: 'ID klien tidak valid' });
    }

    try {
      // Generate uniformly-random 6-digit PIN (100000..999999, padded
      // string so a leading zero would be preserved — though randomInt's
      // lower bound is 100000 so no leading zero arises today, the
      // padStart is a cheap safety net if the range is ever widened).
      const pin = String(crypto.randomInt(100000, 1000000)).padStart(6, '0');

      const rounds = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);
      const pinHash = await bcrypt.hash(pin, rounds);

      const updated = await queryOne(
        `UPDATE clients
            SET pin_hash = $1,
                must_change_pin = TRUE,
                updated_at = NOW()
          WHERE id = $2
          RETURNING id, nrp_login, kode_klien, nama_klien`,
        [pinHash, clientId],
      );

      if (!updated) {
        return res.status(404).json({ error: 'Klien tidak ditemukan' });
      }

      // P1-2 follow-on: any existing klien refresh tokens are now stale.
      // Wipe them so the rotated PIN actually takes effect on next login —
      // a leftover refresh token would let an attacker who learned the
      // old PIN ride the existing session past the rotation.
      try {
        await query(
          'DELETE FROM refresh_tokens WHERE client_id = $1',
          [clientId],
        );
      } catch (cleanupErr) {
        // Non-fatal; log and continue. The PIN rotation itself succeeded.
        logger.warn(
          `[reset-pin] Gagal hapus refresh_tokens untuk client ${clientId}: ${cleanupErr.message}`,
        );
      }

      // Audit log — NEVER include the plaintext PIN in detail.
      try {
        await logEvent(
          req.user.id,
          req.user.nama || '',
          'CLIENT_PIN_RESET',
          'clients',
          clientId,
          {
            client_kode: updated.kode_klien,
            client_nama: updated.nama_klien,
            // Note absence of `pin` field — plaintext does not enter logs.
          },
        );
      } catch (auditErr) {
        // Audit failure shouldn't block the response, but we want to see
        // it in the error log so it's findable later.
        logger.error(
          `[reset-pin] Audit log failed for client ${clientId}: ${auditErr.message}`,
        );
      }

      return res.json({
        success: true,
        pin,
        client_id: updated.id,
        nrp_login: updated.nrp_login || updated.kode_klien,
        message: 'PIN baru hanya ditampilkan sekali. Catat sebelum menutup modal.',
      });
    } catch (err) {
      logger.error(`[reset-pin] error for client ${clientId}: ${err.message}`);
      return res.status(500).json({ error: 'Gagal reset PIN klien' });
    }
  },
);

function crudRoutes(ctrl, adminOnly = false, writeRoles = ['admin', 'supervisor', 'komandan']) {
  const r = require('express').Router();
  // [1-5] write roles are now configurable. Default keeps the previous
  // admin/supervisor/komandan set so operational resources are unchanged;
  // sensitive resources (lokasi) pass a tighter set below.
  const wg = adminOnly ? [auth, requireRole(...writeRoles)] : [auth];
  r.get('/', auth, ctrl.getAll); r.get('/:id', auth, ctrl.getById);
  r.post('/', ...wg, ctrl.create); r.put('/:id', ...wg, ctrl.update); r.delete('/:id', ...wg, ctrl.remove);
  return r;
}
// [1-5] lokasi is a sensitive resource: only admin/supervisor may mutate it
// (a komandan is a field role and should not create/delete sites).
router.use('/lokasi', crudRoutes(dataCtrl.lokasi, true, ['admin', 'supervisor']));
router.use('/pos-jaga', crudRoutes(dataCtrl.posJaga, true));
router.use('/checkpoints', crudRoutes(dataCtrl.checkpoints, true));
router.use('/routes', crudRoutes(dataCtrl.routes, true));
router.use('/jadwal-shift', crudRoutes(dataCtrl.jadwalShift, true));
router.use('/shift-assignments', crudRoutes(dataCtrl.shiftAssignments, true));
router.use('/report-exports', crudRoutes(dataCtrl.reportExports, true));
// =============================================================================
// SECURITY (Fase 0 / 2F-1): `clients` is intentionally NOT registered via the
// generic crudRoutes() factory.
//
// The factory leaves GET '/' and GET '/:id' on bare `auth` (its adminOnly flag
// only gates POST/PUT/DELETE). For `clients` that meant ANY authenticated user
// — an anggota/komandan, or a klien from ANY tenant — could call
// GET /api/data/clients and receive every client row, including the bcrypt
// `pin_hash` of a 6-digit PIN (crackable offline → cross-tenant account
// takeover) plus login identity.
//
// We register clients explicitly so the two READ endpoints are gated to
// admin/supervisor only. This matches the existing front-end menu gating
// (ROLE_MENUS in web-admin lib/api.ts already limits /clients and /lokasi to
// admin+supervisor) — now enforced server-side.
//
// The WRITE guard is admin/supervisor only.
//   - Fase 0 (2F-1) registered clients explicitly to gate the two READ
//     endpoints to admin/supervisor (was: any authenticated user).
//   - Fase 1 (1-5) tightens the WRITE guard too: a komandan is a field role
//     and must not create/update/delete client (tenant) accounts. Previously
//     the write guard was admin/supervisor/komandan.
//
// Defense in depth: `pin_hash` and `must_change_pin` are additionally stripped
// from the read output in data.service.js, so the secret is never returned
// even to an admin. The klien LOGIN path (auth.service.js) reads `pin_hash`
// through its own raw query and is unaffected by any of this.
const clientsR = require('express').Router();
const clientsWriteGuard = [auth, requireRole('admin', 'supervisor')];
clientsR.get('/', auth, requireRole('admin', 'supervisor'), dataCtrl.clients.getAll);
clientsR.get('/:id', auth, requireRole('admin', 'supervisor'), dataCtrl.clients.getById);
clientsR.post('/', ...clientsWriteGuard, dataCtrl.clients.create);
clientsR.put('/:id', ...clientsWriteGuard, dataCtrl.clients.update);
clientsR.delete('/:id', ...clientsWriteGuard, dataCtrl.clients.remove);
router.use('/clients', clientsR);
const bcR = require('express').Router();
bcR.get('/', auth, opCtrl.getBroadcasts); bcR.post('/', auth, requireRole('komandan','supervisor','admin'), opCtrl.createBroadcast);
router.use('/broadcasts', bcR);
const stR = require('express').Router();
stR.get('/', auth, opCtrl.getSerahTerima); stR.post('/', auth, opCtrl.createSerahTerima);
router.use('/serah-terima', stR);
const paR = require('express').Router();
paR.get('/', auth, opCtrl.getPanics); paR.post('/', auth, opCtrl.createPanic); paR.put('/:id/resolve', auth, opCtrl.resolvePanic);
router.use('/panic', paR);
const noR = require('express').Router();
noR.get('/', auth, opCtrl.getNotifikasi); noR.post('/', auth, opCtrl.createNotifikasi);
noR.put('/read-all', auth, opCtrl.markAllRead); noR.put('/:id/read', auth, opCtrl.markRead);
router.use('/notifikasi', noR);
router.get('/dashboard/stats', auth, dashCtrl.getStats);
// [Audit 2A/2B] agregat halaman Analytics (ber-scope).
router.get('/dashboard/analytics', auth, dashCtrl.getAnalytics);

// File upload with watermark
//
// SECURITY (P0-16): pickUploadFolder runs BEFORE multer parses the body, so
// invalid folder values are rejected before any bytes hit the disk.
//
// AUDIT FIX (P1-17): applyWatermark may rename the file (.png → .jpg)
// after JPEG re-encoding. We capture the returned path and use it for
// getFileUrl so the URL handed back to the client matches what's on disk.
router.post('/upload', uploadLimiter, auth, pickUploadFolder, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  try {
    let fp = req.file.path;
    const wm = req.headers['x-watermark-info'] || req.body.watermark;
    if (wm && req.file.mimetype && req.file.mimetype.startsWith('image/')) {
      try {
        const { applyWatermark } = require('../services/watermark.service');
        const info = JSON.parse(typeof wm === 'string' ? decodeURIComponent(wm) : wm);
        fp = (await applyWatermark(fp, info)) || fp;
      } catch (e) {
        logger.warn(`[Upload] WM skip: ${e.message}`);
      }
    }
    res.json({ url: getFileUrl(fp) });
  } catch (e) {
    res.json({ url: getFileUrl(req.file.path) });
  }
});

router.post('/upload/multiple', uploadLimiter, auth, pickUploadFolder, upload.array('files', 10), async (req, res) => {
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'No files' });
  try {
    const wm = req.headers['x-watermark-info'] || req.body.watermark;
    let wi = null;
    if (wm) {
      try {
        wi = JSON.parse(typeof wm === 'string' ? decodeURIComponent(wm) : wm);
      } catch { /* malformed watermark info: skip wm, upload still proceeds */ }
    }
    const urls = await Promise.all(req.files.map(async (f) => {
      if (wi && f.mimetype && f.mimetype.startsWith('image/')) {
        try {
          const { applyWatermark } = require('../services/watermark.service');
          // AUDIT FIX (P1-17): mutate f.path so getFileUrl below picks
          // up the renamed file. Previously the rename was silently
          // ignored because we used the return value (which we threw
          // away) instead of f.path.
          f.path = (await applyWatermark(f.path, wi)) || f.path;
        } catch { /* lenient: keep f.path as-is, file still uploaded */ }
      }
      return getFileUrl(f.path);
    }));
    res.json({ urls });
  } catch {
    res.json({ urls: req.files.map((f) => getFileUrl(f.path)) });
  }
});

module.exports = router;