/**
 * USER REPOSITORY - v24
 *
 * TAHAP 7 BUG #5 (P2-4):
 *   findAllWithJoins now supports server-side pagination. The shape it
 *   returns depends on whether the caller asked for it:
 *
 *     - With `page` / `limit` query params, OR by default if neither is
 *       given (the spec wants 25/page as the default to avoid shipping
 *       thousands of rows to a browser), the result is:
 *         { data: [...], total, page, limit, totalPages }
 *
 *     - With `all=true`, the legacy unbounded list is returned as a
 *       plain array. Callers that genuinely need the entire users list
 *       (shift-assignment dropdowns, analytics aggregates) opt into this
 *       explicitly. New consumers should prefer pagination.
 *
 *   The web-admin's apiFetch / `toArray(d)` helper already handles both
 *   shapes (it returns `d.data` when present), so existing pages that
 *   don't yet wire pagination through still see a working array — they
 *   just see at most 25 rows until they're updated to thread page/limit
 *   through.
 *
 * Earlier v23 fix preserved (null value handling in updateFields).
 */
const BaseRepository = require('./base.repository');
const { queryOne, queryAll, query } = require('../config/database');

// Hard cap on page size so a malicious caller can't pass limit=999999 to
// dump the table. 100 is generous for an admin grid.
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;

function parsePagination(filters) {
  // Treat both string ('1') and number (1) inputs safely, since
  // req.query values arrive as strings.
  const rawPage = filters.page != null ? Number(filters.page) : NaN;
  const rawLimit = filters.limit != null ? Number(filters.limit) : NaN;
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  let limit = Number.isFinite(rawLimit) && rawLimit >= 1 ? Math.floor(rawLimit) : DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;
  return { page, limit, offset: (page - 1) * limit };
}

class UserRepository extends BaseRepository {
  constructor() { super('users'); }

  /**
   * findAllWithJoins(filters)
   *
   * filters may include:
   *   role, lokasi_id, status, status_penempatan   — existing filters
   *   page (number ≥ 1), limit (number 1..100)     — pagination
   *   all (truthy)                                  — bypass pagination
   *
   * Returns:
   *   - array of rows when `all` is truthy
   *   - { data, total, page, limit, totalPages }  otherwise
   */
  async findAllWithJoins(filters = {}) {
    const wantAll = filters.all === true || filters.all === 'true' || filters.all === '1';

    let sql = `SELECT u.id, u.nrp, u.nama, u.role, u.no_hp, u.foto_url, u.lokasi_id, u.pos_jaga_id,
               u.shift, u.status, u.skor, u.last_seen, u.last_latitude, u.last_longitude,
               u.expo_push_token, u.created_at,
               u.no_ktp, u.tempat_lahir, u.tanggal_lahir, u.alamat_rumah, u.pendidikan,
               u.berkas_ktp, u.berkas_ijazah, u.berkas_skck, u.berkas_sertifikat,
               u.berkas_cv, u.berkas_foto_formal, u.berkas_kontrak, u.berkas_lainnya, u.berkas_foto,
               u.catatan_personil, u.tanggal_bergabung, u.status_penempatan,
               u.jenis_kelamin, u.golongan_darah, u.agama,
               l.nama as lokasi_nama, p.nama as pos_nama`;

    // Add a windowed total count when paginating so we get count + rows in
    // a single query (no extra round-trip for COUNT(*)).
    if (!wantAll) {
      sql += `, COUNT(*) OVER() AS total_count`;
    }

    sql += `
               FROM users u LEFT JOIN lokasi l ON u.lokasi_id = l.id
               LEFT JOIN pos_jaga p ON u.pos_jaga_id = p.id WHERE 1=1`;
    const params = [];
    if (filters.role) {
      let roles = Array.isArray(filters.role) ? filters.role : [filters.role];
      if (roles.length === 1 && roles[0].includes(',')) roles = roles[0].split(',');
      params.push(roles);
      sql += ` AND u.role = ANY($${params.length})`;
    }
    if (filters.lokasi_id) { params.push(filters.lokasi_id); sql += ` AND u.lokasi_id = $${params.length}`; }
    else if (Array.isArray(filters.lokasi_ids)) {
      // [1-2] scope: empty array = deny-all sentinel; otherwise match the set.
      if (filters.lokasi_ids.length === 0) { sql += ' AND FALSE'; }
      else { params.push(filters.lokasi_ids); sql += ` AND u.lokasi_id = ANY($${params.length}::uuid[])`; }
    }
    if (filters.status) { params.push(filters.status); sql += ` AND u.status = $${params.length}`; }
    if (filters.status_penempatan) { params.push(filters.status_penempatan); sql += ` AND u.status_penempatan = $${params.length}`; }
    // [5-4] Pencarian server-side nama/NRP (sebelumnya hanya filter klien pada
    // halaman aktif → user di halaman lain tak ketemu). Parameterized → aman SQLi;
    // scope per-peran (role/lokasi_ids di atas) tetap dihormati.
    if (filters.search != null && String(filters.search).trim() !== '') {
      params.push(`%${String(filters.search).trim()}%`);
      sql += ` AND (u.nama ILIKE $${params.length} OR u.nrp ILIKE $${params.length})`;
    }

    if (wantAll) {
      sql += ' ORDER BY u.nama';
      return queryAll(sql, params);
    }

    const { page, limit, offset } = parsePagination(filters);
    // Stable, predictable ordering for paginated grids: newest first.
    // Falls back to nama for ties so the order is deterministic.
    sql += ' ORDER BY u.created_at DESC, u.nama ASC';
    params.push(limit);
    sql += ` LIMIT $${params.length}`;
    params.push(offset);
    sql += ` OFFSET $${params.length}`;

    const rows = await queryAll(sql, params);
    const total = rows.length > 0 ? Number(rows[0].total_count) : 0;
    // Strip the helper column so it doesn't leak into the API response.
    const data = rows.map(({ total_count, ...rest }) => rest);
    return {
      data,
      total,
      page,
      limit,
      totalPages: limit > 0 ? Math.ceil(total / limit) : 1,
    };
  }

  async findByIdWithJoins(id) {
    return queryOne(
      `SELECT u.id, u.nrp, u.nama, u.role, u.no_hp, u.foto_url, u.lokasi_id, u.pos_jaga_id,
       u.shift, u.status, u.skor, u.last_seen, u.last_latitude, u.last_longitude,
       u.expo_push_token, u.created_at, u.updated_at,
       u.no_ktp, u.tempat_lahir, u.tanggal_lahir, u.alamat_rumah, u.pendidikan,
       u.berkas_ktp, u.berkas_ijazah, u.berkas_skck, u.berkas_sertifikat,
       u.berkas_cv, u.berkas_foto_formal, u.berkas_kontrak, u.berkas_lainnya, u.berkas_foto,
       u.catatan_personil, u.tanggal_bergabung, u.status_penempatan,
       u.jenis_kelamin, u.golongan_darah, u.agama,
       l.nama as lokasi_nama, p.nama as pos_nama FROM users u
       LEFT JOIN lokasi l ON u.lokasi_id = l.id LEFT JOIN pos_jaga p ON u.pos_jaga_id = p.id
       WHERE u.id = $1`, [id]
    );
  }

  async updateFields(id, fields) {
    // FIXED: Allow null values (e.g., clearing lokasi_id)
    const keys = Object.keys(fields).filter(k => k !== 'pin_hash' && fields[k] !== undefined);
    if (!keys.length) return null;
    const params = keys.map(k => fields[k]);
    const sets = keys.map((k, i) => `${k} = $${i + 1}`);
    if (!keys.includes('updated_at')) {
      sets.push('updated_at = NOW()');
    }
    // Auto-set status_penempatan when lokasi_id changes
    if (fields.lokasi_id === null && !keys.includes('status_penempatan')) {
      sets.push(`status_penempatan = 'belum_ditempatkan'`);
    } else if (fields.lokasi_id && !keys.includes('status_penempatan')) {
      sets.push(`status_penempatan = 'ditempatkan'`);
    }
    params.push(id);
    return queryOne(`UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
  }

  async updateLocation(userId, lat, lng) {
    return query('UPDATE users SET last_latitude=$1, last_longitude=$2, last_seen=NOW() WHERE id=$3', [lat, lng, userId]);
  }

  async updatePushToken(userId, token) {
    return query('UPDATE users SET expo_push_token=$1 WHERE id=$2', [token, userId]);
  }

  async updateStatus(userId, status) {
    return query('UPDATE users SET status=$1 WHERE id=$2', [status, userId]);
  }
}

module.exports = new UserRepository();