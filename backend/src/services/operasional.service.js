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
const { emitToAll, emitToRole, emitToLokasi } = require('../realtime/socketio');
const { getScopeFilter, applyLokasiScope } = require('../utils/scope');

class OperasionalService {
  // Broadcasts
  async getBroadcasts(filters = {}, user) {
    const scope = await getScopeFilter(user);
    applyLokasiScope(filters, scope);
    return opRepo.findBroadcasts(filters);
  }
  async createBroadcast(user, data) {
    const row = await opRepo.createBroadcast({ pengirim_id: user.id, ...data });
    // [5-1] Emit realtime agar broadcast langsung muncul di penerima (sebelumnya
    // tak ada emit → baru terlihat saat fetch ulang). Cakupan mengikuti broadcast:
    // ber-lokasi → kamar lokasi + staf komando; global → semua. Konsumen mobile
    // (useRealtimeSync) & web-admin me-refetch saat 'broadcast:new' (tanpa duplikat).
    const payload = { ...row, pengirim_nama: user.nama };
    if (row && row.lokasi_id) {
      emitToLokasi(row.lokasi_id, 'broadcast:new', payload);
      emitToRole(['admin', 'komandan', 'supervisor'], 'broadcast:new', payload);
    } else {
      emitToAll('broadcast:new', payload);
    }
    return row;
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
  async createNotifikasi(user, data) {
    // [1-6] anti-spoofing. Only authority roles may broadcast to a target_role
    // or target another user (e.g. "Laporan Disetujui"). Everyone else may
    // only create a notification addressed to THEMSELVES (the legitimate
    // mobile case of a local self-notification mirrored to the server).
    const AUTHORITY = ['admin', 'supervisor', 'komandan'];
    if (!user || !AUTHORITY.includes(user.role)) {
      const targetsRole = data && data.target_role != null &&
        (!Array.isArray(data.target_role) || data.target_role.length > 0);
      const targetsOther = data && data.target_user_id != null &&
        String(data.target_user_id) !== String(user && user.id);
      if (targetsRole || targetsOther) {
        throw { status: 403, message: 'Tidak boleh membuat notifikasi untuk target tersebut' };
      }
      // Force the target to self regardless of what was sent.
      data = { ...data, target_user_id: user.id, target_role: null };
    }
    return opRepo.createNotifikasi(data);
  }
  async markRead(id) { return opRepo.markRead(id); }
  async markAllRead(user) { return opRepo.markAllRead(user.id, user.role); }
}

module.exports = new OperasionalService();
