/**
 * DATA SERVICE - Generic CRUD for master data
 * v23 - Fixed update stripping computed fields, client pin, kode_unik removal
 * v24 - P0-14: client create() now mints a random 6-digit PIN, sets
 *       must_change_pin=true, and surfaces the temp PIN once in the
 *       response. Removes the hardcoded '123456' default that previously
 *       gave every new klien the same out-of-the-box password.
 */
const crypto = require('crypto');
const repos = require('../repositories/data.repository');
const { queryAll, queryOne } = require('../config/database');
const { logger } = require('../utils/logger');
const { getScopeFilter } = require('../utils/scope');

// Same rounds as auth.service.js / bootstrap.js — P0-15.
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12');

// P0-14: see comment in auth.service.js for the rationale around
// crypto.randomInt vs Math.random. Same helper, kept local to avoid
// a circular import via auth.service.
function randomPin() {
  return String(crypto.randomInt(100000, 1000000));
}

// =============================================================================
// SECURITY (Fase 0 / 2F-1): fields that must NEVER leave the API on a
// `clients` READ response.
//
//   - pin_hash: bcrypt hash of a 6-digit numeric PIN. Returning it to a client
//     lets anyone who receives it crack the PIN offline and log in as that
//     client. This was being leaked by the generic SELECT clients.* read path.
//   - must_change_pin: internal PIN-rotation state, no business use on the read
//     side; we drop it so the read response carries no credential metadata.
//
// Stripping is applied to getAll() and getById() output for the `clients`
// table only. The LOGIN path (auth.service.js) and PIN reset/change paths read
// `pin_hash` through their own raw queries and are NOT affected by this.
// =============================================================================
const CLIENT_READ_SECRET_FIELDS = ['pin_hash', 'must_change_pin'];

function stripClientSecrets(row) {
  if (!row || typeof row !== 'object') return row;
  for (const field of CLIENT_READ_SECRET_FIELDS) {
    if (field in row) delete row[field];
  }
  return row;
}

class DataService {
  getRepo(table) {
    const map = { lokasi: repos.lokasi, 'pos-jaga': repos.posJaga, checkpoints: repos.checkpoint,
      routes: repos.route, 'jadwal-shift': repos.jadwalShift, 'shift-assignments': repos.shiftAssignment,
      'report-exports': repos.reportExport, clients: repos.clients };
    return map[table];
  }

  async getAll(table, filters, user) {
    const repo = this.getRepo(table);
    if (!repo) throw { status: 400, message: `Unknown table: ${table}` };
    const orderMap = { lokasi: 'nama', 'pos-jaga': 'nama', checkpoints: 'nama', routes: 'nama',
      'jadwal-shift': 'waktu_mulai', 'shift-assignments': 'tanggal DESC', 'report-exports': 'created_at DESC',
      clients: 'nama_klien' };
    filters = { ...(filters || {}) };

    // [Audit 2A] Scope lokasi (fail-closed) untuk data master ber-lokasi.
    // Sebelumnya GET /api/data/lokasi|pos-jaga|checkpoints|routes|jadwal-shift
    // mengembalikan SEMUA tenant ke anggota/komandan/klien mana pun. Invarian
    // utils/scope: admin/supervisor bebas; komandan/anggota lokasi sendiri;
    // klien seluruh lokasi client_id-nya; selain itu deny. Kunci filter:
    // tabel lokasi memakai kolom `id`, lainnya `lokasi_id`. Permintaan
    // ?lokasi_id=X di luar scope → hasil kosong (tidak melebar).
    const LOKASI_SCOPED = { lokasi: 'id', 'pos-jaga': 'lokasi_id', checkpoints: 'lokasi_id', routes: 'lokasi_id', 'jadwal-shift': 'lokasi_id' };
    const scopeKey = LOKASI_SCOPED[table];
    if (scopeKey && user) {
      const scope = await getScopeFilter(user);
      if (!scope.unrestricted) {
        const requested = filters[scopeKey];
        if (requested) {
          if (!scope.lokasiIds.includes(requested)) filters[scopeKey] = [];
        } else {
          filters[scopeKey] = scope.lokasiIds.slice(); // [] = deny-all
        }
      }
    }

    let results = await repo.findAll({ where: filters, orderBy: orderMap[table] || 'created_at DESC', limit: filters.limit });
    results = await this.enrichResults(table, results, filters);
    // SECURITY (Fase 0 / 2F-1): never return pin_hash / must_change_pin for clients.
    if (table === 'clients' && Array.isArray(results)) {
      results = results.map((r) => stripClientSecrets(r));
    }
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
    } catch (err) { logger.error(`[DataService] Enrich error: ${err.message}`); }
    return results;
  }

  async getById(table, id, user) {
    const repo = this.getRepo(table);
    const row = await repo.findById(id);
    if (!row) throw { status: 404, message: 'Tidak ditemukan' };
    // SECURITY (Fase 0 / 2F-1): never return pin_hash / must_change_pin for clients.
    if (table === 'clients') return stripClientSecrets(row);

    // [1-11] light IDOR scope for lokasi-bearing master data. A restricted
    // caller (komandan/anggota/klien) may only read a record that belongs to a
    // lokasi within their scope; out-of-scope -> 404. For `lokasi` itself the
    // scope key is the row's own id. Resources without a lokasi key
    // (report-exports, shift-assignments) are NOT lokasi-scoped here — they
    // carry no tenant data keyed by lokasi — so they are left readable to
    // internal roles (documented decision). admin/supervisor are unrestricted.
    if (user) {
      const scope = await getScopeFilter(user);
      if (!scope.unrestricted) {
        const lokKey = (table === 'lokasi') ? row.id : row.lokasi_id;
        if (lokKey !== undefined && lokKey !== null) {
          if (!scope.lokasiIds.includes(lokKey)) {
            throw { status: 404, message: 'Tidak ditemukan' };
          }
        }
      }
    }
    return row;
  }

  // [Audit 2A] Normalisasi & validasi input tulis untuk data master.
  //  - '' → null: klien web mengirim "" untuk select kosong (pos_jaga_id,
  //    lokasi_id, client_id) → Postgres menolak '' pada kolom uuid/date → 500.
  //  - kolom turunan hasil enrich (lokasi_nama, klien_nama, …) dibuang agar
  //    tidak dianggap kolom (sebelumnya hanya di update()).
  //  - field wajib per tabel diperiksa di sini → 400 yang jelas, bukan 500.
  _normalize(table, data) {
    const computed = ['lokasi_nama', 'klien_nama', 'klien_kode', 'pos_nama', 'user_nama', 'user_nrp',
      'shift_nama', 'waktu_mulai_shift', 'created_at', 'updated_at', 'id', 'total_count', 'temp_pin'];
    const out = {};
    for (const [k, v] of Object.entries(data || {})) {
      if (computed.includes(k)) continue;
      out[k] = (typeof v === 'string' && v.trim() === '') ? null : v;
    }
    return out;
  }

  _validate(table, data, isUpdate) {
    const errors = [];
    const need = (k, label) => { if (!isUpdate || data[k] !== undefined) { if (data[k] === undefined || data[k] === null || data[k] === '') errors.push(`${label || k} wajib diisi`); } };
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const uuidOpt = (k) => { if (data[k] != null && data[k] !== '' && !uuidRe.test(String(data[k]))) errors.push(`${k} harus UUID valid`); };
    const enumOf = (k, list) => { if (data[k] != null && !list.includes(data[k])) errors.push(`${k} harus salah satu: ${list.join('/')}`); };
    const numRange = (k, min, max) => { if (data[k] != null && (isNaN(Number(data[k])) || Number(data[k]) < min || Number(data[k]) > max)) errors.push(`${k} harus angka ${min}–${max}`); };

    switch (table) {
      case 'lokasi':
        need('nama', 'Nama lokasi'); need('alamat', 'Alamat');
        numRange('latitude', -90, 90); numRange('longitude', -180, 180); numRange('radius', 10, 50000);
        enumOf('status', ['active', 'inactive']); uuidOpt('client_id');
        break;
      case 'pos-jaga':
        need('nama', 'Nama pos jaga'); need('lokasi_id', 'Lokasi'); uuidOpt('lokasi_id');
        numRange('latitude', -90, 90); numRange('longitude', -180, 180); numRange('radius', 5, 50000);
        enumOf('status', ['active', 'inactive']);
        break;
      case 'checkpoints':
        need('nama', 'Nama checkpoint'); need('lokasi_id', 'Lokasi'); uuidOpt('lokasi_id');
        if (!isUpdate) { need('latitude', 'Latitude'); need('longitude', 'Longitude'); }
        numRange('latitude', -90, 90); numRange('longitude', -180, 180); numRange('radius', 1, 5000);
        enumOf('status', ['active', 'inactive']);
        break;
      case 'routes':
        need('nama', 'Nama rute'); need('lokasi_id', 'Lokasi'); uuidOpt('lokasi_id');
        if (data.checkpoint_ids != null && !Array.isArray(data.checkpoint_ids)) errors.push('checkpoint_ids harus array');
        numRange('waktu_estimasi', 1, 1440); enumOf('status', ['active', 'inactive']);
        break;
      case 'jadwal-shift':
        need('nama', 'Nama shift'); need('lokasi_id', 'Lokasi'); uuidOpt('lokasi_id');
        need('waktu_mulai', 'Waktu mulai'); need('waktu_selesai', 'Waktu selesai');
        for (const k of ['waktu_mulai', 'waktu_selesai']) {
          if (data[k] != null && !/^\d{2}:\d{2}(:\d{2})?$/.test(String(data[k]))) errors.push(`${k} harus format HH:MM`);
        }
        break;
      case 'shift-assignments':
        need('user_id', 'Personil'); need('shift_id', 'Shift'); need('tanggal', 'Tanggal');
        uuidOpt('user_id'); uuidOpt('shift_id'); uuidOpt('pos_jaga_id');
        if (data.tanggal != null && !/^\d{4}-\d{2}-\d{2}/.test(String(data.tanggal))) errors.push('tanggal harus YYYY-MM-DD');
        break;
      case 'clients':
        need('nama_klien', 'Nama klien');
        enumOf('status_klien', ['Aktif', 'Non-Aktif', 'Blacklist']);
        enumOf('jenis_kelamin', ['Laki-Laki', 'Perempuan', 'Lainnya/Instansi']);
        if (data.email != null && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(data.email))) errors.push('Format email tidak valid');
        uuidOpt('lokasi_id');
        break;
      case 'report-exports':
        enumOf('tipe', ['absensi', 'laporan_harian', 'laporan_kejadian', 'patroli', 'all', 'weekly_auto']);
        uuidOpt('lokasi_id'); uuidOpt('generated_by');
        break;
      default:
        break;
    }
    if (errors.length) throw { status: 400, message: 'Validasi gagal', details: errors };
  }

  async create(table, data) {
    const repo = this.getRepo(table);
    data = this._normalize(table, data);
    this._validate(table, data, false);
    // [5-3] Pertahanan server: cegah double-booking shift (1 penugasan per
    // user_id + tanggal). Web-admin juga mengecek di klien; ini lapis kedua
    // agar race/akses langsung API tetap aman. Tanpa constraint DB keras
    // (data lama bisa punya duplikat → migrasi keras berisiko gagal saat boot).
    if (table === 'shift-assignments' && data.user_id && data.tanggal) {
      const existing = await repo.count({ user_id: data.user_id, tanggal: data.tanggal });
      if (existing > 0) {
        throw { status: 409, message: 'Anggota sudah memiliki penugasan shift pada tanggal tersebut.' };
      }
    }
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
      // P0-14: random temp PIN, must_change_pin=true. The PIN is
      // returned to the admin who created the account (see the
      // `temp_pin` field at the bottom of this branch) and must be
      // delivered out-of-band — it's the only point the PIN exists
      // in the clear anywhere in the system.
      let _tempPin = null;
      if (!data.pin_hash) {
        try {
          const { hashPin } = require('../utils/pinHash');
          _tempPin = randomPin();
          data.pin_hash = await hashPin(_tempPin, BCRYPT_ROUNDS);
          data.must_change_pin = true;
        } catch (e) { logger.info(`[DataService] bcrypt error: ${e.message}`); }
      }
      const created = await repo.create(data);
      if (_tempPin && created) {
        // Return the temp PIN exactly once. Anything that re-reads the
        // client row later will NOT see it (we never store the plain
        // PIN, only the bcrypt hash). The admin UI is responsible for
        // displaying it immediately and warning the operator to copy
        // it now.
        created.temp_pin = _tempPin;
        created.must_change_pin = true;
      }
      return created;
    }
    return repo.create(data);
  }

  async update(table, id, data) {
    const repo = this.getRepo(table);
    // [Audit 2A] normalisasi ('' → null, buang kolom turunan) + validasi field.
    data = this._normalize(table, data);
    this._validate(table, data, true);

    if (table === 'clients') {
      // Handle pin update
      if (data.pin && !data.pin_hash) {
        try {
          const { hashPin } = require('../utils/pinHash');
          data.pin_hash = await hashPin(String(data.pin), BCRYPT_ROUNDS);
          // P0-14: an admin pushing a new PIN through the data update
          // endpoint is effectively a forced reset — the client never
          // chose this PIN. Flag for rotation on next login so the
          // client picks their own value as soon as they're back in.
          data.must_change_pin = true;
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