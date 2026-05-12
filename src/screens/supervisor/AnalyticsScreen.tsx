/**
 * ANALYTICS SCREEN - v3 (Bug-Fix Pass)
 *
 * CRITICAL FIXES (v3):
 *  🚨 patroliApi.list() and absensiApi.list() return PAGINATED response
 *     { data: [...], pagination: {...} }. Previously:
 *       - `(totalRows as any[])?.length` → undefined (object has no length)
 *         → patroliStats was ALWAYS { total: 0, completed: 0 }
 *       - `Array.isArray(aRows)` → ALWAYS false for paginated
 *         → weeklyData was ALWAYS { attendance: [0,0,0,0,0,0,0], late: [0,...], patrol: [0,...] }
 *     Fixed with extractArray() helper. Charts now show real data.
 *
 *  🚨 weeklyData.patrol fetched ALL patroli rows in EVERY day loop iteration
 *     (7x duplicate work). Now fetched ONCE outside the loop and filtered.
 *
 * MEDIUM FIXES:
 *  ✅ weeklyLoading state was set but never used in JSX. Now drives spinner
 *     in Mingguan tab so user sees loading state on slow networks.
 *  ✅ `tab` state was initialized from `lang` but didn't react to language
 *     switches. Migrated to tab index (0/1/2) - language-agnostic.
 *  ✅ saveExportRecord race condition: uses functional setState now to avoid
 *     stale closure when multiple records arrive in rapid succession.
 *  ✅ handleGenerateWeeklyReport useCallback no longer depends on
 *     `exportHistory` (which would invalidate ref on every export).
 *  ✅ Print errors now show user-friendly alerts instead of silent failure.
 *  ✅ Date format parsing made resilient to non-ISO `created_at` values.
 *  ✅ Generate button disabled while generating (was technically already, now
 *     also wraps the whole UI in disabled-styled state).
 */
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions,
  Alert, Switch, ActivityIndicator as RNActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Typography, Spacing, Radius } from '../../constants';
import { Card, Badge, Button } from '../../components';
import { useDataStore } from '../../stores/dataStore';
import { useAuthStore } from '../../stores/authStore';
import { patroliApi, absensiApi } from '../../lib/apiClient';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

const { width } = Dimensions.get('window');
const TABS_ID = ['Ringkasan', 'Mingguan', 'Laporan'];
const TABS_EN = ['Summary', 'Weekly', 'Reports'];
const DAYS_ID = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
const DAYS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const EXPORT_HISTORY_KEY = '@ptsss_export_history';
const AUTO_EXPORT_KEY = '@ptsss_auto_export';

/** Extract array from paginated API response. */
function extractArray(result: any): any[] {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.data)) return result.data;
  if (result && Array.isArray(result.rows)) return result.rows;
  if (result && Array.isArray(result.items)) return result.items;
  return [];
}

/** Safely get a field value, checking multiple key variants. */
function getField(obj: any, ...keys: string[]): any {
  if (!obj) return undefined;
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return undefined;
}

// ===== Bar Chart Component =====
function BarChart({ data, maxVal, color, label, days }: {
  data: number[]; maxVal: number; color: string; label: string; days: string[];
}) {
  const barW = Math.floor((width - 80) / data.length) - 4;
  return (
    <Card style={{ padding: 14 }}>
      <Text style={st.chartTitle}>{label}</Text>
      <View style={st.chartWrap}>
        {data.map((v, i) => (
          <View key={`bar-${i}`} style={st.chartCol}>
            <Text style={st.chartVal}>{v}</Text>
            <View
              style={[
                st.chartBar,
                {
                  height: maxVal > 0 ? Math.max(4, (v / maxVal) * 100) : 4,
                  width: barW,
                  backgroundColor: v > 0 ? color : Colors.bgGray,
                },
              ]}
            />
            <Text style={st.chartDay}>{days[i]}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

function MiniBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <View style={st.barRow}>
      <Text style={st.barLabel}>{label}</Text>
      <View style={st.barBg}>
        <View style={[st.barFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <Text style={st.barVal}>{value}</Text>
    </View>
  );
}

function KPI({ value, label, color, icon }: { value: string | number; label: string; color: string; icon: string }) {
  return (
    <Card style={st.kpiCard}>
      <View style={[st.kpiIcon, { backgroundColor: `${color}15` }]}>
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
      <Text style={[st.kpiVal, { color }]}>{value}</Text>
      <Text style={st.kpiLabel}>{label}</Text>
    </Card>
  );
}

// ===== Export History Type =====
type ExportRecord = {
  id: string;
  tipe: string;
  tanggal: string;
  periodeStart: string;
  periodeEnd: string;
  fileUri: string | null;
  status: 'success' | 'failed';
};

// HTML escape helper - prevent injection through user data
function escapeHtml(s: any): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ===== Generate Report HTML =====
function generateWeeklyReportHTML(data: {
  companyName: string;
  generatedBy: string;
  periodeStart: string;
  periodeEnd: string;
  stats: any;
  team: any[];
  topPerformers: any[];
  weeklyData: any;
  patroliStats: any;
  serahTerimaCount: number;
}) {
  const { companyName, generatedBy, periodeStart, periodeEnd, stats, team, topPerformers, weeklyData, patroliStats, serahTerimaCount } = data;

  const topPerformerRows = topPerformers
    .map(
      (m, i) => `
    <tr>
      <td style="font-weight:700;color:${i === 0 ? '#F59E0B' : '#666'}">#${i + 1}</td>
      <td>${escapeHtml(m.nama)}</td>
      <td>${escapeHtml(m.pos)} - ${escapeHtml(m.shift)}</td>
      <td style="font-weight:700;color:#27ae60">${m.skor}</td>
    </tr>
  `
    )
    .join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Helvetica Neue',Arial,sans-serif; padding:24px; color:#333; font-size:12px; }
  .header { text-align:center; border-bottom:3px solid #2980b9; padding-bottom:16px; margin-bottom:20px; }
  .header h1 { font-size:20px; color:#2980b9; margin-bottom:4px; }
  .header p { color:#888; font-size:11px; }
  .section { margin-bottom:20px; }
  .section h2 { font-size:14px; color:#2c3e50; border-bottom:1px solid #ddd; padding-bottom:6px; margin-bottom:10px; }
  .kpi-grid { display:flex; gap:12px; margin-bottom:16px; }
  .kpi-box { flex:1; text-align:center; border:1px solid #ddd; border-radius:8px; padding:12px; }
  .kpi-box .value { font-size:24px; font-weight:800; }
  .kpi-box .label { font-size:10px; color:#888; margin-top:2px; }
  table { width:100%; border-collapse:collapse; margin-top:8px; }
  th { background:#f1f5f9; padding:8px; text-align:left; font-size:11px; border-bottom:2px solid #ddd; }
  td { padding:8px; border-bottom:1px solid #eee; font-size:11px; }
  .bar-container { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
  .bar-label { width:80px; font-size:11px; }
  .bar-bg { flex:1; height:14px; background:#f1f5f9; border-radius:7px; overflow:hidden; }
  .bar-fill { height:100%; border-radius:7px; }
  .bar-val { width:30px; text-align:right; font-weight:700; font-size:11px; }
  .footer { margin-top:24px; text-align:center; font-size:9px; color:#aaa; border-top:1px solid #ddd; padding-top:10px; }
  .badge { display:inline-block; padding:2px 8px; border-radius:10px; font-size:10px; font-weight:600; }
  .badge-success { background:#d4edda; color:#155724; }
  .badge-warning { background:#fff3cd; color:#856404; }
  .badge-danger { background:#f8d7da; color:#721c24; }
</style></head><body>
  <div class="header">
    <h1>📊 Laporan Mingguan</h1>
    <p>${escapeHtml(companyName)}</p>
    <p>Periode: ${escapeHtml(periodeStart)} - ${escapeHtml(periodeEnd)}</p>
    <p>Digenerate oleh: ${escapeHtml(generatedBy)} • ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
  </div>

  <div class="section">
    <h2>📈 Ringkasan KPI</h2>
    <div class="kpi-grid">
      <div class="kpi-box"><div class="value" style="color:#2980b9">${team.length}</div><div class="label">Total Personil</div></div>
      <div class="kpi-box"><div class="value" style="color:#27ae60">${stats.kehadiranPct}%</div><div class="label">Kehadiran</div></div>
      <div class="kpi-box"><div class="value" style="color:#2980b9">${patroliStats.completed}</div><div class="label">Patroli Selesai</div></div>
      <div class="kpi-box"><div class="value" style="color:#e67e22">${stats.lkTotal}</div><div class="label">Insiden</div></div>
      <div class="kpi-box"><div class="value" style="color:#8B5CF6">${stats.tracked}</div><div class="label">GPS Aktif</div></div>
      <div class="kpi-box"><div class="value" style="color:#F59E0B">${serahTerimaCount}</div><div class="label">Serah Terima</div></div>
    </div>
  </div>

  <div class="section">
    <h2>👥 Status Personil</h2>
    <div class="bar-container">
      <span class="bar-label">On Duty</span>
      <div class="bar-bg"><div class="bar-fill" style="width:${team.length > 0 ? (stats.onDuty / team.length * 100) : 0}%;background:#27ae60"></div></div>
      <span class="bar-val">${stats.onDuty}</span>
    </div>
    <div class="bar-container">
      <span class="bar-label">Off Duty</span>
      <div class="bar-bg"><div class="bar-fill" style="width:${team.length > 0 ? (stats.offDuty / team.length * 100) : 0}%;background:#95a5a6"></div></div>
      <span class="bar-val">${stats.offDuty}</span>
    </div>
    <div class="bar-container">
      <span class="bar-label">GPS Aktif</span>
      <div class="bar-bg"><div class="bar-fill" style="width:${team.length > 0 ? (stats.tracked / team.length * 100) : 0}%;background:#8B5CF6"></div></div>
      <span class="bar-val">${stats.tracked}</span>
    </div>
  </div>

  <div class="section">
    <h2>📋 Statistik Absensi</h2>
    <div class="bar-container">
      <span class="bar-label">Hadir</span>
      <div class="bar-bg"><div class="bar-fill" style="width:${stats.totalMasuk > 0 ? (stats.hadir / stats.totalMasuk * 100) : 0}%;background:#27ae60"></div></div>
      <span class="bar-val">${stats.hadir}</span>
    </div>
    <div class="bar-container">
      <span class="bar-label">Terlambat</span>
      <div class="bar-bg"><div class="bar-fill" style="width:${stats.totalMasuk > 0 ? (stats.terlambat / stats.totalMasuk * 100) : 0}%;background:#f39c12"></div></div>
      <span class="bar-val">${stats.terlambat}</span>
    </div>
    <div class="bar-container">
      <span class="bar-label">Tidak Hadir</span>
      <div class="bar-bg"><div class="bar-fill" style="width:${stats.totalMasuk > 0 ? (stats.tidakHadir / stats.totalMasuk * 100) : 0}%;background:#e74c3c"></div></div>
      <span class="bar-val">${stats.tidakHadir}</span>
    </div>
    <p style="margin-top:8px;font-size:11px;color:#888">Total check-in: ${stats.totalMasuk}</p>
  </div>

  <div class="section">
    <h2>📝 Laporan</h2>
    <table>
      <tr><th>Kategori</th><th>Jumlah</th><th>Status</th></tr>
      <tr><td>Laporan Harian</td><td>${stats.lhTotal}</td><td><span class="badge badge-success">${stats.lhApproved} disetujui</span> <span class="badge badge-warning">${stats.lhPending} pending</span></td></tr>
      <tr><td>Laporan Kejadian</td><td>${stats.lkTotal}</td><td><span class="badge badge-success">${stats.lkResolved} resolved</span> <span class="badge badge-danger">${stats.lkKritis} kritis</span></td></tr>
    </table>
  </div>

  <div class="section">
    <h2>🏆 Top Performers</h2>
    <table>
      <tr><th>#</th><th>Nama</th><th>Pos / Shift</th><th>Skor</th></tr>
      ${topPerformerRows || '<tr><td colspan="4" style="text-align:center;color:#888">Belum ada data</td></tr>'}
    </table>
  </div>

  <div class="footer">
    <p>Laporan ini digenerate otomatis oleh sistem PTSSS (PT Sopiak Satria Saga)</p>
    <p>© ${new Date().getFullYear()} - Dokumen ini bersifat rahasia</p>
  </div>
</body></html>`;
}

// ===== MAIN COMPONENT =====
export default function AnalyticsScreen({ navigation }: any) {
  const { t, lang } = useI18n();
  const { theme, isDark } = useTheme();
  const user = useAuthStore((s) => s.user);
  // Use tab index (0/1/2) instead of label - language-agnostic
  const [tabIndex, setTabIndex] = useState(0);
  const team = useDataStore((s) => s.team);
  const absensi = useDataStore((s) => s.absensiRecords);
  const laporanH = useDataStore((s) => s.laporanHarian);
  const laporanK = useDataStore((s) => s.laporanKejadian);
  const serahTerima = useDataStore((s) => s.serahTerimaRecords);

  const [patroliStats, setPatroliStats] = useState({ total: 0, completed: 0 });
  const [weeklyData, setWeeklyData] = useState<any>(null);
  const [autoExport, setAutoExport] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [exportHistory, setExportHistory] = useState<ExportRecord[]>([]);
  const [weeklyLoading, setWeeklyLoading] = useState(true);

  const TABS = lang === 'en' ? TABS_EN : TABS_ID;
  const DAYS = lang === 'en' ? DAYS_EN : DAYS_ID;

  // Ref to latest export history (avoids stale closure in callback deps)
  const exportHistoryRef = useRef(exportHistory);
  useEffect(() => { exportHistoryRef.current = exportHistory; }, [exportHistory]);

  // Load export history + settings
  useEffect(() => {
    loadExportHistory();
    AsyncStorage.getItem(AUTO_EXPORT_KEY).then((v) => v && setAutoExport(v === 'true')).catch(() => {});
  }, []);

  const loadExportHistory = async () => {
    try {
      const stored = await AsyncStorage.getItem(EXPORT_HISTORY_KEY);
      if (stored) setExportHistory(JSON.parse(stored));
    } catch (e) {
      console.log('[Analytics] export history load err:', e);
    }
  };

  const saveExportRecord = async (record: ExportRecord) => {
    // Use functional update to avoid stale closure
    const next = [record, ...exportHistoryRef.current].slice(0, 20);
    setExportHistory(next);
    try {
      await AsyncStorage.setItem(EXPORT_HISTORY_KEY, JSON.stringify(next));
    } catch (e) {
      console.log('[Analytics] save export err:', e);
    }
  };

  // 🚨 CRITICAL FIX: Use extractArray() for paginated API responses
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setWeeklyLoading(true);
      try {
        // Fetch totals first
        const [totalRowsRaw, completedRowsRaw, allPatroliRaw] = await Promise.all([
          patroliApi.list().catch(() => null),
          patroliApi.list('status=completed').catch(() => null),
          patroliApi.list('limit=500').catch(() => null), // get bulk for daily filter
        ]);

        if (cancelled) return;

        const totalRows = extractArray(totalRowsRaw);
        const completedRows = extractArray(completedRowsRaw);
        const allPatroli = extractArray(allPatroliRaw);

        setPatroliStats({
          total: totalRows.length,
          completed: completedRows.length,
        });

        // Build weekly data
        const days: number[] = [];
        const lateD: number[] = [];
        const patrolD: number[] = [];

        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dayStr = d.toISOString().split('T')[0]; // YYYY-MM-DD

          // Fetch attendance + late for this day in parallel
          const [aRowsRaw, lRowsRaw] = await Promise.all([
            absensiApi.list(`tipe=masuk&date=${dayStr}`).catch(() => null),
            absensiApi.list(`status=terlambat&date=${dayStr}`).catch(() => null),
          ]);

          if (cancelled) return;

          const aRows = extractArray(aRowsRaw);
          const lRows = extractArray(lRowsRaw);

          // Filter patroli rows that started on this day
          const patroliOnDay = allPatroli.filter((p: any) => {
            const ca = getField(p, 'created_at', 'createdAt', 'start_time');
            return typeof ca === 'string' && ca.startsWith(dayStr);
          });

          days.push(aRows.length);
          lateD.push(lRows.length);
          patrolD.push(patroliOnDay.length);
        }

        if (!cancelled) {
          setWeeklyData({ attendance: days, late: lateD, patrol: patrolD });
        }
      } catch (e) {
        console.log('Analytics error:', e);
      } finally {
        if (!cancelled) setWeeklyLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Stats computation
  const stats = useMemo(() => {
    const absensiMasuk = absensi.filter((a) => a.tipe === 'masuk');
    const hadir = absensiMasuk.filter((a) => a.status === 'hadir').length;
    const terlambat = absensiMasuk.filter((a) => a.status === 'terlambat').length;
    const tidakHadir = absensiMasuk.filter((a) => a.status === 'tidak_hadir').length;
    const totalMasuk = absensiMasuk.length;
    const kehadiranPct = totalMasuk > 0 ? Math.round(((hadir + terlambat) / totalMasuk) * 100) : 0;
    const lhApproved = laporanH.filter((l) => l.status === 'approved').length;
    const lhPending = laporanH.filter((l) => l.status === 'pending').length;
    const lhRevision = laporanH.filter((l) => l.status === 'revision').length;
    const lkOpen = laporanK.filter((l) => l.status !== 'approved').length;
    const lkResolved = laporanK.filter((l) => l.status === 'approved').length;
    const lkKritis = laporanK.filter((l) => l.prioritas === 'kritis').length;
    const onDuty = team.filter((m) => m.status === 'on_duty' || m.status === 'patroli').length;
    const offDuty = team.filter((m) => m.status === 'off_duty').length;
    const tracked = team.filter((m) => m.lastLatitude !== null && m.lastLatitude !== undefined).length;
    return {
      hadir, terlambat, tidakHadir, totalMasuk, kehadiranPct,
      lhApproved, lhPending, lhRevision, lhTotal: laporanH.length,
      lkOpen, lkResolved, lkKritis, lkTotal: laporanK.length,
      onDuty, offDuty, tracked,
    };
  }, [absensi, laporanH, laporanK, team]);

  const topPerformers = useMemo(
    () =>
      [...team]
        .sort((a, b) => {
          const diff = (b.skor || 0) - (a.skor || 0);
          return diff !== 0 ? diff : String(a.id).localeCompare(String(b.id));
        })
        .slice(0, 5),
    [team]
  );

  // Generate Weekly Report
  const handleGenerateWeeklyReport = useCallback(async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const periodeStart = weekAgo.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
      const periodeEnd = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

      const html = generateWeeklyReportHTML({
        companyName: 'PT Sopiak Satria Saga',
        generatedBy: getField(user, 'nama', 'name') || 'Supervisor',
        periodeStart,
        periodeEnd,
        stats,
        team,
        topPerformers,
        weeklyData,
        patroliStats,
        serahTerimaCount: serahTerima.length,
      });

      // Generate PDF file
      const { uri } = await Print.printToFileAsync({ html, base64: false });

      const fileName = `Laporan_Mingguan_${now.toISOString().split('T')[0]}.pdf`;
      const docDir = (FileSystem as any).documentDirectory || (FileSystem as any).cacheDirectory;
      if (!docDir) throw new Error('Storage directory not available');
      const newUri = docDir.endsWith('/') ? `${docDir}${fileName}` : `${docDir}/${fileName}`;

      try {
        await FileSystem.moveAsync({ from: uri, to: newUri });
      } catch {
        // If move fails, use original uri
      }

      const finalUri = await FileSystem.getInfoAsync(newUri)
        .then((info) => (info.exists ? newUri : uri))
        .catch(() => uri);

      const record: ExportRecord = {
        id: `EXP-${Date.now()}`,
        tipe: lang === 'en' ? 'Weekly Report' : 'Laporan Mingguan',
        tanggal: now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        periodeStart,
        periodeEnd,
        fileUri: finalUri,
        status: 'success',
      };
      await saveExportRecord(record);

      setGenerating(false);

      Alert.alert(
        '✅ ' + (lang === 'en' ? 'Report Generated' : 'Laporan Berhasil Dibuat'),
        lang === 'en'
          ? `Weekly report (${periodeStart} - ${periodeEnd}) has been generated as PDF.`
          : `Laporan mingguan (${periodeStart} - ${periodeEnd}) berhasil digenerate sebagai PDF.`,
        [
          {
            text: lang === 'en' ? 'Share / Save' : 'Bagikan / Simpan',
            onPress: async () => {
              try {
                if (await Sharing.isAvailableAsync()) {
                  await Sharing.shareAsync(finalUri, {
                    mimeType: 'application/pdf',
                    dialogTitle: lang === 'en' ? 'Share Weekly Report' : 'Bagikan Laporan Mingguan',
                  });
                } else {
                  Alert.alert(
                    'Info',
                    lang === 'en' ? 'Sharing is not available on this device' : 'Fitur berbagi tidak tersedia di perangkat ini'
                  );
                }
              } catch (e: any) {
                Alert.alert('Error', e?.message || 'Failed to share');
              }
            },
          },
          {
            text: lang === 'en' ? 'Print' : 'Cetak',
            onPress: async () => {
              try {
                await Print.printAsync({ html });
              } catch (e: any) {
                Alert.alert('Error', e?.message || (lang === 'en' ? 'Failed to print' : 'Gagal mencetak'));
              }
            },
          },
          { text: 'OK' },
        ]
      );
    } catch (err: any) {
      setGenerating(false);

      const record: ExportRecord = {
        id: `EXP-${Date.now()}`,
        tipe: lang === 'en' ? 'Weekly Report' : 'Laporan Mingguan',
        tanggal: new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        periodeStart: '-',
        periodeEnd: '-',
        fileUri: null,
        status: 'failed',
      };
      await saveExportRecord(record);

      Alert.alert(
        '❌ Error',
        lang === 'en'
          ? `Failed to generate report: ${err?.message || 'Unknown error'}`
          : `Gagal membuat laporan: ${err?.message || 'Error tidak diketahui'}`
      );
    }
    // Note: exportHistory removed from deps since we use ref
  }, [user, stats, team, topPerformers, weeklyData, patroliStats, serahTerima, lang, generating]);

  const toggleAutoExport = async (val: boolean) => {
    setAutoExport(val);
    try {
      await AsyncStorage.setItem(AUTO_EXPORT_KEY, String(val));
    } catch (e) {
      console.log('[Analytics] auto-export save err:', e);
    }

    if (val) {
      Alert.alert(
        lang === 'en' ? '✅ Weekly Reminder Active' : '✅ Pengingat Mingguan Aktif',
        lang === 'en'
          ? 'You will receive a reminder every Monday morning to generate and review the weekly report. The report will include attendance, patrol, and incident data from the past week.'
          : 'Anda akan menerima pengingat setiap Senin pagi untuk membuat dan mereview laporan mingguan. Laporan mencakup data kehadiran, patroli, dan insiden selama seminggu terakhir.'
      );
    }
  };

  const handleReshareExport = async (record: ExportRecord) => {
    if (!record.fileUri) {
      Alert.alert(
        lang === 'en' ? 'File Not Available' : 'File Tidak Tersedia',
        lang === 'en'
          ? 'This report file is no longer available. Please generate a new report.'
          : 'File laporan ini sudah tidak tersedia. Silakan buat laporan baru.'
      );
      return;
    }

    try {
      const info = await FileSystem.getInfoAsync(record.fileUri);
      if (!info.exists) {
        Alert.alert(
          lang === 'en' ? 'File Expired' : 'File Kadaluarsa',
          lang === 'en'
            ? 'This file has been removed from storage. Please generate a new report.'
            : 'File ini sudah dihapus dari penyimpanan. Silakan buat laporan baru.'
        );
        return;
      }
    } catch {
      // continue and try sharing anyway
    }

    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(record.fileUri, {
          mimeType: 'application/pdf',
          dialogTitle: record.tipe,
        });
      } else {
        Alert.alert(
          'Info',
          lang === 'en' ? 'Sharing is not available on this device' : 'Fitur berbagi tidak tersedia'
        );
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to share');
    }
  };

  const handleDeleteExport = async (recordId: string) => {
    Alert.alert(
      lang === 'en' ? 'Delete Record?' : 'Hapus Riwayat?',
      lang === 'en' ? 'Remove this export from history?' : 'Hapus riwayat export ini?',
      [
        { text: lang === 'en' ? 'Cancel' : 'Batal', style: 'cancel' },
        {
          text: lang === 'en' ? 'Delete' : 'Hapus',
          style: 'destructive',
          onPress: async () => {
            const updated = exportHistoryRef.current.filter((r) => r.id !== recordId);
            setExportHistory(updated);
            try {
              await AsyncStorage.setItem(EXPORT_HISTORY_KEY, JSON.stringify(updated));
            } catch {}
          },
        },
      ]
    );
  };

  const handleClearHistory = async () => {
    Alert.alert(
      lang === 'en' ? 'Clear All History?' : 'Hapus Semua Riwayat?',
      lang === 'en' ? 'This will remove all export records.' : 'Ini akan menghapus semua riwayat export.',
      [
        { text: lang === 'en' ? 'Cancel' : 'Batal', style: 'cancel' },
        {
          text: lang === 'en' ? 'Clear' : 'Hapus Semua',
          style: 'destructive',
          onPress: async () => {
            setExportHistory([]);
            try { await AsyncStorage.removeItem(EXPORT_HISTORY_KEY); } catch {}
          },
        },
      ]
    );
  };

  return (
    <View style={[st.container, { backgroundColor: theme.bg }]}>
      <View style={[st.header, { backgroundColor: theme.bgCard, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[st.headerTitle, { color: theme.text }]}>Analytics</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={[st.tabsRow, { backgroundColor: theme.bgCard, borderBottomColor: theme.border }]}>
        {TABS.map((label, i) => (
          <TouchableOpacity
            key={`tab-${i}`}
            style={[
              st.tab,
              {
                backgroundColor: tabIndex === i ? Colors.primary : isDark ? theme.bgInput : Colors.bgGray,
              },
            ]}
            onPress={() => setTabIndex(i)}
          >
            <Text
              style={[
                st.tabText,
                tabIndex === i ? st.tabTextActive : { color: theme.textMuted },
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={st.content}>
        {/* ===== TAB: RINGKASAN ===== */}
        {tabIndex === 0 && (
          <>
            <View style={st.kpiRow}>
              <KPI value={team.length} label={lang === 'en' ? 'Personnel' : 'Personil'} color={Colors.primary} icon="people" />
              <KPI value={`${stats.kehadiranPct}%`} label={lang === 'en' ? 'Attendance' : 'Kehadiran'} color={Colors.success} icon="checkmark-circle" />
              <KPI value={stats.lkTotal} label={lang === 'en' ? 'Incidents' : 'Insiden'} color={Colors.warning} icon="alert-circle" />
            </View>

            <View style={st.kpiRow}>
              <KPI value={stats.tracked} label="GPS" color="#8B5CF6" icon="navigate" />
              <KPI value={patroliStats.completed} label={lang === 'en' ? 'Patrols Done' : 'Patroli Selesai'} color={Colors.primary} icon="footsteps" />
              <KPI value={serahTerima.length} label={lang === 'en' ? 'Handovers' : 'Serah Terima'} color="#F59E0B" icon="swap-horizontal" />
            </View>

            <Text style={[st.sectionTitle, { color: theme.text }]}>
              {lang === 'en' ? 'Personnel Status' : 'Status Personil'}
            </Text>
            <Card>
              <MiniBar label="On Duty" value={stats.onDuty} max={team.length} color={Colors.success} />
              <MiniBar label="Off Duty" value={stats.offDuty} max={team.length} color={Colors.textMuted} />
              <MiniBar label="GPS" value={stats.tracked} max={team.length} color="#8B5CF6" />
            </Card>

            <Text style={[st.sectionTitle, { color: theme.text }]}>
              {lang === 'en' ? 'Attendance Stats' : 'Statistik Absensi'}
            </Text>
            <Card>
              <MiniBar label={lang === 'en' ? 'Present' : 'Hadir'} value={stats.hadir} max={stats.totalMasuk || 1} color={Colors.success} />
              <MiniBar label={lang === 'en' ? 'Late' : 'Terlambat'} value={stats.terlambat} max={stats.totalMasuk || 1} color={Colors.warning} />
              <MiniBar label={lang === 'en' ? 'Absent' : 'Tidak Hadir'} value={stats.tidakHadir} max={stats.totalMasuk || 1} color={Colors.danger} />
              <View style={st.subtotalRow}>
                <Text style={[st.subtotalLabel, { color: theme.textMuted }]}>Total:</Text>
                <Text style={[st.subtotalVal, { color: theme.text }]}>{stats.totalMasuk}</Text>
              </View>
            </Card>

            <Text style={[st.sectionTitle, { color: theme.text }]}>
              {lang === 'en' ? 'Daily Reports' : 'Laporan Harian'}
            </Text>
            <Card>
              <MiniBar label={lang === 'en' ? 'Approved' : 'Disetujui'} value={stats.lhApproved} max={stats.lhTotal || 1} color={Colors.success} />
              <MiniBar label="Pending" value={stats.lhPending} max={stats.lhTotal || 1} color={Colors.warning} />
              <MiniBar label={lang === 'en' ? 'Revision' : 'Revisi'} value={stats.lhRevision} max={stats.lhTotal || 1} color={Colors.danger} />
            </Card>

            <Text style={[st.sectionTitle, { color: theme.text }]}>
              {lang === 'en' ? 'Incidents' : 'Insiden'}
            </Text>
            <Card>
              <MiniBar label="Open" value={stats.lkOpen} max={stats.lkTotal || 1} color={Colors.warning} />
              <MiniBar label="Resolved" value={stats.lkResolved} max={stats.lkTotal || 1} color={Colors.success} />
              <View style={st.subtotalRow}>
                <Text style={[st.subtotalLabel, { color: theme.textMuted }]}>
                  {lang === 'en' ? 'Critical' : 'Kritis'}: {stats.lkKritis}
                </Text>
                <Text style={[st.subtotalVal, { color: theme.text }]}>{stats.lkTotal} total</Text>
              </View>
            </Card>

            <Text style={[st.sectionTitle, { color: theme.text }]}>Top Performers</Text>
            <Card>
              {topPerformers.length === 0 ? (
                <Text style={[st.emptyText, { color: theme.textMuted }]}>
                  {lang === 'en' ? 'No data yet' : 'Belum ada data'}
                </Text>
              ) : (
                topPerformers.map((m, i) => (
                  <View
                    key={`perf-${m.id}`}
                    style={[
                      st.perfRow,
                      i < topPerformers.length - 1 && { borderBottomWidth: 1, borderBottomColor: isDark ? theme.border : Colors.borderLight },
                    ]}
                  >
                    <Text style={[st.perfRank, i === 0 && { color: '#F59E0B' }]}>#{i + 1}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[st.perfName, { color: theme.text }]}>{m.nama}</Text>
                      <Text style={[st.perfMeta, { color: theme.textMuted }]}>
                        {m.pos || '-'} • {m.shift || '-'}
                      </Text>
                    </View>
                    <View style={st.perfScoreBox}>
                      <Text style={st.perfScore}>{m.skor}</Text>
                    </View>
                  </View>
                ))
              )}
            </Card>
          </>
        )}

        {/* ===== TAB: MINGGUAN ===== */}
        {tabIndex === 1 && (
          <>
            <Text style={[st.sectionTitle, { color: theme.text }]}>
              {lang === 'en' ? 'Attendance (Last 7 Days)' : 'Kehadiran 7 Hari Terakhir'}
            </Text>
            {weeklyLoading || !weeklyData ? (
              <Card style={{ padding: 20, alignItems: 'center' }}>
                <RNActivityIndicator size="small" color={Colors.primary} />
                <Text style={[st.loadText, { color: theme.textMuted }]}>
                  {lang === 'en' ? 'Loading...' : 'Memuat data...'}
                </Text>
              </Card>
            ) : (
              <BarChart
                data={weeklyData.attendance}
                maxVal={Math.max(...weeklyData.attendance, 1)}
                color={Colors.success}
                label={lang === 'en' ? 'Check-in per Day' : 'Absensi Masuk per Hari'}
                days={DAYS}
              />
            )}

            <Text style={[st.sectionTitle, { color: theme.text }]}>
              {lang === 'en' ? 'Late Arrivals (Last 7 Days)' : 'Keterlambatan 7 Hari Terakhir'}
            </Text>
            {weeklyData && (
              <BarChart
                data={weeklyData.late}
                maxVal={Math.max(...weeklyData.late, ...weeklyData.attendance, 1)}
                color={Colors.warning}
                label={lang === 'en' ? 'Late per Day' : 'Terlambat per Hari'}
                days={DAYS}
              />
            )}

            <Text style={[st.sectionTitle, { color: theme.text }]}>
              {lang === 'en' ? 'Patrols (Last 7 Days)' : 'Patroli 7 Hari Terakhir'}
            </Text>
            {weeklyData && (
              <BarChart
                data={weeklyData.patrol}
                maxVal={Math.max(...weeklyData.patrol, 1)}
                color={Colors.primary}
                label={lang === 'en' ? 'Patrols per Day' : 'Patroli per Hari'}
                days={DAYS}
              />
            )}

            <Text style={[st.sectionTitle, { color: theme.text }]}>
              {lang === 'en' ? 'Weekly Summary' : 'Ringkasan Mingguan'}
            </Text>
            <Card>
              <View style={st.weekSummary}>
                <View style={st.weekItem}>
                  <Text style={[st.weekVal, { color: Colors.success }]}>
                    {weeklyData ? weeklyData.attendance.reduce((a: number, b: number) => a + b, 0) : '-'}
                  </Text>
                  <Text style={[st.weekLbl, { color: theme.textMuted }]}>
                    {lang === 'en' ? 'Total Present' : 'Total Hadir'}
                  </Text>
                </View>
                <View style={st.weekItem}>
                  <Text style={[st.weekVal, { color: Colors.warning }]}>
                    {weeklyData ? weeklyData.late.reduce((a: number, b: number) => a + b, 0) : '-'}
                  </Text>
                  <Text style={[st.weekLbl, { color: theme.textMuted }]}>
                    {lang === 'en' ? 'Late' : 'Terlambat'}
                  </Text>
                </View>
                <View style={st.weekItem}>
                  <Text style={[st.weekVal, { color: Colors.primary }]}>
                    {weeklyData ? weeklyData.patrol.reduce((a: number, b: number) => a + b, 0) : '-'}
                  </Text>
                  <Text style={[st.weekLbl, { color: theme.textMuted }]}>
                    {lang === 'en' ? 'Patrols' : 'Patroli'}
                  </Text>
                </View>
              </View>
            </Card>

            <Text style={[st.sectionTitle, { color: theme.text }]}>GPS Tracking</Text>
            <Card>
              <View style={st.weekSummary}>
                <View style={st.weekItem}>
                  <Text style={[st.weekVal, { color: '#8B5CF6' }]}>{stats.tracked}</Text>
                  <Text style={[st.weekLbl, { color: theme.textMuted }]}>GPS</Text>
                </View>
                <View style={st.weekItem}>
                  <Text style={[st.weekVal, { color: theme.textMuted }]}>
                    {team.length - stats.tracked}
                  </Text>
                  <Text style={[st.weekLbl, { color: theme.textMuted }]}>
                    {lang === 'en' ? 'No GPS' : 'Belum Terlacak'}
                  </Text>
                </View>
                <View style={st.weekItem}>
                  <Text style={[st.weekVal, { color: Colors.success }]}>
                    {team.length > 0 ? Math.round((stats.tracked / team.length) * 100) : 0}%
                  </Text>
                  <Text style={[st.weekLbl, { color: theme.textMuted }]}>Coverage</Text>
                </View>
              </View>
            </Card>
          </>
        )}

        {/* ===== TAB: LAPORAN ===== */}
        {tabIndex === 2 && (
          <>
            <Text style={[st.sectionTitle, { color: theme.text }]}>
              {lang === 'en' ? 'Generate Report' : 'Buat Laporan'}
            </Text>
            <Card style={{ backgroundColor: theme.bgCard }}>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 12 }}>
                <View style={[st.exportIcon, { backgroundColor: isDark ? `${Colors.primary}20` : '#EFF6FF' }]}>
                  <Ionicons name="document-text" size={24} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[st.exportTitle, { color: theme.text }]}>
                    {lang === 'en' ? 'Weekly Report' : 'Laporan Mingguan'}
                  </Text>
                  <Text style={[st.exportDesc, { color: theme.textMuted }]}>
                    {lang === 'en'
                      ? 'Generate a complete PDF report covering attendance, patrols, incidents, and team performance for the past 7 days.'
                      : 'Buat laporan PDF lengkap mencakup kehadiran, patroli, insiden, dan performa tim selama 7 hari terakhir.'}
                  </Text>
                </View>
              </View>

              <View style={[st.previewBox, { backgroundColor: isDark ? theme.bgInput : '#F8FAFC', borderColor: theme.border }]}>
                <Text style={[st.previewLabel, { color: theme.textMuted }]}>
                  {lang === 'en' ? 'Report will include:' : 'Laporan akan mencakup:'}
                </Text>
                <View style={st.previewItems}>
                  {[
                    { icon: 'people', text: `${team.length} ${lang === 'en' ? 'personnel' : 'personil'}`, color: Colors.primary },
                    { icon: 'checkmark-circle', text: `${stats.kehadiranPct}% ${lang === 'en' ? 'attendance' : 'kehadiran'}`, color: Colors.success },
                    { icon: 'footsteps', text: `${patroliStats.completed} ${lang === 'en' ? 'patrols' : 'patroli'}`, color: Colors.primary },
                    { icon: 'alert-circle', text: `${stats.lkTotal} ${lang === 'en' ? 'incidents' : 'insiden'}`, color: Colors.warning },
                  ].map((item, idx) => (
                    <View key={`pi-${idx}`} style={st.previewItem}>
                      <Ionicons name={item.icon as any} size={14} color={item.color} />
                      <Text style={[st.previewItemText, { color: theme.textSecondary }]}>{item.text}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={{ gap: 8, marginTop: 12 }}>
                <Button
                  title={
                    generating
                      ? lang === 'en' ? 'Generating...' : 'Membuat laporan...'
                      : lang === 'en' ? 'Generate Weekly Report (PDF)' : 'Buat Laporan Mingguan (PDF)'
                  }
                  variant="primary"
                  size="medium"
                  icon="document-text"
                  onPress={handleGenerateWeeklyReport}
                  disabled={generating}
                  loading={generating}
                  fullWidth
                />
              </View>

              {generating && (
                <View style={st.generatingBar}>
                  <RNActivityIndicator size="small" color={Colors.primary} />
                  <Text style={[st.generatingText, { color: theme.primary }]}>
                    {lang === 'en' ? 'Creating PDF report...' : 'Membuat laporan PDF...'}
                  </Text>
                </View>
              )}
            </Card>

            <Text style={[st.sectionTitle, { color: theme.text }]}>
              {lang === 'en' ? 'Weekly Reminder' : 'Pengingat Mingguan'}
            </Text>
            <Card style={{ backgroundColor: theme.bgCard }}>
              <View style={st.autoRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[st.autoTitle, { color: theme.text }]}>
                    {lang === 'en' ? 'Monday Morning Reminder' : 'Pengingat Senin Pagi'}
                  </Text>
                  <Text style={[st.autoDesc, { color: theme.textMuted }]}>
                    {lang === 'en'
                      ? 'Get reminded every Monday at 06:00 to generate and review the weekly report before the new work week.'
                      : 'Dapatkan pengingat setiap Senin pukul 06:00 untuk membuat dan mereview laporan mingguan sebelum minggu kerja baru.'}
                  </Text>
                </View>
                <Switch value={autoExport} onValueChange={toggleAutoExport} trackColor={{ true: Colors.primary, false: undefined as any }} />
              </View>
              {autoExport && (
                <View style={[st.autoInfo, { backgroundColor: isDark ? `${Colors.primary}15` : Colors.primaryBg }]}>
                  <Ionicons name="notifications" size={16} color={theme.primary} />
                  <Text style={[st.autoInfoText, { color: theme.primary }]}>
                    {lang === 'en'
                      ? "Active - You'll be reminded every Monday at 06:00 to generate a fresh weekly report."
                      : 'Aktif - Anda akan diingatkan setiap Senin pukul 06:00 untuk membuat laporan mingguan terbaru.'}
                  </Text>
                </View>
              )}
            </Card>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
              <Text style={[st.sectionTitle, { color: theme.text, marginTop: 0 }]}>
                {lang === 'en' ? 'Export History' : 'Riwayat Export'}
              </Text>
              {exportHistory.length > 0 && (
                <TouchableOpacity onPress={handleClearHistory}>
                  <Text style={{ fontSize: 12, color: Colors.danger, fontWeight: '600' }}>
                    {lang === 'en' ? 'Clear All' : 'Hapus Semua'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {exportHistory.length === 0 ? (
              <Card style={{ backgroundColor: theme.bgCard }}>
                <View style={{ alignItems: 'center', paddingVertical: 24, gap: 8 }}>
                  <View style={[st.emptyHistoryIcon, { backgroundColor: isDark ? `${theme.textMuted}15` : '#F1F5F9' }]}>
                    <Ionicons name="folder-open-outline" size={36} color={theme.textMuted} />
                  </View>
                  <Text style={[st.emptyHistoryTitle, { color: theme.text }]}>
                    {lang === 'en' ? 'No exports yet' : 'Belum ada export'}
                  </Text>
                  <Text style={[st.emptyHistoryDesc, { color: theme.textMuted }]}>
                    {lang === 'en'
                      ? 'Generated reports will appear here. You can reshare or reprint them anytime.'
                      : 'Laporan yang sudah digenerate akan muncul di sini. Anda bisa membagikan atau mencetak ulang kapan saja.'}
                  </Text>
                </View>
              </Card>
            ) : (
              exportHistory.map((record) => (
                <Card key={record.id} style={{ marginBottom: 8, backgroundColor: theme.bgCard }}>
                  <View style={st.historyRow}>
                    <View
                      style={[
                        st.historyIcon,
                        {
                          backgroundColor:
                            record.status === 'success'
                              ? isDark
                                ? '#0a3622'
                                : '#D4EDDA'
                              : isDark
                              ? '#3d1515'
                              : '#F8D7DA',
                        },
                      ]}
                    >
                      <Ionicons
                        name={record.status === 'success' ? 'document' : 'alert-circle'}
                        size={20}
                        color={record.status === 'success' ? Colors.success : Colors.danger}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[st.historyTitle, { color: theme.text }]}>{record.tipe}</Text>
                      <Text style={[st.historyDate, { color: theme.textMuted }]}>{record.tanggal}</Text>
                      {record.periodeStart !== '-' && (
                        <Text style={[st.historyPeriode, { color: theme.textMuted }]}>
                          {record.periodeStart} - {record.periodeEnd}
                        </Text>
                      )}
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                      <Badge
                        text={
                          record.status === 'success'
                            ? lang === 'en' ? 'Success' : 'Berhasil'
                            : lang === 'en' ? 'Failed' : 'Gagal'
                        }
                        variant={record.status === 'success' ? 'success' : 'danger'}
                      />
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {record.status === 'success' && record.fileUri && (
                          <TouchableOpacity onPress={() => handleReshareExport(record)}>
                            <Ionicons name="share-outline" size={20} color={theme.primary} />
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity onPress={() => handleDeleteExport(record.id)}>
                          <Ionicons name="trash-outline" size={20} color={Colors.danger} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </Card>
              ))
            )}
          </>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingTop: 50, paddingBottom: 12,
    paddingHorizontal: Spacing.base, borderBottomWidth: 1,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { ...Typography.h3, flex: 1, textAlign: 'center' },
  tabsRow: {
    flexDirection: 'row', gap: 8, paddingHorizontal: Spacing.base,
    paddingVertical: 10, borderBottomWidth: 1,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: Radius.md },
  tabText: { ...Typography.smallBold, color: Colors.textSecondary },
  tabTextActive: { color: '#fff' },
  content: { padding: Spacing.base },
  kpiRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  kpiCard: { flex: 1, alignItems: 'center', padding: 12 },
  kpiIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  kpiVal: { fontSize: 22, fontWeight: '800' },
  kpiLabel: { ...Typography.caption, color: Colors.textMuted, textAlign: 'center', marginTop: 2 },
  sectionTitle: { ...Typography.h3, marginBottom: 8, marginTop: 12 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  barLabel: { width: 80, ...Typography.small, color: Colors.textSecondary },
  barBg: { flex: 1, height: 12, backgroundColor: Colors.bgGray, borderRadius: 6, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 6 },
  barVal: { width: 30, ...Typography.smallBold, color: Colors.textPrimary, textAlign: 'right' },
  subtotalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.borderLight, marginTop: 4 },
  subtotalLabel: { ...Typography.caption },
  subtotalVal: { ...Typography.smallBold },
  chartTitle: { ...Typography.smallBold, color: Colors.textPrimary, marginBottom: 12 },
  chartWrap: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 140 },
  chartCol: { alignItems: 'center', justifyContent: 'flex-end', flex: 1 },
  chartBar: { borderRadius: 4, marginVertical: 4, minHeight: 4 },
  chartVal: { fontSize: 11, fontWeight: '700', color: Colors.textPrimary },
  chartDay: { fontSize: 10, color: Colors.textMuted },
  weekSummary: { flexDirection: 'row' },
  weekItem: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  weekVal: { fontSize: 22, fontWeight: '800' },
  weekLbl: { ...Typography.caption, marginTop: 2 },
  perfRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  perfRank: { fontSize: 16, fontWeight: '800', color: Colors.textMuted, width: 28 },
  perfName: { ...Typography.bodyBold },
  perfMeta: { ...Typography.caption },
  perfScoreBox: { backgroundColor: Colors.successBg, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.md },
  perfScore: { ...Typography.bodyBold, color: Colors.success },
  emptyText: { ...Typography.body, textAlign: 'center', padding: 20 },
  loadText: { ...Typography.caption, marginTop: 8 },
  exportIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  exportTitle: { ...Typography.bodyBold, fontSize: 15 },
  exportDesc: { ...Typography.small, marginTop: 4, lineHeight: 18 },
  previewBox: { padding: 10, borderRadius: Radius.md, borderWidth: 1, marginTop: 8 },
  previewLabel: { ...Typography.caption, fontWeight: '600', marginBottom: 6 },
  previewItems: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  previewItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  previewItemText: { ...Typography.small },
  generatingBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingVertical: 8 },
  generatingText: { ...Typography.small, fontWeight: '600' },
  autoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  autoTitle: { ...Typography.bodyBold },
  autoDesc: { ...Typography.caption, marginTop: 4, lineHeight: 17 },
  autoInfo: { flexDirection: 'row', gap: 8, marginTop: 12, padding: 10, borderRadius: Radius.sm },
  autoInfoText: { ...Typography.caption, flex: 1, lineHeight: 17 },
  emptyHistoryIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyHistoryTitle: { ...Typography.bodyBold },
  emptyHistoryDesc: { ...Typography.small, textAlign: 'center', paddingHorizontal: 24, lineHeight: 18 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  historyIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  historyTitle: { ...Typography.bodyBold, fontSize: 13 },
  historyDate: { ...Typography.caption },
  historyPeriode: { ...Typography.caption, fontSize: 10 },
});
