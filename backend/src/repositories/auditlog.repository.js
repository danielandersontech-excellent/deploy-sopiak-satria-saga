/**
 * AUDIT LOG REPOSITORY
 */
const { queryAll } = require('../config/database');

class AuditlogRepository {
  async findAll(filters = {}) {
    let sql = 'SELECT * FROM audit_log WHERE 1=1';
    const params = [];
    if (filters.user_id) { params.push(filters.user_id); sql += ` AND user_id = $${params.length}`; }
    if (filters.action) { params.push(filters.action); sql += ` AND action = $${params.length}`; }
    if (filters.resource) { params.push(filters.resource); sql += ` AND resource = $${params.length}`; }
    if (filters.date_from) { params.push(filters.date_from); sql += ` AND created_at >= $${params.length}`; }
    if (filters.date_to) { params.push(filters.date_to); sql += ` AND created_at <= $${params.length}`; }
    sql += ' ORDER BY created_at DESC';
    params.push(parseInt(filters.limit) || 100);
    sql += ` LIMIT $${params.length}`;
    return queryAll(sql, params);
  }

  async getSummary() {
    return queryAll(`SELECT user_id, user_nama, action, COUNT(*)::int as count FROM audit_log
      WHERE created_at >= CURRENT_DATE - INTERVAL '7 days' GROUP BY user_id, user_nama, action ORDER BY count DESC`);
  }

  async findByUser(userId) {
    return queryAll('SELECT * FROM audit_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [userId]);
  }
}

module.exports = new AuditlogRepository();
