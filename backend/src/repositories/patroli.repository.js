/**
 * PATROLI REPOSITORY
 *
 * P0-6 (Tahap 4): findAll now accepts filters.lokasi_id (single uuid)
 * and filters.lokasi_ids (uuid[]); both filter through the joined
 * users table (`u.lokasi_id`) since the patroli table itself has no
 * lokasi_id column. An empty lokasi_ids array is the deny-all
 * sentinel from utils/scope.
 *
 * [Audit 2A]
 *   - findAll kini ber-pagination (page/limit, all=true untuk export) dengan
 *     filter search (nama/NRP/rute), start_date/end_date, status; hasil
 *     berbentuk { data, pagination, summary } seperti absensi/laporan.
 *     Bentuk lama (array) tetap dikembalikan bila pemanggil TIDAK mengirim
 *     page/limit/all (mobile dataStore & web-admin lama) agar kompatibel.
 *   - findActiveByUser / findScanTargetInfo untuk validasi start & scan.
 */
const { queryOne, queryAll, query } = require('../config/database');
const { parsePagination, paginatedResponse } = require('../utils/pagination');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
    const paged = filters.page != null || filters.limit != null || filters.all != null;
    const params = [];
    let where = 'WHERE 1=1';
    if (filters.status) { params.push(filters.status); where += ` AND p.status = $${params.length}`; }
    if (filters.user_id) { params.push(filters.user_id); where += ` AND p.user_id = $${params.length}`; }
    if (filters.search != null && String(filters.search).trim() !== '') {
      params.push(`%${String(filters.search).trim()}%`);
      where += ` AND (u.nama ILIKE $${params.length} OR u.nrp ILIKE $${params.length} OR p.route_name ILIKE $${params.length})`;
    }
    if (filters.start_date && DATE_RE.test(filters.start_date)) { params.push(filters.start_date); where += ` AND p.created_at >= $${params.length}::date`; }
    if (filters.end_date && DATE_RE.test(filters.end_date)) { params.push(filters.end_date); where += ` AND p.created_at < ($${params.length}::date + INTERVAL '1 day')`; }
    where += buildLokasiClause(filters, 'u.lokasi_id', params);

    const baseFrom = `FROM patroli p LEFT JOIN users u ON p.user_id = u.id LEFT JOIN routes r ON p.route_id = r.id LEFT JOIN lokasi l ON l.id = u.lokasi_id`;
    const select = `SELECT p.*, u.nama, u.nrp, u.foto_url AS user_foto_url, u.lokasi_id AS user_lokasi_id, l.nama AS lokasi_nama, r.nama as rute_nama,
                    (SELECT COUNT(*)::int FROM patrol_scans ps WHERE ps.patroli_id = p.id) AS jumlah_scan`;

    if (!paged) {
      let sql = `${select} ${baseFrom} ${where} ORDER BY p.created_at DESC`;
      if (filters.limit) { params.push(parseInt(filters.limit)); sql += ` LIMIT $${params.length}`; }
      return queryAll(sql, params);
    }

    const { page, limit, offset } = parsePagination(filters);
    const sum = await queryOne(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE p.status = 'active')::int AS active,
              COUNT(*) FILTER (WHERE p.status = 'completed')::int AS completed,
              COUNT(*) FILTER (WHERE p.status = 'incomplete')::int AS incomplete,
              COUNT(*) FILTER (WHERE p.status = 'cancelled')::int AS cancelled
       ${baseFrom} ${where}`, params);
    const dataParams = [...params, limit, offset];
    const rows = await queryAll(`${select} ${baseFrom} ${where} ORDER BY p.created_at DESC LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`, dataParams);
    const result = paginatedResponse(rows, sum?.total || 0, page, limit);
    result.summary = { total: sum?.total || 0, active: sum?.active || 0, completed: sum?.completed || 0, incomplete: sum?.incomplete || 0, cancelled: sum?.cancelled || 0 };
    return result;
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

  /** [Audit 2A] Patroli aktif milik user (untuk mencegah patroli ganda). */
  async findActiveByUser(userId) {
    return queryOne(`SELECT id, client_patrol_id, start_time FROM patroli WHERE user_id = $1 AND status = 'active' ORDER BY start_time DESC LIMIT 1`, [userId]);
  }

  /** [Audit 2A] Info ringkas patroli + eksistensi checkpoint untuk validasi scan. */
  async findScanTargetInfo(patroliId, checkpointId) {
    const patrol = await queryOne(`SELECT id, user_id, status FROM patroli WHERE id = $1`, [patroliId]);
    const checkpoint = checkpointId ? await queryOne(`SELECT id, nama FROM checkpoints WHERE id = $1`, [checkpointId]) : null;
    return { patrol, checkpoint };
  }

  async start(userId, routeId, routeName, clientPatrolId) {
    // [4-2] Idempotent pada client_patrol_id → start yang di-replay dari antrian
    // offline tidak membuat patroli ganda; mengembalikan patroli yang sama.
    if (clientPatrolId) {
      const row = await queryOne(
        `INSERT INTO patroli (user_id, route_id, route_name, status, client_patrol_id)
         VALUES ($1,$2,$3,'active',$4)
         ON CONFLICT (client_patrol_id) WHERE client_patrol_id IS NOT NULL DO NOTHING RETURNING *`,
        [userId, routeId || null, routeName || null, clientPatrolId]
      );
      if (row) return row;
      return queryOne('SELECT * FROM patroli WHERE client_patrol_id = $1', [clientPatrolId]);
    }
    return queryOne(
      `INSERT INTO patroli (user_id, route_id, route_name, status) VALUES ($1,$2,$3,'active') RETURNING *`,
      [userId, routeId || null, routeName || null]
    );
  }

  // [4-2] Menautkan scan/end yang di-antri offline ke patroli yang benar
  // setelah start tersinkron (resolusi referensi lokal → PK server).
  async findIdByClientPatrolId(clientPatrolId) {
    return queryOne('SELECT id, user_id FROM patroli WHERE client_patrol_id = $1', [clientPatrolId]);
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

  /** [Audit 2A] Tutup semua patroli aktif milik SATU user sebagai incomplete. */
  async closeActiveByUser(userId) {
    const r = await query(
      `UPDATE patroli SET status = 'incomplete', end_time = NOW(),
              checkpoint_scanned = GREATEST(checkpoint_scanned, (SELECT COUNT(*) FROM patrol_scans ps WHERE ps.patroli_id = patroli.id))
        WHERE user_id = $1 AND status = 'active' RETURNING id`,
      [userId]
    );
    return r.rowCount;
  }

  /** [Audit 2A] Tutup patroli aktif yang terbengkalai (dipakai job perawatan). */
  async closeStale(hours = 24) {
    const r = await query(
      `UPDATE patroli SET status = 'incomplete', end_time = NOW(),
              checkpoint_scanned = GREATEST(checkpoint_scanned, (SELECT COUNT(*) FROM patrol_scans ps WHERE ps.patroli_id = patroli.id))
        WHERE status = 'active' AND start_time < NOW() - ($1 || ' hours')::interval
        RETURNING id`,
      [String(parseInt(hours, 10) || 24)]
    );
    return r.rowCount;
  }
}

module.exports = new PatroliRepository();
