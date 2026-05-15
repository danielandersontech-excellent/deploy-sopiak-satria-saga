/**
 * LAPORAN ROUTES - /api/laporan
 */
const router = require('express').Router();
const ctrl = require('../controllers/laporan.controller');
const { auth, requireRole } = require('../middleware/auth');
const { upload, setFolder } = require('../middleware/upload');
// TAHAP 9 BUG #1 (P2-9): rate limit upload — max 30 file / 15 menit per IP.
const { uploadLimiter } = require('../middleware/uploadLimit');

// Harian
router.get('/harian',              auth, ctrl.getHarian);
router.post('/harian',             uploadLimiter, auth, setFolder('laporan'), upload.array('fotos', 5), ctrl.createHarian);
router.put('/harian/:id/validate', auth, requireRole('komandan', 'supervisor', 'admin'), ctrl.validateHarian);

// Kejadian
router.get('/kejadian',              auth, ctrl.getKejadian);
router.post('/kejadian',             uploadLimiter, auth, setFolder('kejadian'), upload.array('fotos', 5), ctrl.createKejadian);
router.put('/kejadian/:id/validate', auth, requireRole('komandan', 'supervisor', 'admin'), ctrl.validateKejadian);

module.exports = router;
