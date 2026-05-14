/**
 * AUDIT LOG CONTROLLER
 *
 * P0-6 (Tahap 4): pass req.user to every read method so the service
 * can apply lokasi scoping. Komandan now only sees audit events for
 * users in their own lokasi; klien sees events for users in any
 * lokasi linked to their client_id; admin/supervisor unchanged.
 */
const auditService = require('../services/auditlog.service');

exports.getAll = async (req, res) => {
  try { res.json(await auditService.getAll(req.query, req.user)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};

exports.getSummary = async (req, res) => {
  try { res.json(await auditService.getSummary(req.user)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};

exports.getByUser = async (req, res) => {
  try { res.json(await auditService.getByUser(req.params.userId, req.user)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};
