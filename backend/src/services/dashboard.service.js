/**
 * DASHBOARD SERVICE
 * v23 - Supports lokasi_id filter for role-based stats
 * v24 - P0-7: `lokasiIds` is now null / array (not a single uuid). The
 *       repository understands all three forms; the service just
 *       passes through. Empty array means deny-all and the repo
 *       short-circuits the heavy parallel SELECTs into zero counts.
 */
const dashRepo = require('../repositories/dashboard.repository');

// Helper: empty-array (deny-all) → all-zero response shape that
// matches what the repo would otherwise return. Avoids 6 round-trips
// to the DB just to read zeros.
function emptyStats() {
  return {
    personil: 0, onDuty: 0, absensiToday: 0,
    pendingLH: 0, pendingLK: 0, activePatrol: 0, activePanic: 0,
    totalLokasi: 0, totalCheckpoints: 0,
    total_personil: 0, total: 0,
    on_duty: 0, absensi_today: 0, absToday: 0,
    pending_lh: 0, pending_lk: 0,
    pending_reports: 0, pending: 0,
    active_patrol: 0, active_panic: 0, panic: 0,
    total_lokasi: 0, lokasi: 0, total_checkpoints: 0,
  };
}

class DashboardService {
  /** [Audit 2A/2B] Agregat halaman Analytics (lihat dashboard.repository). */
  async getAnalytics(lokasiIds = null, days = 30) {
    if (Array.isArray(lokasiIds) && lokasiIds.length === 0) {
      return {
        periode_hari: days, absensi: { masuk: 0, hadir: 0, terlambat: 0, tidak_hadir: 0, luar_radius: 0 },
        absensi_mingguan: [], laporan_harian: { total: 0 }, laporan_kejadian: { total: 0, kritis: 0 },
        patroli: { total: 0 }, patroli_mingguan: [], distribusi_role: [], top_performers: [],
      };
    }
    return dashRepo.getAnalytics(lokasiIds, days);
  }

  async getStats(lokasiIds = null) {
    // Deny-all shortcut.
    if (Array.isArray(lokasiIds) && lokasiIds.length === 0) {
      const stats = emptyStats();
      return {
        total_personil: 0, on_duty: 0, absensi_today: 0,
        pending_laporan: 0, active_patroli: 0, active_panic: 0,
        total_lokasi: 0, total_checkpoints: 0,
        kontrak_habis: 0, kontrak_hampir_habis: 0, pending_lama: 0,
        weekly_absensi: [], weekly_patroli: [], weekly_laporan: [],
        absensi_breakdown: [],
        patrol_completion: { total: 0, completed: 0, rate: 0 },
        top_performers: [], recent_incidents: [],
      };
    }

    const [stats, trends, breakdown, patrolStats, topPerformers, recentIncidents] = await Promise.all([
      dashRepo.getStats(lokasiIds), dashRepo.getWeeklyTrends(lokasiIds), dashRepo.getAbsensiBreakdown(lokasiIds),
      dashRepo.getPatrolStats(lokasiIds), dashRepo.getTopPerformers(lokasiIds), dashRepo.getRecentIncidents(lokasiIds),
    ]);
    return {
      total_personil: stats.personil, on_duty: stats.onDuty, absensi_today: stats.absensiToday,
      pending_laporan: stats.pendingLH + stats.pendingLK, active_patroli: stats.activePatrol,
      active_panic: stats.activePanic, total_lokasi: stats.totalLokasi, total_checkpoints: stats.totalCheckpoints,
      // [Misi V3 / C1-C2] kartu peringatan dashboard
      kontrak_habis: stats.kontrak_habis || 0, kontrak_hampir_habis: stats.kontrak_hampir_habis || 0, pending_lama: stats.pending_lama || 0,
      weekly_absensi: trends.absensi, weekly_patroli: trends.patroli, weekly_laporan: trends.laporan,
      absensi_breakdown: breakdown,
      patrol_completion: {
        total: patrolStats.total, completed: patrolStats.completed,
        rate: patrolStats.total > 0 ? Math.round((patrolStats.completed / patrolStats.total) * 100) : 0,
      },
      top_performers: topPerformers, recent_incidents: recentIncidents,
    };
  }
}

module.exports = new DashboardService();