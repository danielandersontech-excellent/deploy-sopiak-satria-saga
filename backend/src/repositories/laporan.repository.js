/**
 * LAPORAN REPOSITORY - Laporan Harian & Kejadian
 */
const { queryOne, queryAll } = require('../config/database');
const { parsePagination, paginatedResponse } = require('../utils/pagination');

class LaporanRepository {
  // ====== HARIAN ======
  async findHarian(filters = {}) {
    const { page, limit, offset } = parsePagination(filters);
    let where = 'WHERE 1=1';
    const params = [];
    if (filters.user_id) { params.push(filters.user_id); where += ` AND lh.user_id = $${params.length}`; }
    if (filters.status) { params.push(filters.status); where += ` AND lh.status = $${params.length}`; }
    if (filters.lokasi_id) { params.push(filters.lokasi_id); where += ` AND u.lokasi_id = $${params.length}`; }

    const countResult = await queryOne(`SELECT COUNT(*)::int as total FROM laporan_harian lh LEFT JOIN users u ON lh.user_id = u.id ${where}`, params);
    const dataParams = [...params, limit, offset];
    const rows = await queryAll(
      `SELECT lh.*, u.nama, u.nrp, u.lokasi_id FROM laporan_harian lh LEFT JOIN users u ON lh.user_id = u.id ${where} ORDER BY lh.created_at DESC LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );
    return paginatedResponse(rows, countResult?.total || 0, page, limit);
  }

  async createHarian(data) {
    return queryOne(
      `INSERT INTO laporan_harian (user_id, tanggal, shift, pos_jaga, kondisi, aktivitas, temuan, perhatian_khusus, fotos, foto_dokumentasi, status, lokasi_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',$11) RETURNING *`,
      [data.user_id, data.tanggal || null, data.shift, data.pos_jaga, data.kondisi, data.aktivitas, data.temuan, data.perhatian_khusus || null, data.fotos || [], data.foto_dokumentasi || [], data.lokasi_id || null]
    );
  }

  async validateHarian(id, status, catatan, validatorId) {
    return queryOne(
      `UPDATE laporan_harian SET status = $1, catatan_komandan = $2, validated_by = $3, updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [status, catatan, validatorId, id]
    );
  }

  // ====== KEJADIAN ======
  async findKejadian(filters = {}) {
    const { page, limit, offset } = parsePagination(filters);
    let where = 'WHERE 1=1';
    const params = [];
    if (filters.user_id) { params.push(filters.user_id); where += ` AND lk.user_id = $${params.length}`; }
    if (filters.status) { params.push(filters.status); where += ` AND lk.status = $${params.length}`; }
    if (filters.prioritas) { params.push(filters.prioritas); where += ` AND lk.prioritas = $${params.length}`; }
    if (filters.lokasi_id) { params.push(filters.lokasi_id); where += ` AND u.lokasi_id = $${params.length}`; }

    const countResult = await queryOne(`SELECT COUNT(*)::int as total FROM laporan_kejadian lk LEFT JOIN users u ON lk.user_id = u.id ${where}`, params);
    const dataParams = [...params, limit, offset];
    const rows = await queryAll(
      `SELECT lk.*, u.nama, u.nrp, u.lokasi_id FROM laporan_kejadian lk LEFT JOIN users u ON lk.user_id = u.id ${where} ORDER BY lk.created_at DESC LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );
    return paginatedResponse(rows, countResult?.total || 0, page, limit);
  }

  async createKejadian(data) {
    return queryOne(
      `INSERT INTO laporan_kejadian (user_id, jenis, prioritas, lokasi_text, latitude, longitude, kronologi, bukti_media, status, lokasi_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9) RETURNING *`,
      [data.user_id, data.jenis, data.prioritas || 'sedang', data.lokasi_text, data.latitude, data.longitude, data.kronologi, data.bukti_media || [], data.lokasi_id || null]
    );
  }

  async validateKejadian(id, status, catatan, validatorId) {
    return queryOne(
      `UPDATE laporan_kejadian SET status = $1, catatan_komandan = $2, validated_by = $3, updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [status, catatan, validatorId, id]
    );
  }
}

module.exports = new LaporanRepository();
