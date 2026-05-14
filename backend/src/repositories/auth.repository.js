/**
 * AUTH REPOSITORY - User authentication DB queries
 */
const BaseRepository = require('./base.repository');
const { queryOne, query } = require('../config/database');

class AuthRepository extends BaseRepository {
  constructor() { super('users'); }

  async findByNrp(nrp) {
    // P0-14: must_change_pin added to the SELECT list so auth.service.js
    // can surface the mustChangePin flag on login. Older DBs that haven't
    // had migration 002 applied will simply not have the column — the
    // query will fail and the caller will see "column does not exist".
    // Operators are expected to apply migration 002 before deploying
    // the matching service-layer code, but if you need to ship the
    // service-layer change first you can replace the explicit column
    // with `COALESCE((SELECT must_change_pin), FALSE) AS must_change_pin`
    // wrapped in a try/catch in the service layer. Leaving the simple
    // form for clarity.
    return queryOne(
      `SELECT id, nrp, nama, role, no_hp, foto_url, lokasi_id, pos_jaga_id,
              shift, status, skor, pin_hash, must_change_pin FROM users WHERE UPPER(nrp) = UPPER($1)`,
      [nrp]
    );
  }

  async getProfile(userId) {
    return queryOne(
      `SELECT u.*, l.nama as lokasi_nama, p.nama as pos_nama
       FROM users u
       LEFT JOIN lokasi l ON u.lokasi_id = l.id
       LEFT JOIN pos_jaga p ON u.pos_jaga_id = p.id
       WHERE u.id = $1`,
      [userId]
    );
  }

  async getPasswordHash(userId) {
    const row = await queryOne('SELECT pin_hash FROM users WHERE id = $1', [userId]);
    return row?.pin_hash;
  }

  async updatePassword(userId, hash) {
    return query('UPDATE users SET pin_hash = $1, updated_at = NOW() WHERE id = $2', [hash, userId]);
  }

  async updateLastSeen(userId) {
    return query('UPDATE users SET last_seen = NOW() WHERE id = $1', [userId]);
  }

  async nrpExists(nrp) {
    const row = await queryOne('SELECT id FROM users WHERE nrp = $1', [nrp]);
    return !!row;
  }

  async createUser(data) {
    return queryOne(
      `INSERT INTO users (nrp, nama, role, no_hp, lokasi_id, pos_jaga_id, shift, pin_hash,
       no_ktp, tempat_lahir, tanggal_lahir, alamat_rumah, pendidikan,
       jenis_kelamin, golongan_darah, agama, catatan_personil, status_penempatan,
       foto_url, skor)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
      [data.nrp, data.nama, data.role, data.no_hp, data.lokasi_id, data.pos_jaga_id, data.shift, data.pin_hash,
       data.no_ktp || null, data.tempat_lahir || null, data.tanggal_lahir || null,
       data.alamat_rumah || null, data.pendidikan || null, data.jenis_kelamin || 'L',
       data.golongan_darah || null, data.agama || null, data.catatan_personil || null,
       data.lokasi_id ? 'ditempatkan' : (data.status_penempatan || 'belum_ditempatkan'),
       data.foto_url || null, data.skor || 80]
    );
  }
}

module.exports = new AuthRepository();
