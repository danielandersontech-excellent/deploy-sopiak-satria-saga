/**
 * OPERASIONAL CONTROLLER - Broadcasts, Serah Terima, Panic, Notifikasi
 * v15 - Enhanced with filtering, catatan_resolver
 */
const opService = require('../services/operasional.service');
const fcm = require('../services/fcm.service');

// Broadcasts
exports.getBroadcasts = async (req, res) => {
  try { res.json(await opService.getBroadcasts(req.query)); }
  catch (e) { res.status(500).json({ error: e.message }); }
};
exports.createBroadcast = async (req, res) => {
  try {
    const result = await opService.createBroadcast(req.user, req.body);
    fcm.sendBroadcast(req.body.judul, req.body.pesan, req.body.target || 'all', req.body.prioritas || 'normal')
      .catch(err => console.error('[FCM] Broadcast push error:', err));
    res.status(201).json(result);
  }
  catch (e) { res.status(500).json({ error: e.message }); }
};

// Serah Terima
exports.getSerahTerima = async (req, res) => {
  try { res.json(await opService.getSerahTerima(req.query)); }
  catch (e) { res.status(500).json({ error: e.message }); }
};
exports.createSerahTerima = async (req, res) => {
  try { res.status(201).json(await opService.createSerahTerima(req.user, req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
};

// Panic
exports.getPanics = async (req, res) => {
  try { res.json(await opService.getPanics(req.query)); }
  catch (e) { res.status(500).json({ error: e.message }); }
};
exports.createPanic = async (req, res) => {
  try {
    const result = await opService.createPanic(req.user, req.body);
    fcm.sendPanicAlert(req.user.nama, req.body.alamat, req.body.latitude, req.body.longitude)
      .catch(err => console.error('[FCM] Panic push error:', err));
    res.status(201).json(result);
  }
  catch (e) { res.status(500).json({ error: e.message }); }
};
exports.resolvePanic = async (req, res) => {
  try {
    const catatan = req.body.catatan_resolver || req.body.catatan || null;
    const status = req.body.status || 'resolved';
    res.json(await opService.resolvePanic(req.params.id, req.user, status, catatan));
  }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};

// Notifikasi
exports.getNotifikasi = async (req, res) => {
  try { res.json(await opService.getNotifikasi(req.user)); }
  catch (e) { res.status(500).json({ error: e.message }); }
};
exports.createNotifikasi = async (req, res) => {
  try { res.status(201).json(await opService.createNotifikasi(req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
};
exports.markRead = async (req, res) => {
  try { await opService.markRead(req.params.id); res.json({ message: 'OK' }); }
  catch (e) { res.status(500).json({ error: e.message }); }
};
exports.markAllRead = async (req, res) => {
  try { await opService.markAllRead(req.user); res.json({ message: 'OK' }); }
  catch (e) { res.status(500).json({ error: e.message }); }
};
