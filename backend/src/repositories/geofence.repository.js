/**
 * GEOFENCE REPOSITORY - Geofence, Izin Keluar, Violations
 *
 * P0-6 (Tahap 4): live-map / violations queries now accept either a
 * single `lokasiId` (string uuid) OR an array `lokasiIds` (uuid[]).
 * Convention used everywhere in this file:
 *   - null / undefined → no filter (admin/supervisor)
 *   - string            → single-lokasi filter (backward compat)
 *   - []                → deny-all sentinel (klien with no lokasi)
 *   - [a, b, ...]       → ANY($N::uuid[])
 * Three previously-unfiltered queries (`getUnacknowledgedViolations`,
 * `getActiveIzinList`) now ALSO scope themselves, because the
 * live-map service was passing them to klien JWTs unfiltered.
 */
const { queryOne, queryAll, query } = require('../config/database');

// Normalize a caller's lokasi arg into either:
//   { kind: 'none' }          → unrestricted
//   { kind: 'deny' }          → deny-all
//   { kind: 'single', id }    → single uuid
//   { kind: 'many',   ids }   → multi uuid
function normalizeLokasiArg(arg) {
  if (arg === null || arg === undefined) return { kind: 'none' };
  if (typeof arg === 'string' && arg) return { kind: 'single', id: arg };
  if (Array.isArray(arg)) {
    if (arg.length === 0) return { kind: 'deny' };
    if (arg.length === 1) return { kind: 'single', id: arg[0] };
    return { kind: 'many', ids: arg };
  }
  // Anything else (numbers, objects) — treat conservatively as no filter.
  // The caller layers already validate; this is just defensive.
  return { kind: 'none' };
}

// Append a scope predicate. Mutates `params`. Returns the SQL fragment.
function lokasiPredicate(arg, colRef, params) {
  const n = normalizeLokasiArg(arg);
  if (n.kind === 'none') return '';
  if (n.kind === 'deny') return ' AND FALSE';
  if (n.kind === 'single') {
    params.push(n.id);
    return ` AND ${colRef} = $${params.length}`;
  }
  params.push(n.ids);
  return ` AND ${colRef} = ANY($${params.length}::uuid[])`;
}

class GeofenceRepository {
  // ===== LOCATION =====
  async updateUserPosition(userId, lat, lng) {
    return query('UPDATE users SET last_latitude=$1, last_longitude=$2, last_seen=NOW() WHERE id=$3', [lat, lng, userId]);
  }

  async saveLocationHistory(userId, lat, lng, accuracy) {
    return query('INSERT INTO location_history (user_id, latitude, longitude, accuracy) VALUES ($1,$2,$3,$4)', [userId, lat, lng, accuracy]);
  }

  async getUserLokasi(userId) {
    return queryOne('SELECT l.* FROM lokasi l JOIN users u ON u.lokasi_id = l.id WHERE u.id = $1', [userId]);
  }

  // ===== IZIN KELUAR =====
  async findActiveIzin(userId, lokasiId) {
    if (!lokasiId) {
      return queryOne(
        `SELECT * FROM geofence_izin WHERE user_id=$1 AND status='approved' 
         AND (batas_waktu IS NULL OR batas_waktu > NOW()) ORDER BY created_at DESC LIMIT 1`,
        [userId]
      );
    }
    return queryOne(
      `SELECT * FROM geofence_izin WHERE user_id=$1 AND lokasi_id=$2 AND status='approved' 
       AND (batas_waktu IS NULL OR batas_waktu > NOW()) ORDER BY created_at DESC LIMIT 1`,
      [userId, lokasiId]
    );
  }

  async expireIzin(id) {
    return query("UPDATE geofence_izin SET status='expired', updated_at=NOW() WHERE id=$1", [id]);
  }

  async returnIzin(id) {
    return query("UPDATE geofence_izin SET status='returned', waktu_kembali=NOW(), updated_at=NOW() WHERE id=$1", [id]);
  }

  async findPendingIzin(userId) {
    return queryOne("SELECT id FROM geofence_izin WHERE user_id=$1 AND status='pending'", [userId]);
  }

  async createIzin(data) {
    return queryOne(
      `INSERT INTO geofence_izin (user_id, lokasi_id, alasan, latitude, longitude) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [data.user_id, data.lokasi_id, data.alasan, data.latitude, data.longitude]
    );
  }

  async approveIzin(id, approverId, durasiMenit, catatan) {
    return queryOne(
      `UPDATE geofence_izin SET status='approved', approved_by=$1, approved_at=NOW(),
       durasi_menit=$2, batas_waktu=NOW() + $2 * INTERVAL '1 minute',
       catatan_komandan=$3, waktu_keluar=NOW(), updated_at=NOW()
       WHERE id=$4 AND status='pending' RETURNING *`,
      [approverId, durasiMenit, catatan, id]
    );
  }

  async rejectIzin(id, rejecterId, catatan) {
    return queryOne(
      `UPDATE geofence_izin SET status='rejected', approved_by=$1, approved_at=NOW(),
       catatan_komandan=$2, updated_at=NOW() WHERE id=$3 AND status='pending' RETURNING *`,
      [rejecterId, catatan || 'Ditolak oleh komandan', id]
    );
  }

  async findIzinList(filters = {}) {
    let sql = `SELECT ik.*, u.nama as user_nama, u.nrp, l.nama as lokasi_nama, a.nama as approved_by_nama
               FROM geofence_izin ik JOIN users u ON ik.user_id = u.id
               JOIN lokasi l ON ik.lokasi_id = l.id LEFT JOIN users a ON ik.approved_by = a.id WHERE 1=1`;
    const params = [];
    if (filters.status) { params.push(filters.status); sql += ` AND ik.status = $${params.length}`; }
    // P0-6: support either lokasi_id (single, existing) or lokasi_ids
    // (array, new) — same shape as the rest of the codebase.
    if (filters.lokasi_id) {
      params.push(filters.lokasi_id);
      sql += ` AND ik.lokasi_id = $${params.length}`;
    } else if (Array.isArray(filters.lokasi_ids)) {
      if (filters.lokasi_ids.length === 0) {
        sql += ' AND FALSE';
      } else {
        params.push(filters.lokasi_ids);
        sql += ` AND ik.lokasi_id = ANY($${params.length}::uuid[])`;
      }
    }
    if (filters.user_id) { params.push(filters.user_id); sql += ` AND ik.user_id = $${params.length}`; }
    sql += ' ORDER BY ik.created_at DESC LIMIT 100';
    return queryAll(sql, params);
  }

  // ===== VIOLATIONS =====
  async createViolation(data) {
    return queryOne(
      `INSERT INTO geofence_violations (user_id, lokasi_id, tipe, izin_keluar_id, latitude, longitude, jarak_dari_pusat)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [data.user_id, data.lokasi_id, data.tipe, data.izin_keluar_id || null, data.latitude, data.longitude, data.jarak]
    );
  }

  async findRecentViolation(userId, lokasiId) {
    return queryOne(
      `SELECT id FROM geofence_violations WHERE user_id=$1 AND lokasi_id=$2 AND tipe='no_permission'
       AND created_at > NOW() - INTERVAL '5 minutes'`,
      [userId, lokasiId]
    );
  }

  async findViolations(filters = {}) {
    let sql = `SELECT gv.*, u.nama as user_nama, u.nrp, l.nama as lokasi_nama
               FROM geofence_violations gv JOIN users u ON gv.user_id = u.id
               JOIN lokasi l ON gv.lokasi_id = l.id WHERE 1=1`;
    const params = [];
    // P0-6: filter on gv.lokasi_id (which is the violation's lokasi,
    // not the user's). Single OR array form.
    if (filters.lokasi_id) {
      params.push(filters.lokasi_id);
      sql += ` AND gv.lokasi_id = $${params.length}`;
    } else if (Array.isArray(filters.lokasi_ids)) {
      if (filters.lokasi_ids.length === 0) {
        sql += ' AND FALSE';
      } else {
        params.push(filters.lokasi_ids);
        sql += ` AND gv.lokasi_id = ANY($${params.length}::uuid[])`;
      }
    }
    if (filters.acknowledged === 'false') sql += ' AND gv.acknowledged = false';
    if (filters.acknowledged === 'true') sql += ' AND gv.acknowledged = true';
    sql += ' ORDER BY gv.created_at DESC LIMIT 100';
    return queryAll(sql, params);
  }

  async acknowledgeViolation(id, userId) {
    return queryOne(
      `UPDATE geofence_violations SET acknowledged=true, acknowledged_by=$1, acknowledged_at=NOW() WHERE id=$2 RETURNING *`,
      [userId, id]
    );
  }

  // ===== LIVE MAP =====
  async getPersonnelPositions(lokasiArg) {
    let sql = `SELECT u.id, u.nrp, u.nama, u.role, u.status, u.foto_url,
               u.last_latitude, u.last_longitude, u.last_seen,
               l.nama as lokasi_nama, l.latitude as lok_lat, l.longitude as lok_lng, l.radius as lok_radius,
               p.nama as pos_nama
               FROM users u LEFT JOIN lokasi l ON u.lokasi_id = l.id LEFT JOIN pos_jaga p ON u.pos_jaga_id = p.id
               WHERE u.role IN ('anggota','komandan') AND u.last_latitude IS NOT NULL`;
    const params = [];
    sql += lokasiPredicate(lokasiArg, 'u.lokasi_id', params);
    sql += ' ORDER BY u.last_seen DESC';
    return queryAll(sql, params);
  }

  async getActiveLokasi(lokasiArg) {
    let sql = 'SELECT id, nama, latitude, longitude, radius FROM lokasi WHERE status=$1';
    const params = ['active'];
    sql += lokasiPredicate(lokasiArg, 'id', params);
    return queryAll(sql, params);
  }

  async getActivePosJaga(lokasiArg) {
    let sql = 'SELECT id, nama, latitude, longitude, radius, lokasi_id FROM pos_jaga WHERE status=$1';
    const params = ['active'];
    sql += lokasiPredicate(lokasiArg, 'lokasi_id', params);
    return queryAll(sql, params);
  }

  async getUnacknowledgedViolations(lokasiArg) {
    // P0-6: previously unfiltered — a klien hitting /live-map saw
    // every unack'd violation across every contract. Now scoped on
    // gv.lokasi_id.
    let sql = `SELECT gv.*, u.nama as user_nama FROM geofence_violations gv
               JOIN users u ON gv.user_id = u.id WHERE gv.acknowledged = false`;
    const params = [];
    sql += lokasiPredicate(lokasiArg, 'gv.lokasi_id', params);
    sql += ' ORDER BY gv.created_at DESC LIMIT 20';
    return queryAll(sql, params);
  }

  async getActiveIzinList(lokasiArg) {
    // P0-6: previously unfiltered — same leak as
    // getUnacknowledgedViolations. Filter on ik.lokasi_id.
    let sql = `SELECT ik.*, u.nama as user_nama FROM geofence_izin ik JOIN users u ON ik.user_id = u.id
               WHERE ik.status = 'approved' AND (ik.batas_waktu IS NULL OR ik.batas_waktu > NOW())`;
    const params = [];
    sql += lokasiPredicate(lokasiArg, 'ik.lokasi_id', params);
    return queryAll(sql, params);
  }

  // ===== STATUS =====
  async getUserGeofenceStatus(userId) {
    return queryOne(
      `SELECT u.last_latitude, u.last_longitude, l.latitude as lok_lat, l.longitude as lok_lng,
       l.radius, l.nama as lokasi_nama FROM users u LEFT JOIN lokasi l ON u.lokasi_id = l.id WHERE u.id=$1`,
      [userId]
    );
  }
}

module.exports = new GeofenceRepository();
