/**
 * LAPORAN SERVICE
 * 
 * FIX v3.2:
 * - Tambah filter lokasi_id untuk role 'komandan'
 *   Sebelumnya komandan tidak difilter → menerima semua laporan dari semua lokasi
 *   Sekarang komandan hanya melihat laporan dari lokasi yang sama (user.lokasi_id)
 */
const laporanRepo = require('../repositories/laporan.repository');
const { logEvent } = require('../middleware/auditlog');
const { emitToAll, emitToRole } = require('../realtime/socketio');

class LaporanService {
  // ====== HARIAN ======
  async getHarian(filters, user) {
    // Anggota hanya melihat laporan sendiri
    if (['anggota'].includes(user.role)) filters.user_id = user.id;

    // FIX: Komandan hanya melihat laporan dari lokasi yang sama
    if (user.role === 'komandan' && user.lokasi_id) {
      filters.lokasi_id = user.lokasi_id;
    }

    return laporanRepo.findHarian(filters);
  }

  async createHarian(user, data, fotos) {
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
    // Anggota hanya melihat laporan sendiri
    if (['anggota'].includes(user.role)) filters.user_id = user.id;

    // FIX: Komandan hanya melihat laporan dari lokasi yang sama
    if (user.role === 'komandan' && user.lokasi_id) {
      filters.lokasi_id = user.lokasi_id;
    }

    return laporanRepo.findKejadian(filters);
  }

  async createKejadian(user, data, bukti) {
    const row = await laporanRepo.createKejadian({
      user_id: user.id, jenis: data.jenis, prioritas: data.prioritas,
      lokasi_text: data.lokasi_text, latitude: data.latitude ? parseFloat(data.latitude) : null,
      longitude: data.longitude ? parseFloat(data.longitude) : null, kronologi: data.kronologi, bukti_media: bukti,
      lokasi_id: data.lokasi_id || user.lokasi_id || null,
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
