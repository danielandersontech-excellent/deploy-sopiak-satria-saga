/**
 * GEOFENCE ROUTES - /api/geofence
 */
const router = require('express').Router();
const ctrl = require('../controllers/geofence.controller');
const { auth } = require('../middleware/auth');

router.post('/check',               auth, ctrl.check);
router.post('/izin',                 auth, ctrl.requestIzin);
router.put('/izin/:id/approve',      auth, ctrl.approveIzin);
router.put('/izin/:id/reject',       auth, ctrl.rejectIzin);
router.get('/izin',                  auth, ctrl.getIzinList);
router.get('/violations',           auth, ctrl.getViolations);
router.put('/violations/:id/ack',    auth, ctrl.ackViolation);
router.get('/live-map',              auth, ctrl.liveMap);
router.get('/status',                auth, ctrl.status);

module.exports = router;
