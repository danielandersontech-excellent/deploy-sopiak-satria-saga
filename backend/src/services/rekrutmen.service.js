/**
 * REKRUTMEN SERVICE — aturan bisnis modul rekrutmen.
 *
 * Alur publik (tanpa login):
 *   daftarPublik()  : validasi formulir, honeypot, magic-bytes berkas, cek NIK
 *                     duplikat (409), idempotency (pengiriman ulang → respons
 *                     yang sama, tanpa baris ganda), simpan, notifikasi admin.
 *   cekStatus()     : pelamar mengecek status dengan nomor referensi + NIK.
 *
 * Alur admin/supervisor (route sudah dijaga requireRole):
 *   list / detail / ubahStatus / jadikanAnggota / hapus / berkasPath.
 *
 * Data pelamar adalah data pribadi (NIK, alamat, no HP). Yang ditulis ke
 * logger/audit hanya id, nomor referensi, dan status — tidak pernah NIK/HP.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { hashPin } = require('../utils/pinHash');
const rekrutmenRepo = require('../repositories/rekrutmen.repository');
const opRepo = require('../repositories/operasional.repository');
const { logEvent } = require('../middleware/auditlog');
const { emitToRole } = require('../realtime/socketio');
const { logger } = require('../utils/logger');
const {
  REKRUTMEN_SLOTS, verifyMagicBytes, removeUploadedFiles,
  toRelativePrivatePath, resolvePrivatePath, PRIVATE_UPLOAD_DIR,
} = require('../middleware/uploadPrivate');

const { STATUS_LIST } = rekrutmenRepo;
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12');
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

// PIN awal untuk akun hasil rekrutmen. Berbeda dari register() (PIN acak yang
// dikembalikan sekali ke admin): pelamar diberi tahu PIN standar 123456 saat
// onboarding, dan must_change_pin = TRUE memaksa penggantian pada login pertama.
const PIN_AWAL_REKRUTMEN = '123456';

const PENDIDIKAN_LIST = ['SD', 'SMP', 'SMA/SMK', 'D3', 'S1', 'S2'];
const POSISI_LIST = ['anggota', 'komandan'];
const SLOT_WAJIB = ['foto', 'ktp', 'ijazah', 'skck'];
const NAMA_SLOT = { foto: 'Pas Foto', ktp: 'KTP', kk: 'Kartu Keluarga', ijazah: 'Ijazah', skck: 'SKCK', cv: 'CV', sertifikat: 'Sertifikat' };

// Nama field honeypot di formulir: tersembunyi dari manusia (CSS), bot pengisi
// otomatis biasanya mengisinya. Bila terisi → balas 201 palsu tanpa menyimpan.
const HONEYPOT_FIELD = 'website';

const str = (v, max) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.slice(0, max);
};

function normalizeHp(raw) {
  if (!raw) return null;
  let s = String(raw).replace(/[\s\-().]/g, '');
  if (s.startsWith('+62')) s = '0' + s.slice(3);
  else if (s.startsWith('62')) s = '0' + s.slice(2);
  return s;
}

function validasiPublik(body) {
  const errors = [];
  const nama = str(body.nama, 100);
  if (!nama || nama.length < 3) errors.push('Nama lengkap wajib diisi (minimal 3 karakter)');

  const nik = str(body.nik, 32);
  if (!nik || !/^[0-9]{16}$/.test(nik)) errors.push('NIK harus 16 digit angka');

  const no_hp = normalizeHp(body.no_hp);
  if (!no_hp || !/^08[0-9]{7,12}$/.test(no_hp)) errors.push('Nomor HP tidak valid (contoh: 0812xxxxxxx)');

  const email = str(body.email, 100);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.push('Format email tidak valid');

  const jenis_kelamin = str(body.jenis_kelamin, 1) || 'L';
  if (!['L', 'P'].includes(jenis_kelamin)) errors.push('Jenis kelamin harus L atau P');

  const tanggal_lahir = str(body.tanggal_lahir, 10);
  if (!tanggal_lahir || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal_lahir) || isNaN(Date.parse(tanggal_lahir))) {
    errors.push('Tanggal lahir wajib diisi (format YYYY-MM-DD)');
  } else {
    const umur = (Date.now() - Date.parse(tanggal_lahir)) / (365.25 * 24 * 3600 * 1000);
    if (umur < 18 || umur > 55) errors.push('Usia pelamar harus 18–55 tahun');
  }

  const pendidikan = str(body.pendidikan, 20);
  if (!pendidikan || !PENDIDIKAN_LIST.includes(pendidikan)) errors.push(`Pendidikan harus salah satu: ${PENDIDIKAN_LIST.join(', ')}`);

  const posisi_dilamar = str(body.posisi_dilamar, 20) || 'anggota';
  if (!POSISI_LIST.includes(posisi_dilamar)) errors.push('Posisi yang dilamar tidak valid');

  const tinggi_badan = body.tinggi_badan ? parseInt(body.tinggi_badan, 10) : null;
  if (tinggi_badan !== null && (isNaN(tinggi_badan) || tinggi_badan < 100 || tinggi_badan > 250)) errors.push('Tinggi badan harus 100–250 cm');
  const berat_badan = body.berat_badan ? parseInt(body.berat_badan, 10) : null;
  if (berat_badan !== null && (isNaN(berat_badan) || berat_badan < 30 || berat_badan > 200)) errors.push('Berat badan harus 30–200 kg');

  const alamat = str(body.alamat, 500);
  if (!alamat || alamat.length < 10) errors.push('Alamat wajib diisi (minimal 10 karakter)');

  const idempotency_key = str(body.idempotency_key, 100);
  if (idempotency_key && !/^[A-Za-z0-9_-]+$/.test(idempotency_key)) errors.push('idempotency_key tidak valid');

  return {
    errors,
    data: {
      nama, nik, no_hp, email, jenis_kelamin, tanggal_lahir, pendidikan, posisi_dilamar,
      tinggi_badan, berat_badan, alamat,
      tempat_lahir: str(body.tempat_lahir, 100),
      lokasi_preferensi: str(body.lokasi_preferensi, 100),
      pengalaman: str(body.pengalaman, 2000),
      catatan: str(body.catatan, 1000),
      idempotency_key,
    },
  };
}

// Karakter tanpa 0/O/1/I agar nomor mudah dibaca & disalin.
const REF_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function buatNomorReferensi() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  let rand = '';
  for (let i = 0; i < 5; i++) rand += REF_CHARS[crypto.randomInt(0, REF_CHARS.length)];
  return `REK-${ymd}-${rand}`;
}

function buatBerkasMap(files) {
  const berkas = {};
  for (const slot of REKRUTMEN_SLOTS) {
    const f = files && files[slot] && files[slot][0];
    if (!f) continue;
    berkas[slot] = {
      path: toRelativePrivatePath(f.path),
      nama_asli: String(f.originalname || '').slice(0, 150),
      ukuran: f.size,
      mime: f.mimetype,
    };
  }
  return berkas;
}

function hapusBerkasFisik(berkas) {
  if (!berkas || typeof berkas !== 'object') return;
  for (const info of Object.values(berkas)) {
    const abs = info && resolvePrivatePath(info.path);
    if (abs) { try { fs.unlinkSync(abs); } catch { /* sudah tidak ada */ } }
  }
}

class RekrutmenService {
  // ===== PUBLIK =====
  async daftarPublik(body, files, meta = {}) {
    // Honeypot: bot mengisi field tersembunyi → pura-pura sukses, jangan simpan.
    if (body && typeof body[HONEYPOT_FIELD] === 'string' && body[HONEYPOT_FIELD].trim() !== '') {
      removeUploadedFiles(files);
      logger.warn(`[Rekrutmen] Honeypot terisi dari IP ${meta.ip || '-'} — pengiriman diabaikan`);
      return { nomor_referensi: buatNomorReferensi(), status: 'baru', honeypot: true };
    }

    const { errors, data } = validasiPublik(body || {});

    // Berkas wajib & magic bytes.
    for (const slot of SLOT_WAJIB) {
      if (!files || !files[slot] || !files[slot][0]) errors.push(`Berkas ${NAMA_SLOT[slot]} wajib diunggah`);
    }
    for (const slot of REKRUTMEN_SLOTS) {
      const f = files && files[slot] && files[slot][0];
      if (f && !verifyMagicBytes(f.path, f.mimetype)) {
        errors.push(`Berkas ${NAMA_SLOT[slot]} bukan file ${f.mimetype === 'application/pdf' ? 'PDF' : 'gambar'} yang valid`);
      }
    }
    if (errors.length) {
      removeUploadedFiles(files);
      throw { status: 400, message: 'Validasi gagal', details: errors };
    }

    // Idempotency lebih dulu: pengiriman ulang dengan key sama → respons lama.
    if (data.idempotency_key) {
      const existing = await rekrutmenRepo.findByIdempotency(data.idempotency_key);
      if (existing) {
        removeUploadedFiles(files);
        return { nomor_referensi: existing.nomor_referensi, nama: existing.nama, status: existing.status, created_at: existing.created_at, duplicate: true };
      }
    }

    // NIK sudah pernah mendaftar → 409 (pesan ramah, sertakan nomor referensi lama).
    const byNik = await rekrutmenRepo.findByNik(data.nik);
    if (byNik) {
      removeUploadedFiles(files);
      throw { status: 409, message: `NIK ini sudah terdaftar dengan nomor referensi ${byNik.nomor_referensi}. Gunakan menu Cek Status atau hubungi kami bila ada perubahan data.` };
    }

    const berkas = buatBerkasMap(files);
    let row = null; let duplicate = false;
    for (let attempt = 0; attempt < 3 && !row; attempt++) {
      try {
        const res = await rekrutmenRepo.create({
          ...data,
          nomor_referensi: buatNomorReferensi(),
          berkas,
          ip_address: meta.ip || null,
          user_agent: meta.userAgent ? String(meta.userAgent).slice(0, 300) : null,
        });
        row = res.row; duplicate = res.duplicate;
      } catch (err) {
        if (err && err.code === '23505' && /ux_rekrutmen_nomor/.test(err.constraint || '')) continue; // tabrakan nomor → ulang
        if (err && err.code === '23505' && /ux_rekrutmen_nik/.test(err.constraint || '')) {
          removeUploadedFiles(files);
          throw { status: 409, message: 'NIK ini sudah terdaftar. Gunakan menu Cek Status atau hubungi kami.' };
        }
        removeUploadedFiles(files);
        throw err;
      }
    }
    if (!row) { removeUploadedFiles(files); throw { status: 500, message: 'Gagal membuat nomor referensi, coba lagi' }; }
    if (duplicate) removeUploadedFiles(files);

    if (!duplicate) {
      logEvent(null, 'PUBLIK', 'CREATE', 'rekrutmen_pelamar', row.id, { nomor_referensi: row.nomor_referensi, posisi: row.posisi_dilamar }).catch(() => {});
      try {
        await opRepo.createNotifikasi({
          tipe: 'info',
          judul: 'Lamaran Baru Masuk',
          pesan: `${row.nama} melamar posisi ${row.posisi_dilamar} (${row.nomor_referensi}). Buka menu Rekrutmen untuk memproses.`,
          target_role: ['admin', 'supervisor'],
          data: { type: 'rekrutmen_baru', pelamar_id: row.id, nomor_referensi: row.nomor_referensi },
        });
      } catch (e) { logger.warn(`[Rekrutmen] Gagal membuat notifikasi: ${e.message}`); }
      emitToRole(['admin', 'supervisor'], 'rekrutmen:new', { id: row.id, nomor_referensi: row.nomor_referensi, nama: row.nama, posisi_dilamar: row.posisi_dilamar, created_at: row.created_at });
    }

    return { nomor_referensi: row.nomor_referensi, nama: row.nama, status: row.status, created_at: row.created_at, duplicate };
  }

  async cekStatus(nomor, nik) {
    const n = str(nomor, 40); const k = str(nik, 32);
    if (!n || !/^REK-\d{8}-[A-Z0-9]{5}$/.test(n.toUpperCase()) || !k || !/^[0-9]{16}$/.test(k)) {
      throw { status: 400, message: 'Nomor referensi dan NIK (16 digit) wajib diisi dengan benar' };
    }
    const row = await rekrutmenRepo.findByNomorAndNik(n.toUpperCase(), k);
    if (!row) throw { status: 404, message: 'Lamaran tidak ditemukan. Periksa kembali nomor referensi dan NIK Anda.' };
    return row;
  }

  // ===== ADMIN =====
  async list(filters) {
    return rekrutmenRepo.findAll(filters || {});
  }

  async ringkasan() {
    return rekrutmenRepo.countByStatus();
  }

  async detail(id) {
    const row = await rekrutmenRepo.findById(id);
    if (!row) throw { status: 404, message: 'Pelamar tidak ditemukan' };
    return row;
  }

  async ubahStatus(id, user, body) {
    const status = str(body && body.status, 20);
    if (!status || !STATUS_LIST.includes(status)) throw { status: 400, message: `Status harus salah satu: ${STATUS_LIST.join(', ')}` };
    if (status === 'diterima') throw { status: 400, message: 'Gunakan tombol "Jadikan Anggota" untuk menerima pelamar' };
    const cur = await rekrutmenRepo.findById(id);
    if (!cur) throw { status: 404, message: 'Pelamar tidak ditemukan' };
    if (cur.status === 'diterima' || cur.user_id) throw { status: 409, message: 'Pelamar sudah menjadi anggota, status tidak dapat diubah' };
    const row = await rekrutmenRepo.updateStatus(id, {
      status,
      catatan_admin: str(body && body.catatan_admin, 1000),
      diproses_oleh: user.id,
    });
    logEvent(user.id, user.nama || '', 'UPDATE', 'rekrutmen_pelamar', id, { status, nomor_referensi: row.nomor_referensi }).catch(() => {});
    return row;
  }

  /**
   * Buat akun users dari pelamar. NRP = AGT### berikutnya (KMD### bila posisi
   * komandan), PIN awal 123456, must_change_pin TRUE. Berkas pelamar DISALIN ke
   * uploads/personil/<NRP>/ agar tampil di halaman Personil dengan pola yang
   * sama seperti berkas personil lain (kolom users.berkas_*).
   */
  async jadikanAnggota(id, user, body = {}) {
    const p = await rekrutmenRepo.findById(id);
    if (!p) throw { status: 404, message: 'Pelamar tidak ditemukan' };
    if (p.status === 'diterima' || p.user_id) throw { status: 409, message: 'Pelamar sudah menjadi anggota' };
    if (p.status === 'ditolak' || p.status === 'dibatalkan') throw { status: 409, message: `Pelamar berstatus ${p.status}, ubah status dulu sebelum menjadikannya anggota` };

    const role = body.role === 'komandan' ? 'komandan' : (p.posisi_dilamar === 'komandan' ? 'komandan' : 'anggota');
    const shift = str(body.shift, 20) || '06:00-14:00';
    const lokasi_id = str(body.lokasi_id, 40) || null;
    if (lokasi_id && !/^[0-9a-f-]{36}$/i.test(lokasi_id)) throw { status: 400, message: 'lokasi_id tidak valid' };

    const pin_hash = await hashPin(PIN_AWAL_REKRUTMEN, BCRYPT_ROUNDS);
    const salinan = await this._salinBerkasKePersonil(p);

    const result = await rekrutmenRepo.jadikanAnggota(id, {
      nama: p.nama, role, no_hp: p.no_hp, lokasi_id, shift, pin_hash,
      no_ktp: p.nik, tempat_lahir: p.tempat_lahir, tanggal_lahir: p.tanggal_lahir,
      alamat_rumah: p.alamat, pendidikan: p.pendidikan, jenis_kelamin: p.jenis_kelamin,
      catatan_personil: `Direkrut via website (${p.nomor_referensi})${p.pengalaman ? '. Pengalaman: ' + p.pengalaman.slice(0, 300) : ''}`,
      berkas_ktp: salinan.ktp || null, berkas_ijazah: salinan.ijazah || null, berkas_skck: salinan.skck || null,
      berkas_sertifikat: salinan.sertifikat || null, berkas_cv: salinan.cv || null,
      berkas_foto_formal: salinan.foto || null, foto_url: salinan.foto || null,
    }, user.id);

    if (result.error === 'NOT_FOUND') throw { status: 404, message: 'Pelamar tidak ditemukan' };
    if (result.error === 'ALREADY') throw { status: 409, message: 'Pelamar sudah menjadi anggota' };

    logEvent(user.id, user.nama || '', 'REKRUT_JADI_ANGGOTA', 'users', result.user.id, {
      nrp: result.user.nrp, pelamar_id: id, nomor_referensi: p.nomor_referensi,
    }).catch(() => {});

    return {
      user: result.user,
      pelamar: result.pelamar,
      // PIN awal standar — ditampilkan sekali ke admin untuk disampaikan ke anggota.
      initial_pin: PIN_AWAL_REKRUTMEN,
      must_change_pin: true,
    };
  }

  async hapus(id, user) {
    const p = await rekrutmenRepo.findById(id);
    if (!p) throw { status: 404, message: 'Pelamar tidak ditemukan' };
    const ok = await rekrutmenRepo.delete(id);
    if (ok) hapusBerkasFisik(p.berkas);
    logEvent(user.id, user.nama || '', 'DELETE', 'rekrutmen_pelamar', id, { nomor_referensi: p.nomor_referensi }).catch(() => {});
    return { message: 'Lamaran dihapus' };
  }

  /** Path absolut berkas privat untuk di-stream oleh controller. */
  async berkasPath(id, jenis) {
    if (!REKRUTMEN_SLOTS.includes(jenis)) throw { status: 400, message: 'Jenis berkas tidak dikenal' };
    const p = await rekrutmenRepo.findById(id);
    if (!p) throw { status: 404, message: 'Pelamar tidak ditemukan' };
    const info = p.berkas && p.berkas[jenis];
    if (!info || !info.path) throw { status: 404, message: 'Berkas tidak ada' };
    const abs = resolvePrivatePath(info.path);
    if (!abs || !fs.existsSync(abs)) throw { status: 404, message: 'File berkas tidak ditemukan di penyimpanan' };
    return { abs, mime: info.mime || 'application/octet-stream', nama: `${p.nomor_referensi}-${jenis}${path.extname(abs)}` };
  }

  /**
   * Salin berkas privat pelamar → uploads/personil/<NRP-sementara>/ (folder
   * publik, pola yang sama dengan upload berkas personil di web-admin).
   * NRP final belum diketahui sebelum transaksi, jadi folder memakai id pelamar.
   * Mengembalikan peta { slot: url_publik }.
   */
  async _salinBerkasKePersonil(p) {
    const out = {};
    const berkas = p.berkas || {};
    const apiUrl = process.env.API_URL || 'http://localhost:3000';
    const destDir = path.join(UPLOAD_DIR, 'personil', `rekrutmen-${p.id}`);
    for (const slot of REKRUTMEN_SLOTS) {
      const info = berkas[slot];
      const abs = info && resolvePrivatePath(info.path);
      if (!abs || !fs.existsSync(abs)) continue;
      try {
        fs.mkdirSync(destDir, { recursive: true });
        const name = path.basename(abs);
        fs.copyFileSync(abs, path.join(destDir, name));
        out[slot] = `${apiUrl}/uploads/personil/rekrutmen-${p.id}/${name}`;
      } catch (e) {
        logger.warn(`[Rekrutmen] Gagal menyalin berkas ${slot} pelamar ${p.id}: ${e.message}`);
      }
    }
    return out;
  }
}

module.exports = new RekrutmenService();
module.exports.PRIVATE_UPLOAD_DIR = PRIVATE_UPLOAD_DIR;
