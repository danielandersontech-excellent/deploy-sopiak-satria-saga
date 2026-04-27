/**
 * USER REPOSITORY - v23 - Fixed null value handling in updateFields
 */
const BaseRepository = require('./base.repository');
const { queryOne, queryAll, query } = require('../config/database');

class UserRepository extends BaseRepository {
  constructor() { super('users'); }

  async findAllWithJoins(filters = {}) {
    let sql = `SELECT u.id, u.nrp, u.nama, u.role, u.no_hp, u.foto_url, u.lokasi_id, u.pos_jaga_id, 
               u.shift, u.status, u.skor, u.last_seen, u.last_latitude, u.last_longitude, 
               u.expo_push_token, u.created_at,
               u.no_ktp, u.tempat_lahir, u.tanggal_lahir, u.alamat_rumah, u.pendidikan,
               u.berkas_ktp, u.berkas_ijazah, u.berkas_skck, u.berkas_sertifikat,
               u.berkas_cv, u.berkas_foto_formal, u.berkas_kontrak, u.berkas_lainnya, u.berkas_foto,
               u.catatan_personil, u.tanggal_bergabung, u.status_penempatan,
               u.jenis_kelamin, u.golongan_darah, u.agama,
               l.nama as lokasi_nama, p.nama as pos_nama
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
    if (filters.status) { params.push(filters.status); sql += ` AND u.status = $${params.length}`; }
    if (filters.status_penempatan) { params.push(filters.status_penempatan); sql += ` AND u.status_penempatan = $${params.length}`; }
    sql += ' ORDER BY u.nama';
    return queryAll(sql, params);
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
