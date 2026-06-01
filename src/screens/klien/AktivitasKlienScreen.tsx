/**
 * AKTIVITAS KLIEN - v25 (Bug-Fix Pass on top of v24)
 *
 * FIXES (v25):
 *  🚨 PATROLI TAB ALWAYS SHOWED 0! `patroliApi.list()` returns paginated
 *     `{data: [...], pagination}` but the original code did `data.filter(...)`
 *     on the wrapper object — which threw "data.filter is not a function" and
 *     was caught by `try/catch`, leaving `patroliData = []` forever. Now uses
 *     extractArray() helper (same pattern as supervisor's AnalyticsScreen fix).
 *  🚨 `getField(p.user, ...)` CRASHED when `p.user` was undefined (backend may
 *     not always JOIN). Now guards with `p.user || {}`.
 *  🚨 PRIVACY LEAK — klien with no `lokasi_id` saw ALL companies' activity.
 *     Now shows empty state with explanation instead.
 *
 *  ✅ TAB labels now i18n'd (constants are still string literals for routing,
 *     but display labels use t() / lang switch).
 *  ✅ Status badge labels translated ('Hadir' → 'Present', etc.).
 *  ✅ `useEffect` dep array now includes `loadPatroli` for proper re-fetch.
 *  ✅ Patroli sort uses real start_time instead of fragile `now - idx`.
 *  ✅ `tabBadge` hardcoded `#ddd`/`#666` → theme-aware bg/text.
 *  ✅ Locale-aware date formatting (id-ID vs en-US).
 *  ✅ `p.status === 'cancelled'` badge text properly shows 'Cancelled'/'Batal'.
 *  ✅ Empty state desc fully translated for all 4 tabs.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../constants';
import { Badge } from '../../components';
import { useDataStore } from '../../stores/dataStore';
import { useAuthStore } from '../../stores/authStore';
import { patroliApi } from '../../lib/apiClient';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

const { width: SW } = Dimensions.get('window');
type TabKey = 'all' | 'absensi' | 'patroli' | 'laporan';
const TABS: TabKey[] = ['all', 'absensi', 'patroli', 'laporan'];
const TAB_ICONS: Record<TabKey, string> = {
  all: 'layers',
  absensi: 'finger-print',
  patroli: 'navigate',
  laporan: 'document-text',
};

function getField(obj: any, ...keys: string[]): any {
  if (!obj) return undefined;
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return undefined;
}

// 🚨 CRITICAL: handles BOTH raw arrays AND paginated {data: [...]} responses.
function extractArray(result: any): any[] {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.data)) return result.data;
  if (result && Array.isArray(result.rows)) return result.rows;
  if (result && Array.isArray(result.items)) return result.items;
  return [];
}

interface PatroliRecord {
  id: string;
  userName: string;
  routeName: string;
  startTime: string;       // formatted "HH:MM"
  endTime: string | null;  // formatted "HH:MM" or null
  startEpoch: number;      // for sort
  status: 'active' | 'completed' | 'cancelled';
  checkpointScanned: number;
  checkpointTotal: number;
}

interface AktivitasItem {
  type: string; icon: string; color: string; bg: string;
  title: string; detail: string; time: string;
  badge: string; variant: 'success' | 'warning' | 'info' | 'default' | 'danger';
  sortTime: number;
}

export default function AktivitasKlienScreen() {
  const insets = useSafeAreaInsets();
  const { t, lang } = useI18n();
  const { theme, isDark } = useTheme();
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<TabKey>('all');
  const [refreshing, setRefreshing] = useState(false);

  const myLokasiId = getField(user, 'lokasi_id', 'lokasiId') || null;
  const isKlien = user?.role === 'klien';
  const hideAll = isKlien && !myLokasiId;

  const rawAbsensi = useDataStore((s) => s.absensiRecords);
  const rawLaporanH = useDataStore((s) => s.laporanHarian);
  const rawLaporanK = useDataStore((s) => s.laporanKejadian);

  // Filter by lokasi_id; if klien without lokasi → empty for privacy
  const absensi = useMemo(() => {
    if (hideAll) return [];
    if (!myLokasiId) return rawAbsensi;
    return rawAbsensi.filter((a) =>
      String(getField(a, 'lokasi_id', 'lokasiId') || '') === String(myLokasiId)
    );
  }, [rawAbsensi, myLokasiId, hideAll]);

  const laporanH = useMemo(() => {
    if (hideAll) return [];
    if (!myLokasiId) return rawLaporanH;
    return rawLaporanH.filter((l) =>
      String(getField(l, 'lokasi_id', 'lokasiId') || '') === String(myLokasiId)
    );
  }, [rawLaporanH, myLokasiId, hideAll]);

  const laporanK = useMemo(() => {
    if (hideAll) return [];
    if (!myLokasiId) return rawLaporanK;
    return rawLaporanK.filter((l) =>
      String(getField(l, 'lokasi_id', 'lokasiId') || '') === String(myLokasiId)
    );
  }, [rawLaporanK, myLokasiId, hideAll]);

  const [patroliData, setPatroliData] = useState<PatroliRecord[]>([]);
  const [loadingPatroli, setLoadingPatroli] = useState(false);

  const dateLocale = lang === 'en' ? 'en-US' : 'id-ID';

  // 🚨 CRITICAL FIX: extractArray() unwraps the paginated response
  const loadPatroli = useCallback(async () => {
    if (hideAll) {
      setPatroliData([]);
      return;
    }
    setLoadingPatroli(true);
    try {
      const result = await patroliApi.list('limit=30');
      const arr = extractArray(result); // ← fixes "data.filter is not a function"

      let filtered = arr;
      if (myLokasiId) {
        filtered = arr.filter((p: any) => {
          const pLokasiId = getField(p, 'lokasi_id', 'lokasiId');
          const userLokasiId = getField(p.user || {}, 'lokasi_id', 'lokasiId'); // guard against undefined
          return String(pLokasiId || '') === String(myLokasiId) ||
                 String(userLokasiId || '') === String(myLokasiId);
        });
      }

      setPatroliData(
        filtered.map((p: any) => {
          const stRaw = getField(p, 'start_time', 'startTime');
          const etRaw = getField(p, 'end_time', 'endTime');
          const stEpoch = stRaw ? new Date(stRaw).getTime() : Date.now();
          return {
            id: String(p.id),
            userName: getField(p.user || {}, 'nama', 'name') || (lang === 'en' ? 'Officer' : 'Petugas'),
            routeName: getField(p, 'route_name', 'routeName') || (lang === 'en' ? 'Patrol Route' : 'Rute Patroli'),
            startTime: stRaw
              ? new Date(stRaw).toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })
              : '-',
            endTime: etRaw
              ? new Date(etRaw).toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })
              : null,
            startEpoch: isNaN(stEpoch) ? Date.now() : stEpoch,
            status: p.status || 'active',
            checkpointScanned: getField(p, 'checkpoint_scanned', 'checkpointScanned') || (Array.isArray(p.patrol_scans) ? p.patrol_scans.length : 0),
            checkpointTotal: getField(p, 'checkpoint_total', 'checkpointTotal') || 0,
          };
        })
      );
    } catch (e: any) {
      console.log('[AktivitasKlien] Load patroli error:', e?.message);
    } finally {
      setLoadingPatroli(false);
    }
  }, [myLokasiId, hideAll, lang, dateLocale]);

  // Now properly listed in deps; refetches when user/lang change
  useEffect(() => {
    loadPatroli();
  }, [loadPatroli]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([useDataStore.getState().loadAllData(), loadPatroli()]);
    } catch {}
    finally {
      setRefreshing(false);
    }
  }, [loadPatroli]);

  // ===== Label helpers (i18n-aware) =====
  const labelHadir = lang === 'en' ? 'Present' : 'Hadir';
  const labelTerlambat = lang === 'en' ? 'Late' : 'Terlambat';
  const labelMasukIn = lang === 'en' ? 'Clock-in' : 'Masuk';
  const labelKeluarOut = lang === 'en' ? 'Clock-out' : 'Keluar';
  const labelInProgress = lang === 'en' ? '(in progress)' : '(sedang berjalan)';
  const labelActive = lang === 'en' ? 'Active' : 'Aktif';
  const labelSelesai = lang === 'en' ? 'Done' : 'Selesai';
  const labelBatal = lang === 'en' ? 'Cancelled' : 'Batal';
  const labelDisetujui = lang === 'en' ? 'Approved' : 'Disetujui';
  const labelPending = lang === 'en' ? 'Pending' : 'Pending';
  const labelResolved = lang === 'en' ? 'Resolved' : 'Resolved';
  const labelOpen = lang === 'en' ? 'Open' : 'Open';
  const labelAman = lang === 'en' ? 'Safe' : 'Aman';
  const labelMasalah = lang === 'en' ? 'Issue' : 'Masalah';
  const labelPerhatian = lang === 'en' ? 'Alert' : 'Perhatian';

  const items = useMemo(() => {
    const list: AktivitasItem[] = [];
    const now = Date.now();

    if (tab === 'all' || tab === 'absensi') {
      absensi.forEach((a) => {
        const tipe = getField(a, 'tipe') || 'masuk';
        const status = getField(a, 'status') || '';
        const nama = getField(a, 'nama', 'name', 'user_nama') || (lang === 'en' ? 'Officer' : 'Petugas');
        const posJaga = getField(a, 'pos_jaga', 'posJaga') || '-';
        const waktu = getField(a, 'waktu', 'created_at', 'createdAt') || '';
        const tanggal = getField(a, 'tanggal', 'created_at', 'createdAt') || '';

        list.push({
          type: 'Absensi',
          icon: tipe === 'masuk' ? 'log-in' : 'log-out',
          color: status === 'hadir' ? Colors.success : status === 'terlambat' ? Colors.warning : Colors.danger,
          bg: status === 'hadir' ? Colors.successBg : status === 'terlambat' ? Colors.warningBg : Colors.dangerBg,
          title: `${lang === 'en' ? 'Attendance' : 'Absensi'} ${tipe === 'masuk' ? labelMasukIn : labelKeluarOut}`,
          detail: `${nama} - ${posJaga}`,
          time: typeof waktu === 'string' && waktu.includes('T')
            ? new Date(waktu).toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })
            : waktu,
          badge: status === 'hadir' ? labelHadir : status === 'terlambat' ? labelTerlambat : status || '-',
          variant: status === 'hadir' ? 'success' : 'warning',
          sortTime: (() => {
            try {
              if (tanggal && waktu && !waktu.includes('T')) return new Date(`${tanggal}T${waktu}`).getTime();
              if (waktu && waktu.includes('T')) return new Date(waktu).getTime();
              if (tanggal) return new Date(tanggal).getTime();
            } catch {}
            return now;
          })(),
        });
      });
    }

    if (tab === 'all' || tab === 'patroli') {
      patroliData.forEach((p) => {
        const badgeTxt =
          p.status === 'completed' ? labelSelesai :
          p.status === 'active' ? labelActive :
          labelBatal;
        const variant: AktivitasItem['variant'] =
          p.status === 'completed' ? 'success' :
          p.status === 'active' ? 'info' :
          'default';
        list.push({
          type: 'Patroli',
          icon: 'navigate',
          color: p.status === 'completed' ? Colors.success : p.status === 'active' ? Colors.primary : Colors.textMuted,
          bg: p.status === 'completed' ? Colors.successBg : p.status === 'active' ? Colors.primaryBg : Colors.bgGray,
          title: p.routeName,
          detail: `${p.userName} - ${p.checkpointScanned}/${p.checkpointTotal} CP${p.endTime ? '' : ' ' + labelInProgress}`,
          time: p.endTime ? `${p.startTime} - ${p.endTime}` : `${p.startTime} - ${labelActive}`,
          badge: badgeTxt,
          variant,
          sortTime: p.startEpoch, // 🚨 real time, not "now - idx"
        });
      });
    }

    if (tab === 'all' || tab === 'laporan') {
      laporanH.forEach((l) => {
        const kondisi = getField(l, 'kondisi') || 'aman';
        const status = getField(l, 'status') || 'pending';
        const nama = getField(l, 'nama', 'name', 'user_nama') || (lang === 'en' ? 'Officer' : 'Petugas');
        const posJaga = getField(l, 'pos_jaga', 'posJaga') || '-';
        const tanggal = getField(l, 'tanggal') || '';
        const waktuSubmit = getField(l, 'created_at', 'createdAt', 'waktuSubmit', 'waktu_submit') || '';

        const kondisiLabel = kondisi === 'aman' ? labelAman :
                             kondisi === 'ada_masalah' ? labelMasalah : labelPerhatian;

        list.push({
          type: 'Laporan',
          icon: 'document-text',
          color: kondisi === 'aman' ? Colors.success : kondisi === 'ada_masalah' ? Colors.warning : Colors.danger,
          bg: kondisi === 'aman' ? Colors.successBg : kondisi === 'ada_masalah' ? Colors.warningBg : Colors.dangerBg,
          title: `${lang === 'en' ? 'Daily Report' : 'Lap. Harian'} - ${kondisiLabel}`,
          detail: `${nama} - ${posJaga}`,
          time: typeof waktuSubmit === 'string' && waktuSubmit.includes('T')
            ? new Date(waktuSubmit).toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })
            : waktuSubmit,
          badge: status === 'approved' ? labelDisetujui : status === 'pending' ? labelPending : status,
          variant: status === 'approved' ? 'success' : 'default',
          sortTime: (() => {
            try {
              if (waktuSubmit && waktuSubmit.includes('T')) return new Date(waktuSubmit).getTime();
              if (tanggal && waktuSubmit) return new Date(`${tanggal}T${waktuSubmit}`).getTime();
              if (tanggal) return new Date(tanggal).getTime();
            } catch {}
            return now;
          })(),
        });
      });

      laporanK.forEach((l) => {
        const prioritas = getField(l, 'prioritas') || 'sedang';
        const jenis = getField(l, 'jenis') || (lang === 'en' ? 'Incident' : 'Insiden');
        const status = getField(l, 'status') || 'pending';
        const nama = getField(l, 'nama', 'name', 'user_nama') || (lang === 'en' ? 'Reporter' : 'Pelapor');
        const lokasiText = getField(l, 'lokasi_text', 'lokasiText', 'lokasi') || '-';
        const waktuKejadian = getField(l, 'waktu_kejadian', 'waktuKejadian') || '';
        const waktuSubmit = getField(l, 'created_at', 'createdAt', 'waktuSubmit', 'waktu_submit') || '';
        const displayTime = waktuKejadian || waktuSubmit;

        list.push({
          type: 'Laporan',
          icon: 'alert-circle',
          color: prioritas === 'kritis' ? Colors.danger : prioritas === 'tinggi' ? Colors.warning : Colors.primary,
          bg: prioritas === 'kritis' ? Colors.dangerBg : prioritas === 'tinggi' ? Colors.warningBg : Colors.primaryBg,
          title: `${lang === 'en' ? 'Incident' : 'Insiden'}: ${jenis}`,
          detail: `${nama} - ${lokasiText}`,
          time: typeof displayTime === 'string' && displayTime.includes('T')
            ? new Date(displayTime).toLocaleString(dateLocale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
            : displayTime,
          badge: status === 'approved' ? labelResolved : labelOpen,
          variant: status === 'approved' ? 'success' : 'danger',
          sortTime: (() => {
            try { return new Date(displayTime).getTime(); } catch { return now; }
          })(),
        });
      });
    }

    list.sort((a, b) => b.sortTime - a.sortTime);
    return list;
  }, [tab, absensi, laporanH, laporanK, patroliData, lang, dateLocale,
      labelHadir, labelTerlambat, labelMasukIn, labelKeluarOut, labelInProgress,
      labelActive, labelSelesai, labelBatal, labelDisetujui, labelPending,
      labelResolved, labelOpen, labelAman, labelMasalah, labelPerhatian]);

  const counts = {
    absensi: absensi.length,
    patroli: patroliData.length,
    laporan: laporanH.length + laporanK.length,
  };

  const tabLabel = (k: TabKey): string => {
    if (k === 'all') return lang === 'en' ? 'All' : 'Semua';
    if (k === 'absensi') return lang === 'en' ? 'Attendance' : 'Absensi';
    if (k === 'patroli') return 'Patroli';
    if (k === 'laporan') return lang === 'en' ? 'Reports' : 'Laporan';
    return k;
  };

  const emptyDescFor = (k: TabKey) => {
    if (hideAll) {
      return lang === 'en'
        ? 'No location assigned to your account. Contact admin to assign you a company location.'
        : 'Akun Anda belum memiliki lokasi perusahaan. Hubungi admin.';
    }
    if (k === 'patroli') {
      return lang === 'en' ? 'No patrol records yet' : 'Belum ada data patroli yang tercatat';
    }
    if (k === 'absensi') {
      return lang === 'en' ? 'No attendance records yet' : 'Belum ada record absensi';
    }
    if (k === 'laporan') {
      return lang === 'en' ? 'No reports submitted yet' : 'Belum ada laporan yang dikirim';
    }
    return lang === 'en' ? 'Activity will appear here once data is available' : 'Aktivitas akan muncul setelah ada data';
  };

  return (
    <View style={[st.container, { backgroundColor: theme.bg }]}>
      {/* Header */}
      <View style={[st.header, { paddingTop: insets.top + 12 }, { backgroundColor: isDark ? theme.bgCard : '#fff', borderBottomColor: theme.border }]}>
        <View style={st.headerRow}>
          <View style={[st.headerIcon, { backgroundColor: isDark ? `${theme.primary}15` : Colors.primaryBg }]}>
            <Ionicons name="pulse" size={20} color={theme.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[st.headerTitle, { color: theme.text }]}>
              {lang === 'en' ? 'Activity Monitor' : 'Monitor Aktivitas'}
            </Text>
            <Text style={[st.headerSub, { color: theme.textMuted }]}>
              {lang === 'en' ? 'Real-time security activity' : 'Aktivitas keamanan real-time'}
            </Text>
          </View>
        </View>

        {/* Summary KPIs */}
        <View style={st.summaryRow}>
          {[
            { val: absensi.length, label: lang === 'en' ? 'Attendance' : 'Absensi', color: Colors.primary, icon: 'finger-print' },
            { val: patroliData.length, label: 'Patroli', color: Colors.success, icon: 'navigate' },
            { val: laporanH.length, label: lang === 'en' ? 'Daily' : 'Lap. Harian', color: Colors.warning, icon: 'document-text' },
            { val: laporanK.length, label: lang === 'en' ? 'Incidents' : 'Insiden', color: Colors.danger, icon: 'alert-circle' },
          ].map((s2, i) => (
            <View key={i} style={[st.summaryItem, { backgroundColor: isDark ? `${s2.color}10` : `${s2.color}08` }]}>
              <Ionicons name={s2.icon as any} size={14} color={s2.color} />
              <Text style={[st.summaryVal, { color: s2.color }]}>{s2.val}</Text>
              <Text style={[st.summaryLabel, { color: theme.textMuted }]}>{s2.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Tabs */}
      <View style={[st.tabsContainer, { backgroundColor: isDark ? theme.bgCard : '#fff', borderBottomColor: theme.border }]}>
        {TABS.map((tk) => {
          const isActive = tab === tk;
          const count = tk === 'all' ? null : counts[tk as keyof typeof counts] || 0;
          return (
            <TouchableOpacity
              key={tk}
              style={[st.tab, isActive && { backgroundColor: theme.primary }]}
              onPress={() => setTab(tk)}
              activeOpacity={0.7}
            >
              <Ionicons name={TAB_ICONS[tk] as any} size={14} color={isActive ? '#fff' : theme.textMuted} />
              <Text style={[st.tabText, { color: isActive ? '#fff' : theme.textMuted }]}>{tabLabel(tk)}</Text>
              {count !== null && count > 0 && (
                <View
                  style={[
                    st.tabBadge,
                    { backgroundColor: isDark ? theme.bgInput : '#e2e8f0' },
                    isActive && { backgroundColor: 'rgba(255,255,255,0.3)' },
                  ]}
                >
                  <Text
                    style={[
                      st.tabBadgeText,
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
        contentContainerStyle={[st.content, { paddingBottom: insets.bottom + 16 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {loadingPatroli && (tab === 'patroli' || tab === 'all') && (
          <View style={st.loadingRow}>
            <ActivityIndicator size="small" color={theme.primary} />
            <Text style={[st.loadingText, { color: theme.textMuted }]}>
              {lang === 'en' ? 'Loading patrol data...' : 'Memuat data patroli...'}
            </Text>
          </View>
        )}

        {items.length === 0 && !loadingPatroli ? (
          <View style={st.emptyWrap}>
            <View style={[st.emptyCircle, { backgroundColor: isDark ? `${theme.primary}15` : Colors.primaryBg }]}>
              <Ionicons name={(TAB_ICONS[tab as TabKey] || 'layers') as any} size={36} color={theme.primary} />
            </View>
            <Text style={[st.emptyTitle, { color: theme.text }]}>
              {lang === 'en' ? 'No activity yet' : 'Belum ada aktivitas'}
            </Text>
            <Text style={[st.emptyDesc, { color: theme.textMuted }]}>{emptyDescFor(tab)}</Text>
          </View>
        ) : (
          items.map((item, idx) => (
            <View
              key={`${item.type}-${idx}`}
              style={[st.card, { backgroundColor: isDark ? theme.bgCard : '#fff', borderColor: theme.border }]}
            >
              <View style={st.cardRow}>
                <View style={[st.iconCircle, { backgroundColor: isDark ? `${item.color}18` : item.bg }]}>
                  <Ionicons name={item.icon as any} size={18} color={item.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[st.cardTitle, { color: theme.text }]}>{item.title}</Text>
                  <Text style={[st.cardDetail, { color: theme.textMuted }]}>{item.detail}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Badge text={item.badge} variant={item.variant} />
                  <Text style={[st.cardTime, { color: theme.textMuted }]}>{item.time}</Text>
                </View>
              </View>
            </View>
          ))
        )}
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingBottom: 14, paddingHorizontal: Spacing.base, borderBottomWidth: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  headerIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  headerSub: { fontSize: 11, marginTop: 1 },
  summaryRow: { flexDirection: 'row', gap: 6 },
  summaryItem: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10, gap: 2 },
  summaryVal: { fontSize: 16, fontWeight: '900' },
  summaryLabel: { fontSize: 9, fontWeight: '600' },
  tabsContainer: { flexDirection: 'row', gap: 6, paddingHorizontal: Spacing.base, paddingVertical: 10, borderBottomWidth: 1 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 10, backgroundColor: 'transparent' },
  tabText: { fontSize: 11, fontWeight: '700' },
  tabBadge: { borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tabBadgeText: { fontSize: 9, fontWeight: '700' },
  content: { padding: Spacing.base },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  loadingText: { fontSize: 12 },
  emptyWrap: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyCircle: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '800' },
  emptyDesc: { fontSize: 12, textAlign: 'center', paddingHorizontal: 32 },
  card: { marginBottom: 8, padding: 14, borderRadius: 14, borderWidth: 1 },
  cardRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  iconCircle: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 13, fontWeight: '700' },
  cardDetail: { fontSize: 11, marginTop: 1 },
  cardTime: { fontSize: 10 },
});
============================================================