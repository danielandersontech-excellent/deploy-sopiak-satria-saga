/**
 * EXPORT ROUTES - /api/export
 * Generate Excel (.xlsx) & enhanced PDF exports with multi-lokasi filtering
 * Supports: absensi, laporan_harian, laporan_kejadian, patroli, all-in-one
 */
const router = require('express').Router();
const { queryAll, queryOne } = require('../config/database');
const { auth, requireRole } = require('../middleware/auth');
const { logEvent } = require('../middleware/auditlog');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

// Ensure exports directory
const EXPORT_DIR = path.join(__dirname, '..', '..', 'uploads', 'exports');
if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });

// ==================== HELPERS ====================

function fmtDate(d) {
  if (!d) return '-';
  try { return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return String(d); }
}

function fmtTime(d) {
  if (!d) return '-';
  try { return new Date(d).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }); }
  catch { return String(d); }
}

function applyHeaderStyle(ws, rowNum) {
  const row = ws.getRow(rowNum);
  row.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A5276' } };
  row.alignment = { vertical: 'middle', horizontal: 'center' };
  row.height = 28;
  row.eachCell(c => { c.border = { bottom: { style: 'thin', color: { argb: 'FF2980B9' } } }; });
}

function autoWidth(ws) {
  ws.columns.forEach(col => {
    let max = col.header ? col.header.length : 10;
    col.eachCell({ includeEmpty: false }, cell => {
      const len = cell.value ? String(cell.value).length : 0;
      if (len > max) max = len;
    });
    col.width = Math.min(max + 4, 40);
  });
}

function addTitleRow(ws, title, colCount) {
  ws.mergeCells(1, 1, 1, colCount);
  const cell = ws.getCell('A1');
  cell.value = `PT SOPIAK SATRIA SAGA - ${title}`;
  cell.font = { bold: true, size: 14, color: { argb: 'FF1A5276' } };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 32;

  ws.mergeCells(2, 1, 2, colCount);
  const sub = ws.getCell('A2');
  sub.value = `Digenerate: ${new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
  sub.font = { italic: true, size: 10, color: { argb: 'FF7F8C8D' } };
  sub.alignment = { horizontal: 'center' };
  ws.getRow(2).height = 20;
}

// ==================== EXPORT ABSENSI ====================

router.get('/absensi', auth, requireRole('supervisor', 'admin', 'komandan'), async (req, res) => {
  try {
    const { start_date, end_date, lokasi_id, format = 'xlsx' } = req.query;
    const sd = start_date || new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
    const ed = end_date || new Date().toISOString().split('T')[0];

    let sql = `SELECT a.*, u.nama, u.nrp, u.shift as user_shift, l.nama as lokasi_nama
               FROM absensi a LEFT JOIN users u ON a.user_id = u.id LEFT JOIN lokasi l ON u.lokasi_id = l.id
               WHERE DATE(a.created_at) BETWEEN $1 AND $2`;
    const params = [sd, ed];
    if (lokasi_id) { params.push(lokasi_id); sql += ` AND u.lokasi_id = $${params.length}`; }
    sql += ' ORDER BY a.created_at DESC';
    const data = await queryAll(sql, params);

    // Get lokasi name for subtitle
    let lokasiName = 'Semua Lokasi';
    if (lokasi_id) {
      const lok = await queryOne('SELECT nama FROM lokasi WHERE id = $1', [lokasi_id]);
      if (lok) lokasiName = lok.nama;
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = 'PT Sopiak Satria Saga System';
    wb.created = new Date();

    const ws = wb.addWorksheet('Absensi', { views: [{ state: 'frozen', ySplit: 4 }] });
    const cols = ['No', 'Tanggal', 'Waktu', 'NRP', 'Nama', 'Shift', 'Tipe', 'Status', 'Pos Jaga', 'Dalam Radius', 'Lokasi', 'Alamat', 'Latitude', 'Longitude'];

    addTitleRow(ws, `LAPORAN ABSENSI - ${lokasiName}`, cols.length);
    ws.mergeCells(3, 1, 3, cols.length);
    ws.getCell('A3').value = `Periode: ${fmtDate(sd)} s/d ${fmtDate(ed)} | Total: ${data.length} record`;
    ws.getCell('A3').font = { size: 10, color: { argb: 'FF5D6D7E' } };
    ws.getCell('A3').alignment = { horizontal: 'center' };

    ws.getRow(4).values = cols;
    applyHeaderStyle(ws, 4);

    data.forEach((r, i) => {
      const row = ws.addRow([
        i + 1, fmtDate(r.created_at), fmtTime(r.created_at), r.nrp || '-', r.nama || '-',
        r.user_shift || '-', r.tipe, r.status, r.pos_jaga || '-',
        r.dalam_radius ? 'Ya' : 'Tidak', r.lokasi_nama || '-', r.alamat || '-',
        r.latitude, r.longitude,
      ]);
      // Alternate row coloring
      if (i % 2 === 0) {
        row.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FA' } }; });
      }
      // Color status
      const statusCell = row.getCell(8);
      if (r.status === 'terlambat') statusCell.font = { color: { argb: 'FFD97706' }, bold: true };
      else if (r.status === 'tidak_hadir') statusCell.font = { color: { argb: 'FFDC2626' }, bold: true };
      else statusCell.font = { color: { argb: 'FF16A34A' } };
    });

    // Summary sheet
    const sumWs = wb.addWorksheet('Ringkasan');
    const totalMasuk = data.filter(r => r.tipe === 'masuk').length;
    const totalKeluar = data.filter(r => r.tipe === 'keluar').length;
    const hadir = data.filter(r => r.status === 'hadir').length;
    const terlambat = data.filter(r => r.status === 'terlambat').length;
    const tidakHadir = data.filter(r => r.status === 'tidak_hadir').length;
    const dalamRadius = data.filter(r => r.dalam_radius).length;

    sumWs.columns = [{ width: 25 }, { width: 15 }];
    sumWs.addRow(['Ringkasan Absensi', '']).font = { bold: true, size: 14 };
    sumWs.addRow([]);
    sumWs.addRow(['Periode', `${fmtDate(sd)} s/d ${fmtDate(ed)}`]);
    sumWs.addRow(['Lokasi', lokasiName]);
    sumWs.addRow(['Total Record', data.length]);
    sumWs.addRow(['Absen Masuk', totalMasuk]);
    sumWs.addRow(['Absen Keluar', totalKeluar]);
    sumWs.addRow(['Hadir', hadir]);
    sumWs.addRow(['Terlambat', terlambat]);
    sumWs.addRow(['Tidak Hadir', tidakHadir]);
    sumWs.addRow(['Dalam Radius', `${dalamRadius} (${data.length > 0 ? Math.round((dalamRadius / data.length) * 100) : 0}%)`]);

    autoWidth(ws);

    const filename = `Absensi_${sd}_${ed}_${Date.now()}.xlsx`;
    const filepath = path.join(EXPORT_DIR, filename);
    await wb.xlsx.writeFile(filepath);

    logEvent(req.user.id, req.user.nama || '', 'EXPORT', 'absensi', null, { format: 'xlsx', periode: `${sd} - ${ed}`, lokasi_id, records: data.length });

    res.download(filepath, filename, () => {
      setTimeout(() => fs.unlink(filepath, () => {}), 60000);
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== EXPORT LAPORAN ====================

router.get('/laporan', auth, requireRole('supervisor', 'admin', 'komandan'), async (req, res) => {
  try {
    const { start_date, end_date, lokasi_id } = req.query;
    const sd = start_date || new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
    const ed = end_date || new Date().toISOString().split('T')[0];

    // Laporan Harian
    let sqlH = `SELECT lh.*, u.nama, u.nrp, l.nama as lokasi_nama
                FROM laporan_harian lh LEFT JOIN users u ON lh.user_id = u.id LEFT JOIN lokasi l ON u.lokasi_id = l.id
                WHERE DATE(lh.created_at) BETWEEN $1 AND $2`;
    const paramsH = [sd, ed];
    if (lokasi_id) { paramsH.push(lokasi_id); sqlH += ` AND u.lokasi_id = $${paramsH.length}`; }
    sqlH += ' ORDER BY lh.created_at DESC';

    // Laporan Kejadian
    let sqlK = `SELECT lk.*, u.nama, u.nrp, l.nama as lokasi_nama
                FROM laporan_kejadian lk LEFT JOIN users u ON lk.user_id = u.id LEFT JOIN lokasi l ON u.lokasi_id = l.id
                WHERE DATE(lk.created_at) BETWEEN $1 AND $2`;
    const paramsK = [sd, ed];
    if (lokasi_id) { paramsK.push(lokasi_id); sqlK += ` AND u.lokasi_id = $${paramsK.length}`; }
    sqlK += ' ORDER BY lk.created_at DESC';

    const [harian, kejadian] = await Promise.all([queryAll(sqlH, paramsH), queryAll(sqlK, paramsK)]);

    let lokasiName = 'Semua Lokasi';
    if (lokasi_id) { const lok = await queryOne('SELECT nama FROM lokasi WHERE id = $1', [lokasi_id]); if (lok) lokasiName = lok.nama; }

    const wb = new ExcelJS.Workbook();
    wb.creator = 'PT Sopiak Satria Saga System';

    // Sheet 1: Laporan Harian
    const wsH = wb.addWorksheet('Lap. Harian', { views: [{ state: 'frozen', ySplit: 4 }] });
    const colsH = ['No', 'Tanggal', 'NRP', 'Pelapor', 'Shift', 'Pos Jaga', 'Kondisi', 'Aktivitas', 'Temuan', 'Status', 'Lokasi'];
    addTitleRow(wsH, `LAPORAN HARIAN - ${lokasiName}`, colsH.length);
    wsH.mergeCells(3, 1, 3, colsH.length);
    wsH.getCell('A3').value = `Periode: ${fmtDate(sd)} s/d ${fmtDate(ed)} | Total: ${harian.length}`;
    wsH.getCell('A3').font = { size: 10, color: { argb: 'FF5D6D7E' } };
    wsH.getCell('A3').alignment = { horizontal: 'center' };
    wsH.getRow(4).values = colsH;
    applyHeaderStyle(wsH, 4);
    harian.forEach((r, i) => {
      const row = wsH.addRow([i + 1, fmtDate(r.tanggal || r.created_at), r.nrp, r.nama, r.shift, r.pos_jaga || '-', r.kondisi, r.aktivitas || '-', r.temuan || '-', r.status, r.lokasi_nama || '-']);
      if (i % 2 === 0) row.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FA' } }; });
    });
    autoWidth(wsH);

    // Sheet 2: Laporan Kejadian
    const wsK = wb.addWorksheet('Lap. Kejadian', { views: [{ state: 'frozen', ySplit: 4 }] });
    const colsK = ['No', 'Tanggal', 'NRP', 'Pelapor', 'Jenis', 'Prioritas', 'Lokasi Kejadian', 'Kronologi', 'Status', 'Lokasi Klien'];
    addTitleRow(wsK, `LAPORAN KEJADIAN - ${lokasiName}`, colsK.length);
    wsK.mergeCells(3, 1, 3, colsK.length);
    wsK.getCell('A3').value = `Periode: ${fmtDate(sd)} s/d ${fmtDate(ed)} | Total: ${kejadian.length}`;
    wsK.getCell('A3').font = { size: 10, color: { argb: 'FF5D6D7E' } };
    wsK.getCell('A3').alignment = { horizontal: 'center' };
    wsK.getRow(4).values = colsK;
    applyHeaderStyle(wsK, 4);
    kejadian.forEach((r, i) => {
      const row = wsK.addRow([i + 1, fmtDate(r.created_at), r.nrp, r.nama, r.jenis, r.prioritas, r.lokasi_text || '-', r.kronologi || '-', r.status, r.lokasi_nama || '-']);
      if (i % 2 === 0) row.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FA' } }; });
      const prioCell = row.getCell(6);
      if (r.prioritas === 'kritis') prioCell.font = { color: { argb: 'FFDC2626' }, bold: true };
      else if (r.prioritas === 'tinggi') prioCell.font = { color: { argb: 'FFD97706' }, bold: true };
    });
    autoWidth(wsK);

    const filename = `Laporan_${sd}_${ed}_${Date.now()}.xlsx`;
    const filepath = path.join(EXPORT_DIR, filename);
    await wb.xlsx.writeFile(filepath);

    logEvent(req.user.id, req.user.nama || '', 'EXPORT', 'laporan', null, { format: 'xlsx', periode: `${sd} - ${ed}`, harian: harian.length, kejadian: kejadian.length });

    res.download(filepath, filename, () => { setTimeout(() => fs.unlink(filepath, () => {}), 60000); });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== EXPORT PATROLI ====================

router.get('/patroli', auth, requireRole('supervisor', 'admin', 'komandan'), async (req, res) => {
  try {
    const { start_date, end_date, lokasi_id } = req.query;
    const sd = start_date || new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
    const ed = end_date || new Date().toISOString().split('T')[0];

    let sql = `SELECT p.*, u.nama, u.nrp, l.nama as lokasi_nama
               FROM patroli p LEFT JOIN users u ON p.user_id = u.id LEFT JOIN lokasi l ON u.lokasi_id = l.id
               WHERE DATE(p.created_at) BETWEEN $1 AND $2`;
    const params = [sd, ed];
    if (lokasi_id) { params.push(lokasi_id); sql += ` AND u.lokasi_id = $${params.length}`; }
    sql += ' ORDER BY p.start_time DESC';
    const data = await queryAll(sql, params);

    let lokasiName = 'Semua Lokasi';
    if (lokasi_id) { const lok = await queryOne('SELECT nama FROM lokasi WHERE id = $1', [lokasi_id]); if (lok) lokasiName = lok.nama; }

    const wb = new ExcelJS.Workbook();
    wb.creator = 'PT Sopiak Satria Saga System';

    const ws = wb.addWorksheet('Patroli', { views: [{ state: 'frozen', ySplit: 4 }] });
    const cols = ['No', 'Tanggal', 'NRP', 'Petugas', 'Rute', 'Mulai', 'Selesai', 'Checkpoint Scan', 'Checkpoint Total', 'Status', 'Lokasi'];
    addTitleRow(ws, `LAPORAN PATROLI - ${lokasiName}`, cols.length);
    ws.mergeCells(3, 1, 3, cols.length);
    ws.getCell('A3').value = `Periode: ${fmtDate(sd)} s/d ${fmtDate(ed)} | Total: ${data.length}`;
    ws.getCell('A3').font = { size: 10, color: { argb: 'FF5D6D7E' } };
    ws.getCell('A3').alignment = { horizontal: 'center' };
    ws.getRow(4).values = cols;
    applyHeaderStyle(ws, 4);

    data.forEach((r, i) => {
      const row = ws.addRow([
        i + 1, fmtDate(r.start_time), r.nrp, r.nama, r.route_name || '-',
        fmtTime(r.start_time), r.end_time ? fmtTime(r.end_time) : '-',
        r.checkpoint_scanned || 0, r.checkpoint_total || 0, r.status, r.lokasi_nama || '-',
      ]);
      if (i % 2 === 0) row.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FA' } }; });
    });

    autoWidth(ws);

    const filename = `Patroli_${sd}_${ed}_${Date.now()}.xlsx`;
    const filepath = path.join(EXPORT_DIR, filename);
    await wb.xlsx.writeFile(filepath);

    logEvent(req.user.id, req.user.nama || '', 'EXPORT', 'patroli', null, { format: 'xlsx', records: data.length });

    res.download(filepath, filename, () => { setTimeout(() => fs.unlink(filepath, () => {}), 60000); });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== EXPORT ALL-IN-ONE ====================

router.get('/complete', auth, requireRole('supervisor', 'admin'), async (req, res) => {
  try {
    const { start_date, end_date, lokasi_id } = req.query;
    const sd = start_date || new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
    const ed = end_date || new Date().toISOString().split('T')[0];
    const lokFilter = lokasi_id ? ` AND u.lokasi_id = $3` : '';
    const baseParams = [sd, ed];
    const lokParams = lokasi_id ? [...baseParams, lokasi_id] : baseParams;

    let lokasiName = 'Semua Lokasi';
    if (lokasi_id) { const lok = await queryOne('SELECT nama FROM lokasi WHERE id = $1', [lokasi_id]); if (lok) lokasiName = lok.nama; }

    const [absensi, harian, kejadian, patroli, personil] = await Promise.all([
      queryAll(`SELECT a.*, u.nama, u.nrp, l.nama as lokasi_nama FROM absensi a LEFT JOIN users u ON a.user_id = u.id LEFT JOIN lokasi l ON u.lokasi_id = l.id WHERE DATE(a.created_at) BETWEEN $1 AND $2${lokFilter} ORDER BY a.created_at DESC`, lokParams),
      queryAll(`SELECT lh.*, u.nama, u.nrp, l.nama as lokasi_nama FROM laporan_harian lh LEFT JOIN users u ON lh.user_id = u.id LEFT JOIN lokasi l ON u.lokasi_id = l.id WHERE DATE(lh.created_at) BETWEEN $1 AND $2${lokFilter} ORDER BY lh.created_at DESC`, lokParams),
      queryAll(`SELECT lk.*, u.nama, u.nrp, l.nama as lokasi_nama FROM laporan_kejadian lk LEFT JOIN users u ON lk.user_id = u.id LEFT JOIN lokasi l ON u.lokasi_id = l.id WHERE DATE(lk.created_at) BETWEEN $1 AND $2${lokFilter} ORDER BY lk.created_at DESC`, lokParams),
      queryAll(`SELECT p.*, u.nama, u.nrp, l.nama as lokasi_nama FROM patroli p LEFT JOIN users u ON p.user_id = u.id LEFT JOIN lokasi l ON u.lokasi_id = l.id WHERE DATE(p.created_at) BETWEEN $1 AND $2${lokFilter} ORDER BY p.start_time DESC`, lokParams),
      queryAll(`SELECT u.nrp, u.nama, u.role, u.shift, u.status, u.skor, l.nama as lokasi_nama FROM users u LEFT JOIN lokasi l ON u.lokasi_id = l.id WHERE u.role IN ('anggota','komandan')${lokasi_id ? ' AND u.lokasi_id = $1' : ''} ORDER BY u.nama`, lokasi_id ? [lokasi_id] : []),
    ]);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'PT Sopiak Satria Saga System';

    // Ringkasan sheet
    const wsSum = wb.addWorksheet('Ringkasan');
    wsSum.columns = [{ width: 30 }, { width: 20 }];
    wsSum.addRow(['LAPORAN LENGKAP PT SOPIAK SATRIA SAGA', '']).font = { bold: true, size: 16 };
    wsSum.addRow([`Lokasi: ${lokasiName}`, '']);
    wsSum.addRow([`Periode: ${fmtDate(sd)} s/d ${fmtDate(ed)}`, '']);
    wsSum.addRow([]);
    wsSum.addRow(['DATA', 'JUMLAH']).font = { bold: true };
    wsSum.addRow(['Total Absensi', absensi.length]);
    wsSum.addRow(['Hadir', absensi.filter(r => r.status === 'hadir').length]);
    wsSum.addRow(['Terlambat', absensi.filter(r => r.status === 'terlambat').length]);
    wsSum.addRow(['Laporan Harian', harian.length]);
    wsSum.addRow(['Laporan Kejadian', kejadian.length]);
    wsSum.addRow(['Total Patroli', patroli.length]);
    wsSum.addRow(['Patroli Selesai', patroli.filter(r => r.status === 'completed').length]);
    wsSum.addRow(['Total Personil', personil.length]);

    // Personil sheet
    const wsPers = wb.addWorksheet('Personil');
    wsPers.getRow(1).values = ['No', 'NRP', 'Nama', 'Role', 'Shift', 'Status', 'Skor', 'Lokasi'];
    applyHeaderStyle(wsPers, 1);
    personil.forEach((r, i) => wsPers.addRow([i + 1, r.nrp, r.nama, r.role, r.shift, r.status, r.skor, r.lokasi_nama || '-']));
    autoWidth(wsPers);

    // Absensi sheet
    const wsAbs = wb.addWorksheet('Absensi');
    wsAbs.getRow(1).values = ['No', 'Tanggal', 'NRP', 'Nama', 'Tipe', 'Status', 'Pos Jaga', 'Dalam Radius', 'Lokasi'];
    applyHeaderStyle(wsAbs, 1);
    absensi.forEach((r, i) => wsAbs.addRow([i + 1, fmtDate(r.created_at), r.nrp, r.nama, r.tipe, r.status, r.pos_jaga || '-', r.dalam_radius ? 'Ya' : 'Tidak', r.lokasi_nama || '-']));
    autoWidth(wsAbs);

    // Laporan Harian sheet
    const wsLH = wb.addWorksheet('Lap. Harian');
    wsLH.getRow(1).values = ['No', 'Tanggal', 'NRP', 'Pelapor', 'Shift', 'Kondisi', 'Status', 'Lokasi'];
    applyHeaderStyle(wsLH, 1);
    harian.forEach((r, i) => wsLH.addRow([i + 1, fmtDate(r.tanggal || r.created_at), r.nrp, r.nama, r.shift, r.kondisi, r.status, r.lokasi_nama || '-']));
    autoWidth(wsLH);

    // Laporan Kejadian sheet
    const wsLK = wb.addWorksheet('Lap. Kejadian');
    wsLK.getRow(1).values = ['No', 'Tanggal', 'NRP', 'Pelapor', 'Jenis', 'Prioritas', 'Status', 'Lokasi'];
    applyHeaderStyle(wsLK, 1);
    kejadian.forEach((r, i) => wsLK.addRow([i + 1, fmtDate(r.created_at), r.nrp, r.nama, r.jenis, r.prioritas, r.status, r.lokasi_nama || '-']));
    autoWidth(wsLK);

    // Patroli sheet
    const wsPat = wb.addWorksheet('Patroli');
    wsPat.getRow(1).values = ['No', 'Tanggal', 'NRP', 'Petugas', 'Rute', 'Mulai', 'Selesai', 'Checkpoint', 'Status', 'Lokasi'];
    applyHeaderStyle(wsPat, 1);
    patroli.forEach((r, i) => wsPat.addRow([i + 1, fmtDate(r.start_time), r.nrp, r.nama, r.route_name || '-', fmtTime(r.start_time), r.end_time ? fmtTime(r.end_time) : '-', `${r.checkpoint_scanned || 0}/${r.checkpoint_total || 0}`, r.status, r.lokasi_nama || '-']));
    autoWidth(wsPat);

    const filename = `LaporanLengkap_${lokasiName.replace(/\s/g, '_')}_${sd}_${ed}_${Date.now()}.xlsx`;
    const filepath = path.join(EXPORT_DIR, filename);
    await wb.xlsx.writeFile(filepath);

    logEvent(req.user.id, req.user.nama || '', 'EXPORT', 'complete', null, { format: 'xlsx', lokasi: lokasiName });

    res.download(filepath, filename, () => { setTimeout(() => fs.unlink(filepath, () => {}), 60000); });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== LOKASI STATS (Multi-lokasi dashboard) ====================

router.get('/lokasi-stats', auth, requireRole('supervisor', 'admin'), async (req, res) => {
  try {
    const lokasi = await queryAll("SELECT id, nama, alamat, status FROM lokasi WHERE status = 'active' ORDER BY nama");

    const stats = await Promise.all(lokasi.map(async (l) => {
      const [personil, onDuty, absensiToday, pendingLap, activePatrol] = await Promise.all([
        queryOne("SELECT COUNT(*)::int as c FROM users WHERE lokasi_id = $1 AND role IN ('anggota','komandan')", [l.id]),
        queryOne("SELECT COUNT(*)::int as c FROM users WHERE lokasi_id = $1 AND status != 'off_duty' AND role IN ('anggota','komandan')", [l.id]),
        queryOne("SELECT COUNT(*)::int as c FROM absensi a JOIN users u ON a.user_id = u.id WHERE u.lokasi_id = $1 AND DATE(a.created_at) = CURRENT_DATE", [l.id]),
        queryOne(`SELECT COUNT(*)::int as c FROM (
          SELECT id FROM laporan_harian WHERE status = 'pending' AND user_id IN (SELECT id FROM users WHERE lokasi_id = $1)
          UNION ALL
          SELECT id FROM laporan_kejadian WHERE status = 'pending' AND user_id IN (SELECT id FROM users WHERE lokasi_id = $1)
        ) t`, [l.id]),
        queryOne("SELECT COUNT(*)::int as c FROM patroli WHERE status = 'active' AND user_id IN (SELECT id FROM users WHERE lokasi_id = $1)", [l.id]),
      ]);
      return {
        ...l,
        total_personil: personil.c,
        on_duty: onDuty.c,
        absensi_today: absensiToday.c,
        pending_laporan: pendingLap.c,
        active_patrol: activePatrol.c,
      };
    }));

    res.json(stats);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
