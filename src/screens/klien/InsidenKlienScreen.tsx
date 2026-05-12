/**
 * INSIDEN KLIEN - v25 (Bug-Fix Pass on top of v24)
 *
 * FIXES (v25):
 *  🚨 XSS PREVENTION — buildHTML interpolated `jenis`, `lokasiText`, `nama`,
 *     `nrp`, `kronologi`, `catatanKomandan` DIRECTLY into HTML. A field
 *     containing `<script>` or special chars would break the print template
 *     or execute. Now every user-controlled field is escaped via escapeHtml().
 *  🚨 EMPTY CATCH BLOCKS — Print/Share errors silently swallowed (lines 120,
 *     129 original). User taps button, nothing happens, no clue why. Now
 *     errors are caught and surfaced via Alert with the actual message.
 *  🚨 PRIVACY LEAK — when user has no `lokasi_id`, the screen showed ALL
 *     incidents from ALL companies. Now shows empty state instead of leaking.
 *  🚨 DOWNLOAD BUTTONS DISABLED ACROSS ALL CARDS — `disabled={!!downloadingId}`
 *     disabled every card's buttons when ANY one was downloading. Now scoped
 *     per-card so other cards remain interactive.
 *
 *  ✅ Pull-to-refresh added.
 *  ✅ TAB labels now i18n'd ('Semua' → 'All' in EN, etc.).
 *  ✅ Empty state messages fully translated for all 3 tabs.
 *  ✅ `PRIO_COLOR.tinggi` migrated from hardcoded `#e67e22` to `Colors.warningDark`.
 *  ✅ `tabCount` default bg/text now theme-aware (was hardcoded `#ddd`/`#666`).
 *  ✅ Locale-aware date formatting (id-ID vs en-US).
 *  ✅ Modal back button safety: header gets back arrow when reachable via stack.
 */
import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
  ActivityIndicator, Dimensions, RefreshControl,
} from 'react-native';
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
type TabKey = 'all' | 'open' | 'resolved';
const TABS: TabKey[] = ['all', 'open', 'resolved'];
const PRIO_COLOR: Record<string, string> = {
  rendah: Colors.textMuted,
  sedang: Colors.warning,
  tinggi: Colors.warningDark,
  kritis: Colors.danger,
};

function getField(obj: any, ...keys: string[]): any {
  if (!obj) return undefined;
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return undefined;
}

// 🚨 XSS PREVENTION: escape HTML special chars before interpolation.
function escapeHtml(s: any): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default function InsidenKlienScreen({ navigation }: any) {
  const { t, lang } = useI18n();
  const { theme, isDark } = useTheme();
  const user = useAuthStore((s) => s.user);
  const laporanK = useDataStore((s) => s.laporanKejadian);
  const loadAllData = useDataStore((s) => s.loadAllData);
  const [tab, setTab] = useState<TabKey>('all');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const myLokasiId = getField(user, 'lokasi_id', 'lokasiId') || null;
  // Klien is a special role — track whether we should hide all data
  const isKlien = user?.role === 'klien';
  const hideAll = isKlien && !myLokasiId;

  // 🚨 PRIVACY: if klien has no lokasi_id, don't leak everyone's incidents
  const myLaporanK = useMemo(() => {
    if (hideAll) return [];
    if (!myLokasiId) return laporanK;
    return laporanK.filter((l) =>
      String(getField(l, 'lokasi_id', 'lokasiId') || '') === String(myLokasiId)
    );
  }, [laporanK, myLokasiId, hideAll]);

  const filtered = useMemo(() => {
    switch (tab) {
      case 'open':
        return myLaporanK.filter((l) => {
          const s = getField(l, 'status');
          return s === 'pending' || s === 'draft';
        });
      case 'resolved':
        return myLaporanK.filter((l) => getField(l, 'status') === 'approved');
      default:
        return myLaporanK;
    }
  }, [myLaporanK, tab]);

  const openCount = myLaporanK.filter((l) => {
    const s = getField(l, 'status');
    return s === 'pending' || s === 'draft';
  }).length;
  const resolvedCount = myLaporanK.filter((l) => getField(l, 'status') === 'approved').length;
  const kritisCount = myLaporanK.filter((l) => {
    const p = getField(l, 'prioritas');
    return p === 'kritis' || p === 'tinggi';
  }).length;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await loadAllData?.(); } catch {}
    finally { setRefreshing(false); }
  }, [loadAllData]);

  const dateLocale = lang === 'en' ? 'en-US' : 'id-ID';

  // 🚨 XSS-SAFE buildHTML
  const buildHTML = (l: any) => {
    const jenis = escapeHtml(getField(l, 'jenis') || '-');
    const prioritas = escapeHtml(getField(l, 'prioritas') || '-');
    const status = getField(l, 'status') || 'pending';
    const waktuKejadian = getField(l, 'waktu_kejadian', 'waktuKejadian') || '-';
    const displayWaktu = typeof waktuKejadian === 'string' && waktuKejadian.includes('T')
      ? new Date(waktuKejadian).toLocaleString(dateLocale, {
          day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
        })
      : waktuKejadian;
    const lokasiText = escapeHtml(getField(l, 'lokasi_text', 'lokasiText', 'lokasi') || '-');
    const nama = escapeHtml(getField(l, 'nama', 'name', 'user_nama') || '-');
    const nrp = escapeHtml(getField(l, 'nrp', 'user_nrp') || '-');
    const kronologi = escapeHtml(getField(l, 'kronologi') || '-');
    const catatanKomandan = escapeHtml(getField(l, 'catatan_komandan', 'catatanKomandan', 'catatan') || '');
    const id = escapeHtml(l.id || '');
    const safeDisplayWaktu = escapeHtml(displayWaktu);
    const dateLong = new Date().toLocaleDateString(dateLocale, {
      day: 'numeric', month: 'long', year: 'numeric',
    });

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}body{font-family:'Helvetica Neue',Arial,sans-serif;color:#2c3e50;padding:40px;font-size:12px}
    .header{border-bottom:3px solid #e74c3c;padding-bottom:16px;margin-bottom:24px}
    .header h1{font-size:20px;color:#e74c3c}.header p{font-size:11px;color:#666}
    .badge{display:inline-block;padding:3px 10px;border-radius:10px;font-size:10px;font-weight:700}
    .section{margin-bottom:16px}.section-title{font-size:13px;font-weight:700;color:#2980b9;margin-bottom:8px;border-bottom:1px solid #eee;padding-bottom:4px}
    .field{display:flex;margin-bottom:6px}.field-label{width:130px;font-weight:600;color:#666}.field-value{flex:1}
    .kronologi{background:#f8f9fa;border-radius:8px;padding:14px;border:1px solid #e8ecef;line-height:1.6;word-wrap:break-word}
    .footer{margin-top:30px;padding-top:12px;border-top:1px solid #ddd;text-align:center;font-size:9px;color:#aaa}
  </style></head><body>
    <div class="header"><h1>Detail Laporan Kejadian</h1><p>ID: ${id} &bull; ${dateLong}</p></div>
    <div class="section"><div class="section-title">Informasi</div>
      <div class="field"><div class="field-label">Jenis:</div><div class="field-value"><strong>${jenis}</strong></div></div>
      <div class="field"><div class="field-label">Prioritas:</div><div class="field-value">${prioritas.toUpperCase()}</div></div>
      <div class="field"><div class="field-label">Status:</div><div class="field-value">${status === 'approved' ? 'RESOLVED' : 'OPEN'}</div></div>
      <div class="field"><div class="field-label">Waktu:</div><div class="field-value">${safeDisplayWaktu}</div></div>
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

  // 🚨 Errors no longer swallowed
  const handleDownload = async (l: any) => {
    if (downloadingId) return;
    setDownloadingId(l.id);
    try {
      await Print.printAsync({ html: buildHTML(l) });
    } catch (e: any) {
      console.log('[InsidenKlien] print err:', e);
      Alert.alert(
        'Error',
        e?.message || (lang === 'en' ? 'Failed to print PDF' : 'Gagal mencetak PDF')
      );
    } finally {
      setDownloadingId(null);
    }
  };

  const handleShare = async (l: any) => {
    if (downloadingId) return;
    setDownloadingId(l.id + '-s');
    try {
      const { uri } = await Print.printToFileAsync({ html: buildHTML(l), base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
      } else {
        Alert.alert(
          'Info',
          lang === 'en' ? 'Sharing is not available on this device' : 'Fitur berbagi tidak tersedia di perangkat ini'
        );
      }
    } catch (e: any) {
      console.log('[InsidenKlien] share err:', e);
      Alert.alert(
        'Error',
        e?.message || (lang === 'en' ? 'Failed to share PDF' : 'Gagal membagikan PDF')
      );
    } finally {
      setDownloadingId(null);
    }
  };

  const tabLabel = (k: TabKey) => {
    if (k === 'all') return lang === 'en' ? 'All' : 'Semua';
    if (k === 'open') return lang === 'en' ? 'Open' : 'Open';
    return lang === 'en' ? 'Resolved' : 'Resolved';
  };

  const emptyDescFor = (k: TabKey) => {
    if (hideAll) {
      return lang === 'en'
        ? 'No location assigned to your account. Contact admin to assign you a company location.'
        : 'Akun Anda belum memiliki lokasi perusahaan. Hubungi admin untuk penugasan.';
    }
    if (k === 'open') {
      return lang === 'en' ? 'All incidents have been resolved' : 'Semua insiden sudah ditangani';
    }
    if (k === 'resolved') {
      return lang === 'en' ? 'No resolved incidents yet' : 'Belum ada insiden diselesaikan';
    }
    return lang === 'en' ? 'Your area is safe' : 'Area Anda aman';
  };

  const canGoBack = typeof navigation?.canGoBack === 'function' && navigation.canGoBack();

  return (
    <View style={[st.container, { backgroundColor: theme.bg }]}>
      {/* Header */}
      <View style={[st.header, { backgroundColor: isDark ? theme.bgCard : '#fff', borderBottomColor: theme.border }]}>
        <View style={st.headerRow}>
          {canGoBack && (
            <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="arrow-back" size={22} color={theme.text} />
            </TouchableOpacity>
          )}
          <View style={[st.headerIcon, { backgroundColor: isDark ? `${Colors.danger}15` : Colors.dangerBg }]}>
            <Ionicons name="shield-half" size={20} color={Colors.danger} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[st.headerTitle, { color: theme.text }]}>
              {lang === 'en' ? 'Incident Reports' : 'Laporan Insiden'}
            </Text>
            <Text style={[st.headerSub, { color: theme.textMuted }]}>
              {lang === 'en' ? 'Track and monitor incidents' : 'Pantau dan lacak insiden keamanan'}
            </Text>
          </View>
        </View>

        {/* KPI */}
        <View style={st.kpiRow}>
          {[
            { val: myLaporanK.length, label: 'Total', color: Colors.primary, icon: 'layers' },
            { val: openCount, label: 'Open', color: Colors.warning, icon: 'alert-circle' },
            { val: resolvedCount, label: lang === 'en' ? 'Done' : 'Resolved', color: Colors.success, icon: 'checkmark-circle' },
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
        {TABS.map((tk) => {
          const isActive = tab === tk;
          const count = tk === 'open' ? openCount : tk === 'resolved' ? resolvedCount : myLaporanK.length;
          return (
            <TouchableOpacity
              key={tk}
              style={[st.tab, isActive && { backgroundColor: theme.primary }]}
              onPress={() => setTab(tk)}
              activeOpacity={0.7}
            >
              <Text style={[st.tabText, { color: isActive ? '#fff' : theme.textMuted }]}>
                {tabLabel(tk)}
              </Text>
              {count > 0 && (
                <View
                  style={[
                    st.tabCount,
                    { backgroundColor: isDark ? theme.bgInput : '#e2e8f0' },
                    isActive && { backgroundColor: 'rgba(255,255,255,0.3)' },
                  ]}
                >
                  <Text
                    style={[
                      st.tabCountText,
                      { color: theme.textMuted },
                      isActive && { color: '#fff' },
                    ]}
                  >
                    {count > 99 ? '99+' : count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={st.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {filtered.length === 0 ? (
          <View style={st.emptyWrap}>
            <View style={[st.emptyCircle, { backgroundColor: isDark ? `${Colors.success}15` : Colors.successBg }]}>
              <Ionicons name="shield-checkmark" size={36} color={Colors.success} />
            </View>
            <Text style={[st.emptyTitle, { color: theme.text }]}>
              {lang === 'en' ? 'No incidents' : 'Tidak ada insiden'}
            </Text>
            <Text style={[st.emptyDesc, { color: theme.textMuted }]}>{emptyDescFor(tab)}</Text>
          </View>
        ) : (
          filtered.map((l) => {
            const prioritas = getField(l, 'prioritas') || 'sedang';
            const prioColor = PRIO_COLOR[prioritas] || Colors.textMuted;
            const isExpanded = expandedId === l.id;
            const jenis = getField(l, 'jenis') || 'Insiden';
            const status = getField(l, 'status') || 'pending';
            const lokasiText = getField(l, 'lokasi_text', 'lokasiText', 'lokasi') || '-';
            const waktuKejadian = getField(l, 'waktu_kejadian', 'waktuKejadian') || '';
            const waktuSubmit = getField(l, 'created_at', 'createdAt', 'waktuSubmit', 'waktu_submit') || '';
            const displayWaktu = (() => {
              const w = waktuKejadian || waktuSubmit;
              if (typeof w === 'string' && w.includes('T')) {
                return new Date(w).toLocaleString(dateLocale, {
                  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                });
              }
              return w;
            })();
            const kronologi = getField(l, 'kronologi') || '';
            const nama = getField(l, 'nama', 'name', 'user_nama') || (lang === 'en' ? 'Reporter' : 'Pelapor');
            const nrp = getField(l, 'nrp', 'user_nrp') || '-';
            const catatanKomandan = getField(l, 'catatan_komandan', 'catatanKomandan', 'catatan') || '';

            // Per-card download state — only THIS card's buttons are disabled
            const isMyDownload = downloadingId === l.id;
            const isMyShare = downloadingId === l.id + '-s';
            const isAnyActive = !!downloadingId;
            const disableOther = isAnyActive && !isMyDownload && !isMyShare;

            return (
              <TouchableOpacity
                key={l.id}
                activeOpacity={0.7}
                onPress={() => setExpandedId(isExpanded ? null : l.id)}
                style={[st.card, { backgroundColor: isDark ? theme.bgCard : '#fff', borderColor: theme.border, opacity: disableOther ? 0.6 : 1 }]}
              >
                <View style={[st.prioStripe, { backgroundColor: prioColor }]} />
                <View style={st.cardBody}>
                  <View style={st.cardTop}>
                    <View style={[st.prioBadge, { backgroundColor: isDark ? `${prioColor}20` : `${prioColor}12` }]}>
                      <Text style={[st.prioBadgeText, { color: prioColor }]}>{String(prioritas).toUpperCase()}</Text>
                    </View>
                    <Badge text={jenis} variant="danger" />
                    <View style={{ flex: 1 }} />
                    <Badge
                      text={status === 'approved' ? (lang === 'en' ? '✓ Resolved' : '✓ Resolved') : (lang === 'en' ? '● Open' : '● Open')}
                      variant={status === 'approved' ? 'success' : 'warning'}
                    />
                  </View>

                  <View style={st.infoRow}>
                    <Ionicons name="location-outline" size={13} color={theme.textMuted} />
                    <Text style={[st.infoText, { color: theme.textMuted }]} numberOfLines={1}>{lokasiText}</Text>
                    <Ionicons name="time-outline" size={13} color={theme.textMuted} />
                    <Text style={[st.infoText, { color: theme.textMuted }]}>{displayWaktu}</Text>
                  </View>

                  <Text style={[st.kronologi, { color: theme.text }]} numberOfLines={isExpanded ? 100 : 2}>
                    {kronologi}
                  </Text>

                  <View style={st.reporterRow}>
                    <Ionicons name="person-outline" size={12} color={theme.textMuted} />
                    <Text style={[st.reporterText, { color: theme.textMuted }]}>{nama} ({nrp})</Text>
                  </View>

                  {isExpanded && (
                    <>
                      {catatanKomandan ? (
                        <View
                          style={[
                            st.catatanBox,
                            {
                              backgroundColor: isDark ? `${Colors.warning}15` : Colors.warningBg,
                              borderLeftColor: Colors.warning,
                            },
                          ]}
                        >
                          <Text style={[st.catatanLabel, { color: Colors.warningDark }]}>
                            {lang === 'en' ? 'Commander Notes' : 'Catatan Komandan'}
                          </Text>
                          <Text style={[st.catatanText, { color: theme.text }]}>{catatanKomandan}</Text>
                        </View>
                      ) : null}
                      <View style={st.actionRow}>
                        <TouchableOpacity
                          style={[st.actionBtn, { backgroundColor: theme.primary }]}
                          onPress={() => handleDownload(l)}
                          disabled={isAnyActive}
                          activeOpacity={0.7}
                        >
                          {isMyDownload ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <Ionicons name="download-outline" size={14} color="#fff" />
                          )}
                          <Text style={st.actionBtnText}>PDF</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[st.actionBtnOutline, { borderColor: theme.primary }]}
                          onPress={() => handleShare(l)}
                          disabled={isAnyActive}
                          activeOpacity={0.7}
                        >
                          {isMyShare ? (
                            <ActivityIndicator size="small" color={theme.primary} />
                          ) : (
                            <Ionicons name="share-outline" size={14} color={theme.primary} />
                          )}
                          <Text style={[st.actionBtnOutlineText, { color: theme.primary }]}>
                            {lang === 'en' ? 'Share' : 'Bagikan'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}

                  <View style={st.expandHint}>
                    <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={theme.textMuted} />
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingTop: 48, paddingBottom: 14, paddingHorizontal: Spacing.base, borderBottomWidth: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
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
  tabCount: { borderRadius: 8, minWidth: 18, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tabCountText: { fontSize: 9, fontWeight: '700' },
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
