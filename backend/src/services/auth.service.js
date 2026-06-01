/**
 * AUTH SERVICE - Authentication business logic
 * v18 - Added klien (client) login support
 * v19 - Hardening N-06: register() kini membuat PIN awal acak (bukan '123456')
 */
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const authRepo = require('../repositories/auth.repository');
const { generateToken, generateRefreshToken } = require('../middleware/auth');
const { logEvent } = require('../middleware/auditlog');
const { queryOne } = require('../config/database');

class AuthService {
  async login(nrp, pin) {
    if (!nrp || !pin) throw { status: 400, message: 'NRP dan PIN wajib diisi' };

    // Try user login first
    let user = await authRepo.findByNrp(nrp);
    
    if (user) {
      const valid = await bcrypt.compare(pin, user.pin_hash);
      if (!valid) throw { status: 401, message: 'PIN salah' };

      await authRepo.updateLastSeen(user.id);
      const token = generateToken(user);
      
      let refresh_token = null;
      try { refresh_token = await generateRefreshToken(user.id); } catch (e) {}
      
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
    
    if (client && client.pin_hash) {
      const valid = await bcrypt.compare(pin, client.pin_hash);
      if (!valid) throw { status: 401, message: 'PIN salah' };

      try { await queryOne('UPDATE clients SET last_seen = NOW() WHERE id = $1 RETURNING *', [client.id]); } catch(e) {}

      const lokasi = await queryOne('SELECT * FROM lokasi WHERE client_id = $1 LIMIT 1', [client.id]);

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
        status: 'active',
      };

      const jwt = require('jsonwebtoken');
      const JWT_SECRET = process.env.JWT_SECRET;
      const token = jwt.sign(
        { id: clientUser.id, nrp: clientUser.nrp, role: 'klien', nama: clientUser.nama, client_id: client.id },
        JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '30m' }
      );

      logEvent(null, client.nama_klien, 'LOGIN', 'auth', null, { nrp: clientUser.nrp, role: 'klien' });
      return { token, refresh_token: null, user: clientUser };
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
        lokasi_id: lokasi?.id || null, lokasi_nama: lokasi?.nama || null,
        email: client.email, nomor_telepon: client.nomor_telepon,
      };
    }

    const user = await authRepo.getProfile(userId);
    if (!user) throw { status: 404, message: 'User tidak ditemukan' };
    delete user.pin_hash;
    return user;
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
      const valid = await bcrypt.compare(oldPin, client.pin_hash);
      if (!valid) throw { status: 401, message: 'PIN lama salah' };
      const newHash = await bcrypt.hash(newPin, parseInt(process.env.BCRYPT_ROUNDS || '12'));
      await queryOne('UPDATE clients SET pin_hash = $1 WHERE id = $2', [newHash, clientId]);
      return { message: 'PIN berhasil diubah' };
    }

    const hash = await authRepo.getPasswordHash(userId);
    const valid = await bcrypt.compare(oldPin, hash);
    if (!valid) throw { status: 401, message: 'PIN lama salah' };

    const newHash = await bcrypt.hash(newPin, parseInt(process.env.BCRYPT_ROUNDS || '12'));
    await authRepo.updatePassword(userId, newHash);
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
    const pin_hash = await bcrypt.hash(plainPin, parseInt(process.env.BCRYPT_ROUNDS || '12'));
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