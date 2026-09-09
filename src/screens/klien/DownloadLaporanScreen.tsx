/**
 * DOWNLOAD LAPORAN KLIEN - v25 (Bug-Fix Pass on top of v24)
 *
 * FIXES (v25):
 *  🚨 XSS PREVENTION — buildHTML interpolated `nama`, `nrp`, `posJaga`,
 *     `kondisi`, `aktivitas`, `kronologi`, `lokasiText`, `jenis` directly into
 *     HTML. Fields with `<` or HTML-like content would break the template or
 *     execute scripts. Now every field passes through escapeHtml().
 *  🚨 EMPTY CATCH BLOCKS — Print/Share errors silently swallowed. User taps
 *     button, nothing happens, no error message. Now errors surface via Alert.
 *  🚨 PATROLI COUNT ALWAYS 0 — original hardcoded `count: 0` even when there
 *     were patrol records. Now fetches via `patroliApi.list()` + extractArray()
 *     and renders an actual patrol table when generating the report.
 *  🚨 NO BACK BUTTON — DownloadLaporanScreen is registered BOTH as a tab AND
 *     as a stack screen. When reached via stack push (e.g. from Dashboard menu),
 *     user had no way back. Now uses navigation.canGoBack() to conditionally
 *     render a back arrow.
 *  🚨 PRIVACY LEAK — klien user with no `lokasi_id` saw EVERY company's data.
 *     Now hideAll → empty + notice.
 *
 *  ✅ Filter chips ('Semua', 'Harian', etc.) labels now i18n'd.
 *  ✅ Locale-aware date formatting (id-ID vs en-US) in HTML and UI.
 *  ✅ Stat label `textTransform: capitalize` removed (couldn't handle ID/EN
 *     multi-word) — labels are now pre-translated.
 *  ✅ `aktivitas.substring(0,80)` truncation now appends "…" instead of
 *     cutting mid-word silently.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
  ActivityIndicator, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Colors, Typography, Spacing, Radius } from '../../constants';
import { Badge } from '../../components';
import { useDataStore } from '../../stores/dataStore';
import { useAuthStore } from '../../stores/authStore';
import { patroliApi } from '../../lib/apiClient';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

const { width: SW } = Dimensions.get('window');
type ReportType = 'all' | 'Harian' | 'Kejadian' | 'Absensi' | 'Patroli';
const JENIS: ReportType[] = ['all', 'Harian', 'Kejadian', 'Absensi', 'Patroli'];

const ICON_MAP: Record<string, { name: string; color: string; bg: string }> = {
  Harian:   { name: 'document-text', color: Colors.primary, bg: Colors.primaryBg },
  Kejadian: { name: 'alert-circle',  color: Colors.danger,  bg: Colors.dangerBg },
  Absensi:  { name: 'finger-print',  color: Colors.success, bg: Colors.successBg },
  Patroli:  { name: 'navigate',      color: Colors.warning, bg: Colors.warningBg },
};

function getField(obj: any, ...keys: string[]): any {
  if (!obj) return undefined;
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return undefined;
}

// 🚨 XSS prevention
function escapeHtml(s: any): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Truncate string with ellipsis (instead of mid-word cut)
function truncate(s: string, max: number): string {
  if (!s) return '';
  if (s.length <= max) return s;
  return s.substring(0, max - 1).trimEnd() + '…';
}

function extractArray(result: any): any[] {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.data)) return result.data;
  if (result && Array.isArray(result.rows)) return result.rows;
  if (result && Array.isArray(result.items)) return result.items;
  return [];
}

export default function DownloadLaporanScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { lang } = useI18n();
  const { theme, isDark } = useTheme();
  const user = useAuthStore((s) => s.user);

  const myLokasiId = getField(user, 'lokasi_id', 'lokasiId') || null;
  const isKlien = user?.role === 'klien';
  const hideAll = isKlien && !myLokasiId;

  const rawLH = useDataStore((s) => s.laporanHarian);
  const rawLK = useDataStore((s) => s.laporanKejadian);
  const rawAbs = useDataStore((s) => s.absensiRecords);

  // 🚨 Privacy filter — hideAll if klien without lokasi
  const laporanH = useMemo(() => {
    if (hideAll) return [];
    if (!myLokasiId) return rawLH;
    return rawLH.filter((l) =>
      String(getField(l, 'lokasi_id', 'lokasiId') || '') === String(myLokasiId)
    );
  }, [rawLH, myLokasiId, hideAll]);

  const laporanK = useMemo(() => {
    if (hideAll) return [];
    if (!myLokasiId) return rawLK;
    return rawLK.filter((l) =>
      String(getField(l, 'lokasi_id', 'lokasiId') || '') === String(myLokasiId)
    );
  }, [rawLK, myLokasiId, hideAll]);

  const absensi = useMemo(() => {
    if (hideAll) return [];
    if (!myLokasiId) return rawAbs;
    return rawAbs.filter((a) =>
      String(getField(a, 'lokasi_id', 'lokasiId') || '') === String(myLokasiId)
    );
  }, [rawAbs, myLokasiId, hideAll]);

  const [jenis, setJenis] = useState<ReportType>('all');
  const [downloading, setDownloading] = useState<string | null>(null);
  const [patroli, setPatroli] = useState<any[]>([]);
  const [loadingPatroli, setLoadingPatroli] = useState(false);

  const dateLocale = lang === 'en' ? 'en-US' : 'id-ID';

  // 🚨 Fetch real patroli data instead of always showing count=0
  useEffect(() => {
    let alive = true;
    if (hideAll) {
      setPatroli([]);
      return;
    }
    setLoadingPatroli(true);
    (async () => {
      try {
        const result = await patroliApi.list('limit=100');
        const arr = extractArray(result);
        let filtered = arr;
        if (myLokasiId) {
          filtered = arr.filter((p: any) => {
            // [Audit 2D] lokasi petugas kini flat di `user_lokasi_id` (lihat AktivitasKlien).
            const pLokasiId = getField(p, 'lokasi_id', 'lokasiId', 'user_lokasi_id');
            const userLokasiId = getField(p.user || {}, 'lokasi_id', 'lokasiId');
            return String(pLokasiId || '') === String(myLokasiId) ||
                   String(userLokasiId || '') === String(myLokasiId);
          });
        }
        if (alive) setPatroli(filtered);
      } catch (e: any) {
        console.log('[DownloadLaporan] patroli load err:', e?.message);
      } finally {
        if (alive) setLoadingPatroli(false);
      }
    })();
    return () => { alive = false; };
  }, [myLokasiId, hideAll]);

  // ===== HTML wrap =====
  const wrapHTML = (title: string, content: string) => {
    const now = new Date();
    const d = now.toLocaleDateString(dateLocale, { day: 'numeric', month: 'long', year: 'numeric' });
    const t2 = now.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' });
    const userName = escapeHtml(getField(user, 'nama', 'name') || (lang === 'en' ? 'Client' : 'Klien'));
    const safeTitle = escapeHtml(title);

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}body{font-family:'Helvetica Neue',Arial,sans-serif;color:#2c3e50;padding:40px;font-size:11px}
    .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #2980b9;padding-bottom:16px;margin-bottom:24px}
    .header-left h1{font-size:20px;color:#2980b9;margin-bottom:4px}.header-left p{font-size:11px;color:#666}
    .header-right{text-align:right;font-size:10px;color:#888}.header-right .company{font-size:14px;font-weight:700;color:#1a5276}
    .summary-row{display:flex;gap:12px;margin-bottom:20px}
    .summary-card{flex:1;background:#f8f9fa;border-radius:8px;padding:14px;text-align:center;border:1px solid #e8ecef}
    .summary-val{font-size:24px;font-weight:800;color:#2c3e50}.summary-val.green{color:#27ae60}.summary-val.red{color:#e74c3c}.summary-val.orange{color:#f39c12}.summary-val.blue{color:#2980b9}
    .summary-label{font-size:10px;color:#95a5a6;margin-top:4px}
    table{width:100%;border-collapse:collapse;margin-bottom:20px}th{background:#2980b9;color:#fff;padding:8px 10px;font-size:10px;text-align:left}
    td{padding:7px 10px;border-bottom:1px solid #ecf0f1;font-size:10px;word-wrap:break-word}tr:nth-child(even){background:#fafbfc}
    .badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:9px;font-weight:700;text-transform:uppercase}
    .bg-green{background:#eafaf1;color:#27ae60}.bg-red{background:#fdedec;color:#e74c3c}.bg-orange{background:#fef9e7;color:#f39c12}.bg-blue{background:#eaf2f8;color:#2980b9}.bg-gray{background:#ecf0f1;color:#5d6d7e}
    .empty{text-align:center;color:#999}.footer{margin-top:30px;padding-top:12px;border-top:1px solid #ddd;text-align:center;font-size:9px;color:#aaa}
  </style></head><body>
    <div class="header">
      <div class="header-left"><h1>${safeTitle}</h1><p>${escapeHtml(lang === 'en' ? 'Printed' : 'Dicetak')}: ${d} ${t2} - ${escapeHtml(lang === 'en' ? 'by' : 'oleh')}: ${userName}</p></div>
      <div class="header-right"><div class="company">PT Sopiak Satria Saga</div><div>Security Management System</div></div>
    </div>
    ${content}
    <div class="footer">${escapeHtml(lang === 'en' ? 'Document generated by PT Sopiak Satria Saga System' : 'Dokumen ini digenerate oleh Sistem PT Sopiak Satria Saga')} - ${d}</div>
  </body></html>`;
  };

  // ===== Build HTML per report type =====
  const buildHTML = (type: string) => {
    const lblEmpty = lang === 'en' ? 'No data' : 'Belum ada data';

    if (type === 'Harian') {
      const rows = laporanH.map((l) => {
        const tanggal = escapeHtml(getField(l, 'tanggal') || '-');
        const nama = escapeHtml(getField(l, 'nama', 'name', 'user_nama') || '-');
        const nrp = escapeHtml(getField(l, 'nrp', 'user_nrp') || '-');
        const posJaga = escapeHtml(getField(l, 'pos_jaga', 'posJaga') || '-');
        const shift = escapeHtml(getField(l, 'shift') || '-');
        const kondisi = escapeHtml(getField(l, 'kondisi') || '-');
        const aktivitas = escapeHtml(truncate(getField(l, 'aktivitas') || '', 80));
        const status = escapeHtml(getField(l, 'status') || '-');
        const kondisiClass =
          kondisi === 'aman' ? 'bg-green' :
          kondisi === 'ada_masalah' ? 'bg-orange' :
          'bg-red';
        const statusClass = status === 'approved' ? 'bg-green' : 'bg-orange';
        return `<tr><td>${tanggal}</td><td>${nama} (${nrp})</td><td>${posJaga}</td><td>${shift}</td><td><span class="badge ${kondisiClass}">${kondisi}</span></td><td>${aktivitas}</td><td><span class="badge ${statusClass}">${status}</span></td></tr>`;
      }).join('');
      const amanCount = laporanH.filter((d) => getField(d, 'kondisi') === 'aman').length;
      const approvedCount = laporanH.filter((d) => getField(d, 'status') === 'approved').length;
      const lblTotal = lang === 'en' ? 'Total' : 'Total';
      const lblAman = lang === 'en' ? 'Safe' : 'Aman';
      const lblApproved = lang === 'en' ? 'Approved' : 'Disetujui';
      const ths = lang === 'en'
        ? '<th>Date</th><th>Officer</th><th>Post</th><th>Shift</th><th>Condition</th><th>Activity</th><th>Status</th>'
        : '<th>Tanggal</th><th>Petugas</th><th>Pos</th><th>Shift</th><th>Kondisi</th><th>Aktivitas</th><th>Status</th>';
      return wrapHTML(
        lang === 'en' ? 'Daily Reports' : 'Laporan Harian',
        `<div class="summary-row"><div class="summary-card"><div class="summary-val">${laporanH.length}</div><div class="summary-label">${lblTotal}</div></div><div class="summary-card"><div class="summary-val green">${amanCount}</div><div class="summary-label">${lblAman}</div></div><div class="summary-card"><div class="summary-val blue">${approvedCount}</div><div class="summary-label">${lblApproved}</div></div></div><table><thead><tr>${ths}</tr></thead><tbody>${rows || `<tr><td colspan="7" class="empty">${lblEmpty}</td></tr>`}</tbody></table>`
      );
    }

    if (type === 'Kejadian') {
      const rows = laporanK.map((l) => {
        const waktu = getField(l, 'waktu_kejadian', 'waktuKejadian') || '-';
        const displayWaktu = escapeHtml(
          typeof waktu === 'string' && waktu.includes('T')
            ? new Date(waktu).toLocaleString(dateLocale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
            : waktu
        );
        const prioritas = escapeHtml(getField(l, 'prioritas') || '-');
        const jenisVal = escapeHtml(getField(l, 'jenis') || '-');
        const lokasiText = escapeHtml(getField(l, 'lokasi_text', 'lokasiText', 'lokasi') || '-');
        const nama = escapeHtml(getField(l, 'nama', 'name', 'user_nama') || '-');
        const kronologi = escapeHtml(truncate(getField(l, 'kronologi') || '', 60));
        const status = getField(l, 'status') || '-';
        const prioClass =
          prioritas === 'kritis' ? 'bg-red' :
          prioritas === 'tinggi' ? 'bg-orange' :
          'bg-gray';
        const statusClass = status === 'approved' ? 'bg-green' : 'bg-orange';
        const statusLabel = escapeHtml(status === 'approved' ? 'Resolved' : 'Open');
        return `<tr><td>${displayWaktu}</td><td><span class="badge ${prioClass}">${prioritas}</span></td><td><strong>${jenisVal}</strong></td><td>${lokasiText}</td><td>${nama}</td><td>${kronologi}</td><td><span class="badge ${statusClass}">${statusLabel}</span></td></tr>`;
      }).join('');
      const highPrioCount = laporanK.filter((d) => {
        const p = getField(d, 'prioritas');
        return p === 'kritis' || p === 'tinggi';
      }).length;
      const resolvedCount = laporanK.filter((d) => getField(d, 'status') === 'approved').length;
      const lblTotal = lang === 'en' ? 'Total' : 'Total';
      const lblHigh = lang === 'en' ? 'High Priority' : 'Prioritas Tinggi';
      const lblResolved = lang === 'en' ? 'Resolved' : 'Resolved';
      const ths = lang === 'en'
        ? '<th>Time</th><th>Priority</th><th>Type</th><th>Location</th><th>Reporter</th><th>Chronology</th><th>Status</th>'
        : '<th>Waktu</th><th>Prioritas</th><th>Jenis</th><th>Lokasi</th><th>Pelapor</th><th>Kronologi</th><th>Status</th>';
      return wrapHTML(
        lang === 'en' ? 'Incident Reports' : 'Laporan Kejadian',
        `<div class="summary-row"><div class="summary-card"><div class="summary-val">${laporanK.length}</div><div class="summary-label">${lblTotal}</div></div><div class="summary-card"><div class="summary-val red">${highPrioCount}</div><div class="summary-label">${lblHigh}</div></div><div class="summary-card"><div class="summary-val green">${resolvedCount}</div><div class="summary-label">${lblResolved}</div></div></div><table><thead><tr>${ths}</tr></thead><tbody>${rows || `<tr><td colspan="7" class="empty">${lblEmpty}</td></tr>`}</tbody></table>`
      );
    }

    if (type === 'Absensi') {
      const rows = absensi.map((a) => {
        const tanggal = escapeHtml(
          getField(a, 'tanggal') || (() => {
            const ca = getField(a, 'created_at', 'createdAt');
            return ca ? new Date(ca).toLocaleDateString(dateLocale) : '-';
          })()
        );
        const nama = escapeHtml(getField(a, 'nama', 'name', 'user_nama') || '-');
        const nrp = escapeHtml(getField(a, 'nrp', 'user_nrp') || '-');
        const tipe = escapeHtml(getField(a, 'tipe') || '-');
        const waktu = escapeHtml(
          getField(a, 'waktu') || (() => {
            const ca = getField(a, 'created_at', 'createdAt');
            return ca ? new Date(ca).toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' }) : '-';
          })()
        );
        const posJaga = escapeHtml(getField(a, 'pos_jaga', 'posJaga') || '-');
        const status = escapeHtml(getField(a, 'status') || '-');
        const dalamRadius = getField(a, 'dalam_radius', 'dalamRadius');
        const tipeClass = tipe === 'masuk' ? 'bg-green' : 'bg-blue';
        const statusClass =
          status === 'hadir' ? 'bg-green' :
          status === 'terlambat' ? 'bg-orange' :
          'bg-red';
        return `<tr><td>${tanggal}</td><td>${nama} (${nrp})</td><td><span class="badge ${tipeClass}">${tipe}</span></td><td>${waktu}</td><td>${posJaga}</td><td><span class="badge ${statusClass}">${status}</span></td><td>${dalamRadius ? '&#10003;' : '&#10007;'}</td></tr>`;
      }).join('');
      const hadirCount = absensi.filter((d) => getField(d, 'status') === 'hadir').length;
      const terlambatCount = absensi.filter((d) => getField(d, 'status') === 'terlambat').length;
      const lblTotal = lang === 'en' ? 'Total' : 'Total';
      const lblHadir = lang === 'en' ? 'Present' : 'Hadir';
      const lblLate = lang === 'en' ? 'Late' : 'Terlambat';
      const ths = lang === 'en'
        ? '<th>Date</th><th>Officer</th><th>Type</th><th>Time</th><th>Post</th><th>Status</th><th>In Radius</th>'
        : '<th>Tanggal</th><th>Petugas</th><th>Tipe</th><th>Waktu</th><th>Pos</th><th>Status</th><th>Radius</th>';
      return wrapHTML(
        lang === 'en' ? 'Attendance Report' : 'Rekap Absensi',
        `<div class="summary-row"><div class="summary-card"><div class="summary-val">${absensi.length}</div><div class="summary-label">${lblTotal}</div></div><div class="summary-card"><div class="summary-val green">${hadirCount}</div><div class="summary-label">${lblHadir}</div></div><div class="summary-card"><div class="summary-val orange">${terlambatCount}</div><div class="summary-label">${lblLate}</div></div></div><table><thead><tr>${ths}</tr></thead><tbody>${rows || `<tr><td colspan="7" class="empty">${lblEmpty}</td></tr>`}</tbody></table>`
      );
    }

    if (type === 'Patroli') {
      // 🚨 Build actual patroli table now (was always empty)
      const rows = patroli.map((p) => {
        const userName = escapeHtml(getField(p, 'nama', 'user_nama') || getField(p.user || {}, 'nama', 'name') || (lang === 'en' ? 'Officer' : 'Petugas')); // [Audit 2D]
        const routeName = escapeHtml(getField(p, 'route_name', 'routeName') || '-');
        const stRaw = getField(p, 'start_time', 'startTime');
        const etRaw = getField(p, 'end_time', 'endTime');
        const startTime = escapeHtml(
          stRaw ? new Date(stRaw).toLocaleString(dateLocale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-'
        );
        const endTime = escapeHtml(
          etRaw ? new Date(etRaw).toLocaleString(dateLocale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : (lang === 'en' ? 'In progress' : 'Aktif')
        );
        const scanned = getField(p, 'checkpoint_scanned', 'checkpointScanned') || (Array.isArray(p.patrol_scans) ? p.patrol_scans.length : 0);
        const total = getField(p, 'checkpoint_total', 'checkpointTotal') || 0;
        const status = escapeHtml(p.status || 'active');
        const statusClass =
          status === 'completed' ? 'bg-green' :
          status === 'active' ? 'bg-blue' :
          'bg-gray';
        return `<tr><td>${userName}</td><td>${routeName}</td><td>${startTime}</td><td>${endTime}</td><td>${scanned}/${total}</td><td><span class="badge ${statusClass}">${status}</span></td></tr>`;
      }).join('');
      const completedCount = patroli.filter((p) => p.status === 'completed').length;
      const activeCount = patroli.filter((p) => p.status === 'active').length;
      const lblTotal = lang === 'en' ? 'Total' : 'Total';
      const lblComplete = lang === 'en' ? 'Completed' : 'Selesai';
      const lblActiveCnt = lang === 'en' ? 'Active' : 'Aktif';
      const ths = lang === 'en'
        ? '<th>Officer</th><th>Route</th><th>Start</th><th>End</th><th>Checkpoints</th><th>Status</th>'
        : '<th>Petugas</th><th>Rute</th><th>Mulai</th><th>Selesai</th><th>Checkpoint</th><th>Status</th>';
      return wrapHTML(
        lang === 'en' ? 'Patrol Reports' : 'Laporan Patroli',
        `<div class="summary-row"><div class="summary-card"><div class="summary-val">${patroli.length}</div><div class="summary-label">${lblTotal}</div></div><div class="summary-card"><div class="summary-val green">${completedCount}</div><div class="summary-label">${lblComplete}</div></div><div class="summary-card"><div class="summary-val blue">${activeCount}</div><div class="summary-label">${lblActiveCnt}</div></div></div><table><thead><tr>${ths}</tr></thead><tbody>${rows || `<tr><td colspan="6" class="empty">${lblEmpty}</td></tr>`}</tbody></table>`
      );
    }

    return wrapHTML(lang === 'en' ? 'Report' : 'Laporan', `<p class="empty" style="padding:40px 0;">${lblEmpty}</p>`);
  };

  // ===== Card definitions =====
  const reports = useMemo(() => [
    {
      id: 'H', type: 'Harian' as const,
      title: lang === 'en' ? 'Daily Reports' : 'Laporan Harian',
      count: laporanH.length,
      desc: `${laporanH.length} ${lang === 'en' ? 'reports' : 'laporan'}`,
      stats: {
        [lang === 'en' ? 'approved' : 'disetujui']: laporanH.filter((l) => getField(l, 'status') === 'approved').length,
        [lang === 'en' ? 'pending' : 'pending']: laporanH.filter((l) => getField(l, 'status') === 'pending').length,
      },
    },
    {
      id: 'K', type: 'Kejadian' as const,
      title: lang === 'en' ? 'Incident Reports' : 'Rekap Insiden',
      count: laporanK.length,
      desc: `${laporanK.length} ${lang === 'en' ? 'incidents' : 'insiden'}`,
      stats: {
        [lang === 'en' ? 'resolved' : 'resolved']: laporanK.filter((l) => getField(l, 'status') === 'approved').length,
        [lang === 'en' ? 'open' : 'open']: laporanK.filter((l) => getField(l, 'status') === 'pending').length,
      },
    },
    {
      id: 'A', type: 'Absensi' as const,
      title: lang === 'en' ? 'Attendance Report' : 'Rekap Absensi',
      count: absensi.length,
      desc: `${absensi.length} ${lang === 'en' ? 'records' : 'record'}`,
      stats: {
        [lang === 'en' ? 'present' : 'hadir']: absensi.filter((a) => getField(a, 'status') === 'hadir').length,
        [lang === 'en' ? 'late' : 'terlambat']: absensi.filter((a) => getField(a, 'status') === 'terlambat').length,
      },
    },
    {
      id: 'P', type: 'Patroli' as const,
      title: lang === 'en' ? 'Patrol Reports' : 'Laporan Patroli',
      count: patroli.length, // 🚨 real count from fetched data
      desc: loadingPatroli
        ? (lang === 'en' ? 'Loading patrol data...' : 'Memuat data patroli...')
        : `${patroli.length} ${lang === 'en' ? 'records' : 'record'}`,
      stats: {
        [lang === 'en' ? 'completed' : 'selesai']: patroli.filter((p) => p.status === 'completed').length,
        [lang === 'en' ? 'active' : 'aktif']: patroli.filter((p) => p.status === 'active').length,
      },
    },
  ], [laporanH, laporanK, absensi, patroli, loadingPatroli, lang]);

  const filtered = jenis === 'all' ? reports : reports.filter((r) => r.type === jenis);

  // ===== Actions (no more empty catch{}) =====
  const handleSave = useCallback(async (r: any) => {
    if (downloading) return;
    setDownloading(r.id + '-s');
    try {
      await Print.printAsync({ html: buildHTML(r.type) });
    } catch (e: any) {
      console.log('[DownloadLaporan] print err:', e);
      Alert.alert(
        'Error',
        e?.message || (lang === 'en' ? 'Failed to print PDF' : 'Gagal mencetak PDF')
      );
    } finally {
      setDownloading(null);
    }
  }, [downloading, lang, /* eslint-disable */ buildHTML]);

  const handleShare = useCallback(async (r: any) => {
    if (downloading) return;
    setDownloading(r.id + '-sh');
    try {
      const { uri } = await Print.printToFileAsync({ html: buildHTML(r.type), base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: lang === 'en' ? `Share ${r.title}` : `Bagikan ${r.title}`,
        });
      } else {
        Alert.alert(
          'Info',
          lang === 'en' ? 'Sharing is not available on this device' : 'Fitur berbagi tidak tersedia'
        );
      }
    } catch (e: any) {
      console.log('[DownloadLaporan] share err:', e);
      Alert.alert(
        'Error',
        e?.message || (lang === 'en' ? 'Failed to share PDF' : 'Gagal membagikan PDF')
      );
    } finally {
      setDownloading(null);
    }
  }, [downloading, lang, /* eslint-disable */ buildHTML]);

  // ===== UI labels =====
  const chipLabel = (j: ReportType) => {
    if (j === 'all') return lang === 'en' ? 'All' : 'Semua';
    if (j === 'Harian') return lang === 'en' ? 'Daily' : 'Harian';
    if (j === 'Kejadian') return lang === 'en' ? 'Incidents' : 'Kejadian';
    if (j === 'Absensi') return lang === 'en' ? 'Attendance' : 'Absensi';
    return 'Patroli';
  };

  const canGoBack = typeof navigation?.canGoBack === 'function' && navigation.canGoBack();

  return (
    <View style={[st.container, { backgroundColor: theme.bg }]}>
      {/* Header — conditional back button (this screen is both Tab AND Stack) */}
      <View style={[st.header, { paddingTop: insets.top + 12 }, { backgroundColor: isDark ? theme.bgCard : '#fff', borderBottomColor: theme.border }]}>
        <View style={st.headerRow}>
          {canGoBack && (
            <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="arrow-back" size={22} color={theme.text} />
            </TouchableOpacity>
          )}
          <View style={[st.headerIcon, { backgroundColor: isDark ? `${Colors.primary}15` : Colors.primaryBg }]}>
            <Ionicons name="download" size={20} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[st.headerTitle, { color: theme.text }]}>
              {lang === 'en' ? 'Download Reports' : 'Download Laporan'}
            </Text>
            <Text style={[st.headerSub, { color: theme.textMuted }]}>
              {lang === 'en' ? 'Generate PDF reports' : 'Unduh laporan format PDF'}
            </Text>
          </View>
        </View>
      </View>

      {/* Filter */}
      <View style={[st.filterWrapper, { backgroundColor: isDark ? theme.bgCard : '#fff', borderBottomColor: theme.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.filterContent}>
          {JENIS.map((j) => {
            const isActive = jenis === j;
            return (
              <TouchableOpacity
                key={j}
                style={[
                  st.chip,
                  isActive
                    ? { backgroundColor: theme.primary, borderColor: theme.primary }
                    : { borderColor: theme.border },
                ]}
                onPress={() => setJenis(j)}
                activeOpacity={0.7}
              >
                {j !== 'all' && (
                  <Ionicons
                    name={(ICON_MAP[j]?.name as any) || 'document'}
                    size={13}
                    color={isActive ? '#fff' : theme.textMuted}
                  />
                )}
                <Text style={[st.chipText, { color: isActive ? '#fff' : theme.textMuted }]}>
                  {chipLabel(j)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={[st.content, { paddingBottom: insets.bottom + 16 }]} showsVerticalScrollIndicator={false}>
        {hideAll && (
          <View style={[st.noticeCard, { backgroundColor: isDark ? `${Colors.warning}15` : Colors.warningBg, borderColor: Colors.warning }]}>
            <Ionicons name="alert-circle" size={18} color={Colors.warning} />
            <Text style={[st.noticeText, { color: theme.text }]}>
              {lang === 'en'
                ? 'Your account has no company location. Reports cannot be generated until admin assigns a company.'
                : 'Akun Anda belum ditugaskan ke perusahaan. Laporan tidak dapat di-generate sampai admin menugaskan perusahaan.'}
            </Text>
          </View>
        )}

        {filtered.map((r) => {
          const ic = ICON_MAP[r.type] || ICON_MAP.Harian;
          const downloadingMine = downloading === r.id + '-s';
          const sharingMine = downloading === r.id + '-sh';
          const anyActive = !!downloading;
          const disabledByOther = anyActive && !downloadingMine && !sharingMine;
          return (
            <View
              key={r.id}
              style={[
                st.card,
                {
                  backgroundColor: isDark ? theme.bgCard : '#fff',
                  borderColor: theme.border,
                  opacity: disabledByOther ? 0.6 : 1,
                },
              ]}
            >
              <View style={st.cardHeader}>
                <View style={[st.cardIconWrap, { backgroundColor: isDark ? `${ic.color}15` : ic.bg }]}>
                  <Ionicons name={ic.name as any} size={22} color={ic.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[st.cardTitle, { color: theme.text }]}>{r.title}</Text>
                  <Text style={[st.cardDesc, { color: theme.textMuted }]}>{r.desc}</Text>
                </View>
                <Badge text="PDF" variant="info" />
              </View>

              {r.count > 0 && (
                <View style={[st.statsRow, { borderTopColor: theme.border }]}>
                  {Object.entries(r.stats).map(([key, val]) => (
                    <View
                      key={key}
                      style={[st.statChip, { backgroundColor: isDark ? `${theme.primary}08` : Colors.bgLight }]}
                    >
                      <Text style={[st.statVal, { color: theme.text }]}>{val as number}</Text>
                      <Text style={[st.statLabel, { color: theme.textMuted }]}>{key}</Text>
                    </View>
                  ))}
                </View>
              )}

              <View style={[st.cardActions, { borderTopColor: theme.border }]}>
                <TouchableOpacity
                  style={[st.saveBtn, { backgroundColor: theme.primary }]}
                  onPress={() => handleSave(r)}
                  disabled={anyActive || hideAll || (r.type === 'Patroli' && loadingPatroli)}
                  activeOpacity={0.7}
                >
                  {downloadingMine ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="download-outline" size={15} color="#fff" />
                  )}
                  <Text style={st.saveBtnText}>
                    {downloadingMine ? '...' : (lang === 'en' ? 'Save PDF' : 'Simpan PDF')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[st.shareBtn, { borderColor: theme.primary }]}
                  onPress={() => handleShare(r)}
                  disabled={anyActive || hideAll || (r.type === 'Patroli' && loadingPatroli)}
                  activeOpacity={0.7}
                >
                  {sharingMine ? (
                    <ActivityIndicator size="small" color={theme.primary} />
                  ) : (
                    <Ionicons name="share-outline" size={15} color={theme.primary} />
                  )}
                  <Text style={[st.shareBtnText, { color: theme.primary }]}>
                    {sharingMine ? '...' : (lang === 'en' ? 'Share' : 'Bagikan')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        <View
          style={[
            st.infoCard,
            {
              backgroundColor: isDark ? `${theme.primary}08` : Colors.primaryBg,
              borderColor: isDark ? theme.border : Colors.primarySoft,
            },
          ]}
        >
          <View style={st.infoRow}>
            <Ionicons name="information-circle" size={18} color={theme.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[st.infoTitle, { color: theme.primary }]}>
                {lang === 'en' ? 'About Reports' : 'Tentang Laporan'}
              </Text>
              <Text style={[st.infoDesc, { color: theme.textMuted }]}>
                {lang === 'en'
                  ? 'Reports are generated in real-time from current data. The PDF can be saved or shared directly.'
                  : 'Laporan digenerate real-time dari data terkini. PDF dapat langsung disimpan atau dibagikan.'}
              </Text>
            </View>
          </View>
        </View>
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingBottom: 14, paddingHorizontal: Spacing.base, borderBottomWidth: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  headerSub: { fontSize: 11, marginTop: 1 },
  filterWrapper: { borderBottomWidth: 1, height: 54 },
  filterContent: { paddingHorizontal: Spacing.base, paddingVertical: 10, gap: 8, alignItems: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, height: 34 },
  chipText: { fontSize: 12, fontWeight: '700' },
  content: { padding: Spacing.base },
  noticeCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 12 },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 17 },
  card: { marginBottom: 14, borderRadius: 14, overflow: 'hidden', borderWidth: 1 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  cardIconWrap: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 14, fontWeight: '800' },
  cardDesc: { fontSize: 11, marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingBottom: 12, paddingTop: 10, borderTopWidth: 1 },
  statChip: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10 },
  statVal: { fontSize: 16, fontWeight: '800' },
  statLabel: { fontSize: 9, marginTop: 1 },
  cardActions: { flexDirection: 'row', gap: 8, padding: 14, borderTopWidth: 1 },
  saveBtn: { flex: 1.2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 10 },
  saveBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  shareBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 10, borderWidth: 1.5 },
  shareBtnText: { fontSize: 12, fontWeight: '700' },
  infoCard: { borderRadius: 14, padding: 14, marginTop: 4, borderWidth: 1 },
  infoRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  infoTitle: { fontSize: 12, fontWeight: '700' },
  infoDesc: { fontSize: 11, marginTop: 2, lineHeight: 16 },
});
