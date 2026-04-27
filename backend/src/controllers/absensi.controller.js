/**
 * ABSENSI CONTROLLER - with Watermark + Google Drive CDN
 */
const absensiService = require('../services/absensi.service');
const { getFileUrl } = require('../middleware/upload');

exports.getAll = async (req, res) => {
  try { res.json(await absensiService.getAll(req.query, req.user)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};

exports.getToday = async (req, res) => {
  try { res.json(await absensiService.getToday()); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};

exports.create = async (req, res) => {
  try {
    let fotoUrl = null;

    if (req.file) {
      // Step 1: Apply watermark to the uploaded photo
      try {
        const { applyWatermark } = require('../services/watermark.service');
        const watermarkInfo = {
          nama: req.user.nama || 'Unknown',
          nrp: req.user.nrp || '-',
          latitude: req.body.latitude,
          longitude: req.body.longitude,
          lokasi: req.body.pos_jaga || req.body.alamat || '',
          customText: req.body.tipe === 'masuk' ? 'ABSENSI MASUK' : 'ABSENSI KELUAR',
        };
        await applyWatermark(req.file.path, watermarkInfo);
      } catch (wmErr) {
        console.log('[Absensi] Watermark skipped:', wmErr.message);
      }

      // Step 2: Upload to Google Drive (if enabled) or use local URL
      fotoUrl = getFileUrl(req.file.path);
    }

    res.status(201).json(await absensiService.create(req.user, req.body, fotoUrl));
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};
