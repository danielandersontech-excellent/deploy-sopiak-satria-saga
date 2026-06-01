import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../constants';
import { Card, Badge } from '../../components';
import { useDataStore } from '../../stores/dataStore';
import { useAuthStore } from '../../stores/authStore';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

const TABS = ['Semua', 'Absensi', 'Patroli', 'Laporan'];

export default function AktivitasScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { theme, isDark } = useTheme();
  const [tab, setTab] = useState('Semua');
  const user = useAuthStore((s) => s.user);
  const absensiRecords = useDataStore((s) => s.absensiRecords);
  const laporanHarian = useDataStore((s) => s.laporanHarian);
  const laporanKejadian = useDataStore((s) => s.laporanKejadian);
  const serahTerimaRecords = useDataStore((s) => s.serahTerimaRecords);

  const uid = user?.id || 'T1';
  const absensi = useMemo(() => absensiRecords.filter((a) => a.userId === uid), [absensiRecords, uid]);
  const laporanH = useMemo(() => laporanHarian.filter((l) => l.userId === uid), [laporanHarian, uid]);
  const laporanK = useMemo(() => laporanKejadian.filter((l) => l.userId === uid), [laporanKejadian, uid]);
  const serahTerima = useMemo(() => serahTerimaRecords.filter((s) => s.userId === uid), [serahTerimaRecords, uid]);

  const items: { tipe: string; icon: string; color: string; title: string; detail: string; time: string; status: string; variant: 'success' | 'warning' | 'info' | 'danger' | 'default' }[] = [];

  if (tab === 'Semua' || tab === 'Absensi') {
    absensi.forEach((a) => items.push({ tipe: 'Absensi', icon: a.tipe === 'masuk' ? 'log-in' : 'log-out', color: a.tipe === 'masuk' ? Colors.success : Colors.danger, title: `Absensi ${a.tipe === 'masuk' ? 'Masuk' : 'Keluar'}`, detail: `${a.posJaga}`, time: a.waktu, status: a.status === 'hadir' ? 'Hadir' : 'Terlambat', variant: a.status === 'hadir' ? 'success' : 'warning' }));
  }
  if (tab === 'Semua' || tab === 'Laporan') {
    laporanH.forEach((l) => items.push({ tipe: 'Laporan', icon: 'document-text', color: Colors.warning, title: 'Laporan Harian', detail: l.kondisi, time: l.waktuSubmit, status: l.status === 'approved' ? 'Disetujui' : l.status === 'revision' ? 'Revisi' : 'Pending', variant: l.status === 'approved' ? 'success' : l.status === 'revision' ? 'warning' : 'default' }));
    laporanK.forEach((l) => items.push({ tipe: 'Laporan', icon: 'alert-circle', color: Colors.danger, title: `Insiden: ${l.jenis}`, detail: l.prioritas, time: l.waktuSubmit, status: l.status === 'approved' ? 'Disetujui' : 'Pending', variant: l.status === 'approved' ? 'success' : 'default' }));
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}><Text style={styles.headerTitle}>Aktivitas</Text></View>
      <View style={styles.tabsRow}>
        {TABS.map((t) => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {items.length === 0 ? (
          <View style={styles.emptyWrap}><Ionicons name="clipboard-outline" size={48} color={Colors.textMuted} /><Text style={styles.emptyText}>Belum ada aktivitas</Text></View>
        ) : items.map((item, idx) => (
          <Card key={idx} style={styles.card}>
            <View style={styles.cardRow}>
              <View style={[styles.iconCircle, { backgroundColor: `${item.color}18` }]}>
                <Ionicons name={item.icon as any} size={20} color={item.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardDetail}>{item.detail}</Text>
              </View>
              <View style={styles.cardRight}>
                <Badge text={item.status} variant={item.variant} />
                <Text style={styles.cardTime}>{item.time}</Text>
              </View>
            </View>
          </Card>
        ))}
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgLight },
  header: { paddingBottom: 12, paddingHorizontal: Spacing.base, backgroundColor: Colors.bgWhite },
  headerTitle: { ...Typography.h2, color: Colors.textPrimary },
  tabsRow: { flexDirection: 'row', backgroundColor: Colors.bgWhite, paddingHorizontal: Spacing.base, paddingBottom: 12, gap: 6, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.full, backgroundColor: Colors.bgGray },
  tabActive: { backgroundColor: Colors.primary },
  tabText: { ...Typography.smallBold, color: Colors.textSecondary },
  tabTextActive: { color: '#fff' },
  content: { padding: Spacing.base },
  emptyWrap: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyText: { ...Typography.body, color: Colors.textMuted },
  card: { marginBottom: 8, padding: 14 },
  cardRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  iconCircle: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { ...Typography.bodyBold, color: Colors.textPrimary },
  cardDetail: { ...Typography.caption, color: Colors.textMuted },
  cardRight: { alignItems: 'flex-end', gap: 4 },
  cardTime: { ...Typography.caption, color: Colors.textMuted },
});
============================================================
