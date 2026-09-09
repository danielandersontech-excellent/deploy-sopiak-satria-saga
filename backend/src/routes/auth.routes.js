/**
 * AUTH ROUTES - /api/auth
 */
const router = require('express').Router();
const ctrl = require('../controllers/auth.controller');
const { auth } = require('../middleware/auth');
const { validate } = require('../middleware/validation');

router.post('/login',       validate('login'),    ctrl.login);
router.post('/refresh',     ctrl.refreshToken);
router.post('/logout',   auth, ctrl.logout);
router.get('/me',        auth, ctrl.me);
// [Misi V3 / D2] Klien memperbarui kontak sendiri (kontak_person, nomor_telepon, email).
router.put('/me',        auth, ctrl.updateMe);
router.put('/change-pin', auth, validate('changePin'), ctrl.changePin);
router.post('/register', auth, validate('register'), ctrl.register);

module.exports = router;
