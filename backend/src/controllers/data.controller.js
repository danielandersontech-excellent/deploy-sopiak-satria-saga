/**
 * DATA CONTROLLER - Generic CRUD handlers
 * v17 - Added clients
 */
const dataService = require('../services/data.service');

function makeCtrl(table) {
  return {
    getAll: async (req, res) => { try { res.json(await dataService.getAll(table, req.query)); } catch (e) { res.status(e.status || 500).json({ error: e.message }); } },
    getById: async (req, res) => { try { res.json(await dataService.getById(table, req.params.id, req.user)); } catch (e) { res.status(e.status || 500).json({ error: e.message }); } },
    create: async (req, res) => { try { res.status(201).json(await dataService.create(table, req.body)); } catch (e) { res.status(e.status || 500).json({ error: e.message }); } },
    update: async (req, res) => { try { res.json(await dataService.update(table, req.params.id, req.body)); } catch (e) { res.status(e.status || 500).json({ error: e.message }); } },
    remove: async (req, res) => { try { await dataService.remove(table, req.params.id); res.json({ message: 'Deleted' }); } catch (e) { res.status(e.status || 500).json({ error: e.message }); } },
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
