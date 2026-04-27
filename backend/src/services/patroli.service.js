/**
 * PATROLI SERVICE
 */
const patroliRepo = require('../repositories/patroli.repository');
const userRepo = require('../repositories/user.repository');
const { logEvent } = require('../middleware/auditlog');
const { emitToAll, emitToRole } = require('../realtime/socketio');

class PatroliService {
  async getAll(filters) { return patroliRepo.findAll(filters); }

  async getById(id) {
    const patrol = await patroliRepo.findByIdWithScans(id);
    if (!patrol) throw { status: 404, message: 'Patroli tidak ditemukan' };
    return patrol;
  }

  async start(user, data) {
    const patrol = await patroliRepo.start(user.id, data.route_id, data.route_name);
    await userRepo.updateStatus(user.id, 'patroli');
    logEvent(user.id, user.nama || '', 'CREATE', 'patroli', patrol.id, { route_name: data.route_name || '' });
    emitToRole(['supervisor', 'admin', 'komandan'], 'patroli:update', { action: 'start', ...patrol, nama: user.nama });
    return patrol;
  }

  async scan(user, patroliId, checkpointId, fotoUrl) {
    if (!checkpointId) throw { status: 400, message: 'checkpoint_id wajib' };
    const scan = await patroliRepo.addScan(patroliId, checkpointId, fotoUrl);
    emitToRole(['supervisor', 'admin', 'komandan'], 'patroli:update', { action: 'scan', patroli_id: patroliId, ...scan, nama: user.nama });
    return scan;
  }

  async end(user, id, data) {
    const patrol = await patroliRepo.end(id, user.id, data.checkpoint_scanned, data.checkpoint_total);
    if (!patrol) throw { status: 404, message: 'Patroli tidak ditemukan' };
    await userRepo.updateStatus(user.id, 'on_duty');
    emitToRole(['supervisor', 'admin', 'komandan'], 'patroli:update', { action: 'end', ...patrol, nama: user.nama });
    emitToAll('stats:update', { type: 'patroli' });
    return patrol;
  }
}

module.exports = new PatroliService();
