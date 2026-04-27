/**
 * EXCEL EXPORT SERVICE - Export data to CSV/Excel
 * Uses CSV format (openable in Excel, Google Sheets, etc.)
 * For actual .xlsx, the backend generates it (TODO: backend endpoint)
 */
// Use legacy import to avoid deprecation warnings on SDK 54+
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

interface ExportColumn {
  header: string;
  key: string;
  format?: (val: any) => string;
}

// ===== CORE: Generate CSV string from data =====
function generateCSV(columns: ExportColumn[], data: any[]): string {
  // BOM for Excel UTF-8 compatibility
  const bom = '\ufeff';
  const headers = columns.map(c => `"${c.header}"`).join(',');
  const rows = data.map(row =>
    columns.map(c => {
      let val = row[c.key] ?? '';
      if (c.format) val = c.format(val);
      // Escape quotes in value
      val = String(val).replace(/"/g, '""');
      return `"${val}"`;
    }).join(',')
  );
  return bom + headers + '\n' + rows.join('\n');
}

// ===== CORE: Save and share CSV file =====
async function saveAndShareCSV(csv: string, filename: string): Promise<void> {
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) throw new Error('Cache directory not available');
  const path = `${cacheDir}${filename}`;
  await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
  
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: `Export: ${filename}` });
  } else {
    throw new Error('Sharing not available');
  }
}

// ===== FORMAT HELPERS =====
function fmtDate(val: any): string {
  if (!val) return '-';
  try { return new Date(val).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return String(val); }
}

function fmtTime(val: any): string {
  if (!val) return '-';
  try { return new Date(val).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }); }
  catch { return String(val); }
}

function fmtDateTime(val: any): string {
  if (!val) return '-';
  return `${fmtDate(val)} ${fmtTime(val)}`;
}

// ===== EXPORT PRESETS =====

export async function exportAbsensi(data: any[], dateRange?: string): Promise<void> {
  const columns: ExportColumn[] = [
    { header: 'Tanggal', key: 'created_at', format: fmtDate },
    { header: 'Waktu', key: 'created_at', format: fmtTime },
    { header: 'NRP', key: 'nrp' },
    { header: 'Nama', key: 'nama' },
    { header: 'Tipe', key: 'tipe' },
    { header: 'Status', key: 'status' },
    { header: 'Dalam Radius', key: 'dalam_radius', format: (v) => v ? 'Ya' : 'Tidak' },
    { header: 'Alamat', key: 'alamat' },
    { header: 'Latitude', key: 'latitude' },
    { header: 'Longitude', key: 'longitude' },
  ];
  const csv = generateCSV(columns, data);
  const fname = `Absensi_${dateRange || 'all'}_${Date.now()}.csv`;
  await saveAndShareCSV(csv, fname);
}

export async function exportPatroli(data: any[], dateRange?: string): Promise<void> {
  const columns: ExportColumn[] = [
    { header: 'Tanggal', key: 'created_at', format: fmtDate },
    { header: 'Mulai', key: 'start_time', format: fmtTime },
    { header: 'Selesai', key: 'end_time', format: fmtTime },
    { header: 'Petugas', key: 'user_nama' },
    { header: 'Rute', key: 'route_name' },
    { header: 'Status', key: 'status' },
    { header: 'Checkpoint Scan', key: 'checkpoint_scanned' },
    { header: 'Checkpoint Total', key: 'checkpoint_total' },
  ];
  const csv = generateCSV(columns, data);
  const fname = `Patroli_${dateRange || 'all'}_${Date.now()}.csv`;
  await saveAndShareCSV(csv, fname);
}

export async function exportLaporanHarian(data: any[], dateRange?: string): Promise<void> {
  const columns: ExportColumn[] = [
    { header: 'Tanggal', key: 'created_at', format: fmtDate },
    { header: 'Petugas', key: 'user_nama' },
    { header: 'Shift', key: 'shift' },
    { header: 'Pos Jaga', key: 'pos_jaga' },
    { header: 'Kondisi', key: 'kondisi' },
    { header: 'Aktivitas', key: 'aktivitas' },
    { header: 'Temuan', key: 'temuan' },
    { header: 'Status', key: 'status' },
  ];
  const csv = generateCSV(columns, data);
  const fname = `LaporanHarian_${dateRange || 'all'}_${Date.now()}.csv`;
  await saveAndShareCSV(csv, fname);
}

export async function exportLaporanKejadian(data: any[], dateRange?: string): Promise<void> {
  const columns: ExportColumn[] = [
    { header: 'Tanggal', key: 'created_at', format: fmtDateTime },
    { header: 'Pelapor', key: 'user_nama' },
    { header: 'Jenis', key: 'jenis' },
    { header: 'Prioritas', key: 'prioritas' },
    { header: 'Lokasi', key: 'lokasi_text' },
    { header: 'Kronologi', key: 'kronologi' },
    { header: 'Status', key: 'status' },
  ];
  const csv = generateCSV(columns, data);
  const fname = `LaporanKejadian_${dateRange || 'all'}_${Date.now()}.csv`;
  await saveAndShareCSV(csv, fname);
}

export async function exportAuditLog(data: any[], dateRange?: string): Promise<void> {
  const columns: ExportColumn[] = [
    { header: 'Waktu', key: 'created_at', format: fmtDateTime },
    { header: 'User', key: 'user_nama' },
    { header: 'Aksi', key: 'action' },
    { header: 'Resource', key: 'resource' },
    { header: 'Detail', key: 'detail', format: (v) => typeof v === 'object' ? JSON.stringify(v) : String(v || '') },
    { header: 'IP', key: 'ip_address' },
  ];
  const csv = generateCSV(columns, data);
  const fname = `AuditLog_${dateRange || 'all'}_${Date.now()}.csv`;
  await saveAndShareCSV(csv, fname);
}

// ===== GENERIC EXPORT =====
export async function exportCustom(columns: ExportColumn[], data: any[], filename: string): Promise<void> {
  const csv = generateCSV(columns, data);
  await saveAndShareCSV(csv, filename);
}
