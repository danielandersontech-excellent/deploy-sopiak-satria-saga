/**
 * AUDIT LOG SERVICE
 *
 * P0-6 (Tahap 4): all three read methods now scope by viewer's
 * lokasi. The audit_log table has no lokasi_id of its own, so the
 * filter goes through the joined users table (the user who
 * performed the audited action). Side effect: rows with
 * user_id IS NULL (system actions) are only visible to admin /
 * supervisor — restricted viewers don't get cross-cutting events.
 *
 * getByUser is additionally guarded: a komandan should not be able
 * to dump audit entries for a user outside their lokasi, even if
 * they guess the userId.
 */
const auditRepo = require('../repositories/auditlog.repository');
const { queryOne } = require('../config/database');
const { getScopeFilter, applyLokasiScope } = require('../utils/scope');

class AuditlogService {
  async getAll(filters, user) {
    const scope = await getScopeFilter(user);
    applyLokasiScope(filters, scope);
    return auditRepo.findAll(filters);
  }

  async getSummary(user) {
    const scope = await getScopeFilter(user);
    return auditRepo.getSummary(scope);
  }

  async getByUser(userId, viewer) {
    const scope = await getScopeFilter(viewer);
    if (!scope.unrestricted) {
      // Check the target user is in the viewer's lokasi scope before
      // returning their audit history.
      const target = await queryOne(
        'SELECT lokasi_id FROM users WHERE id = $1',
        [userId]
      );
      if (!target || !target.lokasi_id || !scope.lokasiIds.includes(target.lokasi_id)) {
        throw { status: 403, message: 'Akses ditolak. User di luar scope.' };
      }
    }
    return auditRepo.findByUser(userId);
  }
}

module.exports = new AuditlogService();
