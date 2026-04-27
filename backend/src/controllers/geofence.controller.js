/**
 * GEOFENCE CONTROLLER
 */
const geoService = require('../services/geofence.service');

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
  try { res.json(await geoService.getIzinList(req.query)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};

exports.getViolations = async (req, res) => {
  try { res.json(await geoService.getViolations(req.query)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};

exports.ackViolation = async (req, res) => {
  try { res.json(await geoService.ackViolation(req.params.id, req.user.id)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};

exports.liveMap = async (req, res) => {
  try { res.json(await geoService.getLiveMapData(req.query.lokasi_id)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};

exports.status = async (req, res) => {
  try { res.json(await geoService.getStatus(req.user.id)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};
