/**
 * PATROLI ROUTES - /api/patroli
 */
const router = require('express').Router();
const ctrl = require('../controllers/patroli.controller');
const { auth } = require('../middleware/auth');
const { upload, setFolder } = require('../middleware/upload');
// TAHAP 9 BUG #1 (P2-9): rate limit upload — max 30 file / 15 menit per IP.
const { uploadLimiter } = require('../middleware/uploadLimit');

router.get('/',           auth, ctrl.getAll);
router.get('/:id',        auth, ctrl.getById);
router.post('/start',     auth, ctrl.start);
router.post('/:id/scan',  uploadLimiter, auth, setFolder('patrol'), upload.single('foto'), ctrl.scan);
router.put('/:id/end',    auth, ctrl.end);

module.exports = router;
