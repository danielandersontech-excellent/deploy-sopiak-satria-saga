/**
 * DASHBOARD SERVICE - v23 - Supports lokasi_id filter for role-based stats
 */
const dashRepo = require('../repositories/dashboard.repository');

class DashboardService {
  async getStats(lokasiId = null) {
    const [stats, trends, breakdown, patrolStats, topPerformers, recentIncidents] = await Promise.all([
      dashRepo.getStats(lokasiId), dashRepo.getWeeklyTrends(lokasiId), dashRepo.getAbsensiBreakdown(lokasiId),
      dashRepo.getPatrolStats(lokasiId), dashRepo.getTopPerformers(lokasiId), dashRepo.getRecentIncidents(lokasiId),
    ]);
    return {
      total_personil: stats.personil, on_duty: stats.onDuty, absensi_today: stats.absensiToday,
      pending_laporan: stats.pendingLH + stats.pendingLK, active_patroli: stats.activePatrol,
      active_panic: stats.activePanic, total_lokasi: stats.totalLokasi, total_checkpoints: stats.totalCheckpoints,
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
