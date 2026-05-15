/**
 * SCOPE / DATA-ISOLATION HELPERS  (P0-6)
 *
 * Centralizes the per-user lokasi filter for every read path that
 * touched cross-tenant data before this fix (laporan, patroli, panic,
 * broadcast, serah terima, geofence violations/live-map, audit log,
 * dashboard stats). The rules:
 *
 *   admin, supervisor  → unrestricted (see all lokasi)
 *   komandan, anggota  → restricted to `user.lokasi_id`
 *   klien              → restricted to every lokasi.id where
 *                        lokasi.client_id = user.client_id
 *                        (a klien with multi-site contracts sees them all)
 *   anyone else / missing fields → restricted to []
 *                        (deny by default — fail closed, never fail open)
 *
 * The helper returns a normalized `scope` object. Service / controller
 * code calls `applyLokasiScope(filters, scope)` to inject the scope
 * into a repo `filters` object. Repos understand both shapes:
 *
 *   filters.lokasi_id   → single uuid (existing behaviour, unchanged)
 *   filters.lokasi_ids  → uuid[] or empty array (new)
 *                          - non-empty: AND col = ANY($N::uuid[])
 *                          - empty:     AND FALSE  (deny-all sentinel)
 *
 * Why support both: it keeps backward compatibility with code paths
 * that already passed lokasi_id directly, while still allowing the
 * klien multi-lokasi case to express itself without picking a
 * "primary" lokasi arbitrarily.
 *
 * Intersection rule: if a restricted user passes `?lokasi_id=X` in
 * the query and X is NOT in their allowed scope, the request must
 * not silently bypass the scope. applyLokasiScope intersects: if X
 * is in scope, keep it; if not, force lokasi_ids=[] (no results).
 */
const { queryAll } = require('../config/database');
const { logger } = require('./logger');

async function getScopeFilter(user) {
  // Fail-closed: missing or malformed user → no data.
  if (!user || !user.role) {
    return { unrestricted: false, lokasiIds: [] };
  }

  // Admin & supervisor: cross-tenant by design.
  if (user.role === 'admin' || user.role === 'supervisor') {
    return { unrestricted: true, lokasiIds: [] };
  }

  // Klien: scope is the set of lokasi rows linked to this client_id.
  // We accept client_id == null defensively (treat as deny) so a
  // klien JWT missing client_id can never see anything.
  if (user.role === 'klien') {
    if (user.client_id == null) {
      return { unrestricted: false, lokasiIds: [] };
    }
    let rows = [];
    try {
      rows = await queryAll(
        'SELECT id FROM lokasi WHERE client_id = $1',
        [user.client_id]
      );
    } catch (err) {
      // DB error → deny rather than fail-open. Caller should still
      // log; we just return an empty scope.
      logger.error(`[scope] klien lokasi lookup failed: ${err.message}`);
      return { unrestricted: false, lokasiIds: [] };
    }
    return { unrestricted: false, lokasiIds: rows.map((r) => r.id) };
  }

  // Anggota & komandan: their single assigned lokasi.
  if ((user.role === 'anggota' || user.role === 'komandan') && user.lokasi_id) {
    return { unrestricted: false, lokasiIds: [user.lokasi_id] };
  }

  // Any role we don't recognize, or a komandan/anggota without a
  // lokasi assignment — deny.
  return { unrestricted: false, lokasiIds: [] };
}

/**
 * Mutate `filters` in place so the repo sees the scope. Returns the
 * same filters object for chaining.
 *
 * Behaviour:
 *   - scope.unrestricted=true: do nothing. If the caller passed a
 *     filters.lokasi_id (admin/supervisor narrowing the view), keep it.
 *   - scope restricted, NO filters.lokasi_id: write the scope into
 *     filters as a single lokasi_id (1 element) or lokasi_ids (>1) or
 *     lokasi_ids=[] (0, deny).
 *   - scope restricted, HAS filters.lokasi_id: intersection check.
 *     If the requested lokasi_id is in scope → keep it as-is.
 *     If not → overwrite to lokasi_ids=[] (deny). The user does NOT
 *     get to widen their view by passing query params.
 */
function applyLokasiScope(filters, scope) {
  filters = filters || {};
  if (!scope || scope.unrestricted) return filters;

  const requested = filters.lokasi_id;
  if (requested) {
    const allowed = scope.lokasiIds.includes(requested);
    if (!allowed) {
      // Out-of-scope filter → deny entirely.
      delete filters.lokasi_id;
      filters.lokasi_ids = [];
    }
    // In-scope → keep filters.lokasi_id as-is.
    return filters;
  }

  // No requested filter: project the scope onto filters.
  if (scope.lokasiIds.length === 0) {
    filters.lokasi_ids = [];
  } else if (scope.lokasiIds.length === 1) {
    filters.lokasi_id = scope.lokasiIds[0];
  } else {
    filters.lokasi_ids = scope.lokasiIds.slice();
  }
  return filters;
}

/**
 * Convenience: get a normalized list of lokasi IDs the user is allowed
 * to see. Returns `null` for unrestricted (no filter), or an array
 * (possibly empty = deny). Useful for places like the dashboard that
 * want to fan a single value out into multiple repo queries.
 */
async function getAllowedLokasiIds(user) {
  const scope = await getScopeFilter(user);
  if (scope.unrestricted) return null;
  return scope.lokasiIds.slice();
}

module.exports = { getScopeFilter, applyLokasiScope, getAllowedLokasiIds };
