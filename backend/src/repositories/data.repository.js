/**
 * DATA REPOSITORY - Generic CRUD for master data tables
 * v17 - Added clients repository (separate from users)
 */
const BaseRepository = require('./base.repository');

const lokasiRepo = new BaseRepository('lokasi');
const posJagaRepo = new BaseRepository('pos_jaga');
const checkpointRepo = new BaseRepository('checkpoints');
const routeRepo = new BaseRepository('routes');
const jadwalShiftRepo = new BaseRepository('jadwal_shift');
const shiftAssignmentRepo = new BaseRepository('shift_assignments');
const reportExportRepo = new BaseRepository('report_exports');
const clientsRepo = new BaseRepository('clients');

module.exports = {
  lokasi: lokasiRepo,
  posJaga: posJagaRepo,
  checkpoint: checkpointRepo,
  route: routeRepo,
  jadwalShift: jadwalShiftRepo,
  shiftAssignment: shiftAssignmentRepo,
  reportExport: reportExportRepo,
  clients: clientsRepo,
};
