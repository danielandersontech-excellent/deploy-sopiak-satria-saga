/**
 * OPERASIONAL CONTROLLER - Broadcasts, Serah Terima, Panic, Notifikasi
 * v15 - Enhanced with filtering, catatan_resolver
 * [Audit 2A] - Semua handler memakai e.status (sebelumnya selalu 500 —
 *              error validasi 400/403/404 dari service ikut menjadi 500 dan
 *              di produksi pesannya diganti "Internal server error").
 */
const opService = require('../services/operasional.service');
const fcm = require('../services/fcm.service');
const { logger } = require('../utils/logger');

function sendError(res, e) {
  const payload = { error: e && e.message ? e.message : 'Server error' };
  if (e && e.details) payload.details = e.details;
  res.status((e && e.status) || 500).json(payload);
}

// Broadcasts
exports.getBroadcasts = async (req, res) => {
  // P0-6: pass req.user so service applies lokasi scope.
  try { res.json(await opService.getBroadcasts(req.query, req.user)); }
  catch (e) { sendError(res, e); }
};
exports.createBroadcast = async (req, res) => {
  try {
    const result = await opService.createBroadcast(req.user, req.body);
    fcm.sendBroadcast(result.judul, result.pesan, result.target || 'all', result.prioritas || 'normal')
      .catch(err => logger.error(`[FCM] Broadcast push error: ${err && err.message ? err.message : err}`, { stack: err && err.stack }));
    res.status(201).json(result);
  }
  catch (e) { sendError(res, e); }
};

// Serah Terima
exports.getSerahTerima = async (req, res) => {
  // P0-6: pass req.user so service applies lokasi scope.
  try { res.json(await opService.getSerahTerima(req.query, req.user)); }
  catch (e) { sendError(res, e); }
};
exports.createSerahTerima = async (req, res) => {
  try { res.status(201).json(await opService.createSerahTerima(req.user, req.body)); }
  catch (e) { sendError(res, e); }
};

// Panic
exports.getPanics = async (req, res) => {
  // P0-6: pass req.user so service applies lokasi scope.
  try { res.json(await opService.getPanics(req.query, req.user)); }
  catch (e) { sendError(res, e); }
};
exports.createPanic = async (req, res) => {
  try {
    const result = await opService.createPanic(req.user, req.body);
    fcm.sendPanicAlert(req.user.nama, req.body.alamat, req.body.latitude, req.body.longitude)
      .catch(err => logger.error(`[FCM] Panic push error: ${err && err.message ? err.message : err}`, { stack: err && err.stack }));
    res.status(201).json(result);
  }
  catch (e) { sendError(res, e); }
};
exports.resolvePanic = async (req, res) => {
  try {
    const catatan = req.body.catatan_resolver || req.body.catatan || null;
    const status = req.body.status || 'resolved';
    res.json(await opService.resolvePanic(req.params.id, req.user, status, catatan));
  }
  catch (e) { sendError(res, e); }
};

// Notifikasi
exports.getNotifikasi = async (req, res) => {
  try { res.json(await opService.getNotifikasi(req.user)); }
  catch (e) { sendError(res, e); }
};
exports.createNotifikasi = async (req, res) => {
  try { res.status(201).json(await opService.createNotifikasi(req.user, req.body)); }
  catch (e) { sendError(res, e); }
};
exports.markRead = async (req, res) => {
  try { await opService.markRead(req.params.id, req.user); res.json({ message: 'OK' }); }
  catch (e) { sendError(res, e); }
};
exports.markAllRead = async (req, res) => {
  try { await opService.markAllRead(req.user); res.json({ message: 'OK' }); }
  catch (e) { sendError(res, e); }
};
