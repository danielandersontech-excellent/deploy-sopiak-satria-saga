/**
 * OPERASIONAL SERVICE - Broadcasts, Serah Terima, Panic, Notifikasi
 * v15 - Filtering support, catatan_resolver
 * v16 - P0-6: scope-filter every read method (broadcasts, serah terima,
 *       panic). Previously these accepted whatever `filters.lokasi_id`
 *       the controller passed (which was just `req.query.lokasi_id`,
 *       i.e. attacker-controlled). A klien JWT could read every
 *       panic alert across every contract.
 *
 * [Audit 2A]
 *   - Anti-spoof: body tidak lagi bisa menimpa pengirim_id / user_id
 *     (sebelumnya `{ pengirim_id: user.id, ...data }` → data.pengirim_id
 *     dari klien menang).
 *   - Broadcast: judul/pesan/prioritas/target divalidasi; komandan hanya boleh
 *     mengirim ke lokasinya sendiri (bukan lokasi lain / global).
 *   - Panic resolve: status divalidasi (resolved/false_alarm) dan komandan
 *     hanya boleh menangani panic di lokasinya.
 *   - Panic emit tidak lagi emitToAll (klien tenant lain menerima nama+GPS)
 *     → peran komando + kamar lokasi + pelapor.
 *   - Serah terima: kondisi_area divalidasi; penerima_id harus UUID.
 *   - markRead: hanya notifikasi milik/berhak user yang bisa ditandai.
 */
const opRepo = require('../repositories/operasional.repository');
const { emitToAll, emitToRole, emitToLokasi, emitToUser } = require('../realtime/socketio');
const { getScopeFilter, applyLokasiScope } = require('../utils/scope');
const { queryAll } = require('../config/database');
const { logger } = require('../utils/logger');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HIGH_ROLES = ['komandan', 'supervisor', 'admin'];

class OperasionalService {
  // Broadcasts
  async getBroadcasts(filters = {}, user) {
    const scope = await getScopeFilter(user);
    applyLokasiScope(filters, scope);
    return opRepo.findBroadcasts(filters);
  }
  async createBroadcast(user, data = {}) {
    const judul = String(data.judul || '').trim();
    const pesan = String(data.pesan || '').trim();
    if (judul.length < 2 || judul.length > 200) throw { status: 400, message: 'Judul wajib (2–200 karakter)' };
    if (pesan.length < 2 || pesan.length > 5000) throw { status: 400, message: 'Pesan wajib (2–5000 karakter)' };
    const prioritas = data.prioritas || 'normal';
    if (!['normal', 'urgent'].includes(prioritas)) throw { status: 400, message: 'Prioritas harus normal/urgent' };
    const target = data.target || 'all';
    if (!['all', 'anggota', 'komandan', 'supervisor'].includes(target)) throw { status: 400, message: 'Target tidak valid' };
    let lokasi_id = data.lokasi_id || null;
    if (lokasi_id && !UUID_RE.test(String(lokasi_id))) throw { status: 400, message: 'lokasi_id tidak valid' };
    // Komandan: selalu terikat ke lokasinya sendiri.
    if (user.role === 'komandan') {
      if (!user.lokasi_id) throw { status: 403, message: 'Komandan belum ditempatkan di lokasi' };
      lokasi_id = user.lokasi_id;
    }

    const row = await opRepo.createBroadcast({ pengirim_id: user.id, judul, pesan, prioritas, target, lokasi_id });
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
    // [Misi V3 / D3] Notifikasi in-app persisten (event socket hilang bila
    // penerima offline). Broadcast ber-lokasi → hanya user di lokasi itu
    // (per-user, agar tidak bocor lintas lokasi); global → per peran.
    this._notifyBroadcast(row, user).catch((e) => logger.warn(`[Broadcast] notifikasi gagal: ${e.message}`));
    return row;
  }

  async _notifyBroadcast(row, user) {
    if (!row) return;
    const roles = row.target === 'all' ? ['anggota', 'komandan', 'supervisor', 'admin'] : [row.target];
    const notif = {
      tipe: row.prioritas === 'urgent' ? 'warning' : 'info',
      judul: `${row.prioritas === 'urgent' ? 'Broadcast Mendesak' : 'Broadcast'}: ${row.judul}`,
      pesan: `${String(row.pesan || '').slice(0, 300)} — ${user.nama || 'Komando'}`,
      data: { entity: 'broadcast', id: row.id, lokasi_id: row.lokasi_id || null, path: '/broadcast' },
    };
    if (row.lokasi_id) {
      const rows = await queryAll(
        `SELECT id FROM users WHERE lokasi_id = $1 AND role = ANY($2::text[]) AND status_penempatan IS DISTINCT FROM 'nonaktif' AND id <> $3`,
        [row.lokasi_id, roles, user.id]
      );
      await opRepo.createNotifikasiForUsers(rows.map((r) => r.id), notif);
    } else {
      await opRepo.createNotifikasi({ ...notif, target_role: roles });
    }
  }

  // Serah Terima
  async getSerahTerima(filters = {}, user) {
    const scope = await getScopeFilter(user);
    applyLokasiScope(filters, scope);
    return opRepo.findSerahTerima(filters);
  }
  async createSerahTerima(user, data = {}) {
    const kondisi = data.kondisi_area || 'aman';
    if (!['aman', 'masalah', 'perhatian'].includes(kondisi)) throw { status: 400, message: 'kondisi_area harus aman/masalah/perhatian' };
    if (data.penerima_id && !UUID_RE.test(String(data.penerima_id))) throw { status: 400, message: 'penerima_id tidak valid' };
    if (data.penerima_id && String(data.penerima_id) === String(user.id)) throw { status: 400, message: 'Penerima tidak boleh diri sendiri' };
    return opRepo.createSerahTerima({ ...data, kondisi_area: kondisi, user_id: user.id });
  }

  // Panic
  async getPanics(filters = {}, user) {
    const scope = await getScopeFilter(user);
    applyLokasiScope(filters, scope);
    return opRepo.findPanics(filters);
  }
  async createPanic(user, data = {}) {
    const lat = data.latitude != null && data.latitude !== '' ? parseFloat(data.latitude) : null;
    const lng = data.longitude != null && data.longitude !== '' ? parseFloat(data.longitude) : null;
    if ((lat !== null && (isNaN(lat) || lat < -90 || lat > 90)) || (lng !== null && (isNaN(lng) || lng < -180 || lng > 180))) {
      throw { status: 400, message: 'Koordinat tidak valid' };
    }
    const lokasi_id = data.lokasi_id || user.lokasi_id || null;
    const row = await opRepo.createPanic({
      ...data,
      latitude: lat, longitude: lng,
      user_id: user.id,
      nama_pelapor: user.nama,
      nrp_pelapor: user.nrp,
      lokasi_nama: data.lokasi_nama || null,
      lokasi_id,
    });
    const payload = { ...row, nama: user.nama, nrp: user.nrp, nama_pelapor: user.nama, nrp_pelapor: user.nrp };
    emitToRole(['supervisor', 'admin', 'komandan'], 'panic:alert', payload);
    if (lokasi_id) emitToLokasi(lokasi_id, 'panic:alert', payload);
    emitToUser(user.id, 'panic:alert', payload);
    // [Misi V3 / D3] Notifikasi persisten ke komando (klik → halaman Panic).
    opRepo.createNotifikasi({
      tipe: 'danger', judul: `PANIC: ${user.nama || user.nrp || 'Personil'}`,
      pesan: `Tombol darurat ditekan${row.lokasi_nama ? ` di ${row.lokasi_nama}` : ''}. Segera tindak lanjuti.`,
      target_role: ['komandan', 'supervisor', 'admin'],
      data: { entity: 'panic', id: row.id, lokasi_id: lokasi_id || null, path: '/panic' },
    }).catch((e) => logger.warn(`[Panic] notifikasi gagal: ${e.message}`));
    return row;
  }
  async resolvePanic(id, user, status, catatan) {
    if (!['resolved', 'false_alarm'].includes(status)) throw { status: 400, message: 'Status harus resolved/false_alarm' };
    const panic = await opRepo.findPanicById(id);
    if (!panic) throw { status: 404, message: 'Tidak ditemukan' };
    const isHighRole = HIGH_ROLES.includes(user.role);
    const isCreator = panic.user_id === user.id;
    if (!isHighRole && !isCreator) {
      throw { status: 403, message: 'Akses ditolak. Anda tidak memiliki izin.' };
    }
    // Komandan hanya menangani panic di lokasinya (admin/supervisor bebas).
    if (isHighRole && !isCreator) {
      const scope = await getScopeFilter(user);
      if (!scope.unrestricted) {
        const lok = panic.lokasi_id || panic.pelapor_lokasi_id || null;
        if (!lok || !scope.lokasiIds.includes(lok)) throw { status: 404, message: 'Tidak ditemukan' };
      }
    }
    if (panic.status !== 'active') throw { status: 409, message: `Panic sudah ${panic.status}` };
    const row = await opRepo.resolvePanic(id, user.id, status, catatan);
    if (!row) throw { status: 404, message: 'Tidak ditemukan' };
    const payload = { ...row, resolved_by_nama: user.nama };
    emitToRole(['supervisor', 'admin', 'komandan'], 'panic:resolved', payload);
    if (row.lokasi_id) emitToLokasi(row.lokasi_id, 'panic:resolved', payload);
    if (row.user_id) emitToUser(row.user_id, 'panic:resolved', payload);
    if (row.user_id && row.user_id !== user.id) {
      opRepo.createNotifikasi({
        tipe: 'success', judul: status === 'false_alarm' ? 'Panic ditandai alarm palsu' : 'Panic Anda telah ditangani',
        pesan: `Ditangani oleh ${user.nama || 'komando'}${catatan ? `: ${String(catatan).slice(0, 200)}` : '.'}`,
        target_user_id: row.user_id, data: { entity: 'panic', id: row.id, path: '/panic' },
      }).catch((e) => logger.warn(`[Panic] notifikasi resolve gagal: ${e.message}`));
    }
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
    if (!data || !data.judul || String(data.judul).trim().length < 2) throw { status: 400, message: 'Judul notifikasi wajib' };
    if (data.tipe && !['info', 'warning', 'danger', 'success'].includes(data.tipe)) throw { status: 400, message: 'tipe harus info/warning/danger/success' };
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
  async markRead(id, user) {
    if (!UUID_RE.test(String(id))) throw { status: 400, message: 'ID notifikasi tidak valid' };
    const ok = await opRepo.markReadFor(id, user.id, user.role);
    if (!ok) throw { status: 404, message: 'Notifikasi tidak ditemukan' };
    return true;
  }
  async markAllRead(user) { return opRepo.markAllRead(user.id, user.role); }
}

module.exports = new OperasionalService();
