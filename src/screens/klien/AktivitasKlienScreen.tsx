/**
 * AKTIVITAS KLIEN - v24 DB-ALIGNED
 * Complete activity monitoring with tabs, real-time data, dark mode, filtering by company
 * DB tables: absensi, laporan_harian, laporan_kejadian, patroli
 * All field access normalized for snake_case (DB) + camelCase (store) compatibility
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius, Shadows } from '../../constants';
import { Card, Badge } from '../../components';
import { useDataStore } from '../../stores/dataStore';
import { useAuthStore } from '../../stores/authStore';
import { patroliApi } from '../../lib/apiClient';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

const { width: SW } = Dimensions.get('window');
const TABS = ['Semua', 'Absensi', 'Patroli', 'Laporan'] as const;
const TAB_ICONS: Record<string, string> = { Semua: 'layers', Absensi: 'finger-print', Patroli: 'navigate', Laporan: 'document-text' };

/* ── helper: flexible field access (snake_case DB ↔ camelCase store) ── */
function getField(obj: any, ...keys: string[]): any {
  if (!obj) return undefined;
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return undefined;
}

interface PatroliRecord {
  id: string;
  userName: string;
  routeName: string;
  startTime: string;
  endTime: string | null;
  status: 'active' | 'completed' | 'cancelled';
  checkpointScanned: number;   // DB: checkpoint_scanned
  checkpointTotal: number;     // DB: checkpoint_total
}

interface AktivitasItem {
  type: string; icon: string; color: string; bg: string;
  title: string; detail: string; time: string;
  badge: string; variant: 'success' | 'warning' | 'info' | 'default' | 'danger';
  sortTime: number;
}

export default function AktivitasKlienScreen() {
  const { t, lang } = useI18n();
  const { theme, isDark } = useTheme();
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<typeof TABS[number]>('Semua');
  const [refreshing, setRefreshing] = useState(false);

  // DB: users.lokasi_id
  const myLokasiId = getField(user, 'lokasi_id', 'lokasiId') || null;

  const rawAbsensi = useDataStore((s) => s.absensiRecords);
  const rawLaporanH = useDataStore((s) => s.laporanHarian);
  const rawLaporanK = useDataStore((s) => s.laporanKejadian);

  // Filter by lokasi_id (DB column)
  const absensi = useMemo(() => myLokasiId
    ? rawAbsensi.filter(a => String(getField(a, 'lokasi_id', 'lokasiId') || '') === String(myLokasiId))
    : rawAbsensi, [rawAbsensi, myLokasiId]);

  const laporanH = useMemo(() => myLokasiId
    ? rawLaporanH.filter(l => String(getField(l, 'lokasi_id', 'lokasiId') || '') === String(myLokasiId))
    : rawLaporanH, [rawLaporanH, myLokasiId]);

  const laporanK = useMemo(() => myLokasiId
    ? rawLaporanK.filter(l => String(getField(l, 'lokasi_id', 'lokasiId') || '') === String(myLokasiId))
    : rawLaporanK, [rawLaporanK, myLokasiId]);

  const [patroliData, setPatroliData] = useState<PatroliRecord[]>([]);
  const [loadingPatroli, setLoadingPatroli] = useState(false);

  const loadPatroli = useCallback(async () => {
    setLoadingPatroli(true);
    try {
      const data = await patroliApi.list('limit=30');
      if (data) {
        let filtered = data;
        if (myLokasiId) {
          filtered = data.filter((p: any) => {
            const pLokasiId = getField(p, 'lokasi_id', 'lokasiId');
            const userLokasiId = getField(p.user, 'lokasi_id', 'lokasiId');
            return String(pLokasiId) === String(myLokasiId) || String(userLokasiId) === String(myLokasiId);
          });
        }
        setPatroliData(filtered.map((p: any) => ({
          id: p.id,
          // DB: patroli JOIN users → users.nama
          userName: getField(p.user, 'nama', 'name') || 'Petugas',
          // DB: patroli.route_name
          routeName: getField(p, 'route_name', 'routeName') || 'Rute Patroli',
          // DB: patroli.start_time
          startTime: (() => {
            const st = getField(p, 'start_time', 'startTime');
            return st ? new Date(st).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-';
          })(),
          // DB: patroli.end_time
          endTime: (() => {
            const et = getField(p, 'end_time', 'endTime');
            return et ? new Date(et).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : null;
          })(),
          // DB: patroli.status
          status: p.status,
          // DB: patroli.checkpoint_scanned
          checkpointScanned: getField(p, 'checkpoint_scanned', 'checkpointScanned') || p.patrol_scans?.length || 0,
          // DB: patroli.checkpoint_total
          checkpointTotal: getField(p, 'checkpoint_total', 'checkpointTotal') || 0,
        })));
      }
    } catch (e) { console.error('Load patroli error:', e); }
    setLoadingPatroli(false);
  }, [myLokasiId]);

  useEffect(() => { loadPatroli(); }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([useDataStore.getState().loadAllData(), loadPatroli()]);
    setRefreshing(false);
  }, [loadPatroli]);

  const items = useMemo(() => {
    const list: AktivitasItem[] = [];
    const now = Date.now();

    if (tab === 'Semua' || tab === 'Absensi') {
      absensi.forEach(a => {
        // DB columns: tipe, status, pos_jaga, created_at
        // nama comes from JOIN users or store enrichment
        const tipe = getField(a, 'tipe') || 'masuk';
        const status = getField(a, 'status') || '';
        const nama = getField(a, 'nama', 'name', 'user_nama') || 'Petugas';
        const posJaga = getField(a, 'pos_jaga', 'posJaga') || '-';
        const waktu = getField(a, 'waktu', 'created_at', 'createdAt') || '';
        const tanggal = getField(a, 'tanggal', 'created_at', 'createdAt') || '';

        list.push({
          type: 'Absensi',
          icon: tipe === 'masuk' ? 'log-in' : 'log-out',
          color: status === 'hadir' ? Colors.success : status === 'terlambat' ? Colors.warning : Colors.danger,
          bg: status === 'hadir' ? Colors.successBg : status === 'terlambat' ? Colors.warningBg : Colors.dangerBg,
          title: `Absensi ${tipe === 'masuk' ? 'Masuk' : 'Keluar'}`,
          detail: `${nama} - ${posJaga}`,
          time: typeof waktu === 'string' && waktu.includes('T')
            ? new Date(waktu).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
            : waktu,
          badge: status === 'hadir' ? 'Hadir' : status === 'terlambat' ? 'Terlambat' : status || '-',
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

    if (tab === 'Semua' || tab === 'Patroli') {
      patroliData.forEach((p, idx) => {
        list.push({
          type: 'Patroli', icon: 'navigate',
          color: p.status === 'completed' ? Colors.success : p.status === 'active' ? Colors.primary : Colors.textMuted,
          bg: p.status === 'completed' ? Colors.successBg : p.status === 'active' ? Colors.primaryBg : Colors.bgGray,
          title: p.routeName,
          detail: `${p.userName} - ${p.checkpointScanned}/${p.checkpointTotal} CP${p.endTime ? '' : ' (sedang berjalan)'}`,
          time: p.endTime ? `${p.startTime} - ${p.endTime}` : `${p.startTime} - Aktif`,
          badge: p.status === 'completed' ? 'Selesai' : p.status === 'active' ? 'Aktif' : 'Batal',
          variant: p.status === 'completed' ? 'success' : p.status === 'active' ? 'info' : 'default',
          sortTime: now - idx,
        });
      });
    }

    if (tab === 'Semua' || tab === 'Laporan') {
      laporanH.forEach(l => {
        // DB columns: kondisi, status, pos_jaga, tanggal, created_at
        const kondisi = getField(l, 'kondisi') || 'aman';
        const status = getField(l, 'status') || 'pending';
        const nama = getField(l, 'nama', 'name', 'user_nama') || 'Petugas';
        const posJaga = getField(l, 'pos_jaga', 'posJaga') || '-';
        const tanggal = getField(l, 'tanggal') || '';
        const waktuSubmit = getField(l, 'created_at', 'createdAt', 'waktuSubmit', 'waktu_submit') || '';

        list.push({
          type: 'Laporan', icon: 'document-text',
          color: kondisi === 'aman' ? Colors.success : kondisi === 'ada_masalah' ? Colors.warning : Colors.danger,
          bg: kondisi === 'aman' ? Colors.successBg : kondisi === 'ada_masalah' ? Colors.warningBg : Colors.dangerBg,
          title: `Lap. Harian - ${kondisi === 'aman' ? 'Aman' : kondisi === 'ada_masalah' ? 'Masalah' : 'Perhatian'}`,
          detail: `${nama} - ${posJaga}`,
          time: typeof waktuSubmit === 'string' && waktuSubmit.includes('T')
            ? new Date(waktuSubmit).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
            : waktuSubmit,
          badge: status === 'approved' ? 'Disetujui' : status === 'pending' ? 'Pending' : status,
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

      laporanK.forEach(l => {
        // DB columns: jenis, prioritas, waktu_kejadian, lokasi_text, kronologi, status, created_at
        const prioritas = getField(l, 'prioritas') || 'sedang';
        const jenis = getField(l, 'jenis') || 'Insiden';
        const status = getField(l, 'status') || 'pending';
        const nama = getField(l, 'nama', 'name', 'user_nama') || 'Pelapor';
        // DB column is lokasi_text, NOT lokasi
        const lokasiText = getField(l, 'lokasi_text', 'lokasiText', 'lokasi') || '-';
        const waktuKejadian = getField(l, 'waktu_kejadian', 'waktuKejadian') || '';
        const waktuSubmit = getField(l, 'created_at', 'createdAt', 'waktuSubmit', 'waktu_submit') || '';
        const displayTime = waktuKejadian || waktuSubmit;

        list.push({
          type: 'Laporan', icon: 'alert-circle',
          color: prioritas === 'kritis' ? Colors.danger : prioritas === 'tinggi' ? Colors.warning : Colors.primary,
          bg: prioritas === 'kritis' ? Colors.dangerBg : prioritas === 'tinggi' ? Colors.warningBg : Colors.primaryBg,
          title: `Insiden: ${jenis}`,
          detail: `${nama} - ${lokasiText}`,
          time: typeof displayTime === 'string' && displayTime.includes('T')
            ? new Date(displayTime).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
            : displayTime,
          badge: status === 'approved' ? 'Resolved' : 'Open',
          variant: status === 'approved' ? 'success' : 'danger',
          sortTime: (() => {
            try { return new Date(displayTime).getTime(); } catch {}
            return now;
          })(),
        });
      });
    }

    // Sort by most recent first
    list.sort((a, b) => b.sortTime - a.sortTime);
    return list;
  }, [tab, absensi, laporanH, laporanK, patroliData]);

  const counts = { Absensi: absensi.length, Patroli: patroliData.length, Laporan: laporanH.length + laporanK.length };

  return (
    <View style={[st.container, { backgroundColor: theme.bg }]}>
      {/* Header */}
      <View style={[st.header, { backgroundColor: isDark ? theme.bgCard : '#fff', borderBottomColor: theme.border }]}>
        <View style={st.headerRow}>
          <View style={[st.headerIcon, { backgroundColor: isDark ? `${theme.primary}15` : Colors.primaryBg }]}>
            <Ionicons name="pulse" size={20} color={theme.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[st.headerTitle, { color: theme.text }]}>{lang === 'en' ? 'Activity Monitor' : 'Monitor Aktivitas'}</Text>
            <Text style={[st.headerSub, { color: theme.textMuted }]}>{lang === 'en' ? 'Real-time security activity' : 'Aktivitas keamanan real-time'}</Text>
          </View>
        </View>

        {/* Summary KPIs */}
        <View style={st.summaryRow}>
          {[
            { val: absensi.length, label: 'Absensi', color: Colors.primary, icon: 'finger-print' },
            { val: patroliData.length, label: 'Patroli', color: Colors.success, icon: 'navigate' },
            { val: laporanH.length, label: 'Lap. Harian', color: Colors.warning, icon: 'document-text' },
            { val: laporanK.length, label: 'Insiden', color: Colors.danger, icon: 'alert-circle' },
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
        {TABS.map(t2 => {
          const isActive = tab === t2;
          const count = t2 === 'Semua' ? null : counts[t2 as keyof typeof counts] || 0;
          return (
            <TouchableOpacity key={t2} style={[st.tab, isActive && { backgroundColor: theme.primary }]}
              onPress={() => setTab(t2)} activeOpacity={0.7}>
              <Ionicons name={TAB_ICONS[t2] as any} size={14} color={isActive ? '#fff' : theme.textMuted} />
              <Text style={[st.tabText, { color: isActive ? '#fff' : theme.textMuted }]}>{t2}</Text>
              {count !== null && count > 0 && (
                <View style={[st.tabBadge, isActive && { backgroundColor: 'rgba(255,255,255,0.3)' }]}>
                  <Text style={[st.tabBadgeText, isActive && { color: '#fff' }]}>{count}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={st.content} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}>

        {loadingPatroli && (tab === 'Patroli' || tab === 'Semua') && (
          <View style={st.loadingRow}>
            <ActivityIndicator size="small" color={theme.primary} />
            <Text style={[st.loadingText, { color: theme.textMuted }]}>Memuat data patroli...</Text>
          </View>
        )}

        {items.length === 0 && !loadingPatroli ? (
          <View style={st.emptyWrap}>
            <View style={[st.emptyCircle, { backgroundColor: isDark ? `${theme.primary}15` : Colors.primaryBg }]}>
              <Ionicons name={TAB_ICONS[tab] as any || 'layers'} size={36} color={theme.primary} />
            </View>
            <Text style={[st.emptyTitle, { color: theme.text }]}>{lang === 'en' ? 'No activity yet' : 'Belum ada aktivitas'}</Text>
            <Text style={[st.emptyDesc, { color: theme.textMuted }]}>
              {tab === 'Patroli' ? 'Belum ada data patroli yang tercatat' :
               tab === 'Absensi' ? 'Belum ada record absensi hari ini' :
               tab === 'Laporan' ? 'Belum ada laporan yang dikirim' :
               'Aktivitas akan muncul setelah ada data'}
            </Text>
          </View>
        ) : items.map((item, idx) => (
          <View key={`${item.type}-${idx}`} style={[st.card, { backgroundColor: isDark ? theme.bgCard : '#fff', borderColor: theme.border }]}>
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
        ))}
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
  summaryRow: { flexDirection: 'row', gap: 6 },
  summaryItem: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10, gap: 2 },
  summaryVal: { fontSize: 16, fontWeight: '900' },
  summaryLabel: { fontSize: 9, fontWeight: '600' },
  tabsContainer: { flexDirection: 'row', gap: 6, paddingHorizontal: Spacing.base, paddingVertical: 10, borderBottomWidth: 1 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 10, backgroundColor: 'transparent' },
  tabText: { fontSize: 11, fontWeight: '700' },
  tabBadge: { backgroundColor: '#ddd', borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tabBadgeText: { fontSize: 9, fontWeight: '700', color: '#666' },
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