/**
 * PATROLI SERVICE
 *
 * P0-6 (Tahap 4): getAll() now takes the requesting user so it can
 * apply lokasi scoping. Without this, a komandan calling
 * GET /api/patroli saw patroli records from every lokasi in the
 * company. The patroli table has no lokasi_id column of its own, so
 * the filter goes through the joined users table — see
 * patroli.repository.js.
 */
const patroliRepo = require('../repositories/patroli.repository');
const userRepo = require('../repositories/user.repository');
const { logEvent } = require('../middleware/auditlog');
const { emitToAll, emitToRole } = require('../realtime/socketio');
const { getScopeFilter, applyLokasiScope } = require('../utils/scope');

class PatroliService {
  async getAll(filters, user) {
    const scope = await getScopeFilter(user);
    applyLokasiScope(filters, scope);
    return patroliRepo.findAll(filters);
  }

  async getById(id, user) {
    // [1-4] IDOR fix. getById was previously unscoped (any user could pull any
    // patrol's detail: scans, GPS, photos). Authority roles
    // (komandan/supervisor/admin) may still fetch any patrol by id — report
    // validation flows legitimately cross lokasi. anggota/klien are restricted
    // to their own lokasi scope; out-of-scope -> 404 (don't reveal existence).
    const patrol = await patroliRepo.findByIdWithScans(id);
    if (!patrol) throw { status: 404, message: 'Patroli tidak ditemukan' };

    const AUTHORITY = ['admin', 'supervisor', 'komandan'];
    if (!user || !AUTHORITY.includes(user.role)) {
      const scope = await getScopeFilter(user);
      if (!scope.unrestricted) {
        const lokasiId = patrol.user_lokasi_id || null;
        const inScope = lokasiId && scope.lokasiIds.includes(lokasiId);
        if (!inScope) {
          // Keep the helper column out of the (denied) response path anyway.
          throw { status: 404, message: 'Patroli tidak ditemukan' };
        }
      }
    }
    // Strip the scope-only helper column so the response shape is unchanged.
    delete patrol.user_lokasi_id;
    return patrol;
  }

  async start(user, data) {
    const patrol = await patroliRepo.start(user.id, data.route_id, data.route_name, data.client_patrol_id);
    await userRepo.updateStatus(user.id, 'patroli');
    logEvent(user.id, user.nama || '', 'CREATE', 'patroli', patrol.id, { route_name: data.route_name || '' });
    emitToRole(['supervisor', 'admin', 'komandan'], 'patroli:update', { action: 'start', ...patrol, nama: user.nama });
    return patrol;
  }

  // [4-2] Resolusi patroli: pakai PK server bila valid; bila hanya referensi
  // lokal (client_patrol_id) yang diketahui (scan/end di-antri sebelum start
  // tersinkron), tautkan ke patroli yang benar. Sentinel 'offline' = belum ada PK.
  async _resolvePatrolId(patroliId, clientPatrolId) {
    if (patroliId && patroliId !== 'offline') return patroliId;
    if (clientPatrolId) {
      const found = await patroliRepo.findIdByClientPatrolId(clientPatrolId);
      if (found && found.id) return found.id;
    }
    return null;
  }

  async scan(user, patroliId, checkpointId, fotoUrl, idempotencyKey, clientPatrolId) {
    if (!checkpointId) throw { status: 400, message: 'checkpoint_id wajib' };
    const effId = await this._resolvePatrolId(patroliId, clientPatrolId);
    // Patroli belum tersinkron → 409 retriable (antrian akan mencoba lagi setelah start).
    if (!effId) throw { status: 409, message: 'Patroli belum tersinkron, coba lagi' };
    const scan = await patroliRepo.addScan(effId, checkpointId, fotoUrl, idempotencyKey);
    emitToRole(['supervisor', 'admin', 'komandan'], 'patroli:update', { action: 'scan', patroli_id: effId, ...scan, nama: user.nama });
    return scan;
  }

  async end(user, id, data) {
    const effId = await this._resolvePatrolId(id, data.client_patrol_id);
    if (!effId) throw { status: 409, message: 'Patroli belum tersinkron, coba lagi' };
    const patrol = await patroliRepo.end(effId, user.id, data.checkpoint_scanned, data.checkpoint_total);
    if (!patrol) throw { status: 404, message: 'Patroli tidak ditemukan' };
    await userRepo.updateStatus(user.id, 'on_duty');
    emitToRole(['supervisor', 'admin', 'komandan'], 'patroli:update', { action: 'end', ...patrol, nama: user.nama });
    emitToAll('stats:update', { type: 'patroli' });
    return patrol;
  }
}

module.exports = new PatroliService();