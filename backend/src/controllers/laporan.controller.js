/**
 * LAPORAN CONTROLLER + FCM Push Notifications + Watermark + Google Drive CDN
 *
 * AUDIT FIX (P1-17): applyWatermark() now returns the final on-disk
 * path. processPhotos() mutates f.path so getFileUrl() resolves the
 * renamed file (.png -> .jpg etc.) instead of a stale name.
 *
 * AUDIT FIX (latent bug): the previous file declared
 *   const { logger } = require('../utils/logger');
 * INSIDE the try block of processPhotos(). That const is block-scoped,
 * so the four `logger.error(...)` calls in createHarian / validateHarian
 * / createKejadian / validateKejadian (outside that block) would have
 * thrown ReferenceError the first time an FCM push promise rejected —
 * silently making those error handlers a *new* source of crashes. Moved
 * to module scope so every function in this file shares the same logger.
 */
const laporanService = require('../services/laporan.service');
const { getFileUrl } = require('../middleware/upload');
const fcm = require('../services/fcm.service');
const { logger } = require('../utils/logger');

/**
 * Helper: Apply watermark + upload to Drive for multiple files
 *
 * f.path is MUTATED in place when applyWatermark renames the file
 * (e.g. .png → .jpg after JPEG re-encoding). This way, getFileUrl()
 * below — and any downstream code that reads f.path — always sees
 * the actual on-disk filename.
 */
async function processPhotos(files, user, customText) {
  if (!files || !files.length) return [];

  const urls = [];
  for (const f of files) {
    // Apply watermark
    try {
      const { applyWatermark } = require('../services/watermark.service');
      // AUDIT FIX (P1-17): capture the returned path so a rename to
      // .jpg is reflected in the URL we hand to the service layer.
      f.path = (await applyWatermark(f.path, {
        nama: user.nama || 'Unknown',
        nrp: user.nrp || '-',
        customText: customText || 'LAPORAN',
      })) || f.path;
    } catch (wmErr) {
      logger.info(`[Laporan] Watermark skipped: ${wmErr.message}`);
    }

    // Upload to Drive or local
    const url = getFileUrl(f.path);
    urls.push(url);
  }
  return urls;
}

exports.getHarian = async (req, res) => {
  try { res.json(await laporanService.getHarian(req.query, req.user)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};

exports.createHarian = async (req, res) => {
  try {
    let fotos;
    if (req.files && req.files.length > 0) {
      fotos = await processPhotos(req.files, req.user, 'LAPORAN HARIAN');
    } else {
      fotos = req.body.foto_urls ? JSON.parse(req.body.foto_urls) : [];
    }
    const result = await laporanService.createHarian(req.user, req.body, fotos);
    fcm.sendLaporanNotif(req.user.nama, 'Harian', req.body.kondisi || 'aman')
      .catch(err => logger.error(`[FCM] Laporan harian push error: ${err && err.message ? err.message : err}`, { stack: err && err.stack }));
    res.status(201).json(result);
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};

exports.validateHarian = async (req, res) => {
  try {
    const result = await laporanService.validateHarian(req.params.id, req.user, req.body);
    if (result && result.user_id) {
      const isApproved = req.body.status === 'approved';
      fcm.sendLaporanValidation(result.user_id, isApproved, 'Laporan Harian', req.body.catatan)
        .catch(err => logger.error(`[FCM] Validation push error: ${err && err.message ? err.message : err}`, { stack: err && err.stack }));
    }
    res.json(result);
  }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};

exports.getKejadian = async (req, res) => {
  try { res.json(await laporanService.getKejadian(req.query, req.user)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};

exports.createKejadian = async (req, res) => {
  try {
    let bukti;
    if (req.files && req.files.length > 0) {
      bukti = await processPhotos(req.files, req.user, 'LAPORAN KEJADIAN');
    } else {
      bukti = req.body.foto_urls ? JSON.parse(req.body.foto_urls) : [];
    }
    const result = await laporanService.createKejadian(req.user, req.body, bukti);
    fcm.sendLaporanNotif(req.user.nama, req.body.jenis || 'Kejadian', req.body.prioritas || 'sedang')
      .catch(err => logger.error(`[FCM] Laporan kejadian push error: ${err && err.message ? err.message : err}`, { stack: err && err.stack }));
    res.status(201).json(result);
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};

exports.validateKejadian = async (req, res) => {
  try {
    const result = await laporanService.validateKejadian(req.params.id, req.user, req.body);
    if (result && result.user_id) {
      const isApproved = req.body.status === 'approved';
      fcm.sendLaporanValidation(result.user_id, isApproved, 'Laporan Kejadian', req.body.catatan)
        .catch(err => logger.error(`[FCM] Validation push error: ${err && err.message ? err.message : err}`, { stack: err && err.stack }));
    }
    res.json(result);
  }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};