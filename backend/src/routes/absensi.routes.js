/**
 * ABSENSI ROUTES - /api/absensi
 */
const router = require('express').Router();
const ctrl = require('../controllers/absensi.controller');
const { auth } = require('../middleware/auth');
const { upload, setFolder } = require('../middleware/upload');
const { validate } = require('../middleware/validation');
// TAHAP 9 BUG #1 (P2-9): rate limit upload — max 30 file / 15 menit per IP.
const { uploadLimiter } = require('../middleware/uploadLimit');

router.get('/',      auth, ctrl.getAll);
router.get('/today', auth, ctrl.getToday);
router.post('/',     uploadLimiter, auth, setFolder('absensi'), upload.single('foto'), validate('absensi'), ctrl.create);

module.exports = router;