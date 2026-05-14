/**
 * AUTH SERVICE - Authentication business logic
 * v18 - Added klien (client) login support
 * v19 - Tahap-2 security fixes:
 *   P0-14: random temp PIN on register() (replaces hardcoded 123456);
 *          login() returns mustChangePin flag from users.must_change_pin
 *          / clients.must_change_pin; changePin() clears that flag.
 *   P1-2:  klien login now mints a refresh token via
 *          generateRefreshTokenForClient() and returns it like normal
 *          user logins.
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const authRepo = require('../repositories/auth.repository');
const {
  generateToken,
  generateRefreshToken,
  generateRefreshTokenForClient,
} = require('../middleware/auth');
const { logEvent } = require('../middleware/auditlog');
const { queryOne, queryAll } = require('../config/database');

// Single source of truth for the bcrypt cost factor across this service.
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12');

// P0-14: 6-digit cryptographically-random PIN. crypto.randomInt is
// uniformly distributed across [100000, 999999] and is unpredictable —
// unlike Math.random(), an attacker who sees a few generated PINs can't
// derive the next one. The PIN is only valid until first login (the
// must_change_pin flow forces rotation) but unpredictability still
// matters because the temp PIN is shared out-of-band and could be
// intercepted by anyone tailing the boot log.
function randomPin() {
  return String(crypto.randomInt(100000, 1000000));
}

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

      // P0-14: surface the must-change-pin flag at the top level of the
      // response so mobile / web clients can route the user straight into
      // the change-PIN screen without a second round-trip. The flag is
      // strictly === true so a NULL or missing column (e.g. before the
      // migration is applied) is treated as "not required".
      const mustChangePin = user.must_change_pin === true;

      delete user.pin_hash;
      logEvent(user.id, user.nama, 'LOGIN', 'auth', user.id, { nrp: user.nrp, role: user.role });
      return { token, refresh_token, user, mustChangePin };
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
      // Defense in depth for P1-4: refuse login if the client is
      // already suspended. Middleware will re-check on every request,
      // but we'd rather not mint a token for a suspended account in
      // the first place.
      if (client.status_klien && client.status_klien !== 'Aktif') {
        throw { status: 403, message: 'Akun klien tidak aktif' };
      }

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

      // P1-2: klien refresh token. Without this, klien sessions died
      // silently after 30 minutes — the mobile/web client would try to
      // refresh, find no refresh token, and bounce to login.
      let refresh_token = null;
      try {
        refresh_token = await generateRefreshTokenForClient(client.id);
      } catch (e) {
        console.warn('[auth.service] generateRefreshTokenForClient failed:', e.message);
      }

      // P0-14: klien must-change-pin flag flows through the same shape
      // as users so the mobile UI doesn't need a klien-specific branch.
      const mustChangePin = client.must_change_pin === true;

      logEvent(null, client.nama_klien, 'LOGIN', 'auth', null, { nrp: clientUser.nrp, role: 'klien' });
      return { token, refresh_token, user: clientUser, mustChangePin };
    }

    throw { status: 401, message: 'NRP/ID tidak ditemukan' };
  }

  async getProfile(userId) {
    if (typeof userId === 'string' && userId.startsWith('client-')) {
      const clientId = parseInt(userId.replace('client-', ''));
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
      const clientId = parseInt(userId.replace('client-', ''));
      const client = await queryOne('SELECT pin_hash FROM clients WHERE id = $1', [clientId]);
      if (!client) throw { status: 404, message: 'Klien tidak ditemukan' };
      const valid = await bcrypt.compare(oldPin, client.pin_hash);
      if (!valid) throw { status: 401, message: 'PIN lama salah' };
      const newHash = await bcrypt.hash(newPin, BCRYPT_ROUNDS);
      // P0-14: clear must_change_pin so the forced-rotation gate releases
      // on the next login. Done in the same UPDATE to avoid the (small)
      // window where someone could rotate the PIN successfully but
      // still be told to rotate it again.
      await queryOne(
        'UPDATE clients SET pin_hash = $1, must_change_pin = FALSE WHERE id = $2',
        [newHash, clientId]
      );
      return { message: 'PIN berhasil diubah' };
    }

    const hash = await authRepo.getPasswordHash(userId);
    const valid = await bcrypt.compare(oldPin, hash);
    if (!valid) throw { status: 401, message: 'PIN lama salah' };

    const newHash = await bcrypt.hash(newPin, BCRYPT_ROUNDS);
    await authRepo.updatePassword(userId, newHash);
    // P0-14: clear the flag for regular users too. authRepo.updatePassword
    // doesn't touch must_change_pin, so we do it in a separate UPDATE.
    try {
      await queryOne(
        'UPDATE users SET must_change_pin = FALSE WHERE id = $1',
        [userId]
      );
    } catch (e) {
      // Column may not exist on pre-migration DBs — log and proceed
      // rather than failing a successful PIN change.
      console.warn('[auth.service] clear must_change_pin failed:', e.message);
    }
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

    // P0-14: random per-account temp PIN, replaces the hardcoded
    // '123456'. The admin who creates the account is the one shown
    // the temp PIN, and is responsible for handing it to the new
    // user out-of-band. The user can't do anything other than change
    // their PIN until they do — must_change_pin defaults to TRUE
    // via the column DEFAULT (see migration 002) but we set it
    // explicitly anyway so the behavior is obvious from this file.
    const tempPin = randomPin();
    const pin_hash = await bcrypt.hash(tempPin, BCRYPT_ROUNDS);
    const user = await authRepo.createUser({
      ...data,
      no_hp: data.no_hp || null,
      lokasi_id: data.lokasi_id || null,
      pos_jaga_id: data.pos_jaga_id || null,
      shift: data.shift || '08:00-16:00',
      pin_hash,
      must_change_pin: true,
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
    // P0-14: return temp_pin once — this is the only time it'll be in
    // the clear anywhere in the system. The caller (auth.controller.js)
    // is responsible for displaying it to the registering admin and
    // NOT logging it (the audit log purposely does not include it).
    return { ...user, temp_pin: tempPin, must_change_pin: true };
  }
}

module.exports = new AuthService();
