/**
 * GEOFENCE CONTROLLER
 *
 * P0-6 (Tahap 4): liveMap and getViolations now resolve their lokasi
 * scope server-side from req.user, intersecting with any
 * caller-supplied `?lokasi_id=`. Previously the controllers forwarded
 * `req.query.lokasi_id` straight to the service, so a klien (or
 * komandan) could simply pass another company's lokasi_id and see
 * their personnel positions + violations.
 *
 * Admin/supervisor unchanged: they can still pass `?lokasi_id=` to
 * narrow the view to one lokasi.
 */
const geoService = require('../services/geofence.service');
const { getScopeFilter } = require('../utils/scope');

exports.check = async (req, res) => {
  try { res.json(await geoService.checkPosition(req.user, req.body)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};

exports.requestIzin = async (req, res) => {
  try { res.status(201).json(await geoService.requestIzin(req.user, req.body)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};

exports.approveIzin = async (req, res) => {
  try { res.json(await geoService.approveIzin(req.params.id, req.user, req.body)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};

exports.rejectIzin = async (req, res) => {
  try { res.json(await geoService.rejectIzin(req.params.id, req.user, req.body)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};

exports.getIzinList = async (req, res) => {
  // [1-3] resolve scope server-side, identical to getViolations below.
  // Previously this forwarded req.query straight to the service, so a klien
  // or komandan could read off-area permission requests from other lokasi.
  try {
    const scope = await getScopeFilter(req.user);
    const filters = { ...req.query };
    // [Audit 2A] Anggota hanya melihat izinnya sendiri (bukan seluruh lokasi).
    if (req.user && req.user.role === 'anggota') filters.user_id = req.user.id;
    if (!scope.unrestricted) {
      const requested = filters.lokasi_id;
      if (requested) {
        if (!scope.lokasiIds.includes(requested)) {
          delete filters.lokasi_id;
          filters.lokasi_ids = []; // deny-all sentinel
        }
      } else if (scope.lokasiIds.length === 1) {
        filters.lokasi_id = scope.lokasiIds[0];
      } else {
        filters.lokasi_ids = scope.lokasiIds.slice();
      }
    }
    res.json(await geoService.getIzinList(filters));
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};

exports.getViolations = async (req, res) => {
  // P0-6: resolve scope server-side. The geofence service accepts
  // either filters.lokasi_id (single) or filters.lokasi_ids (array),
  // mirroring the same convention as the rest of the codebase.
  try {
    const scope = await getScopeFilter(req.user);
    const filters = { ...req.query };
    if (!scope.unrestricted) {
      const requested = filters.lokasi_id;
      if (requested) {
        // Admin-like narrowing isn't allowed here: a komandan can't
        // ask for someone else's lokasi. Intersect with scope.
        if (!scope.lokasiIds.includes(requested)) {
          delete filters.lokasi_id;
          filters.lokasi_ids = []; // deny-all sentinel
        }
      } else if (scope.lokasiIds.length === 1) {
        filters.lokasi_id = scope.lokasiIds[0];
      } else {
        filters.lokasi_ids = scope.lokasiIds.slice();
      }
    }
    res.json(await geoService.getViolations(filters));
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};

exports.ackViolation = async (req, res) => {
  try { res.json(await geoService.ackViolation(req.params.id, req.user)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};

exports.liveMap = async (req, res) => {
  // P0-6: build the lokasi set from req.user. Admin/supervisor can
  // still pass ?lokasi_id= to narrow; others get their scope forced.
  try {
    const scope = await getScopeFilter(req.user);
    let lokasiIds; // null = unrestricted, array (possibly empty) = restricted
    if (scope.unrestricted) {
      lokasiIds = req.query.lokasi_id ? [req.query.lokasi_id] : null;
    } else {
      const requested = req.query.lokasi_id;
      if (requested && scope.lokasiIds.includes(requested)) {
        lokasiIds = [requested];
      } else {
        lokasiIds = scope.lokasiIds.slice(); // may be empty (deny)
      }
    }
    res.json(await geoService.getLiveMapData(lokasiIds));
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};

exports.status = async (req, res) => {
  try { res.json(await geoService.getStatus(req.user.id)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};
