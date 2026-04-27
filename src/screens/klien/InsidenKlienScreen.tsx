/**
 * INSIDEN KLIEN - v24 DB-ALIGNED
 * Dark mode, company filtering, PDF export, share, detail view
 * DB table: laporan_kejadian
 * Columns: user_id, jenis, prioritas, waktu_kejadian, lokasi_text, latitude, longitude,
 *          kronologi, bukti_media, status, lokasi_id, created_at
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
const TABS = ['Semua', 'Open', 'Resolved'] as const;
const PRIO_COLOR: Record<string, string> = { rendah: Colors.textMuted, sedang: Colors.warning, tinggi: '#e67e22', kritis: Colors.danger };

/* ── helper: flexible field access (snake_case DB ↔ camelCase store) ── */
function getField(obj: any, ...keys: string[]): any {
  if (!obj) return undefined;
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return undefined;
}

export default function InsidenKlienScreen({ navigation }: any) {
  const { t, lang } = useI18n();
  const { theme, isDark } = useTheme();
  const user = useAuthStore((s) => s.user);
  const laporanK = useDataStore((s) => s.laporanKejadian);
  const [tab, setTab] = useState<typeof TABS[number]>('Semua');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // DB: users.lokasi_id
  const myLokasiId = getField(user, 'lokasi_id', 'lokasiId') || null;

  // Filter by lokasi_id (DB: laporan_kejadian.lokasi_id)
  const myLaporanK = useMemo(() => {
    if (!myLokasiId) return laporanK;
    return laporanK.filter(l => String(getField(l, 'lokasi_id', 'lokasiId') || '') === String(myLokasiId));
  }, [laporanK, myLokasiId]);

  const filtered = useMemo(() => {
    switch (tab) {
      case 'Open': return myLaporanK.filter(l => {
        const s = getField(l, 'status');
        return s === 'pending' || s === 'draft';
      });
      case 'Resolved': return myLaporanK.filter(l => getField(l, 'status') === 'approved');
      default: return myLaporanK;
    }
  }, [myLaporanK, tab]);

  const openCount = myLaporanK.filter(l => {
    const s = getField(l, 'status');
    return s === 'pending' || s === 'draft';
  }).length;
  const resolvedCount = myLaporanK.filter(l => getField(l, 'status') === 'approved').length;
  const kritisCount = myLaporanK.filter(l => {
    const p = getField(l, 'prioritas');
    return p === 'kritis' || p === 'tinggi';
  }).length;

  const buildHTML = (l: any) => {
    // Extract all fields with getField for DB compatibility
    const jenis = getField(l, 'jenis') || '-';
    const prioritas = getField(l, 'prioritas') || '-';
    const status = getField(l, 'status') || 'pending';
    // DB: waktu_kejadian (NOT waktuKejadian)
    const waktuKejadian = getField(l, 'waktu_kejadian', 'waktuKejadian') || '-';
    const displayWaktu = typeof waktuKejadian === 'string' && waktuKejadian.includes('T')
      ? new Date(waktuKejadian).toLocaleString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : waktuKejadian;
    // DB: lokasi_text (NOT lokasi)
    const lokasiText = getField(l, 'lokasi_text', 'lokasiText', 'lokasi') || '-';
    const nama = getField(l, 'nama', 'name', 'user_nama') || '-';
    const nrp = getField(l, 'nrp', 'user_nrp') || '-';
    const kronologi = getField(l, 'kronologi') || '-';
    // DB: catatan from validation (if exists)
    const catatanKomandan = getField(l, 'catatan_komandan', 'catatanKomandan', 'catatan') || '';

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}body{font-family:'Helvetica Neue',Arial,sans-serif;color:#2c3e50;padding:40px;font-size:12px}
    .header{border-bottom:3px solid #e74c3c;padding-bottom:16px;margin-bottom:24px}
    .header h1{font-size:20px;color:#e74c3c}.header p{font-size:11px;color:#666}
    .badge{display:inline-block;padding:3px 10px;border-radius:10px;font-size:10px;font-weight:700}
    .section{margin-bottom:16px}.section-title{font-size:13px;font-weight:700;color:#2980b9;margin-bottom:8px;border-bottom:1px solid #eee;padding-bottom:4px}
    .field{display:flex;margin-bottom:6px}.field-label{width:130px;font-weight:600;color:#666}.field-value{flex:1}
    .kronologi{background:#f8f9fa;border-radius:8px;padding:14px;border:1px solid #e8ecef;line-height:1.6}
    .footer{margin-top:30px;padding-top:12px;border-top:1px solid #ddd;text-align:center;font-size:9px;color:#aaa}
  </style></head><body>
    <div class="header"><h1>Detail Laporan Kejadian</h1><p>ID: ${l.id} - ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p></div>
    <div class="section"><div class="section-title">Informasi</div>
      <div class="field"><div class="field-label">Jenis:</div><div class="field-value"><strong>${jenis}</strong></div></div>
      <div class="field"><div class="field-label">Prioritas:</div><div class="field-value">${prioritas.toUpperCase()}</div></div>
      <div class="field"><div class="field-label">Status:</div><div class="field-value">${status === 'approved' ? 'RESOLVED' : 'OPEN'}</div></div>
      <div class="field"><div class="field-label">Waktu:</div><div class="field-value">${displayWaktu}</div></div>
      <div class="field"><div class="field-label">Lokasi:</div><div class="field-value">${lokasiText}</div></div>
    </div>
    <div class="section"><div class="section-title">Pelapor</div>
      <div class="field"><div class="field-label">Nama:</div><div class="field-value">${nama} (${nrp})</div></div>
    </div>
    <div class="section"><div class="section-title">Kronologi</div><div class="kronologi">${kronologi}</div></div>
    ${catatanKomandan ? `<div class="section"><div class="section-title">Catatan Komandan</div><div class="kronologi">${catatanKomandan}</div></div>` : ''}
    <div class="footer">PT Sopiak Satria Saga - Security Management System</div>
  </body></html>`;
  };

  const handleDownload = async (l: any) => {
    setDownloadingId(l.id);
    try { await Print.printAsync({ html: buildHTML(l) }); } catch {}
    setDownloadingId(null);
  };

  const handleShare = async (l: any) => {
    setDownloadingId(l.id + '-s');
    try {
      const { uri } = await Print.printToFileAsync({ html: buildHTML(l), base64: false });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
    } catch {}
    setDownloadingId(null);
  };

  return (
    <View style={[st.container, { backgroundColor: theme.bg }]}>
      {/* Header */}
      <View style={[st.header, { backgroundColor: isDark ? theme.bgCard : '#fff', borderBottomColor: theme.border }]}>
        <View style={st.headerRow}>
          <View style={[st.headerIcon, { backgroundColor: isDark ? `${Colors.danger}15` : Colors.dangerBg }]}>
            <Ionicons name="shield-half" size={20} color={Colors.danger} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[st.headerTitle, { color: theme.text }]}>{lang === 'en' ? 'Incident Reports' : 'Laporan Insiden'}</Text>
            <Text style={[st.headerSub, { color: theme.textMuted }]}>{lang === 'en' ? 'Track and monitor incidents' : 'Pantau dan lacak insiden keamanan'}</Text>
          </View>
        </View>

        {/* KPI */}
        <View style={st.kpiRow}>
          {[
            { val: myLaporanK.length, label: 'Total', color: Colors.primary, icon: 'layers' },
            { val: openCount, label: 'Open', color: Colors.warning, icon: 'alert-circle' },
            { val: resolvedCount, label: 'Resolved', color: Colors.success, icon: 'checkmark-circle' },
            { val: kritisCount, label: lang === 'en' ? 'Critical' : 'Kritis', color: Colors.danger, icon: 'flame' },
          ].map((k, i) => (
            <View key={i} style={[st.kpiItem, { backgroundColor: isDark ? `${k.color}10` : `${k.color}08`, borderColor: isDark ? theme.border : `${k.color}20` }]}>
              <Ionicons name={k.icon as any} size={16} color={k.color} />
              <Text style={[st.kpiVal, { color: k.color }]}>{k.val}</Text>
              <Text style={[st.kpiLabel, { color: theme.textMuted }]}>{k.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Tabs */}
      <View style={[st.tabsRow, { backgroundColor: isDark ? theme.bgCard : '#fff', borderBottomColor: theme.border }]}>
        {TABS.map(t2 => {
          const isActive = tab === t2;
          const count = t2 === 'Open' ? openCount : t2 === 'Resolved' ? resolvedCount : myLaporanK.length;
          return (
            <TouchableOpacity key={t2} style={[st.tab, isActive && { backgroundColor: theme.primary }]}
              onPress={() => setTab(t2)} activeOpacity={0.7}>
              <Text style={[st.tabText, { color: isActive ? '#fff' : theme.textMuted }]}>{t2}</Text>
              {count > 0 && <View style={[st.tabCount, isActive && { backgroundColor: 'rgba(255,255,255,0.3)' }]}><Text style={[st.tabCountText, isActive && { color: '#fff' }]}>{count}</Text></View>}
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>
        {filtered.length === 0 ? (
          <View style={st.emptyWrap}>
            <View style={[st.emptyCircle, { backgroundColor: isDark ? `${Colors.success}15` : Colors.successBg }]}>
              <Ionicons name="shield-checkmark" size={36} color={Colors.success} />
            </View>
            <Text style={[st.emptyTitle, { color: theme.text }]}>{lang === 'en' ? 'No incidents' : 'Tidak ada insiden'}</Text>
            <Text style={[st.emptyDesc, { color: theme.textMuted }]}>
              {tab === 'Open' ? 'Semua insiden sudah ditangani' : tab === 'Resolved' ? 'Belum ada insiden diselesaikan' : 'Area Anda aman'}
            </Text>
          </View>
        ) : filtered.map(l => {
          const prioritas = getField(l, 'prioritas') || 'sedang';
          const prioColor = PRIO_COLOR[prioritas] || Colors.textMuted;
          const isExpanded = expandedId === l.id;
          const jenis = getField(l, 'jenis') || 'Insiden';
          const status = getField(l, 'status') || 'pending';
          // DB: lokasi_text (NOT lokasi)
          const lokasiText = getField(l, 'lokasi_text', 'lokasiText', 'lokasi') || '-';
          // DB: waktu_kejadian
          const waktuKejadian = getField(l, 'waktu_kejadian', 'waktuKejadian') || '';
          const waktuSubmit = getField(l, 'created_at', 'createdAt', 'waktuSubmit', 'waktu_submit') || '';
          const displayWaktu = (() => {
            const w = waktuKejadian || waktuSubmit;
            if (typeof w === 'string' && w.includes('T')) {
              return new Date(w).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
            }
            return w;
          })();
          const kronologi = getField(l, 'kronologi') || '';
          const nama = getField(l, 'nama', 'name', 'user_nama') || 'Pelapor';
          const nrp = getField(l, 'nrp', 'user_nrp') || '-';
          const catatanKomandan = getField(l, 'catatan_komandan', 'catatanKomandan', 'catatan') || '';

          return (
            <TouchableOpacity key={l.id} activeOpacity={0.7} onPress={() => setExpandedId(isExpanded ? null : l.id)}
              style={[st.card, { backgroundColor: isDark ? theme.bgCard : '#fff', borderColor: theme.border }]}>
              {/* Priority stripe */}
              <View style={[st.prioStripe, { backgroundColor: prioColor }]} />
              <View style={st.cardBody}>
                {/* Top row */}
                <View style={st.cardTop}>
                  <View style={[st.prioBadge, { backgroundColor: isDark ? `${prioColor}20` : `${prioColor}12` }]}>
                    <Text style={[st.prioBadgeText, { color: prioColor }]}>{prioritas.toUpperCase()}</Text>
                  </View>
                  <Badge text={jenis} variant="danger" />
                  <View style={{ flex: 1 }} />
                  <Badge text={status === 'approved' ? '✓ Resolved' : '● Open'} variant={status === 'approved' ? 'success' : 'warning'} />
                </View>

                {/* Location & Time - uses lokasi_text from DB */}
                <View style={st.infoRow}>
                  <Ionicons name="location-outline" size={13} color={theme.textMuted} />
                  <Text style={[st.infoText, { color: theme.textMuted }]} numberOfLines={1}>{lokasiText}</Text>
                  <Ionicons name="time-outline" size={13} color={theme.textMuted} />
                  <Text style={[st.infoText, { color: theme.textMuted }]}>{displayWaktu}</Text>
                </View>

                {/* Kronologi preview */}
                <Text style={[st.kronologi, { color: theme.text }]} numberOfLines={isExpanded ? 100 : 2}>{kronologi}</Text>

                {/* Reporter */}
                <View style={st.reporterRow}>
                  <Ionicons name="person-outline" size={12} color={theme.textMuted} />
                  <Text style={[st.reporterText, { color: theme.textMuted }]}>{nama} ({nrp})</Text>
                </View>

                {/* Expanded: catatan + actions */}
                {isExpanded && (
                  <>
                    {catatanKomandan ? (
                      <View style={[st.catatanBox, { backgroundColor: isDark ? `${Colors.warning}10` : Colors.warningBg, borderLeftColor: Colors.warning }]}>
                        <Text style={[st.catatanLabel, { color: Colors.warningDark }]}>Catatan Komandan</Text>
                        <Text style={[st.catatanText, { color: theme.text }]}>{catatanKomandan}</Text>
                      </View>
                    ) : null}
                    <View style={st.actionRow}>
                      <TouchableOpacity style={[st.actionBtn, { backgroundColor: theme.primary }]} onPress={() => handleDownload(l)} disabled={!!downloadingId}>
                        {downloadingId === l.id ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="download-outline" size={14} color="#fff" />}
                        <Text style={st.actionBtnText}>PDF</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[st.actionBtnOutline, { borderColor: theme.primary }]} onPress={() => handleShare(l)} disabled={!!downloadingId}>
                        {downloadingId === l.id + '-s' ? <ActivityIndicator size="small" color={theme.primary} /> : <Ionicons name="share-outline" size={14} color={theme.primary} />}
                        <Text style={[st.actionBtnOutlineText, { color: theme.primary }]}>{lang === 'en' ? 'Share' : 'Bagikan'}</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}

                {/* Expand hint */}
                <View style={st.expandHint}>
                  <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={theme.textMuted} />
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingTop: 48, paddingBottom: 14, paddingHorizontal: Spacing.base, borderBottomWidth: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  headerIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  headerSub: { fontSize: 11, marginTop: 1 },
  kpiRow: { flexDirection: 'row', gap: 6 },
  kpiItem: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10, gap: 2, borderWidth: 1 },
  kpiVal: { fontSize: 18, fontWeight: '900' },
  kpiLabel: { fontSize: 9, fontWeight: '600' },
  tabsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: Spacing.base, paddingVertical: 10, borderBottomWidth: 1 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 10 },
  tabText: { fontSize: 12, fontWeight: '700' },
  tabCount: { backgroundColor: '#ddd', borderRadius: 8, minWidth: 18, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tabCountText: { fontSize: 9, fontWeight: '700', color: '#666' },
  content: { padding: Spacing.base },
  emptyWrap: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyCircle: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '800' },
  emptyDesc: { fontSize: 12, textAlign: 'center', paddingHorizontal: 32 },
  card: { marginBottom: 12, borderRadius: 14, overflow: 'hidden', borderWidth: 1 },
  prioStripe: { height: 3, width: '100%' },
  cardBody: { padding: 14 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  prioBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  prioBadgeText: { fontSize: 9, fontWeight: '800' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  infoText: { fontSize: 11, flex: 1 },
  kronologi: { fontSize: 12, lineHeight: 18, marginBottom: 8 },
  reporterRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  reporterText: { fontSize: 10 },
  catatanBox: { borderRadius: 8, padding: 10, marginTop: 8, marginBottom: 8, borderLeftWidth: 3 },
  catatanLabel: { fontSize: 10, fontWeight: '700' },
  catatanText: { fontSize: 11, marginTop: 3 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, borderRadius: 10 },
  actionBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  actionBtnOutline: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5 },
  actionBtnOutlineText: { fontSize: 12, fontWeight: '700' },
  expandHint: { alignItems: 'center', marginTop: 4 },
});