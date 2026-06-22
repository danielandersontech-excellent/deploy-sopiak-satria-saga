/**
 * PATROLI REPOSITORY
 *
 * P0-6 (Tahap 4): findAll now accepts filters.lokasi_id (single uuid)
 * and filters.lokasi_ids (uuid[]); both filter through the joined
 * users table (`u.lokasi_id`) since the patroli table itself has no
 * lokasi_id column. An empty lokasi_ids array is the deny-all
 * sentinel from utils/scope.
 */
const { queryOne, queryAll, query } = require('../config/database');

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

class PatroliRepository {
  async findAll(filters = {}) {
    let sql = `SELECT p.*, u.nama, u.nrp, r.nama as rute_nama FROM patroli p
               LEFT JOIN users u ON p.user_id = u.id LEFT JOIN routes r ON p.route_id = r.id WHERE 1=1`;
    const params = [];
    if (filters.status) { params.push(filters.status); sql += ` AND p.status = $${params.length}`; }
    if (filters.user_id) { params.push(filters.user_id); sql += ` AND p.user_id = $${params.length}`; }
    sql += buildLokasiClause(filters, 'u.lokasi_id', params);
    sql += ' ORDER BY p.created_at DESC';
    if (filters.limit) { params.push(parseInt(filters.limit)); sql += ` LIMIT $${params.length}`; }
    return queryAll(sql, params);
  }

  async findByIdWithScans(id) {
    const patrol = await queryOne(
      `SELECT p.*, u.nama, u.nrp, u.lokasi_id AS user_lokasi_id, r.nama as rute_nama FROM patroli p
       LEFT JOIN users u ON p.user_id = u.id LEFT JOIN routes r ON p.route_id = r.id WHERE p.id = $1`, [id]);
    if (patrol) {
      patrol.scans = await queryAll(
        `SELECT ps.*, c.nama as checkpoint_nama FROM patrol_scans ps
         LEFT JOIN checkpoints c ON ps.checkpoint_id = c.id WHERE ps.patroli_id = $1 ORDER BY ps.scan_time`, [id]);
    }
    return patrol;
  }

  async start(userId, routeId, routeName) {
    return queryOne(
      `INSERT INTO patroli (user_id, route_id, route_name, status) VALUES ($1,$2,$3,'active') RETURNING *`,
      [userId, routeId || null, routeName || null]
    );
  }

  async addScan(patroliId, checkpointId, fotoUrl, idempotencyKey) {
    // [3-2] idempotency: scan di-replay dari antrian offline harus aman.
    if (idempotencyKey) {
      const row = await queryOne(
        `INSERT INTO patrol_scans (patroli_id, checkpoint_id, scan_time, foto_url, idempotency_key)
         VALUES ($1,$2,NOW(),$3,$4)
         ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING RETURNING *`,
        [patroliId, checkpointId, fotoUrl, idempotencyKey]
      );
      if (row) return row;
      return queryOne('SELECT * FROM patrol_scans WHERE idempotency_key = $1', [idempotencyKey]);
    }
    return queryOne(
      `INSERT INTO patrol_scans (patroli_id, checkpoint_id, scan_time, foto_url)
       VALUES ($1,$2,NOW(),$3) RETURNING *`,
      [patroliId, checkpointId, fotoUrl]
    );
  }

  async end(id, userId, scanned, total) {
    return queryOne(
      `UPDATE patroli SET status='completed', end_time=NOW(),
       checkpoint_scanned=$1, checkpoint_total=$2
       WHERE id=$3 AND user_id=$4 RETURNING *`,
      [scanned || 0, total || 0, id, userId]
    );
  }
}

module.exports = new PatroliRepository();
