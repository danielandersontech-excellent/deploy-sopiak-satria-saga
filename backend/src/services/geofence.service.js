/**
 * GEOFENCE SERVICE - Complex geofence business logic
 */
const geoRepo = require('../repositories/geofence.repository');
const opRepo = require('../repositories/operasional.repository');
const { haversine } = require('../utils/helpers');
const { emitToRole, emitToUser } = require('../realtime/socketio');
const { queryOne } = require('../config/database');

class GeofenceService {
  async checkPosition(user, data) {
    const { latitude, longitude, accuracy } = data;
    if (!latitude || !longitude) throw { status: 400, message: 'latitude & longitude wajib' };

    // 1. Update posisi & simpan history
    await geoRepo.updateUserPosition(user.id, latitude, longitude);
    await geoRepo.saveLocationHistory(user.id, latitude, longitude, accuracy || null);

    // 2. Ambil lokasi perusahaan
    const lokasi = await geoRepo.getUserLokasi(user.id);
    if (!lokasi || !lokasi.latitude || !lokasi.longitude) {
      return { dalam_radius: true, jarak: 0, message: 'Lokasi perusahaan belum di-set' };
    }

    // 3. Hitung jarak
    const jarak = haversine(latitude, longitude, lokasi.latitude, lokasi.longitude);
    const radius = lokasi.radius || 500;
    const dalam_radius = jarak <= radius;

    // 4. Cek izin aktif
    const izinAktif = await geoRepo.findActiveIzin(user.id, lokasi.id);
    let violation = null;
    let izin_status = null;

    if (!dalam_radius) {
      if (izinAktif) {
        izin_status = 'approved';
        // Cek expired
        if (izinAktif.batas_waktu && new Date(izinAktif.batas_waktu) < new Date()) {
          await geoRepo.expireIzin(izinAktif.id);
          izin_status = 'expired';
          violation = await geoRepo.createViolation({
            user_id: user.id, lokasi_id: lokasi.id, tipe: 'overtime',
            izin_keluar_id: izinAktif.id, latitude, longitude, jarak: Math.round(jarak)
          });
          const notifData = { type: 'geofence_overtime', user_id: user.id, user_nama: user.nama, lokasi_nama: lokasi.nama, jarak: Math.round(jarak) };
          emitToUser(user.id, 'geofence:overtime', notifData);
          emitToRole(['komandan', 'supervisor', 'admin'], 'geofence:overtime', notifData);
          await opRepo.createNotifikasi({ tipe: 'warning', judul: 'Waktu Izin Habis',
            pesan: `${user.nama} melewati batas waktu izin keluar di ${lokasi.nama}. Jarak: ${Math.round(jarak)}m.`,
            target_role: ['komandan', 'supervisor', 'admin'], data: notifData });
        } else {
          emitToRole(['komandan', 'supervisor', 'admin'], 'geofence:outside_permitted', {
            user_id: user.id, user_nama: user.nama, lokasi_nama: lokasi.nama,
            jarak: Math.round(jarak), izin_id: izinAktif.id, batas_waktu: izinAktif.batas_waktu });
        }
      } else {
        // TANPA IZIN
        const recent = await geoRepo.findRecentViolation(user.id, lokasi.id);
        if (!recent) {
          violation = await geoRepo.createViolation({
            user_id: user.id, lokasi_id: lokasi.id, tipe: 'no_permission',
            latitude, longitude, jarak: Math.round(jarak)
          });
          const notifData = { type: 'geofence_violation', severity: 'danger',
            user_id: user.id, user_nama: user.nama, lokasi_nama: lokasi.nama, jarak: Math.round(jarak), radius };
          emitToRole(['komandan', 'supervisor', 'admin'], 'geofence:violation', notifData);
          emitToUser(user.id, 'geofence:warning', { message: 'Anda berada di luar wilayah tanpa izin!' });
          await opRepo.createNotifikasi({ tipe: 'danger', judul: 'Pelanggaran Geofence',
            pesan: `${user.nama} KELUAR dari wilayah ${lokasi.nama} TANPA IZIN! Jarak: ${Math.round(jarak)}m (radius: ${radius}m).`,
            target_role: ['komandan', 'supervisor', 'admin'], data: notifData });
        }
        izin_status = 'none';
      }
    } else {
      // Kembali ke dalam radius
      if (izinAktif) {
        await geoRepo.returnIzin(izinAktif.id);
        emitToRole(['komandan', 'supervisor', 'admin'], 'geofence:returned', {
          user_id: user.id, user_nama: user.nama, lokasi_nama: lokasi.nama });
      }
    }

    return {
      dalam_radius, jarak: Math.round(jarak), radius, lokasi_nama: lokasi.nama,
      izin_aktif: izinAktif ? {
        id: izinAktif.id, status: izin_status || izinAktif.status,
        durasi_menit: izinAktif.durasi_menit, batas_waktu: izinAktif.batas_waktu,
        sisa_menit: izinAktif.batas_waktu ? Math.max(0, Math.round((new Date(izinAktif.batas_waktu) - new Date()) / 60000)) : null,
      } : null,
      violation: violation ? { id: violation.id, tipe: violation.tipe } : null,
    };
  }

  async requestIzin(user, data) {
    if (!data.alasan) throw { status: 400, message: 'Alasan wajib diisi' };
    const u = await queryOne('SELECT lokasi_id FROM users WHERE id=$1', [user.id]);
    if (!u?.lokasi_id) throw { status: 400, message: 'User belum di-assign ke lokasi' };

    const existing = await geoRepo.findPendingIzin(user.id);
    if (existing) throw { status: 400, message: 'Sudah ada permintaan izin yang pending' };

    const izin = await geoRepo.createIzin({ user_id: user.id, lokasi_id: u.lokasi_id, alasan: data.alasan, latitude: data.latitude, longitude: data.longitude });
    const lokasi = await queryOne('SELECT nama FROM lokasi WHERE id=$1', [u.lokasi_id]);
    emitToRole(['komandan', 'supervisor', 'admin'], 'geofence:izin_request', {
      izin_id: izin.id, user_id: user.id, user_nama: user.nama, lokasi_nama: lokasi?.nama, alasan: data.alasan });
    await opRepo.createNotifikasi({ tipe: 'info', judul: 'Permintaan Izin Keluar',
      pesan: `${user.nama} meminta izin keluar dari ${lokasi?.nama || 'wilayah'}. Alasan: ${data.alasan}`,
      target_role: ['komandan', 'supervisor', 'admin'], data: { izin_id: izin.id } });
    return izin;
  }

  async approveIzin(id, approver, data) {
    if (!data.durasi_menit || data.durasi_menit < 1) throw { status: 400, message: 'durasi_menit wajib (minimal 1)' };
    const izin = await geoRepo.approveIzin(id, approver.id, data.durasi_menit, data.catatan || null);
    if (!izin) throw { status: 404, message: 'Izin tidak ditemukan atau sudah diproses' };
    emitToUser(izin.user_id, 'geofence:izin_approved', {
      izin_id: izin.id, durasi_menit: data.durasi_menit, batas_waktu: izin.batas_waktu, approved_by_nama: approver.nama });
    emitToRole(['supervisor', 'admin'], 'geofence:izin_approved', {
      izin_id: izin.id, user_id: izin.user_id, durasi_menit: data.durasi_menit, approved_by_nama: approver.nama });
    await opRepo.createNotifikasi({ tipe: 'success', judul: 'Izin Keluar Disetujui',
      pesan: `Izin keluar Anda disetujui oleh ${approver.nama}. Batas waktu: ${data.durasi_menit} menit.`,
      target_user_id: izin.user_id, data: { izin_id: izin.id, batas_waktu: izin.batas_waktu } });
    return izin;
  }

  async rejectIzin(id, rejecter, data) {
    const izin = await geoRepo.rejectIzin(id, rejecter.id, data.catatan);
    if (!izin) throw { status: 404, message: 'Izin tidak ditemukan atau sudah diproses' };
    emitToUser(izin.user_id, 'geofence:izin_rejected', { izin_id: izin.id, catatan: data.catatan, rejected_by_nama: rejecter.nama });
    await opRepo.createNotifikasi({ tipe: 'danger', judul: 'Izin Keluar Ditolak',
      pesan: `Izin keluar Anda ditolak oleh ${rejecter.nama}. ${data.catatan ? 'Alasan: ' + data.catatan : ''}`,
      target_user_id: izin.user_id });
    return izin;
  }

  async getIzinList(filters) { return geoRepo.findIzinList(filters); }
  async getViolations(filters) { return geoRepo.findViolations(filters); }
  async ackViolation(id, userId) {
    const v = await geoRepo.acknowledgeViolation(id, userId);
    if (!v) throw { status: 404, message: 'Tidak ditemukan' };
    return v;
  }

  async getLiveMapData(lokasiId) {
    const [users, lokasi, pos_jaga, violations, izin_aktif] = await Promise.all([
      geoRepo.getPersonnelPositions(lokasiId), geoRepo.getActiveLokasi(lokasiId),
      geoRepo.getActivePosJaga(lokasiId), geoRepo.getUnacknowledgedViolations(), geoRepo.getActiveIzinList(),
    ]);
    const personnel = users.map(u => {
      let jarak = null, dalam_radius = true;
      if (u.lok_lat && u.lok_lng && u.last_latitude && u.last_longitude) {
        jarak = Math.round(haversine(u.last_latitude, u.last_longitude, u.lok_lat, u.lok_lng));
        dalam_radius = jarak <= (u.lok_radius || 500);
      }
      return { id: u.id, nrp: u.nrp, nama: u.nama, role: u.role, status: u.status, foto_url: u.foto_url,
        latitude: u.last_latitude, longitude: u.last_longitude, last_seen: u.last_seen,
        lokasi_nama: u.lokasi_nama, pos_nama: u.pos_nama, jarak, dalam_radius, lok_radius: u.lok_radius };
    });
    return { personnel, lokasi, pos_jaga, violations, izin_aktif,
      total_online: personnel.filter(p => p.status === 'on_duty' || p.status === 'patroli').length,
      total_outside: personnel.filter(p => !p.dalam_radius).length };
  }

  async getStatus(userId) {
    const user = await geoRepo.getUserGeofenceStatus(userId);
    if (!user || !user.lok_lat) return { dalam_radius: true, message: 'Lokasi belum di-set' };
    const jarak = haversine(user.last_latitude || 0, user.last_longitude || 0, user.lok_lat, user.lok_lng);
    const izin = await geoRepo.findActiveIzin(userId, null);
    return { dalam_radius: jarak <= (user.radius || 500), jarak: Math.round(jarak),
      radius: user.radius || 500, lokasi_nama: user.lokasi_nama, izin_aktif: izin || null };
  }
}

module.exports = new GeofenceService();
