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
 */
const laporanRepo = require('../repositories/laporan.repository');
const { logEvent } = require('../middleware/auditlog');
const { emitToAll, emitToRole } = require('../realtime/socketio');
const { getScopeFilter, applyLokasiScope } = require('../utils/scope');

class LaporanService {
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
    const foto_dokumentasi = data.foto_dokumentasi ? (typeof data.foto_dokumentasi === 'string' ? JSON.parse(data.foto_dokumentasi) : data.foto_dokumentasi) : [];
    const row = await laporanRepo.createHarian({ user_id: user.id, ...data, fotos, foto_dokumentasi, lokasi_id: data.lokasi_id || user.lokasi_id || null });
    logEvent(user.id, user.nama || '', 'CREATE', 'laporan_harian', row.id, { shift: data.shift });
    emitToRole(['supervisor', 'admin', 'komandan'], 'laporan:new', { type: 'harian', ...row, nama: user.nama });
    emitToAll('stats:update', { type: 'laporan' });
    return row;
  }

  async validateHarian(id, user, data) {
    if (!['approved', 'revision', 'rejected'].includes(data.status)) throw { status: 400, message: 'Status tidak valid' };
    const row = await laporanRepo.validateHarian(id, data.status, data.catatan || null, user.id);
    if (!row) throw { status: 404, message: 'Laporan tidak ditemukan' };
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
    const row = await laporanRepo.createKejadian({
      user_id: user.id, jenis: data.jenis, prioritas: data.prioritas,
      lokasi_text: data.lokasi_text, latitude: data.latitude ? parseFloat(data.latitude) : null,
      longitude: data.longitude ? parseFloat(data.longitude) : null, kronologi: data.kronologi, bukti_media: bukti,
      lokasi_id: data.lokasi_id || user.lokasi_id || null,
      idempotency_key: data.idempotency_key || null, // [3-2]
    });
    logEvent(user.id, user.nama || '', 'CREATE', 'laporan_kejadian', row.id, { jenis: data.jenis, prioritas: data.prioritas });
    emitToRole(['supervisor', 'admin', 'komandan'], 'laporan:new', { type: 'kejadian', ...row, nama: user.nama });
    if (data.prioritas === 'kritis' || data.prioritas === 'tinggi') {
      emitToAll('laporan:urgent', { ...row, nama: user.nama });
    }
    return row;
  }

  async validateKejadian(id, user, data) {
    const row = await laporanRepo.validateKejadian(id, data.status, data.catatan || null, user.id);
    if (!row) throw { status: 404, message: 'Laporan tidak ditemukan' };
    return row;
  }
}

module.exports = new LaporanService();