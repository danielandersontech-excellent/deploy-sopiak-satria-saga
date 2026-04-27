/**
 * REPORT EXPORT - PDF & Excel
 * Direct API to Express Backend → PostgreSQL (ptsss_db)
 * TANPA SUPABASE
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { apiFetch } from '@/lib/api';

// ==================== EXCEL ====================
export function exportToExcel(data: any[], filename: string, sheetName = 'Data') {
  if (!data.length) return;
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const colWidths = Object.keys(data[0] || {}).map(key => ({ wch: Math.max(key.length, ...data.map(row => String(row[key] || '').length)) + 2 }));
  ws['!cols'] = colWidths;
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

// ==================== PDF HELPERS ====================
function createPDFHeader(doc: jsPDF, title: string, subtitle?: string) {
  doc.setFillColor(26, 82, 118);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 35, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18); doc.setFont('helvetica', 'bold');
  doc.text('PT SOPIAK SATRIA SAGA', 14, 15);
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text(title, 14, 24);
  if (subtitle) { doc.setFontSize(8); doc.text(subtitle, 14, 30); }
  doc.setFontSize(8);
  doc.text(`Dicetak: ${new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}`, doc.internal.pageSize.getWidth() - 14, 15, { align: 'right' });
  doc.setTextColor(0, 0, 0);
  return 42;
}

export function exportAbsensiPDF(data: any[], periode: string) {
  const doc = new jsPDF();
  const startY = createPDFHeader(doc, 'LAPORAN ABSENSI', periode);
  autoTable(doc, {
    startY,
    head: [['#', 'Nama', 'NRP', 'Tipe', 'Waktu', 'Pos Jaga', 'Status', 'Dalam Radius']],
    body: data.map((r, i) => [i + 1, r.nama || r.users?.nama || '-', r.nrp || r.users?.nrp || '-', r.tipe === 'masuk' ? 'Masuk' : 'Keluar', new Date(r.waktu).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }), r.pos_jaga || '-', r.status, r.dalam_radius ? 'Ya' : 'Tidak']),
    theme: 'striped', headStyles: { fillColor: [41, 128, 185], fontSize: 8 }, bodyStyles: { fontSize: 7 },
  });
  const finalY = (doc as any).lastAutoTable.finalY + 10;
  doc.setFontSize(9); doc.setFont('helvetica', 'bold');
  doc.text(`Total: ${data.length} | Hadir: ${data.filter(r => r.status === 'hadir').length} | Terlambat: ${data.filter(r => r.status === 'terlambat').length}`, 14, finalY);
  doc.save(`Laporan_Absensi_${periode.replace(/\s/g, '_')}.pdf`);
}

export function exportLaporanPDF(harianData: any[], kejadianData: any[], periode: string) {
  const doc = new jsPDF();
  const startY = createPDFHeader(doc, 'LAPORAN KEGIATAN', periode);
  doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.text('A. Laporan Harian', 14, startY);
  autoTable(doc, { startY: startY + 4, head: [['#', 'Pelapor', 'Tanggal', 'Kondisi', 'Shift', 'Status']], body: harianData.map((r, i) => [i + 1, r.users?.nama || '-', r.tanggal, r.kondisi, r.shift || '-', r.status]), theme: 'striped', headStyles: { fillColor: [243, 156, 18], fontSize: 8 }, bodyStyles: { fontSize: 7 } });
  let nextY = (doc as any).lastAutoTable.finalY + 12;
  if (nextY > 250) { doc.addPage(); nextY = 20; }
  doc.setFontSize(12); doc.text('B. Laporan Kejadian', 14, nextY);
  autoTable(doc, { startY: nextY + 4, head: [['#', 'Pelapor', 'Jenis', 'Prioritas', 'Waktu', 'Status']], body: kejadianData.map((r, i) => [i + 1, r.users?.nama || '-', r.jenis, r.prioritas, r.waktu_kejadian ? new Date(r.waktu_kejadian).toLocaleDateString('id-ID') : '-', r.status]), theme: 'striped', headStyles: { fillColor: [231, 76, 60], fontSize: 8 }, bodyStyles: { fontSize: 7 } });
  doc.save(`Laporan_Kegiatan_${periode.replace(/\s/g, '_')}.pdf`);
}

export function exportPatroliPDF(data: any[], periode: string) {
  const doc = new jsPDF();
  const startY = createPDFHeader(doc, 'LAPORAN PATROLI', periode);
  autoTable(doc, { startY, head: [['#', 'Petugas', 'Rute', 'Mulai', 'Selesai', 'Scan', 'Status']], body: data.map((r, i) => [i + 1, r.users?.nama || '-', r.route_name || '-', r.start_time ? new Date(r.start_time).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : '-', r.end_time ? new Date(r.end_time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-', r.patrol_scans?.length || 0, r.status]), theme: 'striped', headStyles: { fillColor: [39, 174, 96], fontSize: 8 }, bodyStyles: { fontSize: 7 } });
  doc.save(`Laporan_Patroli_${periode.replace(/\s/g, '_')}.pdf`);
}

// ==================== DATA FETCHERS (Direct API) ====================
function toArray(d: any): any[] { return Array.isArray(d) ? d : d?.data || d?.rows || []; }

export async function fetchAbsensiForExport(startDate: string, endDate: string, lokasiId?: string) {
  const d = await apiFetch(`/api/absensi?start_date=${startDate}&end_date=${endDate}${lokasiId ? '&lokasi_id=' + lokasiId : ''}`);
  return toArray(d);
}

export async function fetchLaporanForExport(startDate: string, endDate: string) {
  const [harian, kejadian] = await Promise.all([
    apiFetch(`/api/laporan/harian?start_date=${startDate}&end_date=${endDate}`),
    apiFetch(`/api/laporan/kejadian?start_date=${startDate}&end_date=${endDate}`),
  ]);
  return { harian: toArray(harian), kejadian: toArray(kejadian) };
}

export async function fetchPatroliForExport(startDate: string, endDate: string) {
  const d = await apiFetch(`/api/patroli?start_date=${startDate}&end_date=${endDate}`);
  return toArray(d);
}
