/**
 * ABSENSI SERVICE
 */
const absensiRepo = require('../repositories/absensi.repository');
const { logEvent } = require('../middleware/auditlog');
const { emitToAll, emitToRole } = require('../realtime/socketio');
const { getScopeFilter, applyLokasiScope } = require('../utils/scope');

// [1-1] Build the lokasi scope into a filters object for non-anggota roles.
// anggota are scoped to their OWN records (user_id) — strictest, and matches
// prior behaviour. Everyone else goes through the shared scope util:
//   admin/supervisor → unrestricted
//   komandan         → their own lokasi
//   klien            → every lokasi of their client_id
//   anyone else      → deny (lokasi_ids: [])
// The repository understands filters.lokasi_id (single), filters.lokasi_ids
// (uuid[]; empty array = deny-all), mirroring the rest of the codebase.
async function scopeAbsensiFilters(filters, user) {
  if (user && user.role === 'anggota') {
    filters.user_id = user.id;
    return filters;
  }
  const scope = await getScopeFilter(user);
  applyLokasiScope(filters, scope);
  return filters;
}

class AbsensiService {
  async getAll(filters, user) {
    await scopeAbsensiFilters(filters, user);
    return absensiRepo.findAll(filters);
  }

  // [1-1] getToday now requires the requesting user so the same lokasi scope
  // is applied. Previously this returned every company's today-absensi to any
  // authenticated caller (the endpoint GET /api/absensi/today the app uses).
  async getToday(user) {
    const filters = await scopeAbsensiFilters({}, user);
    return absensiRepo.findToday(filters);
  }

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
      // [4-5] Nilai "tidak diketahui" (geofence/pos tak terdeteksi) TIDAK lagi
      // otomatis jadi true. Hanya boolean/string eksplisit yang dipetakan; selain
      // itu → null (unknown). Klien lama selalu kirim boolean → tetap kompatibel.
      dalam_radius:
        (data.dalam_radius === false || data.dalam_radius === 'false') ? false :
        (data.dalam_radius === true || data.dalam_radius === 'true') ? true :
        null,
      waktu: data.waktu || null,
      lokasi_id: data.lokasi_id || user.lokasi_id || null,
      idempotency_key: data.idempotency_key || null, // [3-2]
    });
    logEvent(user.id, user.nama || '', 'CREATE', 'absensi', row.id, { tipe: data.tipe, status: data.status || 'hadir' });
    emitToRole(['supervisor', 'admin', 'komandan'], 'absensi:new', { ...row, nama: user.nama, nrp: user.nrp });
    emitToAll('stats:update', { type: 'absensi' });
    return row;
  }
}

module.exports = new AbsensiService();
