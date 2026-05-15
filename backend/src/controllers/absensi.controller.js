/**
 * ABSENSI CONTROLLER - with Watermark + Google Drive CDN
 *
 * AUDIT FIX (P1-17): applyWatermark() now returns the FINAL on-disk
 * path. If the upload was .png/.webp/.gif, the file gets renamed to
 * .jpg after watermark conversion. We assign the return value back
 * into req.file.path so getFileUrl() below picks up the new name.
 * The `|| req.file.path` fallback is a safety net for the lenient-mode
 * case where watermark was skipped — the function still returns the
 * original path, but in case any future caller returns null/undefined
 * we don't NaN-out the URL.
 *
 * NOTE: `const { logger } = require('../utils/logger')` is moved to
 * the top of the file (module scope) — having it inside the try/catch
 * meant a parse-time `const` declaration inside the same block as the
 * code that uses it, which works in Node but is bad form. Same module
 * is loaded once either way.
 */
const absensiService = require('../services/absensi.service');
const { getFileUrl } = require('../middleware/upload');
const { logger } = require('../utils/logger');

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
        // AUDIT FIX (P1-17): use the returned path. If extension was
        // renamed from .png/.webp/.gif to .jpg, req.file.path now
        // points to the renamed file.
        req.file.path = (await applyWatermark(req.file.path, watermarkInfo)) || req.file.path;
      } catch (wmErr) {
        logger.info(`[Absensi] Watermark skipped: ${wmErr.message}`);
      }

      // Step 2: Upload to Google Drive (if enabled) or use local URL
      fotoUrl = getFileUrl(req.file.path);
    }

    res.status(201).json(await absensiService.create(req.user, req.body, fotoUrl));
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};
