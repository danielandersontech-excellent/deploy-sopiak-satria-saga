/**
 * LAPORAN SERVICE
 *
 * P0-6 (Tahap 4): centralized lokasi scoping. The previous hand-rolled
 * "komandan -> filters.lokasi_id = user.lokasi_id" worked for komandan
 * but left klien with cross-tenant access (a klien JWT had no scope
 * applied at all). Now uses utils/scope.getScopeFilter +
 * applyLokasiScope, which:
 *   - applies the right scope per role (admin/supervisor: none;
 *     komandan/anggota: own lokasi; klien: every lokasi linked to
 *     their client_id);
 *   - intersects the scope with any caller-supplied lokasi_id, so
 *     a komandan can't escape their lokasi by passing ?lokasi_id=X
 *     for a different lokasi.
 *
 * [Audit 2A]
 *   - validateHarian/validateKejadian: komandan hanya boleh memvalidasi
 *     laporan dari lokasinya sendiri (sebelumnya cukup tahu id laporan lokasi
 *     lain → IDOR). Status kejadian kini divalidasi (sebelumnya nilai apa pun
 *     lolos → pelanggaran CHECK → 500). Validasi hanya untuk laporan 'pending'/
 *     'revision'; laporan yang sudah approved tidak bisa diubah diam-diam.
 *   - createHarian: kondisi & shift divalidasi; foto_dokumentasi JSON rusak →
 *     400 (bukan 500).
 *   - Event realtime 'laporan:urgent' tidak lagi emitToAll (bocor lintas klien)
 *     → peran komando + kamar lokasi terkait.
 */
const laporanRepo = require('../repositories/laporan.repository');
const { logEvent } = require('../middleware/auditlog');
const { emitToAll, emitToRole, emitToLokasi, emitToUser } = require('../realtime/socketio');
const { getScopeFilter, applyLokasiScope } = require('../utils/scope');

const VALID_STATUS = ['approved', 'revision', 'rejected'];
const KONDISI = ['aman', 'ada_masalah', 'perhatian_khusus'];
const PRIORITAS = ['rendah', 'sedang', 'tinggi', 'kritis'];

function parseJsonArray(v, label) {
  if (v == null || v === '') return [];
  if (Array.isArray(v)) return v;
  try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; }
  catch { throw { status: 400, message: `${label} bukan JSON array yang valid` }; }
}

class LaporanService {
  /**
   * Pemeriksaan scope untuk validasi: admin/supervisor bebas; komandan (dan
   * peran lain yang lolos requireRole) hanya laporan yang lokasinya ada di
   * scope-nya. Out-of-scope → 404 (tidak membocorkan keberadaan).
   */
  async _assertCanValidate(table, id, user) {
    const info = await laporanRepo.findLokasiOf(table, id);
    if (!info) throw { status: 404, message: 'Laporan tidak ditemukan' };
    const scope = await getScopeFilter(user);
    if (!scope.unrestricted) {
      if (!info.lokasi_id || !scope.lokasiIds.includes(info.lokasi_id)) {
        throw { status: 404, message: 'Laporan tidak ditemukan' };
      }
    }
    if (!['pending', 'revision', 'draft'].includes(info.status)) {
      throw { status: 409, message: `Laporan sudah berstatus ${info.status}` };
    }
    return info;
  }

  // ====== HARIAN ======
  async getHarian(filters, user) {
    // Anggota only see their own reports — this is a stricter cut
    // than lokasi scoping, so we keep it.
    if (user && user.role === 'anggota') {
      filters.user_id = user.id;
    }
    // Apply lokasi scope on top (klien / komandan / etc).
    const scope = await getScopeFilter(user);
    applyLokasiScope(filters, scope);
    return laporanRepo.findHarian(filters);
  }

  async createHarian(user, data, fotos) {
    // [3-8] Pertahankan validasi panjang minimal di server (konten ter-trim)
    // agar tidak bisa dilewati dengan spasi / klien yang dimodifikasi.
    if (!data.aktivitas || String(data.aktivitas).trim().length < 50) {
      throw { status: 400, message: 'Aktivitas wajib diisi minimal 50 karakter' };
    }
    if (data.kondisi && !KONDISI.includes(data.kondisi)) {
      throw { status: 400, message: `Kondisi harus salah satu: ${KONDISI.join('/')}` };
    }
    const foto_dokumentasi = parseJsonArray(data.foto_dokumentasi, 'foto_dokumentasi');
    const row = await laporanRepo.createHarian({
      user_id: user.id, ...data, kondisi: data.kondisi || 'aman', fotos, foto_dokumentasi,
      lokasi_id: data.lokasi_id || user.lokasi_id || null,
    });
    logEvent(user.id, user.nama || '', 'CREATE', 'laporan_harian', row.id, { shift: data.shift });
    emitToRole(['supervisor', 'admin', 'komandan'], 'laporan:new', { type: 'harian', ...row, nama: user.nama });
    emitToAll('stats:update', { type: 'laporan' });
    return row;
  }

  async validateHarian(id, user, data) {
    if (!VALID_STATUS.includes(data.status)) throw { status: 400, message: 'Status tidak valid' };
    await this._assertCanValidate('laporan_harian', id, user);
    const row = await laporanRepo.validateHarian(id, data.status, data.catatan || null, user.id);
    if (!row) throw { status: 404, message: 'Laporan tidak ditemukan' };
    logEvent(user.id, user.nama || '', 'VALIDATE', 'laporan_harian', id, { status: data.status }).catch(() => {});
    if (row.user_id) emitToUser(row.user_id, 'laporan:validated', { type: 'harian', id: row.id, status: row.status, catatan: row.catatan_komandan });
    return row;
  }

  // ====== KEJADIAN ======
  async getKejadian(filters, user) {
    if (user && user.role === 'anggota') {
      filters.user_id = user.id;
    }
    const scope = await getScopeFilter(user);
    applyLokasiScope(filters, scope);
    return laporanRepo.findKejadian(filters);
  }

  async createKejadian(user, data, bukti) {
    // [3-8] validasi panjang minimal kronologi (konten ter-trim) di server.
    if (!data.kronologi || String(data.kronologi).trim().length < 100) {
      throw { status: 400, message: 'Kronologi wajib diisi minimal 100 karakter' };
    }
    if (!data.jenis || String(data.jenis).trim().length < 2) throw { status: 400, message: 'Jenis kejadian wajib diisi' };
    if (data.prioritas && !PRIORITAS.includes(data.prioritas)) throw { status: 400, message: `Prioritas harus salah satu: ${PRIORITAS.join('/')}` };
    const lokasi_id = data.lokasi_id || user.lokasi_id || null;
    const row = await laporanRepo.createKejadian({
      user_id: user.id, jenis: data.jenis, prioritas: data.prioritas,
      lokasi_text: data.lokasi_text, latitude: data.latitude ? parseFloat(data.latitude) : null,
      longitude: data.longitude ? parseFloat(data.longitude) : null, kronologi: data.kronologi, bukti_media: bukti,
      lokasi_id,
      idempotency_key: data.idempotency_key || null, // [3-2]
    });
    logEvent(user.id, user.nama || '', 'CREATE', 'laporan_kejadian', row.id, { jenis: data.jenis, prioritas: data.prioritas });
    emitToRole(['supervisor', 'admin', 'komandan'], 'laporan:new', { type: 'kejadian', ...row, nama: user.nama });
    if (data.prioritas === 'kritis' || data.prioritas === 'tinggi') {
      // [Audit 2A] Dulu emitToAll → klien tenant lain ikut menerima detail insiden.
      emitToRole(['supervisor', 'admin', 'komandan'], 'laporan:urgent', { ...row, nama: user.nama });
      if (lokasi_id) emitToLokasi(lokasi_id, 'laporan:urgent', { ...row, nama: user.nama });
    }
    return row;
  }

  async validateKejadian(id, user, data) {
    if (!VALID_STATUS.includes(data.status)) throw { status: 400, message: 'Status tidak valid' };
    await this._assertCanValidate('laporan_kejadian', id, user);
    const row = await laporanRepo.validateKejadian(id, data.status, data.catatan || null, user.id);
    if (!row) throw { status: 404, message: 'Laporan tidak ditemukan' };
    logEvent(user.id, user.nama || '', 'VALIDATE', 'laporan_kejadian', id, { status: data.status }).catch(() => {});
    if (row.user_id) emitToUser(row.user_id, 'laporan:validated', { type: 'kejadian', id: row.id, status: row.status, catatan: row.catatan_komandan });
    return row;
  }
}

module.exports = new LaporanService();
