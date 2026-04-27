/**
 * USER ROUTES - /api/users
 */
const router = require('express').Router();
const ctrl = require('../controllers/user.controller');
const { auth, requireRole } = require('../middleware/auth');

router.get('/',     auth, ctrl.getAll);
router.get('/:id',  auth, ctrl.getById);
router.put('/:id',  auth, ctrl.update);
router.delete('/:id', auth, requireRole('admin', 'supervisor'), ctrl.delete);
router.put('/:id/location',   auth, ctrl.updateLocation);
router.put('/:id/push-token', auth, ctrl.updatePushToken);

module.exports = router;
