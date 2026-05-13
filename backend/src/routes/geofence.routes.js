/**
 * GEOFENCE ROUTES - /api/geofence
 *
 * v2 - SECURITY (P0-9): approve/reject izin must require an authority role.
 *      Previously any authenticated user (including the requester) could
 *      approve their own off-area request. Now restricted to
 *      komandan / supervisor / admin, matching the same role set used by
 *      other approval flows in this codebase.
 */
const router = require('express').Router();
const ctrl = require('../controllers/geofence.controller');
const { auth, requireRole } = require('../middleware/auth');

const APPROVAL_ROLES = requireRole('komandan', 'supervisor', 'admin');

router.post('/check',                auth, ctrl.check);
router.post('/izin',                 auth, ctrl.requestIzin);
router.put('/izin/:id/approve',      auth, APPROVAL_ROLES, ctrl.approveIzin);
router.put('/izin/:id/reject',       auth, APPROVAL_ROLES, ctrl.rejectIzin);
router.get('/izin',                  auth, ctrl.getIzinList);
router.get('/violations',            auth, ctrl.getViolations);
router.put('/violations/:id/ack',    auth, ctrl.ackViolation);
router.get('/live-map',              auth, ctrl.liveMap);
router.get('/status',                auth, ctrl.status);

module.exports = router;
