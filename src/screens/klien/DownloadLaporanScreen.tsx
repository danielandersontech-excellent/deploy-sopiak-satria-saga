/**
 * DOWNLOAD LAPORAN KLIEN - v24 DB-ALIGNED
 * Full dark mode, company-only data, PDF export, share
 * DB tables: laporan_harian, laporan_kejadian, absensi, patroli
 * All field access normalized for snake_case (DB) + camelCase (store) compatibility
 */
import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Colors, Typography, Spacing, Radius } from '../../constants';
import { Badge } from '../../components';
import { useDataStore } from '../../stores/dataStore';
import { useAuthStore } from '../../stores/authStore';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

const { width: SW } = Dimensions.get('window');
type ReportType = 'Semua' | 'Harian' | 'Kejadian' | 'Absensi' | 'Patroli';
const JENIS: ReportType[] = ['Semua', 'Harian', 'Kejadian', 'Absensi', 'Patroli'];
const ICON_MAP: Record<string, { name: string; color: string; bg: string }> = {
  Harian: { name: 'document-text', color: Colors.primary, bg: Colors.primaryBg },
  Kejadian: { name: 'alert-circle', color: Colors.danger, bg: Colors.dangerBg },
  Absensi: { name: 'finger-print', color: Colors.success, bg: Colors.successBg },
  Patroli: { name: 'navigate', color: Colors.warning, bg: Colors.warningBg },
};

/* ── helper: flexible field access (snake_case DB ↔ camelCase store) ── */
function getField(obj: any, ...keys: string[]): any {
  if (!obj) return undefined;
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return undefined;
}

function wrapHTML(title: string, user: any, content: string) {
  const now = new Date();
  const d = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  const t2 = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const userName = getField(user, 'nama', 'name') || 'Klien';
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
    td{padding:7px 10px;border-bottom:1px solid #ecf0f1;font-size:10px}tr:nth-child(even){background:#fafbfc}
    .badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:9px;font-weight:700;text-transform:uppercase}
    .bg-green{background:#eafaf1;color:#27ae60}.bg-red{background:#fdedec;color:#e74c3c}.bg-orange{background:#fef9e7;color:#f39c12}.bg-blue{background:#eaf2f8;color:#2980b9}.bg-gray{background:#ecf0f1;color:#5d6d7e}
    .empty{text-align:center;color:#999}.footer{margin-top:30px;padding-top:12px;border-top:1px solid #ddd;text-align:center;font-size:9px;color:#aaa}
  </style></head><body>
    <div class="header"><div class="header-left"><h1>${title}</h1><p>Dicetak: ${d} ${t2} WIB - oleh: ${userName}</p></div>
    <div class="header-right"><div class="company">PT Sopiak Satria Saga</div><div>Security Management System</div></div></div>
    ${content}
    <div class="footer">Dokumen ini digenerate oleh Sistem PT Sopiak Satria Saga - ${d}</div>
  </body></html>`;
}

export default function DownloadLaporanScreen({ navigation }: any) {
  const { t, lang } = useI18n();
  const { theme, isDark } = useTheme();
  const user = useAuthStore((s) => s.user);
  // DB: users.lokasi_id
  const myLokasiId = getField(user, 'lokasi_id', 'lokasiId') || null;

  const rawLH = useDataStore((s) => s.laporanHarian);
  const rawLK = useDataStore((s) => s.laporanKejadian);
  const rawAbs = useDataStore((s) => s.absensiRecords);

  // Filter by lokasi_id (DB column)
  const laporanH = useMemo(() => myLokasiId
    ? rawLH.filter(l => String(getField(l, 'lokasi_id', 'lokasiId') || '') === String(myLokasiId))
    : rawLH, [rawLH, myLokasiId]);

  const laporanK = useMemo(() => myLokasiId
    ? rawLK.filter(l => String(getField(l, 'lokasi_id', 'lokasiId') || '') === String(myLokasiId))
    : rawLK, [rawLK, myLokasiId]);

  const absensi = useMemo(() => myLokasiId
    ? rawAbs.filter(a => String(getField(a, 'lokasi_id', 'lokasiId') || '') === String(myLokasiId))
    : rawAbs, [rawAbs, myLokasiId]);

  const [jenis, setJenis] = useState<ReportType>('Semua');
  const [downloading, setDownloading] = useState<string | null>(null);

  const reports = useMemo(() => [
    {
      id: 'H', type: 'Harian' as const,
      title: lang === 'en' ? 'Daily Reports' : 'Laporan Harian',
      count: laporanH.length,
      desc: `${laporanH.length} ${lang === 'en' ? 'reports' : 'laporan'}`,
      stats: {
        approved: laporanH.filter(l => getField(l, 'status') === 'approved').length,
        pending: laporanH.filter(l => getField(l, 'status') === 'pending').length,
      },
    },
    {
      id: 'K', type: 'Kejadian' as const,
      title: lang === 'en' ? 'Incident Reports' : 'Rekap Insiden',
      count: laporanK.length,
      desc: `${laporanK.length} ${lang === 'en' ? 'incidents' : 'insiden'}`,
      stats: {
        resolved: laporanK.filter(l => getField(l, 'status') === 'approved').length,
        open: laporanK.filter(l => getField(l, 'status') === 'pending').length,
      },
    },
    {
      id: 'A', type: 'Absensi' as const,
      title: lang === 'en' ? 'Attendance Report' : 'Rekap Absensi',
      count: absensi.length,
      desc: `${absensi.length} ${lang === 'en' ? 'records' : 'record'}`,
      stats: {
        hadir: absensi.filter(a => getField(a, 'status') === 'hadir').length,
        terlambat: absensi.filter(a => getField(a, 'status') === 'terlambat').length,
      },
    },
    {
      id: 'P', type: 'Patroli' as const,
      title: lang === 'en' ? 'Patrol Reports' : 'Laporan Patroli',
      count: 0,
      desc: lang === 'en' ? 'Patrol activity' : 'Rekap patroli',
      stats: {},
    },
  ], [laporanH, laporanK, absensi, lang]);

  const filtered = jenis === 'Semua' ? reports : reports.filter(r => r.type === jenis);

  const buildHTML = (type: string) => {
    if (type === 'Harian') {
      // DB columns: tanggal, pos_jaga, shift, kondisi, aktivitas, status
      // nama, nrp come from JOIN users
      const rows = laporanH.map(l => {
        const tanggal = getField(l, 'tanggal') || '-';
        const nama = getField(l, 'nama', 'name', 'user_nama') || '-';
        const nrp = getField(l, 'nrp', 'user_nrp') || '-';
        const posJaga = getField(l, 'pos_jaga', 'posJaga') || '-';
        const shift = getField(l, 'shift') || '-';
        const kondisi = getField(l, 'kondisi') || '-';
        const aktivitas = (getField(l, 'aktivitas') || '').substring(0, 80);
        const status = getField(l, 'status') || '-';
        return `<tr><td>${tanggal}</td><td>${nama} (${nrp})</td><td>${posJaga}</td><td>${shift}</td><td><span class="badge ${kondisi === 'aman' ? 'bg-green' : kondisi === 'ada_masalah' ? 'bg-orange' : 'bg-red'}">${kondisi}</span></td><td>${aktivitas}</td><td><span class="badge ${status === 'approved' ? 'bg-green' : 'bg-orange'}">${status}</span></td></tr>`;
      }).join('');
      const amanCount = laporanH.filter(d => getField(d, 'kondisi') === 'aman').length;
      const approvedCount = laporanH.filter(d => getField(d, 'status') === 'approved').length;
      return wrapHTML('Laporan Harian', user, `<div class="summary-row"><div class="summary-card"><div class="summary-val">${laporanH.length}</div><div class="summary-label">Total</div></div><div class="summary-card"><div class="summary-val green">${amanCount}</div><div class="summary-label">Aman</div></div><div class="summary-card"><div class="summary-val blue">${approvedCount}</div><div class="summary-label">Disetujui</div></div></div><table><thead><tr><th>Tanggal</th><th>Petugas</th><th>Pos</th><th>Shift</th><th>Kondisi</th><th>Aktivitas</th><th>Status</th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="empty">Belum ada data</td></tr>'}</tbody></table>`);
    }

    if (type === 'Kejadian') {
      // DB columns: waktu_kejadian, prioritas, jenis, lokasi_text, kronologi, status
      const rows = laporanK.map(l => {
        const waktu = getField(l, 'waktu_kejadian', 'waktuKejadian') || '-';
        const displayWaktu = typeof waktu === 'string' && waktu.includes('T')
          ? new Date(waktu).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
          : waktu;
        const prioritas = getField(l, 'prioritas') || '-';
        const jenis = getField(l, 'jenis') || '-';
        // DB: lokasi_text, NOT lokasi
        const lokasiText = getField(l, 'lokasi_text', 'lokasiText', 'lokasi') || '-';
        const nama = getField(l, 'nama', 'name', 'user_nama') || '-';
        const kronologi = (getField(l, 'kronologi') || '').substring(0, 60);
        const status = getField(l, 'status') || '-';
        return `<tr><td>${displayWaktu}</td><td><span class="badge ${prioritas === 'kritis' ? 'bg-red' : prioritas === 'tinggi' ? 'bg-orange' : 'bg-gray'}">${prioritas}</span></td><td><strong>${jenis}</strong></td><td>${lokasiText}</td><td>${nama}</td><td>${kronologi}</td><td><span class="badge ${status === 'approved' ? 'bg-green' : 'bg-orange'}">${status === 'approved' ? 'Resolved' : 'Open'}</span></td></tr>`;
      }).join('');
      const highPrioCount = laporanK.filter(d => {
        const p = getField(d, 'prioritas');
        return p === 'kritis' || p === 'tinggi';
      }).length;
      const resolvedCount = laporanK.filter(d => getField(d, 'status') === 'approved').length;
      return wrapHTML('Laporan Kejadian', user, `<div class="summary-row"><div class="summary-card"><div class="summary-val">${laporanK.length}</div><div class="summary-label">Total</div></div><div class="summary-card"><div class="summary-val red">${highPrioCount}</div><div class="summary-label">Prioritas Tinggi</div></div><div class="summary-card"><div class="summary-val green">${resolvedCount}</div><div class="summary-label">Resolved</div></div></div><table><thead><tr><th>Waktu</th><th>Prioritas</th><th>Jenis</th><th>Lokasi</th><th>Pelapor</th><th>Kronologi</th><th>Status</th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="empty">Belum ada data</td></tr>'}</tbody></table>`);
    }

    if (type === 'Absensi') {
      // DB columns: tipe, pos_jaga, status, dalam_radius, created_at
      const rows = absensi.map(a => {
        const tanggal = getField(a, 'tanggal') || (() => {
          const ca = getField(a, 'created_at', 'createdAt');
          return ca ? new Date(ca).toLocaleDateString('id-ID') : '-';
        })();
        const nama = getField(a, 'nama', 'name', 'user_nama') || '-';
        const nrp = getField(a, 'nrp', 'user_nrp') || '-';
        const tipe = getField(a, 'tipe') || '-';
        const waktu = getField(a, 'waktu') || (() => {
          const ca = getField(a, 'created_at', 'createdAt');
          return ca ? new Date(ca).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-';
        })();
        // DB: pos_jaga
        const posJaga = getField(a, 'pos_jaga', 'posJaga') || '-';
        const status = getField(a, 'status') || '-';
        // DB: dalam_radius (boolean)
        const dalamRadius = getField(a, 'dalam_radius', 'dalamRadius');
        return `<tr><td>${tanggal}</td><td>${nama} (${nrp})</td><td><span class="badge ${tipe === 'masuk' ? 'bg-green' : 'bg-blue'}">${tipe}</span></td><td>${waktu}</td><td>${posJaga}</td><td><span class="badge ${status === 'hadir' ? 'bg-green' : status === 'terlambat' ? 'bg-orange' : 'bg-red'}">${status}</span></td><td>${dalamRadius ? '✅' : '❌'}</td></tr>`;
      }).join('');
      const hadirCount = absensi.filter(d => getField(d, 'status') === 'hadir').length;
      const terlambatCount = absensi.filter(d => getField(d, 'status') === 'terlambat').length;
      return wrapHTML('Rekap Absensi', user, `<div class="summary-row"><div class="summary-card"><div class="summary-val">${absensi.length}</div><div class="summary-label">Total</div></div><div class="summary-card"><div class="summary-val green">${hadirCount}</div><div class="summary-label">Hadir</div></div><div class="summary-card"><div class="summary-val orange">${terlambatCount}</div><div class="summary-label">Terlambat</div></div></div><table><thead><tr><th>Tanggal</th><th>Petugas</th><th>Tipe</th><th>Waktu</th><th>Pos</th><th>Status</th><th>Radius</th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="empty">Belum ada data</td></tr>'}</tbody></table>`);
    }

    return wrapHTML('Laporan Patroli', user, '<p class="empty" style="padding:40px 0;">Data patroli akan ditampilkan setelah ada record.</p>');
  };

  const handleSave = async (r: any) => {
    setDownloading(r.id + '-s');
    try { await Print.printAsync({ html: buildHTML(r.type) }); } catch {}
    setDownloading(null);
  };

  const handleShare = async (r: any) => {
    setDownloading(r.id + '-sh');
    try {
      const { uri } = await Print.printToFileAsync({ html: buildHTML(r.type), base64: false });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Bagikan ${r.title}` });
    } catch {}
    setDownloading(null);
  };

  return (
    <View style={[st.container, { backgroundColor: theme.bg }]}>
      {/* Header */}
      <View style={[st.header, { backgroundColor: isDark ? theme.bgCard : '#fff', borderBottomColor: theme.border }]}>
        <View style={st.headerRow}>
          <View style={[st.headerIcon, { backgroundColor: isDark ? `${Colors.primary}15` : Colors.primaryBg }]}>
            <Ionicons name="download" size={20} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[st.headerTitle, { color: theme.text }]}>{lang === 'en' ? 'Download Reports' : 'Download Laporan'}</Text>
            <Text style={[st.headerSub, { color: theme.textMuted }]}>{lang === 'en' ? 'Generate PDF reports' : 'Unduh laporan format PDF'}</Text>
          </View>
        </View>
      </View>

      {/* Filter */}
      <View style={[st.filterWrapper, { backgroundColor: isDark ? theme.bgCard : '#fff', borderBottomColor: theme.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.filterContent}>
          {JENIS.map(j => {
            const isActive = jenis === j;
            return (
              <TouchableOpacity key={j} style={[st.chip, isActive && { backgroundColor: theme.primary, borderColor: theme.primary }, !isActive && { borderColor: theme.border }]} onPress={() => setJenis(j)} activeOpacity={0.7}>
                {j !== 'Semua' && <Ionicons name={ICON_MAP[j]?.name as any || 'document'} size={13} color={isActive ? '#fff' : theme.textMuted} />}
                <Text style={[st.chipText, { color: isActive ? '#fff' : theme.textMuted }]}>{j}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>
        {filtered.map(r => {
          const ic = ICON_MAP[r.type] || ICON_MAP.Harian;
          return (
            <View key={r.id} style={[st.card, { backgroundColor: isDark ? theme.bgCard : '#fff', borderColor: theme.border }]}>
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
                    <View key={key} style={[st.statChip, { backgroundColor: isDark ? `${theme.primary}08` : Colors.bgLight }]}>
                      <Text style={[st.statVal, { color: theme.text }]}>{val as number}</Text>
                      <Text style={[st.statLabel, { color: theme.textMuted }]}>{key}</Text>
                    </View>
                  ))}
                </View>
              )}

              <View style={[st.cardActions, { borderTopColor: theme.border }]}>
                <TouchableOpacity style={[st.saveBtn, { backgroundColor: theme.primary }]} onPress={() => handleSave(r)} disabled={!!downloading} activeOpacity={0.7}>
                  {downloading === r.id + '-s' ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="download-outline" size={15} color="#fff" />}
                  <Text style={st.saveBtnText}>{downloading === r.id + '-s' ? '...' : lang === 'en' ? 'Save PDF' : 'Simpan PDF'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[st.shareBtn, { borderColor: theme.primary }]} onPress={() => handleShare(r)} disabled={!!downloading} activeOpacity={0.7}>
                  {downloading === r.id + '-sh' ? <ActivityIndicator size="small" color={theme.primary} /> : <Ionicons name="share-outline" size={15} color={theme.primary} />}
                  <Text style={[st.shareBtnText, { color: theme.primary }]}>{downloading === r.id + '-sh' ? '...' : lang === 'en' ? 'Share' : 'Bagikan'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        <View style={[st.infoCard, { backgroundColor: isDark ? `${theme.primary}08` : Colors.primaryBg, borderColor: isDark ? theme.border : Colors.primarySoft }]}>
          <View style={st.infoRow}>
            <Ionicons name="information-circle" size={18} color={theme.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[st.infoTitle, { color: theme.primary }]}>{lang === 'en' ? 'About Reports' : 'Tentang Laporan'}</Text>
              <Text style={[st.infoDesc, { color: theme.textMuted }]}>
                {lang === 'en' ? 'Reports are generated in real-time from current data. The PDF can be saved or shared directly.' : 'Laporan digenerate real-time dari data terkini. PDF dapat langsung disimpan atau dibagikan.'}
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
  header: { paddingTop: 48, paddingBottom: 14, paddingHorizontal: Spacing.base, borderBottomWidth: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  headerSub: { fontSize: 11, marginTop: 1 },
  filterWrapper: { borderBottomWidth: 1, height: 54 },
  filterContent: { paddingHorizontal: Spacing.base, paddingVertical: 10, gap: 8, alignItems: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, height: 34 },
  chipText: { fontSize: 12, fontWeight: '700' },
  content: { padding: Spacing.base },
  card: { marginBottom: 14, borderRadius: 14, overflow: 'hidden', borderWidth: 1 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  cardIconWrap: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 14, fontWeight: '800' },
  cardDesc: { fontSize: 11, marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingBottom: 12, paddingTop: 10, borderTopWidth: 1 },
  statChip: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10 },
  statVal: { fontSize: 16, fontWeight: '800' },
  statLabel: { fontSize: 9, textTransform: 'capitalize', marginTop: 1 },
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