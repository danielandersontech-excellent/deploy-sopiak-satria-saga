/**
 * REKRUTMEN REPOSITORY — tabel rekrutmen_pelamar (migrasi 008)
 *
 * Semua query berparameter. Kolom yang dipakai di ORDER BY / filter dipilih
 * dari daftar putih (tidak pernah dari input klien). Lihat rekrutmen.service.js
 * untuk validasi & aturan bisnis.
 */
const BaseRepository = require('./base.repository');
const { queryOne, queryAll, query, pool } = require('../config/database');
const { parsePagination, paginatedResponse } = require('../utils/pagination');

const STATUS_LIST = ['baru', 'diproses', 'wawancara', 'diterima', 'ditolak', 'dibatalkan'];

// Kolom yang aman dikembalikan ke daftar (tanpa user_agent/ip agar respons ringkas).
const LIST_COLUMNS = `
  p.id, p.nomor_referensi, p.nik, p.nama, p.jenis_kelamin, p.tempat_lahir, p.tanggal_lahir,
  p.no_hp, p.email, p.alamat, p.pendidikan, p.tinggi_badan, p.berat_badan, p.pengalaman,
  p.posisi_dilamar, p.lokasi_preferensi, p.catatan, p.berkas, p.status, p.catatan_admin,
  p.diproses_oleh, p.diproses_at, p.user_id, p.created_at, p.updated_at,
  a.nama AS diproses_oleh_nama, u.nrp AS user_nrp`;

const FROM_JOINS = `
  FROM rekrutmen_pelamar p
  LEFT JOIN users a ON a.id = p.diproses_oleh
  LEFT JOIN users u ON u.id = p.user_id`;

class RekrutmenRepository extends BaseRepository {
  constructor() { super('rekrutmen_pelamar'); }

  /**
   * Daftar pelamar dengan pagination + ringkasan jumlah per status
   * (untuk chip filter di web-admin). Filter: status, search (nama / NIK /
   * nomor referensi / no HP), posisi, tanggal (created_at dari–sampai).
   */
  async findAll(filters = {}) {
    const { page, limit, offset } = parsePagination(filters);
    const conditions = ['1=1'];
    const params = [];

    if (filters.status && STATUS_LIST.includes(filters.status)) {
      params.push(filters.status);
      conditions.push(`p.status = $${params.length}`);
    }
    if (filters.posisi && ['anggota', 'komandan'].includes(filters.posisi)) {
      params.push(filters.posisi);
      conditions.push(`p.posisi_dilamar = $${params.length}`);
    }
    if (filters.search != null && String(filters.search).trim() !== '') {
      params.push(`%${String(filters.search).trim()}%`);
      const i = params.length;
      conditions.push(`(p.nama ILIKE $${i} OR p.nik ILIKE $${i} OR p.nomor_referensi ILIKE $${i} OR p.no_hp ILIKE $${i})`);
    }
    if (filters.start_date) {
      params.push(filters.start_date);
      conditions.push(`p.created_at >= $${params.length}::date`);
    }
    if (filters.end_date) {
      params.push(filters.end_date);
      conditions.push(`p.created_at < ($${params.length}::date + INTERVAL '1 day')`);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const countRow = await queryOne(`SELECT COUNT(*)::int AS total FROM rekrutmen_pelamar p ${where}`, params);
    const dataParams = [...params, limit, offset];
    const rows = await queryAll(
      `SELECT ${LIST_COLUMNS} ${FROM_JOINS} ${where}
       ORDER BY p.created_at DESC
       LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );
    const result = paginatedResponse(rows, countRow ? countRow.total : 0, page, limit);
    result.summary = await this.countByStatus();
    return result;
  }

  async countByStatus() {
    const rows = await queryAll(
      `SELECT status, COUNT(*)::int AS jumlah FROM rekrutmen_pelamar GROUP BY status`
    );
    const summary = { total: 0 };
    for (const s of STATUS_LIST) summary[s] = 0;
    for (const r of rows) { summary[r.status] = r.jumlah; summary.total += r.jumlah; }
    return summary;
  }

  async findById(id) {
    return queryOne(`SELECT ${LIST_COLUMNS}, p.ip_address, p.user_agent, p.idempotency_key ${FROM_JOINS} WHERE p.id = $1`, [id]);
  }

  async findByNik(nik) {
    return queryOne('SELECT id, nomor_referensi, status, created_at FROM rekrutmen_pelamar WHERE nik = $1', [nik]);
  }

  async findByIdempotency(key) {
    return queryOne('SELECT id, nomor_referensi, nama, status, created_at FROM rekrutmen_pelamar WHERE idempotency_key = $1', [key]);
  }

  async findByNomorAndNik(nomor, nik) {
    return queryOne(
      `SELECT nomor_referensi, nama, status, posisi_dilamar, created_at, updated_at
       FROM rekrutmen_pelamar WHERE nomor_referensi = $1 AND nik = $2`,
      [nomor, nik]
    );
  }

  /**
   * Simpan lamaran baru. Bila idempotency_key sudah ada (pengiriman ulang),
   * kembalikan baris lama — tidak ada duplikat dan tidak ada error.
   */
  async create(data) {
    const cols = [
      'nomor_referensi', 'nik', 'nama', 'jenis_kelamin', 'tempat_lahir', 'tanggal_lahir',
      'no_hp', 'email', 'alamat', 'pendidikan', 'tinggi_badan', 'berat_badan', 'pengalaman',
      'posisi_dilamar', 'lokasi_preferensi', 'catatan', 'berkas', 'idempotency_key',
      'ip_address', 'user_agent',
    ];
    const vals = cols.map((c) => (c === 'berkas' ? JSON.stringify(data.berkas || {}) : (data[c] === undefined ? null : data[c])));
    const placeholders = cols.map((_, i) => `$${i + 1}`);
    const row = await queryOne(
      `INSERT INTO rekrutmen_pelamar (${cols.join(', ')})
       VALUES (${placeholders.join(', ')})
       ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
       RETURNING *`,
      vals
    );
    if (row) return { row, duplicate: false };
    const existing = await this.findByIdempotency(data.idempotency_key);
    return { row: existing, duplicate: true };
  }

  async updateStatus(id, { status, catatan_admin, diproses_oleh }) {
    return queryOne(
      `UPDATE rekrutmen_pelamar
          SET status = $1,
              catatan_admin = COALESCE($2, catatan_admin),
              diproses_oleh = $3,
              diproses_at = NOW(),
              updated_at = NOW()
        WHERE id = $4
        RETURNING *`,
      [status, catatan_admin, diproses_oleh, id]
    );
  }

  async delete(id) {
    const r = await query('DELETE FROM rekrutmen_pelamar WHERE id = $1', [id]);
    return r.rowCount > 0;
  }

  /**
   * "Jadikan Anggota" — SATU transaksi:
   *   1. advisory lock agar dua admin yang menekan tombol bersamaan tidak
   *      mendapat NRP yang sama;
   *   2. hitung NRP berikutnya (AGT + nomor tertinggi + 1, 3 digit);
   *   3. INSERT users;
   *   4. UPDATE pelamar → status 'diterima', user_id terisi.
   * Gagal di langkah mana pun → ROLLBACK total (tidak ada akun tanpa
   * penanda di pelamar, atau sebaliknya).
   */
  async jadikanAnggota(pelamarId, userData, adminId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('rekrutmen_nrp_agt'))`);

      // Kunci baris pelamar & pastikan belum pernah dijadikan anggota.
      const cur = await client.query(
        `SELECT id, status, user_id FROM rekrutmen_pelamar WHERE id = $1 FOR UPDATE`,
        [pelamarId]
      );
      if (cur.rowCount === 0) { await client.query('ROLLBACK'); return { error: 'NOT_FOUND' }; }
      if (cur.rows[0].user_id || cur.rows[0].status === 'diterima') {
        await client.query('ROLLBACK'); return { error: 'ALREADY' };
      }

      const prefix = userData.role === 'komandan' ? 'KMD' : 'AGT';
      const maxRow = await client.query(
        `SELECT COALESCE(MAX(CAST(SUBSTRING(nrp FROM 4) AS INTEGER)), 0) AS n
           FROM users WHERE UPPER(nrp) ~ ('^' || $1 || '[0-9]+$')`,
        [prefix]
      );
      const nextNum = (maxRow.rows[0] && Number(maxRow.rows[0].n) || 0) + 1;
      const nrp = `${prefix}${String(nextNum).padStart(3, '0')}`;

      const ins = await client.query(
        `INSERT INTO users (nrp, nama, role, no_hp, lokasi_id, pos_jaga_id, shift, pin_hash,
           no_ktp, tempat_lahir, tanggal_lahir, alamat_rumah, pendidikan, jenis_kelamin,
           catatan_personil, status_penempatan, status, must_change_pin,
           berkas_ktp, berkas_ijazah, berkas_skck, berkas_sertifikat, berkas_cv, berkas_foto_formal, foto_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'off_duty',TRUE,$17,$18,$19,$20,$21,$22,$23)
         RETURNING id, nrp, nama, role, lokasi_id, shift, status_penempatan, must_change_pin, created_at`,
        [
          nrp, userData.nama, userData.role, userData.no_hp, userData.lokasi_id, null, userData.shift, userData.pin_hash,
          userData.no_ktp, userData.tempat_lahir, userData.tanggal_lahir, userData.alamat_rumah, userData.pendidikan, userData.jenis_kelamin,
          userData.catatan_personil, userData.lokasi_id ? 'ditempatkan' : 'belum_ditempatkan',
          userData.berkas_ktp, userData.berkas_ijazah, userData.berkas_skck, userData.berkas_sertifikat, userData.berkas_cv, userData.berkas_foto_formal, userData.foto_url,
        ]
      );
      const user = ins.rows[0];

      const upd = await client.query(
        `UPDATE rekrutmen_pelamar
            SET status = 'diterima', user_id = $1, diproses_oleh = $2, diproses_at = NOW(), updated_at = NOW()
          WHERE id = $3 RETURNING *`,
        [user.id, adminId, pelamarId]
      );

      await client.query('COMMIT');
      return { user, pelamar: upd.rows[0] };
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch { /* koneksi mungkin putus */ }
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = new RekrutmenRepository();
module.exports.STATUS_LIST = STATUS_LIST;
