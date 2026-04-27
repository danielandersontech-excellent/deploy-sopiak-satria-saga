/**
 * ============================================================
 * PDF REPORT SERVICE - Individual Performance Report per Anggota
 * ============================================================
 * Generates professional PDF via HTML → expo-print → Share
 *  ✅ Personal info + photo
 *  ✅ Attendance summary
 *  ✅ Patrol performance
 *  ✅ Incident + daily reports
 *  ✅ KPI score
 *  ✅ Geofence compliance
 *  ✅ Bilingual (ID/EN)
 */
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export interface AnggotaReportData {
  nama: string; nrp: string; role: string; posJaga: string;
  shift: string; lokasi: string; fotoUrl?: string; noHp?: string;
  periodStart: string; periodEnd: string;
  absensi: { totalHariKerja: number; hadir: number; sakit: number; izin: number; alpha: number; telat: number; rataJamMasuk?: string; };
  patroli: { totalAssigned: number; completed: number; avgCheckpointRate: number; totalCheckpointScanned: number; totalCheckpointTarget: number; };
  laporanHarian: { submitted: number; approved: number; rejected: number; pending: number; completionRate: number; };
  laporanKejadian: { filed: number; resolved: number; pending: number; };
  kpiScore: number;
  geofence?: { totalChecks: number; insideRadius: number; outsideRadius: number; complianceRate: number; };
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return iso; }
}

function buildHTML(d: AnggotaReportData, lang: string): string {
  const en = lang === 'en';
  const period = `${fmtDate(d.periodStart)} - ${fmtDate(d.periodEnd)}`;
  const kpiC = d.kpiScore >= 80 ? '#27ae60' : d.kpiScore >= 60 ? '#f39c12' : '#e74c3c';
  const kpiL = d.kpiScore >= 80 ? (en?'Excellent':'Sangat Baik') : d.kpiScore >= 60 ? (en?'Good':'Baik') : (en?'Needs Improvement':'Perlu Perbaikan');
  const attR = d.absensi.totalHariKerja > 0 ? Math.round((d.absensi.hadir/d.absensi.totalHariKerja)*100) : 0;
  const patR = d.patroli.totalAssigned > 0 ? Math.round((d.patroli.completed/d.patroli.totalAssigned)*100) : 0;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:11px;color:#1e293b;line-height:1.5;padding:24px}
.hdr{border-bottom:3px solid #1a5276;padding-bottom:14px;margin-bottom:14px;text-align:center}
.hdr h1{font-size:18px;color:#1a5276}.hdr h2{font-size:13px;color:#64748b;font-weight:400}.hdr .per{font-size:10px;color:#94a3b8;margin-top:4px}
.prof{display:flex;gap:14px;margin-bottom:18px;padding:12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0}
.av{width:65px;height:65px;border-radius:50%;object-fit:cover;border:2px solid #1a5276}
.pi{flex:1}.pi h3{font-size:15px;color:#1a5276;margin-bottom:3px}.pi .det{font-size:10px;color:#64748b;line-height:1.6}
.kb{text-align:center;padding:6px 14px}.kb .sc{font-size:30px;font-weight:800;line-height:1}.kb .lb{font-size:9px;font-weight:600;margin-top:1px}
.sec{margin-bottom:16px}.st{font-size:12px;font-weight:700;color:#1a5276;border-bottom:1.5px solid #e2e8f0;padding-bottom:3px;margin-bottom:8px}
.g4{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.g5{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}.g2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.sc-card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px;text-align:center}
.sc-card .v{font-size:18px;font-weight:800}.sc-card .l{font-size:9px;color:#64748b;margin-top:1px}
.pb{width:100%;height:7px;background:#e2e8f0;border-radius:3px;overflow:hidden;margin-top:3px}.pf{height:100%;border-radius:3px}
table{width:100%;border-collapse:collapse;font-size:10px}th{background:#f1f5f9;color:#475569;font-weight:600;text-align:left;padding:5px 7px;border:1px solid #e2e8f0}td{padding:4px 7px;border:1px solid #e2e8f0;color:#334155}
tr:nth-child(even) td{background:#fafbfc}
.bg{display:inline-block;padding:1px 5px;border-radius:5px;font-size:9px;font-weight:600}
.bg-g{background:#dcfce7;color:#166534}.bg-r{background:#fee2e2;color:#991b1b}.bg-y{background:#fef3c7;color:#92400e}
.ft{margin-top:20px;padding-top:10px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:9px}
</style></head><body>

<div class="hdr"><h1>PT SOPIAK SATRIA SAGA</h1><h2>${en?'Individual Performance Report':'Laporan Kinerja Individual'}</h2><div class="per">${en?'Period':'Periode'}: ${period}</div></div>

<div class="prof">
${d.fotoUrl?`<img src="${d.fotoUrl}" class="av" onerror="this.style.display='none'"/>`:''}
<div class="pi"><h3>${d.nama}</h3><div class="det">NRP: <b>${d.nrp}</b> | Role: <b>${d.role}</b><br/>${en?'Post':'Pos'}: <b>${d.posJaga}</b> | Shift: <b>${d.shift}</b><br/>${en?'Location':'Lokasi'}: <b>${d.lokasi}</b>${d.noHp?` | HP: <b>${d.noHp}</b>`:''}</div></div>
<div class="kb"><div class="sc" style="color:${kpiC}">${d.kpiScore}</div><div class="lb" style="color:${kpiC}">${kpiL}</div><div style="font-size:8px;color:#94a3b8">KPI</div></div>
</div>

<div class="g4">
<div class="sc-card"><div class="v" style="color:#27ae60">${attR}%</div><div class="l">${en?'Attendance':'Kehadiran'}</div><div class="pb"><div class="pf" style="width:${attR}%;background:#27ae60"></div></div></div>
<div class="sc-card"><div class="v" style="color:#2980b9">${patR}%</div><div class="l">${en?'Patrol':'Patroli'}</div><div class="pb"><div class="pf" style="width:${patR}%;background:#2980b9"></div></div></div>
<div class="sc-card"><div class="v" style="color:#f39c12">${d.laporanHarian.completionRate}%</div><div class="l">${en?'Reports':'Laporan'}</div><div class="pb"><div class="pf" style="width:${d.laporanHarian.completionRate}%;background:#f39c12"></div></div></div>
<div class="sc-card"><div class="v" style="color:${kpiC}">${d.kpiScore}</div><div class="l">KPI</div><div class="pb"><div class="pf" style="width:${d.kpiScore}%;background:${kpiC}"></div></div></div>
</div>

<div class="sec" style="margin-top:14px">
<div class="st">📋 ${en?'Attendance':'Kehadiran'}</div>
<div class="g5">
<div class="sc-card"><div class="v" style="color:#27ae60">${d.absensi.hadir}</div><div class="l">${en?'Present':'Hadir'}</div></div>
<div class="sc-card"><div class="v" style="color:#f39c12">${d.absensi.telat}</div><div class="l">${en?'Late':'Telat'}</div></div>
<div class="sc-card"><div class="v" style="color:#3b82f6">${d.absensi.sakit}</div><div class="l">${en?'Sick':'Sakit'}</div></div>
<div class="sc-card"><div class="v" style="color:#8b5cf6">${d.absensi.izin}</div><div class="l">${en?'Permit':'Izin'}</div></div>
<div class="sc-card"><div class="v" style="color:#e74c3c">${d.absensi.alpha}</div><div class="l">Alpha</div></div>
</div>
${d.absensi.rataJamMasuk?`<div style="margin-top:4px;font-size:10px;color:#64748b">${en?'Avg clock-in':'Rata-rata masuk'}: <b>${d.absensi.rataJamMasuk}</b></div>`:''}
</div>

<div class="sec">
<div class="st">🚶 ${en?'Patrol Performance':'Performa Patroli'}</div>
<table>
<tr><td>${en?'Assigned':'Ditugaskan'}</td><td><b>${d.patroli.totalAssigned}</b></td><td>${en?'Completed':'Selesai'}</td><td><b>${d.patroli.completed}</b></td></tr>
<tr><td>${en?'Rate':'Tingkat'}</td><td><b>${patR}%</b></td><td>Checkpoint</td><td><b>${d.patroli.totalCheckpointScanned}/${d.patroli.totalCheckpointTarget}</b> (${d.patroli.avgCheckpointRate}%)</td></tr>
</table>
</div>

<div class="sec">
<div class="st">📄 ${en?'Reports':'Laporan'}</div>
<div class="g2">
<div><b style="font-size:10px;color:#1a5276">${en?'Daily Reports':'Laporan Harian'}</b>
<table style="margin-top:3px">
<tr><td>${en?'Submitted':'Submit'}</td><td><b>${d.laporanHarian.submitted}</b></td></tr>
<tr><td>${en?'Approved':'Disetujui'}</td><td><span class="bg bg-g">${d.laporanHarian.approved}</span></td></tr>
<tr><td>${en?'Rejected':'Ditolak'}</td><td><span class="bg bg-r">${d.laporanHarian.rejected}</span></td></tr>
<tr><td>Pending</td><td><span class="bg bg-y">${d.laporanHarian.pending}</span></td></tr>
</table></div>
<div><b style="font-size:10px;color:#1a5276">${en?'Incident Reports':'Laporan Kejadian'}</b>
<table style="margin-top:3px">
<tr><td>${en?'Filed':'Dilaporkan'}</td><td><b>${d.laporanKejadian.filed}</b></td></tr>
<tr><td>${en?'Resolved':'Selesai'}</td><td><span class="bg bg-g">${d.laporanKejadian.resolved}</span></td></tr>
<tr><td>Pending</td><td><span class="bg bg-y">${d.laporanKejadian.pending}</span></td></tr>
</table></div>
</div>
</div>

${d.geofence?`
<div class="sec">
<div class="st">🛡️ ${en?'Geofence Compliance':'Kepatuhan Geofence'}</div>
<div class="g4" style="grid-template-columns:repeat(3,1fr)">
<div class="sc-card"><div class="v" style="color:${d.geofence.complianceRate>=90?'#27ae60':'#f39c12'}">${d.geofence.complianceRate}%</div><div class="l">${en?'Compliance':'Kepatuhan'}</div></div>
<div class="sc-card"><div class="v" style="color:#27ae60">${d.geofence.insideRadius}</div><div class="l">${en?'In Zone':'Dalam'}</div></div>
<div class="sc-card"><div class="v" style="color:#e74c3c">${d.geofence.outsideRadius}</div><div class="l">${en?'Out Zone':'Luar'}</div></div>
</div></div>`:''}

<div class="ft">
${en?'Generated by':'Dibuat oleh'} PTSSS v8 - ${new Date().toLocaleString('id-ID')}
<br/>PT Sopiak Satria Saga Security Management System
</div>
</body></html>`;
}

// ===== GENERATE PDF & SHARE =====
export async function generateAnggotaPDF(data: AnggotaReportData, lang: string = 'id'): Promise<string> {
  const html = buildHTML(data, lang);
  const { uri } = await Print.printToFileAsync({ html, width: 612, height: 792 });
  console.log(`[PDF] Generated: ${uri}`);
  return uri;
}

export async function generateAndShareAnggotaPDF(data: AnggotaReportData, lang: string = 'id'): Promise<void> {
  const uri = await generateAnggotaPDF(data, lang);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `Report - ${data.nama}`,
      UTI: 'com.adobe.pdf',
    });
  }
}

// ===== BUILD REPORT DATA FROM STORE =====
export function buildReportFromStore(
  user: any, absensi: any[], patroli: any[], harianList: any[], kejadianList: any[],
  periodStart: string, periodEnd: string,
): AnggotaReportData {
  const userAbsensi = absensi.filter(a => a.user_id === user.id || a.userId === user.id);
  const userPatroli = patroli.filter(p => p.user_id === user.id || p.userId === user.id);
  const userHarian = harianList.filter(l => l.user_id === user.id || l.userId === user.id);
  const userKejadian = kejadianList.filter(l => l.user_id === user.id || l.userId === user.id);

  const hadir = userAbsensi.filter(a => a.status === 'hadir' || a.tipe === 'masuk').length;
  const sakit = userAbsensi.filter(a => a.status === 'sakit').length;
  const izin = userAbsensi.filter(a => a.status === 'izin').length;
  const telat = userAbsensi.filter(a => a.status === 'telat' || a.telat).length;

  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000*60*60*24)));
  const workDays = Math.round(totalDays * 5 / 7); // Approximate work days
  const alpha = Math.max(0, workDays - hadir - sakit - izin);

  const completedPatrols = userPatroli.filter(p => p.status === 'completed' || p.status === 'selesai').length;
  const totalCP = userPatroli.reduce((s: number, p: any) => s + (p.checkpoint_total || 0), 0);
  const scannedCP = userPatroli.reduce((s: number, p: any) => s + (p.checkpoint_scanned || 0), 0);

  const approvedH = userHarian.filter(l => l.status === 'approved').length;
  const rejectedH = userHarian.filter(l => l.status === 'rejected').length;
  const pendingH = userHarian.filter(l => l.status === 'pending').length;

  const resolvedK = userKejadian.filter(l => l.status === 'approved' || l.status === 'resolved').length;
  const pendingK = userKejadian.filter(l => l.status === 'pending').length;

  // KPI calculation
  const attScore = workDays > 0 ? (hadir / workDays) * 100 : 0;
  const patScore = userPatroli.length > 0 ? (completedPatrols / userPatroli.length) * 100 : 100;
  const repScore = workDays > 0 ? Math.min(100, (userHarian.length / workDays) * 100) : 100;
  const kpi = Math.round(attScore * 0.35 + patScore * 0.30 + repScore * 0.25 + (user.skor || 80) * 0.10);

  return {
    nama: user.nama, nrp: user.nrp, role: user.role,
    posJaga: user.pos_nama || user.posJaga || '-',
    shift: user.shift || '-', lokasi: user.lokasi_nama || user.lokasi || '-',
    fotoUrl: user.foto_url, noHp: user.no_hp,
    periodStart, periodEnd,
    absensi: { totalHariKerja: workDays, hadir, sakit, izin, alpha, telat },
    patroli: {
      totalAssigned: userPatroli.length, completed: completedPatrols,
      avgCheckpointRate: totalCP > 0 ? Math.round((scannedCP/totalCP)*100) : 0,
      totalCheckpointScanned: scannedCP, totalCheckpointTarget: totalCP,
    },
    laporanHarian: {
      submitted: userHarian.length, approved: approvedH, rejected: rejectedH,
      pending: pendingH, completionRate: workDays > 0 ? Math.round((userHarian.length/workDays)*100) : 0,
    },
    laporanKejadian: { filed: userKejadian.length, resolved: resolvedK, pending: pendingK },
    kpiScore: Math.min(100, Math.max(0, kpi)),
  };
}
