import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../constants';
import { Card, Badge, Button } from '../../components';
import { useAuthStore } from '../../stores/authStore';
import { laporanApi } from '../../lib/apiClient';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

const TABS = ['Semua', 'Harian', 'Kejadian'];
const SHORT_MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
function fmtTanggal(iso?: string): string {
  if (!iso) return '-';
  // [Audit 2D] Kolom DATE kini string 'YYYY-MM-DD' (backend audit 2A) → parse
  // sebagai tanggal LOKAL agar tidak bergeser sehari & tampil "DD MMM YYYY".
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  const d = m ? new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)) : new Date(iso);
  if (isNaN(d.getTime())) return '-';
  return `${d.getDate()} ${SHORT_MONTHS_ID[d.getMonth()]} ${d.getFullYear()}`;
}
function fmtJam(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

export default function RiwayatLaporanScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { theme, isDark } = useTheme();
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState('Semua');

  const uid = user?.id;
  // [3-6] Ambil laporan milik user LANGSUNG dari backend (backend men-scope
  // anggota ke user_id-nya) dengan paginasi, BUKAN memfilter 50 record global.
  const [harian, setHarian] = useState<any[]>([]);
  const [kejadian, setKejadian] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [limit, setLimit] = useState(50);
  const [hasMore, setHasMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    if (!uid) { setHarian([]); setKejadian([]); setHasMore(false); return; }
    setLoading(true);
    try {
      const base = `user_id=${encodeURIComponent(uid)}&limit=${limit}&page=1&sort=created_at&order=desc`;
      const [hRes, kRes]: any[] = await Promise.all([
        laporanApi.harianList(base),
        laporanApi.kejadianList(base),
      ]);
      const hRows: any[] = Array.isArray(hRes) ? hRes : (hRes?.data || hRes?.items || []);
      const kRows: any[] = Array.isArray(kRes) ? kRes : (kRes?.data || kRes?.items || []);
      setHarian(hRows.map((l: any) => ({
        id: l.id, tipe: 'Harian' as const, desc: l.kondisi || l.aktivitas || '-', status: l.status || 'pending',
        tanggal: fmtTanggal(l.tanggal || l.created_at), waktuSubmit: fmtJam(l.created_at), catatanKomandan: l.catatan_komandan || '', // [Audit 2D] format DATE
        _ts: new Date(l.created_at).getTime() || 0,
      })));
      setKejadian(kRows.map((l: any) => ({
        id: l.id, tipe: 'Kejadian' as const, desc: l.jenis || '-', status: l.status || 'pending',
        tanggal: fmtTanggal(l.created_at), waktuSubmit: fmtJam(l.created_at), catatanKomandan: l.catatan_komandan || '',
        _ts: new Date(l.created_at).getTime() || 0,
      })));
      const hNext = hRes?.pagination?.hasNext, kNext = kRes?.pagination?.hasNext;
      setHasMore(!!hNext || !!kNext);
    } catch {
      setHarian([]); setKejadian([]); setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [uid, limit]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await fetchData(); } catch {}
    finally { setRefreshing(false); }
  }, [fetchData]);

  const all = [...harian, ...kejadian].sort((a, b) => (b._ts || 0) - (a._ts || 0));
  const filtered = tab === 'Semua' ? all : all.filter((l) => l.tipe === tab);

  const statusVar = (s: string): 'success' | 'warning' | 'default' | 'danger' => {
    if (s === 'approved') return 'success';
    if (s === 'revision') return 'warning';
    if (s === 'rejected') return 'danger';
    return 'default';
  };

  return (
    <View style={st.container}>
      <View style={[st.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn}><Ionicons name="arrow-back" size={24} color={Colors.textPrimary} /></TouchableOpacity>
        <Text style={st.headerTitle}>Riwayat Laporan</Text>
        <View style={{ width: 40 }} />
      </View>
      <View style={st.tabsRow}>
        {TABS.map((t) => (
          <TouchableOpacity key={t} style={[st.tab, tab === t && st.tabActive]} onPress={() => setTab(t)}>
            <Text style={[st.tabText, tab === t && st.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView
        contentContainerStyle={st.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {loading && filtered.length === 0 ? (
          <View style={st.emptyWrap}><ActivityIndicator color={theme.primary} /></View>
        ) : !uid ? (
          <View style={st.emptyWrap}><Ionicons name="person-outline" size={48} color={Colors.textMuted} /><Text style={st.emptyText}>Belum login</Text></View>
        ) : filtered.length === 0 ? (
          <View style={st.emptyWrap}><Ionicons name="document-outline" size={48} color={Colors.textMuted} /><Text style={st.emptyText}>Belum ada laporan</Text></View>
        ) : filtered.map((l, idx) => (
          <Card key={idx} style={st.card}>
            <View style={st.cardTop}>
              <Badge text={l.tipe} variant={l.tipe === 'Kejadian' ? 'danger' : 'info'} />
              <Badge text={l.status === 'approved' ? 'Disetujui' : l.status === 'revision' ? 'Revisi' : l.status === 'rejected' ? 'Ditolak' : 'Pending'} variant={statusVar(l.status)} />
              <Text style={st.cardId}>{l.id}</Text>
            </View>
            <Text style={st.cardDesc}>{l.desc}</Text>
            <Text style={st.cardMeta}>{(l as any).tanggal || '-'} • {l.waktuSubmit}</Text>
            {l.catatanKomandan ? <Text style={st.catatan}>Catatan: {l.catatanKomandan}</Text> : null}
          </Card>
        ))}
        {hasMore && filtered.length > 0 && (
          <Button title={loading ? 'Memuat...' : 'Muat lebih banyak'} variant="outline" size="medium" fullWidth disabled={loading} onPress={() => setLimit((n) => n + 50)} style={{ marginTop: 8 }} />
        )}
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}
const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgLight },
  header: { flexDirection: 'row', alignItems: 'center', paddingBottom: 12, paddingHorizontal: Spacing.base, backgroundColor: Colors.bgWhite, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { ...Typography.h3, color: Colors.textPrimary, flex: 1, textAlign: 'center' },
  tabsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: Spacing.base, paddingVertical: 10, backgroundColor: Colors.bgWhite, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: Radius.md, backgroundColor: Colors.bgGray },
  tabActive: { backgroundColor: Colors.primary },
  tabText: { ...Typography.smallBold, color: Colors.textSecondary },
  tabTextActive: { color: '#fff' },
  content: { padding: Spacing.base },
  emptyWrap: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyText: { ...Typography.body, color: Colors.textMuted },
  card: { marginBottom: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  cardId: { ...Typography.caption, color: Colors.textMuted, marginLeft: 'auto' },
  cardDesc: { ...Typography.bodyBold, color: Colors.textPrimary },
  cardMeta: { ...Typography.caption, color: Colors.textMuted, marginTop: 4 },
  catatan: { ...Typography.caption, color: Colors.warning, marginTop: 6, fontStyle: 'italic' },
});
