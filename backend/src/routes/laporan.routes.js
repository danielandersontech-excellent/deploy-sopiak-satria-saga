/**
 * LAPORAN ROUTES - /api/laporan
 */
const router = require('express').Router();
const ctrl = require('../controllers/laporan.controller');
const { auth, requireRole } = require('../middleware/auth');
const { upload, setFolder } = require('../middleware/upload');

// Harian
router.get('/harian',              auth, ctrl.getHarian);
router.post('/harian',             auth, setFolder('laporan'), upload.array('fotos', 5), ctrl.createHarian);
router.put('/harian/:id/validate', auth, requireRole('komandan', 'supervisor', 'admin'), ctrl.validateHarian);

// Kejadian
router.get('/kejadian',              auth, ctrl.getKejadian);
router.post('/kejadian',             auth, setFolder('kejadian'), upload.array('fotos', 5), ctrl.createKejadian);
router.put('/kejadian/:id/validate', auth, requireRole('komandan', 'supervisor', 'admin'), ctrl.validateKejadian);

module.exports = router;
