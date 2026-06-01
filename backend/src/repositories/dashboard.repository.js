/**
 * DASHBOARD REPOSITORY - Stats & analytics queries
 * v24 - FIXED: SQL injection vulnerability (was using string interpolation)
 *       Now uses parameterized queries ($1, $2, etc.) for all lokasi_id filters
 * v25 - P0-7: `lokasiIds` is null (no filter) or array (filter to these).
 *       Empty array is the deny-all sentinel (handled at the service
 *       layer before calling here, so this file just treats it like a
 *       normal array and produces zero rows via ANY of an empty array).
 *       The single-uuid signature is preserved through normalization
 *       so any internal caller still passing a string keeps working.
 */
const { queryOne, queryAll } = require('../config/database');

// Normalize the caller's argument into either {clause, params} pair
// that can be spliced into the query. Returns:
//   { clause: '',                params: [] }   ← unrestricted
//   { clause: ' AND <col> = ANY($1::uuid[])', params: [[...uuids]] }
function buildLokasiBits(lokasiArg, colExpr) {
  if (lokasiArg === null || lokasiArg === undefined) {
    return { clause: '', params: [] };
  }
  let ids;
  if (typeof lokasiArg === 'string' && lokasiArg) {
    ids = [lokasiArg];
  } else if (Array.isArray(lokasiArg)) {
    ids = lokasiArg;
  } else {
    return { clause: '', params: [] };
  }
  // ANY of an empty array is never true → produces zero rows, which
  // is exactly what we want for the deny-all sentinel. (We could
  // short-circuit to FALSE for clarity but ANY($1::uuid[]) with []
  // is correct and means the parameter binding stays uniform.)
  return {
    clause: ` AND ${colExpr} = ANY($1::uuid[])`,
    params: [ids],
  };
}

class DashboardRepository {
  async getStats(lokasiArg = null) {
    // Each sub-query uses its own JOIN/column reference, so we build
    // five tailored clauses. All five reuse the same single param
    // ($1) so the params array is shared across the parallel calls.
    const bUser = buildLokasiBits(lokasiArg, 'u.lokasi_id');
    const bDirect = buildLokasiBits(lokasiArg, 'lokasi_id');
    const bAbsensi = buildLokasiBits(lokasiArg, 'a.lokasi_id');
    const bLokasiId = buildLokasiBits(lokasiArg, 'id');

    const [personil, onDuty, absensiToday, pendingLH, pendingLK, activePatrol, activePanic, totalLokasi, totalCheckpoints] = await Promise.all([
      queryOne(`SELECT COUNT(*)::int as c FROM users u WHERE role IN ('anggota','komandan')${bUser.clause}`, bUser.params),
      queryOne(`SELECT COUNT(*)::int as c FROM users u WHERE status != 'off_duty' AND role IN ('anggota','komandan')${bUser.clause}`, bUser.params),
      queryOne(`SELECT COUNT(*)::int as c FROM absensi a WHERE DATE(a.created_at) = CURRENT_DATE${bAbsensi.clause}`, bAbsensi.params),
      queryOne(`SELECT COUNT(*)::int as c FROM laporan_harian WHERE status = 'pending'${bDirect.clause}`, bDirect.params),
      queryOne(`SELECT COUNT(*)::int as c FROM laporan_kejadian WHERE status = 'pending'${bDirect.clause}`, bDirect.params),
      queryOne(`SELECT COUNT(*)::int as c FROM patroli p LEFT JOIN users u ON p.user_id = u.id WHERE p.status = 'active'${bUser.clause}`, bUser.params),
      queryOne(`SELECT COUNT(*)::int as c FROM panic_alerts WHERE status = 'active'${bDirect.clause}`, bDirect.params),
      queryOne(`SELECT COUNT(*)::int as c FROM lokasi WHERE status = 'active'${bLokasiId.clause}`, bLokasiId.params),
      queryOne(`SELECT COUNT(*)::int as c FROM checkpoints WHERE status = 'active'${bDirect.clause}`, bDirect.params),
    ]);
    return {
      personil: personil.c, onDuty: onDuty.c, absensiToday: absensiToday.c,
      pendingLH: pendingLH.c, pendingLK: pendingLK.c, activePatrol: activePatrol.c, activePanic: activePanic.c,
      totalLokasi: totalLokasi.c, totalCheckpoints: totalCheckpoints.c,
      total_personil: personil.c, total: personil.c,
      on_duty: onDuty.c, absensi_today: absensiToday.c, absToday: absensiToday.c,
      pending_lh: pendingLH.c, pending_lk: pendingLK.c,
      pending_reports: pendingLH.c + pendingLK.c, pending: pendingLH.c + pendingLK.c,
      active_patrol: activePatrol.c, active_panic: activePanic.c, panic: activePanic.c,
      total_lokasi: totalLokasi.c, lokasi: totalLokasi.c, total_checkpoints: totalCheckpoints.c,
    };
  }

  async getWeeklyTrends(lokasiArg = null) {
    const bDirect = buildLokasiBits(lokasiArg, 'lokasi_id');
    const bUser = buildLokasiBits(lokasiArg, 'u.lokasi_id');
    const [absensi, patroli, laporan] = await Promise.all([
      queryAll(`SELECT DATE(created_at) as tanggal, COUNT(*)::int as jumlah FROM absensi WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'${bDirect.clause} GROUP BY DATE(created_at) ORDER BY tanggal`, bDirect.params),
      queryAll(`SELECT DATE(p.created_at) as tanggal, COUNT(*)::int as jumlah FROM patroli p LEFT JOIN users u ON p.user_id = u.id WHERE p.created_at >= CURRENT_DATE - INTERVAL '7 days'${bUser.clause} GROUP BY DATE(p.created_at) ORDER BY tanggal`, bUser.params),
      queryAll(`SELECT DATE(created_at) as tanggal, COUNT(*)::int as jumlah FROM laporan_harian WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'${bDirect.clause} GROUP BY DATE(created_at) ORDER BY tanggal`, bDirect.params),
    ]);
    return { absensi, patroli, laporan };
  }

  async getAbsensiBreakdown(lokasiArg = null) {
    const b = buildLokasiBits(lokasiArg, 'lokasi_id');
    return queryAll(
      `SELECT tipe, status, COUNT(*)::int as jumlah FROM absensi WHERE DATE(created_at) = CURRENT_DATE${b.clause} GROUP BY tipe, status`,
      b.params
    );
  }

  async getPatrolStats(lokasiArg = null) {
    const b = buildLokasiBits(lokasiArg, 'u.lokasi_id');
    return queryOne(
      `SELECT COUNT(*)::int as total, COUNT(CASE WHEN p.status = 'completed' THEN 1 END)::int as completed
       FROM patroli p LEFT JOIN users u ON p.user_id = u.id WHERE p.created_at >= CURRENT_DATE - INTERVAL '30 days'${b.clause}`,
      b.params
    );
  }

  async getTopPerformers(lokasiArg = null) {
    const b = buildLokasiBits(lokasiArg, 'lokasi_id');
    return queryAll(
      `SELECT id, nama, nrp, role, skor FROM users WHERE role IN ('anggota','komandan') AND skor > 0${b.clause} ORDER BY skor DESC LIMIT 5`,
      b.params
    );
  }

  async getRecentIncidents(lokasiArg = null) {
    const b = buildLokasiBits(lokasiArg, 'lk.lokasi_id');
    return queryAll(
      `SELECT lk.id, lk.jenis, lk.prioritas, lk.status, lk.created_at, u.nama
       FROM laporan_kejadian lk LEFT JOIN users u ON lk.user_id = u.id WHERE 1=1${b.clause} ORDER BY lk.created_at DESC LIMIT 5`,
      b.params
    );
  }
}

module.exports = new DashboardRepository();