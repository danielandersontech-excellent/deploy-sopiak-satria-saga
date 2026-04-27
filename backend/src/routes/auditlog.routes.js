/**
 * AUDIT LOG ROUTES - /api/audit-log
 */
const router = require('express').Router();
const ctrl = require('../controllers/auditlog.controller');
const { auth, requireRole } = require('../middleware/auth');

router.get('/',          auth, requireRole('admin', 'supervisor', 'komandan'), ctrl.getAll);
router.get('/summary',   auth, requireRole('admin', 'supervisor'), ctrl.getSummary);
router.get('/user/:userId', auth, requireRole('admin', 'supervisor', 'komandan'), ctrl.getByUser);

module.exports = router;
