/**
 * GEOFENCE REPOSITORY - Geofence, Izin Keluar, Violations
 */
const { queryOne, queryAll, query } = require('../config/database');

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
    if (filters.lokasi_id) { params.push(filters.lokasi_id); sql += ` AND ik.lokasi_id = $${params.length}`; }
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
    if (filters.lokasi_id) { params.push(filters.lokasi_id); sql += ` AND gv.lokasi_id = $${params.length}`; }
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
  async getPersonnelPositions(lokasiId) {
    let sql = `SELECT u.id, u.nrp, u.nama, u.role, u.status, u.foto_url,
               u.last_latitude, u.last_longitude, u.last_seen,
               l.nama as lokasi_nama, l.latitude as lok_lat, l.longitude as lok_lng, l.radius as lok_radius,
               p.nama as pos_nama
               FROM users u LEFT JOIN lokasi l ON u.lokasi_id = l.id LEFT JOIN pos_jaga p ON u.pos_jaga_id = p.id
               WHERE u.role IN ('anggota','komandan') AND u.last_latitude IS NOT NULL`;
    const params = [];
    if (lokasiId) { params.push(lokasiId); sql += ` AND u.lokasi_id = $${params.length}`; }
    sql += ' ORDER BY u.last_seen DESC';
    return queryAll(sql, params);
  }

  async getActiveLokasi(lokasiId) {
    let sql = 'SELECT id, nama, latitude, longitude, radius FROM lokasi WHERE status=$1';
    const params = ['active'];
    if (lokasiId) { params.push(lokasiId); sql += ` AND id = $${params.length}`; }
    return queryAll(sql, params);
  }

  async getActivePosJaga(lokasiId) {
    let sql = 'SELECT id, nama, latitude, longitude, radius, lokasi_id FROM pos_jaga WHERE status=$1';
    const params = ['active'];
    if (lokasiId) { params.push(lokasiId); sql += ` AND lokasi_id = $${params.length}`; }
    return queryAll(sql, params);
  }

  async getUnacknowledgedViolations() {
    return queryAll(
      `SELECT gv.*, u.nama as user_nama FROM geofence_violations gv
       JOIN users u ON gv.user_id = u.id WHERE gv.acknowledged = false ORDER BY gv.created_at DESC LIMIT 20`
    );
  }

  async getActiveIzinList() {
    return queryAll(
      `SELECT ik.*, u.nama as user_nama FROM geofence_izin ik JOIN users u ON ik.user_id = u.id
       WHERE ik.status = 'approved' AND (ik.batas_waktu IS NULL OR ik.batas_waktu > NOW())`
    );
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
