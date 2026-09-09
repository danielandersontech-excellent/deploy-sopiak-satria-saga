/**
 * AUTH SERVICE - Authentication business logic
 * v18 - Added klien (client) login support
 * v19 - Hardening N-06: register() kini membuat PIN awal acak (bukan '123456')
 * v20 - [Misi V3 / B1] bcrypt dipindah ke pool worker thread (utils/pinHash),
 *       instrumentasi waktu per tahap login (logger.debug + peringatan bila
 *       lambat), last_seen & audit log tidak lagi menahan respons login.
 */
const crypto = require('crypto');
const authRepo = require('../repositories/auth.repository');
const { generateToken, generateRefreshToken, generateRefreshTokenForClient, revokeRefreshToken } = require('../middleware/auth');
const { logEvent } = require('../middleware/auditlog');
const { queryOne } = require('../config/database');
const { logger } = require('../utils/logger');
const { comparePin, hashPin } = require('../utils/pinHash');

// Ambang peringatan login lambat (ms). Login normal terukur ±320 ms di produksi
// (didominasi bcrypt cost 12); di atas ambang ini tahapan dicatat sebagai WARN
// agar penyebab (DB, bcrypt, antrean pool) terlihat tanpa mengaktifkan debug.
const SLOW_LOGIN_MS = parseInt(process.env.SLOW_LOGIN_MS || '1500', 10) || 1500;

/** Pengukur waktu per tahap — biaya nol saat tidak dipakai (hanya Date.now). */
function createTimer() {
  const t0 = Date.now();
  let last = t0;
  const marks = {};
  return {
    mark(label) {
      const now = Date.now();
      marks[label] = now - last;
      last = now;
    },
    total() { return Date.now() - t0; },
    marks,
  };
}

function reportLoginTiming(timer, nrp, outcome) {
  const total = timer.total();
  const detail = `${outcome} total=${total}ms tahap=${JSON.stringify(timer.marks)}`;
  if (total > SLOW_LOGIN_MS) {
    logger.warn(`[Auth] Login lambat untuk ${String(nrp).toUpperCase()}: ${detail}`);
  } else {
    logger.debug(`[Auth] Login ${String(nrp).toUpperCase()}: ${detail}`);
  }
}

class AuthService {
  async login(nrp, pin) {
    if (!nrp || !pin) throw { status: 400, message: 'NRP dan PIN wajib diisi' };
    const timer = createTimer();
    try {
      const result = await this._login(nrp, pin, timer);
      reportLoginTiming(timer, nrp, `sukses(${result.user.role})`);
      return result;
    } catch (e) {
      reportLoginTiming(timer, nrp, `gagal(${(e && e.status) || 500})`);
      throw e;
    }
  }

  async _login(nrp, pin, timer) {
    // Try user login first
    let user = await authRepo.findByNrp(nrp);
    timer.mark('query_user');

    if (user) {
      // bcrypt berjalan di worker thread — thread utama tetap melayani request lain.
      const valid = await comparePin(pin, user.pin_hash);
      timer.mark('bcrypt');
      if (!valid) throw { status: 401, message: 'PIN salah' };

      // [Audit 2A] Akun dinonaktifkan: tolak di login dengan pesan jelas.
      // Sebelumnya login mengembalikan token, lalu SETIAP request ditolak 401
      // "Akun dinonaktifkan" oleh middleware — membingungkan pengguna.
      if (user.status_penempatan === 'nonaktif') {
        throw { status: 401, message: 'Akun Anda dinonaktifkan. Hubungi admin.', code: 'ACCOUNT_DEACTIVATED' };
      }
      delete user.status_penempatan;

      // last_seen bukan bagian dari kontrak respons login → fire-and-forget.
      authRepo.updateLastSeen(user.id).catch((e) => logger.warn(`[Auth] Gagal memperbarui last_seen: ${e.message}`));
      const token = generateToken(user);

      let refresh_token = null;
      try { refresh_token = await generateRefreshToken(user.id); }
      catch (e) { logger.warn(`[Auth] Gagal membuat refresh token user ${user.id}: ${e.message}`); }
      timer.mark('refresh_token');

      delete user.pin_hash;
      logEvent(user.id, user.nama, 'LOGIN', 'auth', user.id, { nrp: user.nrp, role: user.role });
      return { token, refresh_token, user };
    }

    // Try klien login
    let client = null;
    try {
      client = await queryOne(
        `SELECT * FROM clients WHERE UPPER(nrp_login) = UPPER($1) OR UPPER(kode_klien) = UPPER($1)`,
        [nrp]
      );
    } catch(e) { /* table might not have nrp_login column yet */ }
    timer.mark('query_klien');

    if (client && client.pin_hash) {
      const valid = await comparePin(pin, client.pin_hash);
      timer.mark('bcrypt');
      if (!valid) throw { status: 401, message: 'PIN salah' };

      // [Audit 2A] Klien Non-Aktif/Blacklist tidak boleh login. Komentar P1-4 di
      // middleware/auth.js mengasumsikan pengecekan ini ada di sini, padahal
      // belum — login sukses lalu semua request ditolak 401.
      if (client.status_klien !== 'Aktif') {
        throw { status: 401, message: 'Akun klien tidak aktif. Hubungi PT Sopiak Satria Saga.', code: 'ACCOUNT_DEACTIVATED' };
      }

      queryOne('UPDATE clients SET last_seen = NOW() WHERE id = $1 RETURNING id', [client.id])
        .catch((e) => logger.warn(`[Auth] Gagal memperbarui last_seen klien: ${e.message}`));

      const lokasi = await queryOne('SELECT * FROM lokasi WHERE client_id = $1 LIMIT 1', [client.id]);
      timer.mark('query_lokasi');

      const clientUser = {
        id: `client-${client.id}`,
        nrp: client.nrp_login || client.kode_klien,
        nama: client.nama_klien,
        role: 'klien',
        client_id: client.id,
        lokasi_id: lokasi?.id || null,
        lokasi_nama: lokasi?.nama || null,
        foto_url: client.foto_url || null,
        email: client.email,
        nomor_telepon: client.nomor_telepon,
        kontak_person: client.kontak_person || null,
        status: 'active',
      };

      const jwt = require('jsonwebtoken');
      const JWT_SECRET = process.env.JWT_SECRET;
      const token = jwt.sign(
        { id: clientUser.id, nrp: clientUser.nrp, role: 'klien', nama: clientUser.nama, client_id: client.id },
        JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '30m' }
      );

      // [Audit 2A] Klien kini mendapat refresh token (P1-2 menyiapkan
      // generateRefreshTokenForClient + jalur refresh di auth.controller, tetapi
      // login klien masih mengembalikan refresh_token: null → sesi klien di
      // web-admin/mobile putus setiap 30 menit).
      let refresh_token = null;
      try { refresh_token = await generateRefreshTokenForClient(client.id); }
      catch (e) { logger.warn(`[Auth] Gagal membuat refresh token klien ${client.id}: ${e.message}`); }
      timer.mark('refresh_token');

      clientUser.must_change_pin = !!client.must_change_pin;
      logEvent(null, client.nama_klien, 'LOGIN', 'auth', null, { nrp: clientUser.nrp, role: 'klien' });
      return { token, refresh_token, user: clientUser };
    }

    throw { status: 401, message: 'NRP/ID tidak ditemukan' };
  }

  async getProfile(userId) {
    if (typeof userId === 'string' && userId.startsWith('client-')) {
      // P0-4 follow-on (tahap 5): clients.id is now uuid. The old
      // parseInt() call here returned NaN for uuid suffixes ('a1b2-...')
      // and silently produced  "WHERE id = NaN"  which Postgres rejected.
      // Strip the 'client-' prefix and pass the raw uuid string through.
      const clientId = userId.replace('client-', '');
      const client = await queryOne('SELECT * FROM clients WHERE id = $1', [clientId]);
      if (!client) throw { status: 404, message: 'Klien tidak ditemukan' };
      const lokasi = await queryOne('SELECT * FROM lokasi WHERE client_id = $1 LIMIT 1', [clientId]);
      return {
        id: userId, nrp: client.nrp_login || client.kode_klien,
        nama: client.nama_klien, role: 'klien', client_id: client.id,
        kode_klien: client.kode_klien,
        lokasi_id: lokasi?.id || null, lokasi_nama: lokasi?.nama || null,
        email: client.email, nomor_telepon: client.nomor_telepon,
        kontak_person: client.kontak_person || null,
        alamat_klien: client.alamat_klien || null,
        foto_url: client.foto_url || null,
        must_change_pin: !!client.must_change_pin,
      };
    }

    const user = await authRepo.getProfile(userId);
    if (!user) throw { status: 404, message: 'User tidak ditemukan' };
    delete user.pin_hash;
    return user;
  }

  /**
   * [Misi V3 / D2] Klien memperbarui data kontaknya sendiri (PUT /api/auth/me).
   * Hanya kolom kontak (kontak_person, nomor_telepon, email) yang boleh diubah — bukan kode klien, status, kontrak,
   * atau lokasi (itu wewenang admin lewat /api/data/clients). Perubahan dicatat
   * ke audit log. Untuk staf (users) gunakan PUT /api/users/:id seperti biasa.
   */
  async updateOwnProfile(user, body = {}) {
    if (!user || user.role !== 'klien' || !user.client_id) {
      throw { status: 403, message: 'Hanya akun klien yang dapat memperbarui profil lewat endpoint ini' };
    }
    const errors = [];
    const out = {};
    const clean = (v, max) => {
      if (v === undefined) return undefined;
      if (v === null) return null;
      const s = String(v).trim();
      if (s === '') return null;
      if (s.length > max) errors.push(`Nilai terlalu panjang (maks ${max} karakter)`);
      return s;
    };
    if ('kontak_person' in body || 'nama_kontak' in body) {
      out.kontak_person = clean('kontak_person' in body ? body.kontak_person : body.nama_kontak, 100);
      if (out.kontak_person !== null && out.kontak_person !== undefined && out.kontak_person.length < 2) errors.push('Nama kontak minimal 2 karakter');
    }
    if ('nomor_telepon' in body || 'no_telp' in body) {
      const v = clean('nomor_telepon' in body ? body.nomor_telepon : body.no_telp, 20);
      if (v !== null && v !== undefined && !/^\+?[0-9][0-9\s-]{6,19}$/.test(v)) errors.push('Nomor telepon tidak valid (7-20 digit, boleh diawali +)');
      out.nomor_telepon = v;
    }
    if ('email' in body) {
      const v = clean(body.email, 100);
      if (v !== null && v !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) errors.push('Format email tidak valid');
      out.email = v === null || v === undefined ? v : v.toLowerCase();
    }
    if (errors.length) throw { status: 400, message: errors[0], details: errors };
    const keys = Object.keys(out).filter((k) => out[k] !== undefined);
    if (keys.length === 0) throw { status: 400, message: 'Tidak ada perubahan yang dikirim (kontak_person, nomor_telepon, email)' };

    const sets = keys.map((k, i) => `${k} = $${i + 1}`);
    const params = keys.map((k) => out[k]);
    params.push(user.client_id);
    const updated = await queryOne(
      `UPDATE clients SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length}
       RETURNING id, kode_klien, nama_klien, kontak_person, nomor_telepon, email`,
      params
    );
    if (!updated) throw { status: 404, message: 'Klien tidak ditemukan' };
    logEvent(user.id, user.nama, 'UPDATE_PROFIL', 'clients', updated.id, { fields: keys });
    return this.getProfile(user.id);
  }

  async changePin(userId, oldPin, newPin) {
    if (!oldPin || !newPin) throw { status: 400, message: 'PIN lama dan baru wajib diisi' };
    if (String(newPin).length < 6) throw { status: 400, message: 'PIN minimal 6 digit' };

    if (typeof userId === 'string' && userId.startsWith('client-')) {
      // P0-4 follow-on: see getProfile() above. parseInt() removed
      // because clients.id is uuid post-migration 003.
      const clientId = userId.replace('client-', '');
      const client = await queryOne('SELECT pin_hash FROM clients WHERE id = $1', [clientId]);
      if (!client) throw { status: 404, message: 'Klien tidak ditemukan' };
      const valid = await comparePin(oldPin, client.pin_hash);
      if (!valid) throw { status: 401, message: 'PIN lama salah' };
      const newHash = await hashPin(newPin);
      // [Audit putaran 2] must_change_pin klien juga dipadamkan (lihat auth.repository.updatePassword).
      await queryOne('UPDATE clients SET pin_hash = $1, must_change_pin = FALSE, updated_at = NOW() WHERE id = $2', [newHash, clientId]);
      return { message: 'PIN berhasil diubah' };
    }

    const hash = await authRepo.getPasswordHash(userId);
    const valid = await comparePin(oldPin, hash);
    if (!valid) throw { status: 401, message: 'PIN lama salah' };

    const newHash = await hashPin(newPin);
    await authRepo.updatePassword(userId, newHash);
    // [2-3] Setelah PIN berganti, cabut SEMUA refresh token milik user ini
    // (memakai mekanisme revoke yang sudah ada). Refresh token yang dicuri
    // tak lagi bisa dipakai untuk login baru. Sesi aktif TIDAK logout
    // mendadak: access token saat ini tetap hidup hingga kedaluwarsa singkat
    // (~30m), lalu perangkat melakukan login ulang seperti biasa.
    try { await revokeRefreshToken(userId); } catch (e) { /* non-fatal */ }
    return { message: 'PIN berhasil diubah' };
  }

  async register(adminUser, data) {
    if (!['admin', 'supervisor'].includes(adminUser.role)) {
      throw { status: 403, message: 'Hanya admin/supervisor yang bisa register user' };
    }
    if (!data.nrp || !data.nama || !data.role) {
      throw { status: 400, message: 'NRP, nama, role wajib diisi' };
    }

    const exists = await authRepo.nrpExists(data.nrp);
    if (exists) throw { status: 409, message: 'NRP sudah terdaftar' };

    // Hardening (N-06): PIN awal acak 6 digit, bukan '123456' yang bisa
    // ditebak. Selaras pola reset-PIN klien (data.routes.js) & client.create()
    // (data.service.js): crypto.randomInt memberi distribusi seragam di
    // 100000..999999 (Math.random bisa diprediksi); padStart adalah jaring
    // pengaman bila rentang diperlebar. Cost factor tetap mengikuti
    // BCRYPT_ROUNDS (default 12). must_change_pin (default DB TRUE — createUser
    // tidak menulis kolom ini) tetap memaksa rotasi saat login pertama.
    const plainPin = String(crypto.randomInt(100000, 1000000)).padStart(6, '0');
    const pin_hash = await hashPin(plainPin);
    const user = await authRepo.createUser({
      ...data,
      no_hp: data.no_hp || null,
      lokasi_id: data.lokasi_id || null,
      pos_jaga_id: data.pos_jaga_id || null,
      shift: data.shift || '08:00-16:00',
      pin_hash,
      no_ktp: data.no_ktp || null,
      tempat_lahir: data.tempat_lahir || null,
      tanggal_lahir: data.tanggal_lahir || null,
      alamat_rumah: data.alamat_rumah || null,
      pendidikan: data.pendidikan || null,
      jenis_kelamin: data.jenis_kelamin || 'L',
      golongan_darah: data.golongan_darah || null,
      agama: data.agama || null,
      catatan_personil: data.catatan_personil || null,
      status_penempatan: data.lokasi_id ? 'ditempatkan' : (data.status_penempatan || 'belum_ditempatkan'),
      foto_url: data.foto_url || null,
      skor: data.skor || 80,
    });
    delete user.pin_hash;

    // Kembalikan PIN plaintext SEKALI sebagai field tambahan. Bentuk respons
    // tetap objek user (flat) + `initial_pin`, sehingga pemanggil yang membaca
    // field user (mis. mobile TambahEditUserScreen) tidak rusak. Controller
    // (auth.controller.js exports.register) meneruskan apa adanya ke res.json,
    // jadi field ini otomatis sampai ke front-end untuk ditampilkan sekali.
    // PENTING: JANGAN menulis `plainPin`/`initial_pin` ke logger mana pun.
    return { ...user, initial_pin: plainPin };
  }
}

module.exports = new AuthService();
