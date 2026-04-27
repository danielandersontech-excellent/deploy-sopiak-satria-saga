/**
 * AUDIT LOG CONTROLLER
 */
const auditService = require('../services/auditlog.service');

exports.getAll = async (req, res) => {
  try { res.json(await auditService.getAll(req.query)); }
  catch (e) { res.status(500).json({ error: e.message }); }
};

exports.getSummary = async (req, res) => {
  try { res.json(await auditService.getSummary()); }
  catch (e) { res.status(500).json({ error: e.message }); }
};

exports.getByUser = async (req, res) => {
  try { res.json(await auditService.getByUser(req.params.userId)); }
  catch (e) { res.status(500).json({ error: e.message }); }
};
