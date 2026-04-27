/**
 * DASHBOARD CONTROLLER - v23 - Passes lokasi_id for role-based stats
 */
const dashService = require('../services/dashboard.service');

exports.getStats = async (req, res) => {
  try {
    // Pass lokasi_id from query or from user's own lokasi (for komandan/klien)
    const lokasiId = req.query.lokasi_id || null;
    const stats = await dashService.getStats(lokasiId);
    res.json(stats);
  } catch (e) {
    console.error('[Dashboard] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
};
