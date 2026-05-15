/**
 * DASHBOARD CONTROLLER - v23 - Passes lokasi_id for role-based stats
 *
 * P0-7 (Tahap 4): the request's `?lokasi_id=` query param is no longer
 * an authoritative source for which lokasi to count over. Before this
 * fix, ANY authenticated user could pass `?lokasi_id=<uuid>` and the
 * dashboard would dutifully aggregate stats for that lokasi —
 * including klien JWTs reading another klien's numbers. The lokasi
 * scope is now resolved server-side from req.user, exactly the same
 * way as P0-6 reads (see utils/scope.js). Admin / supervisor remain
 * able to narrow the view via the query param because they're
 * trusted to pass any lokasi.
 */
const dashService = require('../services/dashboard.service');
const { getScopeFilter } = require('../utils/scope');
const { logger } = require('../utils/logger');

exports.getStats = async (req, res) => {
  try {
    const scope = await getScopeFilter(req.user);

    // Resolve to one of:
    //   null       → no filter, count over everything
    //   []         → deny-all, count zero (well-shaped response below)
    //   [uuid,...] → filter to these lokasi
    let lokasiIds;

    if (scope.unrestricted) {
      // Admin / supervisor: trust the query param if given.
      lokasiIds = req.query.lokasi_id ? [req.query.lokasi_id] : null;
    } else {
      // Restricted role. If the caller also passed ?lokasi_id=, only
      // honor it when it's already inside their scope — otherwise
      // ignore it. (We don't 403; we just don't let them widen the
      // view. Same intersection rule as utils/scope.applyLokasiScope.)
      const requested = req.query.lokasi_id;
      if (requested && scope.lokasiIds.includes(requested)) {
        lokasiIds = [requested];
      } else {
        lokasiIds = scope.lokasiIds.slice(); // may be empty
      }
    }

    const stats = await dashService.getStats(lokasiIds);
    res.json(stats);
  } catch (e) {
    logger.error(`[Dashboard] Error: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
};
