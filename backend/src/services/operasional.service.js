/**
 * OPERASIONAL SERVICE - Broadcasts, Serah Terima, Panic, Notifikasi
 * v15 - Filtering support, catatan_resolver
 * v16 - P0-6: scope-filter every read method (broadcasts, serah terima,
 *       panic). Previously these accepted whatever `filters.lokasi_id`
 *       the controller passed (which was just `req.query.lokasi_id`,
 *       i.e. attacker-controlled). A klien JWT could read every
 *       panic alert across every contract.
 */
const opRepo = require('../repositories/operasional.repository');
const { emitToAll, emitToRole } = require('../realtime/socketio');
const { getScopeFilter, applyLokasiScope } = require('../utils/scope');

class OperasionalService {
  // Broadcasts
  async getBroadcasts(filters = {}, user) {
    const scope = await getScopeFilter(user);
    applyLokasiScope(filters, scope);
    return opRepo.findBroadcasts(filters);
  }
  async createBroadcast(user, data) {
    return opRepo.createBroadcast({ pengirim_id: user.id, ...data });
  }

  // Serah Terima
  async getSerahTerima(filters = {}, user) {
    const scope = await getScopeFilter(user);
    applyLokasiScope(filters, scope);
    return opRepo.findSerahTerima(filters);
  }
  async createSerahTerima(user, data) {
    return opRepo.createSerahTerima({ user_id: user.id, ...data });
  }

  // Panic
  async getPanics(filters = {}, user) {
    const scope = await getScopeFilter(user);
    applyLokasiScope(filters, scope);
    return opRepo.findPanics(filters);
  }
  async createPanic(user, data) {
    const row = await opRepo.createPanic({
      user_id: user.id,
      nama_pelapor: user.nama,
      nrp_pelapor: user.nrp,
      lokasi_nama: data.lokasi_nama || null,
      lokasi_id: data.lokasi_id || user.lokasi_id || null,
      ...data
    });
    emitToAll('panic:alert', { ...row, nama: user.nama, nrp: user.nrp });
    emitToRole(['supervisor', 'admin', 'komandan'], 'panic:alert', { ...row, nama: user.nama, nrp: user.nrp });
    return row;
  }
  async resolvePanic(id, user, status, catatan) {
    const panic = await opRepo.findPanicById(id);
    const isHighRole = ['komandan', 'supervisor', 'admin'].includes(user.role);
    const isCreator = panic && panic.user_id === user.id;
    if (!isHighRole && !isCreator) {
      throw { status: 403, message: 'Akses ditolak. Anda tidak memiliki izin.' };
    }
    const row = await opRepo.resolvePanic(id, user.id, status, catatan);
    if (!row) throw { status: 404, message: 'Tidak ditemukan' };
    emitToAll('panic:resolved', { ...row, resolved_by_nama: user.nama });
    return row;
  }

  // Notifikasi
  async getNotifikasi(user) { return opRepo.findNotifikasi(user.id, user.role); }
  async createNotifikasi(data) { return opRepo.createNotifikasi(data); }
  async markRead(id) { return opRepo.markRead(id); }
  async markAllRead(user) { return opRepo.markAllRead(user.id, user.role); }
}

module.exports = new OperasionalService();
