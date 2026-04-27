/**
 * DATA SERVICE - Generic CRUD for master data
 * v23 - Fixed update stripping computed fields, client pin, kode_unik removal
 */
const repos = require('../repositories/data.repository');
const { queryAll, queryOne } = require('../config/database');

class DataService {
  getRepo(table) {
    const map = { lokasi: repos.lokasi, 'pos-jaga': repos.posJaga, checkpoints: repos.checkpoint,
      routes: repos.route, 'jadwal-shift': repos.jadwalShift, 'shift-assignments': repos.shiftAssignment,
      'report-exports': repos.reportExport, clients: repos.clients };
    return map[table];
  }

  async getAll(table, filters) {
    const repo = this.getRepo(table);
    if (!repo) throw { status: 400, message: `Unknown table: ${table}` };
    const orderMap = { lokasi: 'nama', 'pos-jaga': 'nama', checkpoints: 'nama', routes: 'nama',
      'jadwal-shift': 'waktu_mulai', 'shift-assignments': 'tanggal DESC', 'report-exports': 'created_at DESC',
      clients: 'nama_klien' };
    let results = await repo.findAll({ where: filters, orderBy: orderMap[table] || 'created_at DESC', limit: filters.limit });
    results = await this.enrichResults(table, results, filters);
    return results;
  }

  async enrichResults(table, results, filters) {
    if (!Array.isArray(results) || results.length === 0) return results;
    try {
      if (table === 'lokasi') {
        const clientIds = results.filter(r => r.client_id).map(r => r.client_id);
        if (clientIds.length > 0) {
          const clients = await queryAll(`SELECT id, nama_klien, kode_klien FROM clients WHERE id = ANY($1)`, [clientIds]);
          const clientMap = {};
          clients.forEach(c => { clientMap[c.id] = c; });
          results.forEach(r => {
            if (r.client_id && clientMap[r.client_id]) {
              r.klien_nama = clientMap[r.client_id].nama_klien;
              r.klien_kode = clientMap[r.client_id].kode_klien;
            }
          });
        }
      }
      if (['checkpoints', 'pos-jaga', 'routes', 'jadwal-shift'].includes(table)) {
        const lokasiIds = [...new Set(results.filter(r => r.lokasi_id).map(r => r.lokasi_id))];
        if (lokasiIds.length > 0) {
          const loks = await queryAll(`SELECT id, nama FROM lokasi WHERE id = ANY($1)`, [lokasiIds]);
          const lokMap = {};
          loks.forEach(l => { lokMap[l.id] = l.nama; });
          results.forEach(r => { if (r.lokasi_id) r.lokasi_nama = lokMap[r.lokasi_id] || null; });
        }
      }
      if (table === 'shift-assignments') {
        const userIds = [...new Set(results.filter(r => r.user_id).map(r => r.user_id))];
        const shiftIds = [...new Set(results.filter(r => r.shift_id).map(r => r.shift_id))];
        const posIds = [...new Set(results.filter(r => r.pos_jaga_id).map(r => r.pos_jaga_id))];
        const [users, shifts, poss] = await Promise.all([
          userIds.length > 0 ? queryAll(`SELECT id, nama, nrp FROM users WHERE id = ANY($1)`, [userIds]) : [],
          shiftIds.length > 0 ? queryAll(`SELECT id, nama, waktu_mulai, waktu_selesai FROM jadwal_shift WHERE id = ANY($1)`, [shiftIds]) : [],
          posIds.length > 0 ? queryAll(`SELECT id, nama FROM pos_jaga WHERE id = ANY($1)`, [posIds]) : [],
        ]);
        const uMap = {}, sMap = {}, pMap = {};
        users.forEach(u => { uMap[u.id] = u; });
        shifts.forEach(s => { sMap[s.id] = s; });
        poss.forEach(p => { pMap[p.id] = p; });
        results.forEach(r => {
          if (r.user_id && uMap[r.user_id]) { r.user_nama = uMap[r.user_id].nama; r.user_nrp = uMap[r.user_id].nrp; }
          if (r.shift_id && sMap[r.shift_id]) { r.shift_nama = sMap[r.shift_id].nama; r.waktu_mulai = sMap[r.shift_id].waktu_mulai; r.waktu_selesai = sMap[r.shift_id].waktu_selesai; }
          if (r.pos_jaga_id && pMap[r.pos_jaga_id]) { r.pos_nama = pMap[r.pos_jaga_id].nama; }
        });
      }
    } catch (err) { console.error('[DataService] Enrich error:', err.message); }
    return results;
  }

  async getById(table, id) {
    const repo = this.getRepo(table);
    const row = await repo.findById(id);
    if (!row) throw { status: 404, message: 'Tidak ditemukan' };
    return row;
  }

  async create(table, data) {
    const repo = this.getRepo(table);
    if (table === 'checkpoints' && !data.qr_code) {
      const prefix = await this._getLokasiPrefix(data.lokasi_id);
      const ts = Date.now().toString(36).toUpperCase();
      const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
      data.qr_code = `${prefix}-CP-${ts}-${rand}`;
      // Don't set kode_unik - column doesn't exist
    }
    if (table === 'clients' && !data.kode_klien) {
      const ts = Date.now().toString(36).toUpperCase().slice(-4);
      data.kode_klien = `KLN-${ts}`;
    }
    if (table === 'clients') {
      if (!data.nrp_login) {
        data.nrp_login = (data.kode_klien || '').replace(/[-\s]/g, '').toUpperCase();
      }
      if (!data.pin_hash) {
        try {
          const bcrypt = require('bcryptjs');
          data.pin_hash = await bcrypt.hash('123456', parseInt(process.env.BCRYPT_ROUNDS || '12'));
        } catch (e) { console.log('[DataService] bcrypt error:', e.message); }
      }
    }
    return repo.create(data);
  }

  async update(table, id, data) {
    const repo = this.getRepo(table);
    // Strip computed fields before update
    const computed = ['lokasi_nama', 'klien_nama', 'klien_kode', 'pos_nama', 'user_nama', 'user_nrp', 'shift_nama', 'created_at'];
    computed.forEach(k => delete data[k]);
    delete data.id;
    
    if (table === 'clients') {
      // Handle pin update
      if (data.pin && !data.pin_hash) {
        try {
          const bcrypt = require('bcryptjs');
          data.pin_hash = await bcrypt.hash(String(data.pin), parseInt(process.env.BCRYPT_ROUNDS || '12'));
        } catch (e) {}
      }
      delete data.pin;
      data.updated_at = new Date().toISOString();
    }
    if (table === 'lokasi') {
      data.updated_at = new Date().toISOString();
    }
    
    try {
      const row = await repo.update(id, data);
      if (!row) throw { status: 404, message: 'Tidak ditemukan' };
      return row;
    } catch (err) {
      if (err.status) throw err;
      throw { status: 500, message: err.message || 'Update gagal' };
    }
  }

  async remove(table, id) {
    const repo = this.getRepo(table);
    return repo.delete(id);
  }

  async _getLokasiPrefix(lokasiId) {
    if (!lokasiId) return 'GEN';
    try {
      const lok = await queryOne(`SELECT nama FROM lokasi WHERE id = $1`, [lokasiId]);
      if (lok?.nama) return lok.nama.split(/\s+/).map(w => w[0]).join('').substring(0, 4).toUpperCase();
    } catch (e) {}
    return 'GEN';
  }
}

module.exports = new DataService();
