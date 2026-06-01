import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../constants';
import { Card, Badge } from '../../components';
import { useAuthStore } from '../../stores/authStore';
import { useDataStore } from '../../stores/dataStore';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

const TABS = ['Semua', 'Harian', 'Kejadian'];

export default function RiwayatLaporanScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { theme, isDark } = useTheme();
  const user = useAuthStore((s) => s.user);
  const laporanHarian = useDataStore((s) => s.laporanHarian);
  const laporanKejadian = useDataStore((s) => s.laporanKejadian);
  const [tab, setTab] = useState('Semua');

  const uid = user?.id || 'T1';
  const laporanH = useMemo(() => laporanHarian.filter((l) => l.userId === uid), [laporanHarian, uid]);
  const laporanK = useMemo(() => laporanKejadian.filter((l) => l.userId === uid), [laporanKejadian, uid]);

  const all = [
    ...laporanH.map((l) => ({ ...l, tipe: 'Harian' as const, desc: l.kondisi })),
    ...laporanK.map((l) => ({ ...l, tipe: 'Kejadian' as const, desc: l.jenis })),
  ];
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
      <ScrollView contentContainerStyle={st.content}>
        {filtered.length === 0 ? (
          <View style={st.emptyWrap}><Ionicons name="document-outline" size={48} color={Colors.textMuted} /><Text style={st.emptyText}>Belum ada laporan</Text></View>
        ) : filtered.map((l, idx) => (
          <Card key={idx} style={st.card}>
            <View style={st.cardTop}>
              <Badge text={l.tipe} variant={l.tipe === 'Kejadian' ? 'danger' : 'info'} />
              <Badge text={l.status === 'approved' ? 'Disetujui' : l.status === 'revision' ? 'Revisi' : l.status === 'rejected' ? 'Ditolak' : 'Pending'} variant={statusVar(l.status)} />
              <Text style={st.cardId}>{l.id}</Text>
            </View>
            <Text style={st.cardDesc}>{l.desc}</Text>
            <Text style={st.cardMeta}>{(l as any).tanggal || '-'} â€¢ {l.waktuSubmit}</Text>
            {l.catatanKomandan ? <Text style={st.catatan}>Catatan: {l.catatanKomandan}</Text> : null}
          </Card>
        ))}
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
