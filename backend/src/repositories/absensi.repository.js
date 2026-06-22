/**
 * ABSENSI REPOSITORY
 */
const { queryOne, queryAll } = require('../config/database');
const { parsePagination, paginatedResponse } = require('../utils/pagination');

class AbsensiRepository {
  async findAll(filters = {}) {
    const { page, limit, offset, sort, order } = parsePagination(filters);
    let where = 'WHERE 1=1';
    const params = [];
    if (filters.user_id) { params.push(filters.user_id); where += ` AND a.user_id = $${params.length}`; }
    if (filters.tipe) { params.push(filters.tipe); where += ` AND a.tipe = $${params.length}`; }
    if (filters.date) { params.push(filters.date); where += ` AND DATE(a.created_at) = $${params.length}`; }
    if (filters.status) { params.push(filters.status); where += ` AND a.status = $${params.length}`; }
    if (filters.lokasi_id) { params.push(filters.lokasi_id); where += ` AND u.lokasi_id = $${params.length}`; }
    else if (Array.isArray(filters.lokasi_ids)) {
      // [1-1] scope: empty array = deny-all sentinel; otherwise match the set.
      if (filters.lokasi_ids.length === 0) { where += ' AND FALSE'; }
      else { params.push(filters.lokasi_ids); where += ` AND u.lokasi_id = ANY($${params.length}::uuid[])`; }
    }
    if (filters.waktu_gte || filters.created_at_gte) { const v = filters.waktu_gte || filters.created_at_gte; params.push(v); where += ` AND a.created_at >= $${params.length}`; }
    if (filters.waktu_lte || filters.created_at_lte) { const v = filters.waktu_lte || filters.created_at_lte; params.push(v); where += ` AND a.created_at <= $${params.length}`; }

    // Count total
    const countResult = await queryOne(`SELECT COUNT(*)::int as total FROM absensi a LEFT JOIN users u ON a.user_id = u.id ${where}`, params);
    const total = countResult?.total || 0;

    // Fetch page
    const safeSort = sort.replace(/[^a-zA-Z0-9_]/g, '');
    const dataParams = [...params, limit, offset];
    const rows = await queryAll(
      `SELECT a.*, u.nama, u.nrp, u.foto_url, u.lokasi_id FROM absensi a LEFT JOIN users u ON a.user_id = u.id ${where} ORDER BY a.${safeSort} ${order} LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );

    return paginatedResponse(rows, total, page, limit);
  }

  async findToday(filters = {}) {
    // [1-1] today-absensi is now scoped. Build the same user_id / lokasi
    // filters the list endpoint uses so cross-tenant rows are never returned.
    let where = 'WHERE DATE(a.created_at) = CURRENT_DATE';
    const params = [];
    if (filters.user_id) { params.push(filters.user_id); where += ` AND a.user_id = $${params.length}`; }
    if (filters.lokasi_id) { params.push(filters.lokasi_id); where += ` AND u.lokasi_id = $${params.length}`; }
    else if (Array.isArray(filters.lokasi_ids)) {
      if (filters.lokasi_ids.length === 0) { where += ' AND FALSE'; }
      else { params.push(filters.lokasi_ids); where += ` AND u.lokasi_id = ANY($${params.length}::uuid[])`; }
    }
    return queryAll(
      `SELECT a.*, u.nama, u.nrp FROM absensi a LEFT JOIN users u ON a.user_id = u.id
       ${where} ORDER BY a.created_at DESC`,
      params
    );
  }

  async create(data) {
    // [3-2] Idempotency: bila klien mengirim idempotency_key (retry antrian
    // offline), dedup via ON CONFLICT. Bila konflik (sudah pernah masuk),
    // ambil & kembalikan row yang ada → klien tak mendapat duplikat/erro.
    if (data.idempotency_key) {
      const row = await queryOne(
        `INSERT INTO absensi (user_id, tipe, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, waktu, lokasi_id, idempotency_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING RETURNING *`,
        [data.user_id, data.tipe, data.foto_url, data.latitude, data.longitude,
         data.alamat, data.pos_jaga, data.status || 'hadir', data.dalam_radius, data.waktu || null, data.lokasi_id || null, data.idempotency_key]
      );
      if (row) return row;
      return queryOne('SELECT * FROM absensi WHERE idempotency_key = $1', [data.idempotency_key]);
    }
    return queryOne(
      `INSERT INTO absensi (user_id, tipe, foto_url, latitude, longitude, alamat, pos_jaga, status, dalam_radius, waktu, lokasi_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [data.user_id, data.tipe, data.foto_url, data.latitude, data.longitude,
       data.alamat, data.pos_jaga, data.status || 'hadir', data.dalam_radius, data.waktu || null, data.lokasi_id || null]
    );
  }
}

module.exports = new AbsensiRepository();
