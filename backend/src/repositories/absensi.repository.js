/**
 * ABSENSI REPOSITORY
 *
 * [Audit 2A]
 *   - BUG kolom bentrok: `SELECT a.*, u.foto_url, u.lokasi_id` menimpa
 *     a.foto_url (FOTO ABSENSI) dengan avatar user (sering NULL) → foto
 *     absensi tak pernah tampil di web-admin maupun mobile. Kolom user kini
 *     dialiaskan: user_foto_url, user_lokasi_id, user_nama, user_nrp (nama &
 *     nrp tetap ada untuk kompatibilitas).
 *   - Kolom sort dari query-string kini dibatasi daftar putih (sebelumnya
 *     `?sort=apa_saja` → error SQL → 500).
 *   - Filter baru: search (nama/NRP), start_date/end_date (rentang created_at
 *     inklusif), all=true (export). Hasil menyertakan `summary` (hitungan
 *     tipe/status/luar radius untuk filter yang sama) agar kartu statistik
 *     web-admin tidak dihitung dari 20 baris pertama saja.
 */
const { queryOne, queryAll } = require('../config/database');
const { parsePagination, paginatedResponse } = require('../utils/pagination');

const SORTABLE = new Set(['created_at', 'waktu', 'tipe', 'status', 'pos_jaga', 'dalam_radius']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function buildLokasiClause(filters, colRef, params) {
  if (filters.lokasi_id) { params.push(filters.lokasi_id); return ` AND ${colRef} = $${params.length}`; }
  if (Array.isArray(filters.lokasi_ids)) {
    if (filters.lokasi_ids.length === 0) return ' AND FALSE';
    params.push(filters.lokasi_ids);
    return ` AND ${colRef} = ANY($${params.length}::uuid[])`;
  }
  return '';
}

class AbsensiRepository {
  async findAll(filters = {}) {
    const { page, limit, offset, sort, order } = parsePagination(filters);
    let where = 'WHERE 1=1';
    const params = [];
    if (filters.user_id) { params.push(filters.user_id); where += ` AND a.user_id = $${params.length}`; }
    if (filters.tipe) { params.push(filters.tipe); where += ` AND a.tipe = $${params.length}`; }
    if (filters.date && DATE_RE.test(filters.date)) { params.push(filters.date); where += ` AND DATE(a.created_at) = $${params.length}`; }
    if (filters.status) { params.push(filters.status); where += ` AND a.status = $${params.length}`; }
    if (filters.dalam_radius === 'true' || filters.dalam_radius === 'false') { where += ` AND a.dalam_radius = ${filters.dalam_radius === 'true' ? 'TRUE' : 'FALSE'}`; }
    if (filters.search != null && String(filters.search).trim() !== '') {
      params.push(`%${String(filters.search).trim()}%`);
      where += ` AND (u.nama ILIKE $${params.length} OR u.nrp ILIKE $${params.length})`;
    }
    where += buildLokasiClause(filters, 'u.lokasi_id', params);
    if (filters.start_date && DATE_RE.test(filters.start_date)) { params.push(filters.start_date); where += ` AND a.created_at >= $${params.length}::date`; }
    if (filters.end_date && DATE_RE.test(filters.end_date)) { params.push(filters.end_date); where += ` AND a.created_at < ($${params.length}::date + INTERVAL '1 day')`; }
    if (filters.waktu_gte || filters.created_at_gte) { const v = filters.waktu_gte || filters.created_at_gte; params.push(v); where += ` AND a.created_at >= $${params.length}`; }
    if (filters.waktu_lte || filters.created_at_lte) { const v = filters.waktu_lte || filters.created_at_lte; params.push(v); where += ` AND a.created_at <= $${params.length}`; }

    const baseFrom = 'FROM absensi a LEFT JOIN users u ON a.user_id = u.id';

    // Count + summary dalam satu query.
    const sum = await queryOne(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE a.tipe = 'masuk')::int AS masuk,
              COUNT(*) FILTER (WHERE a.tipe = 'keluar')::int AS keluar,
              COUNT(*) FILTER (WHERE a.status = 'hadir')::int AS hadir,
              COUNT(*) FILTER (WHERE a.status = 'terlambat')::int AS terlambat,
              COUNT(*) FILTER (WHERE a.status = 'tidak_hadir')::int AS tidak_hadir,
              COUNT(*) FILTER (WHERE a.dalam_radius = FALSE)::int AS luar_radius
       ${baseFrom} ${where}`, params);
    const total = sum?.total || 0;

    const safeSort = SORTABLE.has(sort) ? sort : 'created_at';
    const dataParams = [...params, limit, offset];
    const rows = await queryAll(
      `SELECT a.*, u.nama, u.nrp, u.nama AS user_nama, u.nrp AS user_nrp,
              u.foto_url AS user_foto_url, u.lokasi_id AS user_lokasi_id, l.nama AS lokasi_nama
       ${baseFrom} LEFT JOIN lokasi l ON l.id = COALESCE(a.lokasi_id, u.lokasi_id)
       ${where} ORDER BY a.${safeSort} ${order}, a.created_at DESC LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );

    const result = paginatedResponse(rows, total, page, limit);
    result.summary = {
      total, masuk: sum?.masuk || 0, keluar: sum?.keluar || 0, hadir: sum?.hadir || 0,
      terlambat: sum?.terlambat || 0, tidak_hadir: sum?.tidak_hadir || 0, luar_radius: sum?.luar_radius || 0,
    };
    return result;
  }

  async findToday(filters = {}) {
    // [1-1] today-absensi is now scoped. Build the same user_id / lokasi
    // filters the list endpoint uses so cross-tenant rows are never returned.
    let where = 'WHERE DATE(a.created_at) = CURRENT_DATE';
    const params = [];
    if (filters.user_id) { params.push(filters.user_id); where += ` AND a.user_id = $${params.length}`; }
    where += buildLokasiClause(filters, 'u.lokasi_id', params);
    return queryAll(
      `SELECT a.*, u.nama, u.nrp, u.foto_url AS user_foto_url, u.lokasi_id AS user_lokasi_id
       FROM absensi a LEFT JOIN users u ON a.user_id = u.id
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
