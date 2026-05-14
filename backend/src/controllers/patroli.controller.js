/**
 * PATROLI CONTROLLER - with Watermark + Google Drive CDN
 */
const patroliService = require('../services/patroli.service');
const { getFileUrl } = require('../middleware/upload');

exports.getAll = async (req, res) => {
  // P0-6: pass req.user so the service can apply lokasi scope.
  try { res.json(await patroliService.getAll(req.query, req.user)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};

exports.getById = async (req, res) => {
  try { res.json(await patroliService.getById(req.params.id)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};

exports.start = async (req, res) => {
  try { res.status(201).json(await patroliService.start(req.user, req.body)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};

exports.scan = async (req, res) => {
  try {
    let fotoUrl = req.body.foto_url || null;

    if (req.file) {
      // Step 1: Apply watermark
      try {
        const { applyWatermark } = require('../services/watermark.service');
        await applyWatermark(req.file.path, {
          nama: req.user.nama || 'Unknown',
          nrp: req.user.nrp || '-',
          customText: 'PATROLI CHECKPOINT',
        });
      } catch (wmErr) {
        console.log('[Patroli] Watermark skipped:', wmErr.message);
      }

      // Step 2: Upload to Google Drive or local
      fotoUrl = getFileUrl(req.file.path);
    }

    res.status(201).json(await patroliService.scan(req.user, req.params.id, req.body.checkpoint_id, fotoUrl));
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};

exports.end = async (req, res) => {
  try { res.json(await patroliService.end(req.user, req.params.id, req.body)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};
