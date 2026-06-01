/**
 * USER ROUTES - /api/users
 *
 * P0-8 (Tahap 4): PUT /api/users/:id was previously protected only by
 * `auth`, meaning ANY authenticated user (an anggota, a klien, anyone
 * with a valid JWT) could PUT to any other user's id and edit their
 * record — change their nama, no_hp, lokasi_id, anything the
 * controller accepted. The new inline guard requires that the caller
 * is either admin/supervisor OR is editing their own row.
 *
 * The guard sits between auth and the controller so req.user is
 * already populated. We also block role escalation in the body for
 * non-admin self-edits (a komandan can't promote themselves to
 * admin), since that's the natural follow-on attack to fix here.
 */
const router = require('express').Router();
const ctrl = require('../controllers/user.controller');
const { auth, requireRole } = require('../middleware/auth');

// P0-8: enforce self-or-elevated-role on update. Returns the
// middleware function (so it composes with other middleware on the
// route in the usual express style).
function canEditUser(req, res, next) {
  const u = req.user;
  if (!u) {
    // Defensive: auth should have populated this. If not, refuse.
    return res.status(401).json({ error: 'Belum login' });
  }
  const isElevated = u.role === 'admin' || u.role === 'supervisor';
  const isSelf = String(req.params.id) === String(u.id);
  if (!isElevated && !isSelf) {
    return res.status(403).json({ error: 'Akses ditolak. Hanya admin/supervisor yang dapat mengubah user lain.' });
  }

  // P0-8 follow-on: non-admin self-edits cannot escalate role or
  // change their own lokasi/pos_jaga assignment (those are
  // organizational decisions). Strip these from the body before the
  // controller sees them rather than 403'ing, so a benign self-edit
  // (changing nama, no_hp, foto_url) still goes through.
  if (!isElevated && req.body && typeof req.body === 'object') {
    delete req.body.role;
    delete req.body.lokasi_id;
    delete req.body.pos_jaga_id;
    delete req.body.status_penempatan;
    delete req.body.skor;
    delete req.body.must_change_pin;
  }

  next();
}

router.get('/',     auth, ctrl.getAll);
router.get('/:id',  auth, ctrl.getById);
router.put('/:id',  auth, canEditUser, ctrl.update);
router.delete('/:id', auth, requireRole('admin', 'supervisor'), ctrl.delete);
router.put('/:id/location',   auth, ctrl.updateLocation);
router.put('/:id/push-token', auth, ctrl.updatePushToken);

module.exports = router;