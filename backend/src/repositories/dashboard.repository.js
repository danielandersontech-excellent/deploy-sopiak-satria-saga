/**
 * DASHBOARD REPOSITORY - Stats & analytics queries
 * v24 - FIXED: SQL injection vulnerability (was using string interpolation)
 *       Now uses parameterized queries ($1, $2, etc.) for all lokasi_id filters
 */
const { queryOne, queryAll } = require('../config/database');

class DashboardRepository {
  async getStats(lokasiId = null) {
    const lokParams = lokasiId ? [lokasiId] : [];
    const lokFilterUser = lokasiId ? ' AND u.lokasi_id = $1' : '';
    const lokFilterDirect = lokasiId ? ' AND lokasi_id = $1' : '';
    const lokFilterAlias = (alias) => lokasiId ? ` AND ${alias}.lokasi_id = $1` : '';

    const [personil, onDuty, absensiToday, pendingLH, pendingLK, activePatrol, activePanic, totalLokasi, totalCheckpoints] = await Promise.all([
      queryOne(`SELECT COUNT(*)::int as c FROM users u WHERE role IN ('anggota','komandan')${lokFilterUser}`, lokParams),
      queryOne(`SELECT COUNT(*)::int as c FROM users u WHERE status != 'off_duty' AND role IN ('anggota','komandan')${lokFilterUser}`, lokParams),
      queryOne(`SELECT COUNT(*)::int as c FROM absensi a WHERE DATE(a.created_at) = CURRENT_DATE${lokasiId ? ' AND a.lokasi_id = $1' : ''}`, lokParams),
      queryOne(`SELECT COUNT(*)::int as c FROM laporan_harian WHERE status = 'pending'${lokFilterDirect}`, lokParams),
      queryOne(`SELECT COUNT(*)::int as c FROM laporan_kejadian WHERE status = 'pending'${lokFilterDirect}`, lokParams),
      queryOne(`SELECT COUNT(*)::int as c FROM patroli p LEFT JOIN users u ON p.user_id = u.id WHERE p.status = 'active'${lokFilterUser}`, lokParams),
      queryOne(`SELECT COUNT(*)::int as c FROM panic_alerts WHERE status = 'active'${lokFilterDirect}`, lokParams),
      queryOne(`SELECT COUNT(*)::int as c FROM lokasi WHERE status = 'active'${lokasiId ? ' AND id = $1' : ''}`, lokParams),
      queryOne(`SELECT COUNT(*)::int as c FROM checkpoints WHERE status = 'active'${lokFilterDirect}`, lokParams),
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

  async getWeeklyTrends(lokasiId = null) {
    const lokParams = lokasiId ? [lokasiId] : [];
    const [absensi, patroli, laporan] = await Promise.all([
      queryAll(`SELECT DATE(created_at) as tanggal, COUNT(*)::int as jumlah FROM absensi WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'${lokasiId ? ' AND lokasi_id = $1' : ''} GROUP BY DATE(created_at) ORDER BY tanggal`, lokParams),
      queryAll(`SELECT DATE(p.created_at) as tanggal, COUNT(*)::int as jumlah FROM patroli p LEFT JOIN users u ON p.user_id = u.id WHERE p.created_at >= CURRENT_DATE - INTERVAL '7 days'${lokasiId ? ' AND u.lokasi_id = $1' : ''} GROUP BY DATE(p.created_at) ORDER BY tanggal`, lokParams),
      queryAll(`SELECT DATE(created_at) as tanggal, COUNT(*)::int as jumlah FROM laporan_harian WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'${lokasiId ? ' AND lokasi_id = $1' : ''} GROUP BY DATE(created_at) ORDER BY tanggal`, lokParams),
    ]);
    return { absensi, patroli, laporan };
  }

  async getAbsensiBreakdown(lokasiId = null) {
    return queryAll(
      `SELECT tipe, status, COUNT(*)::int as jumlah FROM absensi WHERE DATE(created_at) = CURRENT_DATE${lokasiId ? ' AND lokasi_id = $1' : ''} GROUP BY tipe, status`,
      lokasiId ? [lokasiId] : []
    );
  }

  async getPatrolStats(lokasiId = null) {
    return queryOne(
      `SELECT COUNT(*)::int as total, COUNT(CASE WHEN p.status = 'completed' THEN 1 END)::int as completed
       FROM patroli p LEFT JOIN users u ON p.user_id = u.id WHERE p.created_at >= CURRENT_DATE - INTERVAL '30 days'${lokasiId ? ' AND u.lokasi_id = $1' : ''}`,
      lokasiId ? [lokasiId] : []
    );
  }

  async getTopPerformers(lokasiId = null) {
    return queryAll(
      `SELECT id, nama, nrp, role, skor FROM users WHERE role IN ('anggota','komandan') AND skor > 0${lokasiId ? ' AND lokasi_id = $1' : ''} ORDER BY skor DESC LIMIT 5`,
      lokasiId ? [lokasiId] : []
    );
  }

  async getRecentIncidents(lokasiId = null) {
    return queryAll(
      `SELECT lk.id, lk.jenis, lk.prioritas, lk.status, lk.created_at, u.nama
       FROM laporan_kejadian lk LEFT JOIN users u ON lk.user_id = u.id WHERE 1=1${lokasiId ? ' AND lk.lokasi_id = $1' : ''} ORDER BY lk.created_at DESC LIMIT 5`,
      lokasiId ? [lokasiId] : []
    );
  }
}

module.exports = new DashboardRepository();
