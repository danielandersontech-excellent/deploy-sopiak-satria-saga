/**
 * USER CONTROLLER
 */
const userService = require('../services/user.service');

exports.getAll = async (req, res) => {
  try { res.json(await userService.getAll(req.query, req.user)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};

exports.getById = async (req, res) => {
  try { res.json(await userService.getById(req.params.id, req.user)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};

exports.update = async (req, res) => {
  try { res.json(await userService.update(req.params.id, req.user, req.body)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};

exports.delete = async (req, res) => {
  try { await userService.delete(req.params.id, req.user); res.json({ message: 'Deleted' }); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};

exports.updateLocation = async (req, res) => {
  try { res.json(await userService.updateLocation(req.user.id, req.body.latitude, req.body.longitude)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};

exports.updatePushToken = async (req, res) => {
  try { res.json(await userService.updatePushToken(req.user.id, req.body.token)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};
