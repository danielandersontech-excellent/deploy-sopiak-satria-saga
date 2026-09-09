/**
 * DATA CONTROLLER - Generic CRUD handlers
 * v17 - Added clients
 * [Audit 2A] - getAll meneruskan req.user (scope lokasi); error validasi
 *              menyertakan `details` agar UI bisa menampilkan daftar kesalahan.
 */
const dataService = require('../services/data.service');

function sendError(res, e) {
  const payload = { error: e && e.message ? e.message : 'Server error' };
  if (e && e.details) payload.details = e.details;
  res.status((e && e.status) || 500).json(payload);
}

function makeCtrl(table) {
  return {
    getAll: async (req, res) => { try { res.json(await dataService.getAll(table, req.query, req.user)); } catch (e) { sendError(res, e); } },
    getById: async (req, res) => { try { res.json(await dataService.getById(table, req.params.id, req.user)); } catch (e) { sendError(res, e); } },
    create: async (req, res) => { try { res.status(201).json(await dataService.create(table, req.body)); } catch (e) { sendError(res, e); } },
    update: async (req, res) => { try { res.json(await dataService.update(table, req.params.id, req.body)); } catch (e) { sendError(res, e); } },
    remove: async (req, res) => { try { await dataService.remove(table, req.params.id); res.json({ message: 'Deleted' }); } catch (e) { sendError(res, e); } },
  };
}

module.exports = {
  lokasi: makeCtrl('lokasi'),
  posJaga: makeCtrl('pos-jaga'),
  checkpoints: makeCtrl('checkpoints'),
  routes: makeCtrl('routes'),
  jadwalShift: makeCtrl('jadwal-shift'),
  shiftAssignments: makeCtrl('shift-assignments'),
  reportExports: makeCtrl('report-exports'),
  clients: makeCtrl('clients'),
};
