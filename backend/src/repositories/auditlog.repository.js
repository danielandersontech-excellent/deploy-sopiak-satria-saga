/**
 * AUDIT LOG REPOSITORY
 *
 * P0-6 (Tahap 4): audit_log has no lokasi_id of its own. To scope by
 * lokasi we LEFT JOIN users on al.user_id and filter on u.lokasi_id.
 * NULL user_id rows (system actions) drop out for restricted viewers,
 * which is the desired behaviour — komandan / klien shouldn't see
 * cross-tenant system events.
 */
const { queryAll } = require('../config/database');

function buildLokasiClause(filters, colRef, params) {
  if (filters.lokasi_id) {
    params.push(filters.lokasi_id);
    return ` AND ${colRef} = $${params.length}`;
  }
  if (Array.isArray(filters.lokasi_ids)) {
    if (filters.lokasi_ids.length === 0) return ' AND FALSE';
    params.push(filters.lokasi_ids);
    return ` AND ${colRef} = ANY($${params.length}::uuid[])`;
  }
  return '';
}

class AuditlogRepository {
  async findAll(filters = {}) {
    // Always LEFT JOIN users — even when no scope is applied, the
    // join is cheap (single key) and lets us return user.lokasi_id
    // for downstream UIs that want to render a "lokasi" column.
    let sql = `SELECT al.*, u.lokasi_id AS actor_lokasi_id
               FROM audit_log al
               LEFT JOIN users u ON al.user_id = u.id
               WHERE 1=1`;
    const params = [];
    if (filters.user_id) { params.push(filters.user_id); sql += ` AND al.user_id = $${params.length}`; }
    if (filters.action) { params.push(filters.action); sql += ` AND al.action = $${params.length}`; }
    if (filters.resource) { params.push(filters.resource); sql += ` AND al.resource = $${params.length}`; }
    if (filters.date_from) { params.push(filters.date_from); sql += ` AND al.created_at >= $${params.length}`; }
    if (filters.date_to) { params.push(filters.date_to); sql += ` AND al.created_at <= $${params.length}`; }
    sql += buildLokasiClause(filters, 'u.lokasi_id', params);
    sql += ' ORDER BY al.created_at DESC';
    params.push(parseInt(filters.limit) || 100);
    sql += ` LIMIT $${params.length}`;
    return queryAll(sql, params);
  }

  async getSummary(scope) {
    // scope param: from utils/scope.getScopeFilter. Unrestricted →
    // original cross-tenant aggregate. Restricted → JOIN users and
    // filter; empty-scope → return [] without hitting the DB.
    if (scope && !scope.unrestricted) {
      if (scope.lokasiIds.length === 0) return [];
      return queryAll(
        `SELECT al.user_id, al.user_nama, al.action, COUNT(*)::int as count
         FROM audit_log al
         JOIN users u ON al.user_id = u.id
         WHERE al.created_at >= CURRENT_DATE - INTERVAL '7 days'
           AND u.lokasi_id = ANY($1::uuid[])
         GROUP BY al.user_id, al.user_nama, al.action
         ORDER BY count DESC`,
        [scope.lokasiIds]
      );
    }
    return queryAll(`SELECT user_id, user_nama, action, COUNT(*)::int as count FROM audit_log
      WHERE created_at >= CURRENT_DATE - INTERVAL '7 days' GROUP BY user_id, user_nama, action ORDER BY count DESC`);
  }

  async findByUser(userId) {
    // The service layer (auditlog.service.js#getByUser) has already
    // verified that this userId is within the viewer's scope, so we
    // can do the plain lookup here.
    return queryAll('SELECT * FROM audit_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [userId]);
  }
}

module.exports = new AuditlogRepository();
