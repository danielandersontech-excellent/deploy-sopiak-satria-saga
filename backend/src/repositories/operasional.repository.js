/**
 * OPERASIONAL REPOSITORY - Broadcasts, Serah Terima, Panic, Notifikasi
 * v15 - Enhanced panic with full JOINs, broadcast filtering, serah terima filtering
 * v16 - P0-6: accept filters.lokasi_ids (uuid[]) alongside filters.lokasi_id.
 *       Empty array is the deny-all sentinel. See utils/scope.js.
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

class OperasionalRepository {
  // ===== BROADCASTS =====
  async findBroadcasts(filters = {}) {
    let sql = `SELECT b.*, u.nama as pengirim_nama, l.nama as lokasi_nama
               FROM broadcasts b
               LEFT JOIN users u ON b.pengirim_id = u.id
               LEFT JOIN lokasi l ON b.lokasi_id = l.id
               WHERE 1=1`;
    const params = [];
    // P0-6: broadcasts have their own b.lokasi_id column (a broadcast
    // is targeted at a lokasi). The original single-id branch kept
    // its OR-NULL semantics (NULL = company-wide broadcast visible
    // to everyone) — we preserve that for the single-id case and the
    // multi-id case alike.
    if (filters.lokasi_id) {
      params.push(filters.lokasi_id);
      sql += ` AND (b.lokasi_id = $${params.length} OR b.lokasi_id IS NULL)`;
    } else if (Array.isArray(filters.lokasi_ids)) {
      if (filters.lokasi_ids.length === 0) {
        // Restricted-but-no-lokasi user: still let them see
        // company-wide broadcasts (lokasi_id IS NULL), nothing else.
        sql += ` AND b.lokasi_id IS NULL`;
      } else {
        params.push(filters.lokasi_ids);
        sql += ` AND (b.lokasi_id = ANY($${params.length}::uuid[]) OR b.lokasi_id IS NULL)`;
      }
    }
    sql += ` ORDER BY b.created_at DESC LIMIT 50`;
    return queryAll(sql, params);
  }
  async createBroadcast(data) {
    return queryOne(`INSERT INTO broadcasts (pengirim_id, judul, pesan, prioritas, target, lokasi_id)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [data.pengirim_id, data.judul, data.pesan, data.prioritas || 'normal', data.target || 'all',
       data.lokasi_id || null]);
  }

  // ===== SERAH TERIMA =====
  async findSerahTerima(filters = {}) {
    let sql = `SELECT s.*, u.nama as dari_nama, u.lokasi_id as dari_lokasi_id,
               p.nama as ke_nama FROM serah_terima s
               LEFT JOIN users u ON s.user_id = u.id
               LEFT JOIN users p ON s.penerima_id = p.id WHERE 1=1`;
    const params = [];
    sql += buildLokasiClause(filters, 'u.lokasi_id', params);
    sql += ` ORDER BY s.created_at DESC LIMIT 50`;
    return queryAll(sql, params);
  }
  async createSerahTerima(data) {
    const invJson = typeof data.inventaris === 'string' ? data.inventaris : JSON.stringify(data.inventaris || []);
    return queryOne(`INSERT INTO serah_terima (user_id, penerima_id, kondisi_area, inventaris, catatan) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [data.user_id, data.penerima_id || null, data.kondisi_area, invJson, data.catatan || null]);
  }

  // ===== PANIC ALERTS =====
  async findPanics(filters = {}) {
    let sql = `SELECT pa.*,
               u.nama as nama_pelapor, u.nrp as nrp_pelapor, u.no_hp, u.foto_url as foto_pelapor,
               u.role as role_pelapor, u.lokasi_id as pelapor_lokasi_id,
               l.nama as lokasi_nama,
               r.nama as resolver_nama
               FROM panic_alerts pa
               LEFT JOIN users u ON pa.user_id = u.id
               LEFT JOIN lokasi l ON u.lokasi_id = l.id
               LEFT JOIN users r ON pa.resolved_by = r.id
               WHERE 1=1`;
    const params = [];
    if (filters.status) { params.push(filters.status); sql += ` AND pa.status = $${params.length}`; }
    sql += buildLokasiClause(filters, 'u.lokasi_id', params);
    sql += ' ORDER BY pa.created_at DESC';
    if (filters.limit) { params.push(parseInt(filters.limit)); sql += ` LIMIT $${params.length}`; }
    return queryAll(sql, params);
  }
  async createPanic(data) {
    return queryOne(`INSERT INTO panic_alerts (user_id, latitude, longitude, alamat, pesan, jenis_darurat, lokasi_text, foto_url, nomor_kontak, lokasi_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [data.user_id, data.latitude || null, data.longitude || null, data.alamat || null,
       data.pesan || null, data.jenis_darurat || 'umum', data.lokasi_text || null, data.foto_url || null,
       data.nomor_kontak || null, data.lokasi_id || null]);
  }
  async findPanicById(id) {
    return queryOne(`SELECT pa.*,
      u.nama as nama_pelapor, u.nrp as nrp_pelapor, u.no_hp, u.foto_url as foto_pelapor,
      u.role as role_pelapor, l.nama as lokasi_nama, r.nama as resolver_nama
      FROM panic_alerts pa
      LEFT JOIN users u ON pa.user_id = u.id
      LEFT JOIN lokasi l ON u.lokasi_id = l.id
      LEFT JOIN users r ON pa.resolved_by = r.id
      WHERE pa.id = $1`, [id]);
  }
  async resolvePanic(id, userId, status, catatan) {
    return queryOne(`UPDATE panic_alerts SET status=$1, resolved_by=$2, resolved_at=NOW(),
      catatan_resolver=$4, respon_detail=$5
      WHERE id=$3 RETURNING *`,
      [status || 'resolved', userId, id, catatan || null, catatan || null]);
  }

  // ===== NOTIFIKASI =====
  async findNotifikasi(userId, role) {
    return queryAll(`SELECT * FROM notifikasi WHERE target_user_id = $1 OR $2 = ANY(target_role) OR target_user_id IS NULL
       ORDER BY created_at DESC LIMIT 50`, [userId, role]);
  }
  async createNotifikasi(data) {
    const roleArr = Array.isArray(data.target_role) ? data.target_role : (data.target_role ? [data.target_role] : null);
    return queryOne(`INSERT INTO notifikasi (tipe, judul, pesan, target_user_id, target_role, data) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [data.tipe || 'info', data.judul, data.pesan, data.target_user_id || null, roleArr, data.data ? JSON.stringify(data.data) : null]);
  }
  async markRead(id) { return query('UPDATE notifikasi SET dibaca=true WHERE id=$1', [id]); }
  async markAllRead(userId, role) {
    return query(`UPDATE notifikasi SET dibaca=true WHERE target_user_id=$1 OR $2=ANY(target_role) OR target_user_id IS NULL`, [userId, role]);
  }
}

module.exports = new OperasionalRepository();
