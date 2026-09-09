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

    // [Misi V3 / C1-C2] peringatan dashboard: kontrak klien habis / ≤30 hari
    // (hanya tampilan tak ter-scope lokasi = admin/supervisor) dan laporan
    // pending > 30 hari (ter-scope). Tidak mengubah data apa pun.
    const unrestricted = lokasiArg == null;
    const [personil, onDuty, absensiToday, pendingLH, pendingLK, activePatrol, activePanic, totalLokasi, totalCheckpoints, kontrak, pendingLama] = await Promise.all([
      queryOne(`SELECT COUNT(*)::int as c FROM users u WHERE role IN ('anggota','komandan')${bUser.clause}`, bUser.params),
      queryOne(`SELECT COUNT(*)::int as c FROM users u WHERE status != 'off_duty' AND role IN ('anggota','komandan')${bUser.clause}`, bUser.params),
      queryOne(`SELECT COUNT(*)::int as c FROM absensi a WHERE DATE(a.created_at) = CURRENT_DATE${bAbsensi.clause}`, bAbsensi.params),
      queryOne(`SELECT COUNT(*)::int as c FROM laporan_harian WHERE status = 'pending'${bDirect.clause}`, bDirect.params),
      queryOne(`SELECT COUNT(*)::int as c FROM laporan_kejadian WHERE status = 'pending'${bDirect.clause}`, bDirect.params),
      queryOne(`SELECT COUNT(*)::int as c FROM patroli p LEFT JOIN users u ON p.user_id = u.id WHERE p.status = 'active'${bUser.clause}`, bUser.params),
      queryOne(`SELECT COUNT(*)::int as c FROM panic_alerts WHERE status = 'active'${bDirect.clause}`, bDirect.params),
      queryOne(`SELECT COUNT(*)::int as c FROM lokasi WHERE status = 'active'${bLokasiId.clause}`, bLokasiId.params),
      queryOne(`SELECT COUNT(*)::int as c FROM checkpoints WHERE status = 'active'${bDirect.clause}`, bDirect.params),
      unrestricted
        ? queryOne(`SELECT COUNT(*) FILTER (WHERE tgl_habis_kontrak < CURRENT_DATE)::int AS habis,
                           COUNT(*) FILTER (WHERE tgl_habis_kontrak >= CURRENT_DATE AND tgl_habis_kontrak <= CURRENT_DATE + 30)::int AS hampir
                      FROM clients WHERE status_klien = 'Aktif' AND tgl_habis_kontrak IS NOT NULL`)
        : Promise.resolve({ habis: 0, hampir: 0 }),
      queryOne(`SELECT (SELECT COUNT(*) FROM laporan_harian WHERE status = 'pending' AND created_at < NOW() - INTERVAL '30 days'${bDirect.clause})::int
                     + (SELECT COUNT(*) FROM laporan_kejadian WHERE status = 'pending' AND created_at < NOW() - INTERVAL '30 days'${bDirect.clause})::int AS c`, bDirect.params),
    ]);
    return {
      kontrak_habis: kontrak.habis, kontrak_hampir_habis: kontrak.hampir, pending_lama: pendingLama.c,
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

  /**
   * [Audit 2A/2B] Agregat untuk halaman Analytics web-admin. Sebelumnya
   * halaman menghitung dari 20 baris pertama /api/absensi & /api/laporan
   * (pagination default) → persentase kehadiran, status laporan, dan grafik
   * mingguan salah. Semua dihitung di DB dengan scope lokasi yang sama.
   * Tanggal dikelompokkan dalam zona waktu server (TZ=Asia/Jakarta).
   */
  async getAnalytics(lokasiArg = null, days = 30) {
    const bUser = buildLokasiBits(lokasiArg, 'u.lokasi_id');
    const d = Math.max(7, Math.min(365, parseInt(days, 10) || 30));
    const p = (bits, extra) => [...bits.params, ...extra];
    const n = (bits) => bits.params.length; // jumlah param scope (0/1) → offset placeholder

    const [absStatus, absWeekly, lapH, lapK, patStatus, patWeekly, roles, top] = await Promise.all([
      queryOne(`SELECT COUNT(*) FILTER (WHERE a.tipe='masuk')::int AS masuk,
                       COUNT(*) FILTER (WHERE a.tipe='masuk' AND a.status='hadir')::int AS hadir,
                       COUNT(*) FILTER (WHERE a.tipe='masuk' AND a.status='terlambat')::int AS terlambat,
                       COUNT(*) FILTER (WHERE a.tipe='masuk' AND a.status='tidak_hadir')::int AS tidak_hadir,
                       COUNT(*) FILTER (WHERE a.dalam_radius = FALSE)::int AS luar_radius
                  FROM absensi a LEFT JOIN users u ON u.id = a.user_id
                 WHERE a.created_at >= CURRENT_DATE - ($${n(bUser) + 1} || ' days')::interval${bUser.clause}`, p(bUser, [String(d)])),
      queryAll(`SELECT to_char(DATE(a.created_at), 'YYYY-MM-DD') AS tanggal,
                       COUNT(*) FILTER (WHERE a.status='hadir')::int AS hadir,
                       COUNT(*) FILTER (WHERE a.status='terlambat')::int AS terlambat,
                       COUNT(*) FILTER (WHERE a.status='tidak_hadir')::int AS tidak_hadir
                  FROM absensi a LEFT JOIN users u ON u.id = a.user_id
                 WHERE a.tipe = 'masuk' AND a.created_at >= CURRENT_DATE - INTERVAL '6 days'${bUser.clause}
                 GROUP BY DATE(a.created_at) ORDER BY DATE(a.created_at)`, bUser.params),
      queryAll(`SELECT lh.status, COUNT(*)::int AS jumlah FROM laporan_harian lh LEFT JOIN users u ON u.id = lh.user_id
                 WHERE lh.created_at >= CURRENT_DATE - ($${n(bUser) + 1} || ' days')::interval${bUser.clause} GROUP BY lh.status`, p(bUser, [String(d)])),
      queryAll(`SELECT lk.status, lk.prioritas, COUNT(*)::int AS jumlah FROM laporan_kejadian lk LEFT JOIN users u ON u.id = lk.user_id
                 WHERE lk.created_at >= CURRENT_DATE - ($${n(bUser) + 1} || ' days')::interval${bUser.clause} GROUP BY lk.status, lk.prioritas`, p(bUser, [String(d)])),
      queryAll(`SELECT pt.status, COUNT(*)::int AS jumlah FROM patroli pt LEFT JOIN users u ON u.id = pt.user_id
                 WHERE pt.created_at >= CURRENT_DATE - ($${n(bUser) + 1} || ' days')::interval${bUser.clause} GROUP BY pt.status`, p(bUser, [String(d)])),
      queryAll(`SELECT to_char(DATE(pt.created_at), 'YYYY-MM-DD') AS tanggal,
                       COUNT(*) FILTER (WHERE pt.status='completed')::int AS selesai,
                       COUNT(*) FILTER (WHERE pt.status<>'completed')::int AS berlangsung
                  FROM patroli pt LEFT JOIN users u ON u.id = pt.user_id
                 WHERE pt.created_at >= CURRENT_DATE - INTERVAL '6 days'${bUser.clause}
                 GROUP BY DATE(pt.created_at) ORDER BY DATE(pt.created_at)`, bUser.params),
      queryAll(`SELECT u.role, COUNT(*)::int AS jumlah FROM users u WHERE u.status_penempatan <> 'nonaktif'${bUser.clause} GROUP BY u.role`, bUser.params),
      queryAll(`SELECT u.id, u.nama, u.nrp, u.role, u.shift, u.skor, u.foto_url FROM users u
                 WHERE u.role IN ('anggota','komandan') AND u.status_penempatan <> 'nonaktif'${bUser.clause}
                 ORDER BY u.skor DESC NULLS LAST, u.nama LIMIT 10`, bUser.params),
    ]);

    const lapHarian = { total: 0 }; for (const r of lapH) { lapHarian[r.status] = r.jumlah; lapHarian.total += r.jumlah; }
    const lapKejadian = { total: 0, kritis: 0 }; for (const r of lapK) { lapKejadian[r.status] = (lapKejadian[r.status] || 0) + r.jumlah; lapKejadian.total += r.jumlah; if (r.prioritas === 'kritis') lapKejadian.kritis += r.jumlah; }
    const patrol = { total: 0 }; for (const r of patStatus) { patrol[r.status] = r.jumlah; patrol.total += r.jumlah; }
    return {
      periode_hari: d,
      absensi: absStatus || { masuk: 0, hadir: 0, terlambat: 0, tidak_hadir: 0, luar_radius: 0 },
      absensi_mingguan: absWeekly,
      laporan_harian: lapHarian,
      laporan_kejadian: lapKejadian,
      patroli: patrol,
      patroli_mingguan: patWeekly,
      distribusi_role: roles,
      top_performers: top,
    };
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