/**
 * ABSENSI SERVICE
 */
const absensiRepo = require('../repositories/absensi.repository');
const { logEvent } = require('../middleware/auditlog');
const { emitToAll, emitToRole } = require('../realtime/socketio');

class AbsensiService {
  async getAll(filters, user) {
    if (['anggota'].includes(user.role)) filters.user_id = user.id;
    return absensiRepo.findAll(filters);
  }

  async getToday() { return absensiRepo.findToday(); }

  async create(user, data, fotoUrl) {
    if (!data.tipe || data.latitude == null || data.longitude == null) {
      throw { status: 400, message: 'tipe, latitude, longitude wajib' };
    }
    const row = await absensiRepo.create({
      user_id: user.id,
      tipe: data.tipe,
      foto_url: fotoUrl || data.foto_url || null,
      latitude: parseFloat(data.latitude),
      longitude: parseFloat(data.longitude),
      alamat: data.alamat || null,
      pos_jaga: data.pos_jaga || null,
      status: data.status || 'hadir',
      dalam_radius: data.dalam_radius !== 'false' && data.dalam_radius !== false,
      waktu: data.waktu || null,
      lokasi_id: data.lokasi_id || user.lokasi_id || null,
    });
    logEvent(user.id, user.nama || '', 'CREATE', 'absensi', row.id, { tipe: data.tipe, status: data.status || 'hadir' });
    emitToRole(['supervisor', 'admin', 'komandan'], 'absensi:new', { ...row, nama: user.nama, nrp: user.nrp });
    emitToAll('stats:update', { type: 'absensi' });
    return row;
  }
}

module.exports = new AbsensiService();
