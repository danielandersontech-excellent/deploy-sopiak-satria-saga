/**
 * ABSENSI ROUTES - /api/absensi
 */
const router = require('express').Router();
const ctrl = require('../controllers/absensi.controller');
const { auth } = require('../middleware/auth');
const { upload, setFolder } = require('../middleware/upload');
const { validate } = require('../middleware/validation');

router.get('/',      auth, ctrl.getAll);
router.get('/today', auth, ctrl.getToday);
router.post('/',     auth, setFolder('absensi'), upload.single('foto'), validate('absensi'), ctrl.create);

module.exports = router;
