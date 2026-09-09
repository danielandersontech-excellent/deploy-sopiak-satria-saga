/**
 * LAPORAN REPOSITORY - Laporan Harian & Kejadian
 *
 * P0-6 (Tahap 4): now accepts filters.lokasi_ids (uuid[]) in addition
 * to filters.lokasi_id (single uuid). An empty array is the deny-all
 * sentinel and is rendered as `AND FALSE`. See utils/scope.js for
 * how the service layer populates these.
 *
 * [Audit 2A]
 *   - Filter baru: search (nama/NRP pelapor), tanggal (harian), start_date /
 *     end_date (rentang created_at, inklusif), prioritas (kejadian), all=true
 *     (untuk export). Sebelumnya web-admin hanya menerima 20 baris pertama
 *     lalu memfilter di klien → chip status/hitungan salah.
 *   - Hasil menyertakan `summary` (jumlah per status untuk filter yang sama
 *     tanpa status) agar chip di web-admin akurat.
 *   - u.foto_url dialiaskan `user_foto_url` (avatar pelapor) tanpa menimpa
 *     kolom laporan.
 *   - findLokasiOf(): lokasi pelapor untuk pemeriksaan scope saat validasi.
 */
const { queryOne, queryAll } = require('../config/database');
const { parsePagination, paginatedResponse } = require('../utils/pagination');

// Append the scope predicate to a SQL fragment given a colRef (the
// fully-qualified column to filter on, e.g. 'u.lokasi_id'). Mutates
// `params`. Returns the SQL fragment to append.
function buildLokasiClause(filters, colRef, params) {
  if (filters.lokasi_id) {
    params.push(filters.lokasi_id);
    return ` AND ${colRef} = $${params.length}`;
  }
  if (Array.isArray(filters.lokasi_ids)) {
    if (filters.lokasi_ids.length === 0) {
      // Deny-all sentinel from utils/scope: caller explicitly has
      // no permitted lokasi, so produce zero rows safely.
      return ' AND FALSE';
    }
    params.push(filters.lokasi_ids);
    return ` AND ${colRef} = ANY($${params.length}::uuid[])`;
  }
  return '';
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Predikat bersama (tanpa status) — dipakai untuk data & summary.
function buildCommon(filters, alias, params) {
  let where = 'WHERE 1=1';
  if (filters.user_id) { params.push(filters.user_id); where += ` AND ${alias}.user_id = $${params.length}`; }
  if (filters.search != null && String(filters.search).trim() !== '') {
    params.push(`%${String(filters.search).trim()}%`);
    where += ` AND (u.nama ILIKE $${params.length} OR u.nrp ILIKE $${params.length})`;
  }
  if (filters.start_date && DATE_RE.test(filters.start_date)) { params.push(filters.start_date); where += ` AND ${alias}.created_at >= $${params.length}::date`; }
  if (filters.end_date && DATE_RE.test(filters.end_date)) { params.push(filters.end_date); where += ` AND ${alias}.created_at < ($${params.length}::date + INTERVAL '1 day')`; }
  // [Misi V3 / C2] umur minimal laporan (hari) — filter "Pending > 30 hari".
  const minAge = parseInt(filters.min_age_days, 10);
  if (Number.isFinite(minAge) && minAge > 0 && minAge <= 3650) {
    params.push(String(minAge));
    where += ` AND ${alias}.created_at < NOW() - ($${params.length} || ' days')::interval`;
  }
  where += buildLokasiClause(filters, 'u.lokasi_id', params);
  return where;
}

// [Misi V3 / C2] umur laporan dalam hari (kolom turunan untuk penanda "Pending N hari").
const UMUR_SQL = (alias) => `GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - ${alias}.created_at)) / 86400))::int AS umur_hari`;

class LaporanRepository {
  // ====== HARIAN ======
  async findHarian(filters = {}) {
    const { page, limit, offset } = parsePagination(filters);
    const params = [];
    let where = buildCommon(filters, 'lh', params);
    if (filters.tanggal && DATE_RE.test(filters.tanggal)) { params.push(filters.tanggal); where += ` AND lh.tanggal = $${params.length}::date`; }
    if (filters.kondisi) { params.push(filters.kondisi); where += ` AND lh.kondisi = $${params.length}`; }
    const baseFrom = 'FROM laporan_harian lh LEFT JOIN users u ON lh.user_id = u.id';

    // Summary per status (filter yang sama, tanpa status).
    const sumRows = await queryAll(`SELECT lh.status, COUNT(*)::int AS jumlah ${baseFrom} ${where} GROUP BY lh.status`, params);
    const summary = { total: 0 };
    for (const r of sumRows) { summary[r.status] = r.jumlah; summary.total += r.jumlah; }

    if (filters.status) { params.push(filters.status); where += ` AND lh.status = $${params.length}`; }
    const countResult = await queryOne(`SELECT COUNT(*)::int as total ${baseFrom} ${where}`, params);
    const dataParams = [...params, limit, offset];
    const rows = await queryAll(
      `SELECT lh.*, u.nama, u.nrp, u.foto_url AS user_foto_url, u.lokasi_id, l.nama AS lokasi_nama, v.nama AS validated_by_nama, ${UMUR_SQL('lh')}
       ${baseFrom} LEFT JOIN lokasi l ON l.id = COALESCE(lh.lokasi_id, u.lokasi_id) LEFT JOIN users v ON v.id = lh.validated_by
       ${where} ORDER BY lh.created_at DESC LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );
    const result = paginatedResponse(rows, countResult?.total || 0, page, limit);
    result.summary = summary;
    return result;
  }

  async createHarian(data) {
    // [3-2] idempotency (lihat absensi.repository untuk pola).
    if (data.idempotency_key) {
      const row = await queryOne(
        `INSERT INTO laporan_harian (user_id, tanggal, shift, pos_jaga, kondisi, aktivitas, temuan, perhatian_khusus, fotos, foto_dokumentasi, status, lokasi_id, idempotency_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',$11,$12)
         ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING RETURNING *`,
        [data.user_id, data.tanggal || null, data.shift, data.pos_jaga, data.kondisi, data.aktivitas, data.temuan, data.perhatian_khusus || null, data.fotos || [], data.foto_dokumentasi || [], data.lokasi_id || null, data.idempotency_key]
      );
      if (row) return row;
      return queryOne('SELECT * FROM laporan_harian WHERE idempotency_key = $1', [data.idempotency_key]);
    }
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
    const params = [];
    let where = buildCommon(filters, 'lk', params);
    if (filters.prioritas) { params.push(filters.prioritas); where += ` AND lk.prioritas = $${params.length}`; }
    const baseFrom = 'FROM laporan_kejadian lk LEFT JOIN users u ON lk.user_id = u.id';

    const sumRows = await queryAll(`SELECT lk.status, COUNT(*)::int AS jumlah ${baseFrom} ${where} GROUP BY lk.status`, params);
    const summary = { total: 0 };
    for (const r of sumRows) { summary[r.status] = r.jumlah; summary.total += r.jumlah; }

    if (filters.status) { params.push(filters.status); where += ` AND lk.status = $${params.length}`; }
    const countResult = await queryOne(`SELECT COUNT(*)::int as total ${baseFrom} ${where}`, params);
    const dataParams = [...params, limit, offset];
    const rows = await queryAll(
      `SELECT lk.*, u.nama, u.nrp, u.foto_url AS user_foto_url, u.lokasi_id, l.nama AS lokasi_nama, v.nama AS validated_by_nama, ${UMUR_SQL('lk')}
       ${baseFrom} LEFT JOIN lokasi l ON l.id = COALESCE(lk.lokasi_id, u.lokasi_id) LEFT JOIN users v ON v.id = lk.validated_by
       ${where} ORDER BY lk.created_at DESC LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );
    const result = paginatedResponse(rows, countResult?.total || 0, page, limit);
    result.summary = summary;
    return result;
  }

  async createKejadian(data) {
    // [3-2] idempotency (lihat absensi.repository untuk pola).
    if (data.idempotency_key) {
      const row = await queryOne(
        `INSERT INTO laporan_kejadian (user_id, jenis, prioritas, lokasi_text, latitude, longitude, kronologi, bukti_media, status, lokasi_id, idempotency_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,$10)
         ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING RETURNING *`,
        [data.user_id, data.jenis, data.prioritas || 'sedang', data.lokasi_text, data.latitude, data.longitude, data.kronologi, data.bukti_media || [], data.lokasi_id || null, data.idempotency_key]
      );
      if (row) return row;
      return queryOne('SELECT * FROM laporan_kejadian WHERE idempotency_key = $1', [data.idempotency_key]);
    }
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

  /**
   * [Audit 2A] Lokasi efektif sebuah laporan (lokasi_id laporan, fallback
   * lokasi pelapor) + status saat ini — untuk pemeriksaan scope validasi.
   * `table` hanya boleh 'laporan_harian' | 'laporan_kejadian'.
   */
  /**
   * [Misi V3 / C2] Rekap laporan pending berumur > `days` hari per lokasi
   * (harian + kejadian) — dipakai job pengingat harian ke komandan.
   */
  async findPendingLamaPerLokasi(days = 30) {
    const d = String(Math.max(1, parseInt(days, 10) || 30));
    return queryAll(
      `SELECT lokasi_id, l.nama AS lokasi_nama, SUM(jumlah)::int AS jumlah, MIN(tertua) AS tertua
         FROM (
           SELECT COALESCE(lh.lokasi_id, u.lokasi_id) AS lokasi_id, COUNT(*) AS jumlah, MIN(lh.created_at) AS tertua
             FROM laporan_harian lh LEFT JOIN users u ON u.id = lh.user_id
            WHERE lh.status = 'pending' AND lh.created_at < NOW() - ($1 || ' days')::interval
            GROUP BY 1
           UNION ALL
           SELECT COALESCE(lk.lokasi_id, u.lokasi_id) AS lokasi_id, COUNT(*) AS jumlah, MIN(lk.created_at) AS tertua
             FROM laporan_kejadian lk LEFT JOIN users u ON u.id = lk.user_id
            WHERE lk.status = 'pending' AND lk.created_at < NOW() - ($1 || ' days')::interval
            GROUP BY 1
         ) x LEFT JOIN lokasi l ON l.id = x.lokasi_id
        WHERE x.lokasi_id IS NOT NULL
        GROUP BY x.lokasi_id, l.nama
        ORDER BY jumlah DESC`,
      [d]
    );
  }

  async findLokasiOf(table, id) {
    if (!['laporan_harian', 'laporan_kejadian'].includes(table)) return null;
    return queryOne(
      `SELECT r.id, r.status, r.user_id, COALESCE(r.lokasi_id, u.lokasi_id) AS lokasi_id
         FROM ${table} r LEFT JOIN users u ON u.id = r.user_id WHERE r.id = $1`,
      [id]
    );
  }
}

module.exports = new LaporanRepository();
