import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../constants';
import { Card, Badge } from '../../components';
import { useAuthStore } from '../../stores/authStore';
import { useDataStore } from '../../stores/dataStore';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

export default function RiwayatAbsensiScreen({ navigation }: any) {
  const { t } = useI18n();
  const { theme, isDark } = useTheme();
  const user = useAuthStore((s) => s.user);
  const absensiRecords = useDataStore((s) => s.absensiRecords);
  const [monthIdx, setMonthIdx] = useState(new Date().getMonth());

  const uid = user?.id || 'T1';
  const absensi = useMemo(() => absensiRecords.filter((a) => a.userId === uid), [absensiRecords, uid]);

  const hadir = absensi.filter((a) => a.status === 'hadir').length;
  const terlambat = absensi.filter((a) => a.status === 'terlambat').length;
  const totalDays = hadir + terlambat;
  const persen = totalDays > 0 ? Math.round((hadir / totalDays) * 100) : 0;

  // Generate extra dummy history for display
  const history = [
    ...absensi.map((a) => ({ tanggal: a.tanggal, hari: 'Hari Ini', masuk: a.tipe === 'masuk' ? a.waktu : '-', keluar: '-', status: a.status, metode: 'GPS+Selfie' })),
    { tanggal: '06 Feb 2026', hari: 'Kamis', masuk: '07:55', keluar: '16:02', status: 'hadir', metode: 'GPS+Selfie' },
    { tanggal: '05 Feb 2026', hari: 'Rabu', masuk: '08:12', keluar: '16:05', status: 'terlambat', metode: 'GPS+Selfie' },
    { tanggal: '04 Feb 2026', hari: 'Selasa', masuk: '07:50', keluar: '16:00', status: 'hadir', metode: 'GPS+Selfie' },
    { tanggal: '03 Feb 2026', hari: 'Senin', masuk: '07:58', keluar: '16:03', status: 'hadir', metode: 'GPS+Selfie' },
    { tanggal: '02 Feb 2026', hari: 'Minggu', masuk: '-', keluar: '-', status: 'libur', metode: '-' },
    { tanggal: '01 Feb 2026', hari: 'Sabtu', masuk: '08:00', keluar: '14:00', status: 'hadir', metode: 'GPS+Selfie' },
  ];

  return (
    <View style={st.container}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn}><Ionicons name="arrow-back" size={24} color={Colors.textPrimary} /></TouchableOpacity>
        <Text style={st.headerTitle}>Riwayat Absensi</Text>
        <View style={{ width: 40 }} />
      </View>
      {/* Month Nav */}
      <View style={st.monthNav}>
        <TouchableOpacity onPress={() => setMonthIdx(Math.max(0, monthIdx - 1))}><Ionicons name="chevron-back" size={22} color={Colors.primary} /></TouchableOpacity>
        <Text style={st.monthText}>{MONTHS[monthIdx]} 2026</Text>
        <TouchableOpacity onPress={() => setMonthIdx(Math.min(11, monthIdx + 1))}><Ionicons name="chevron-forward" size={22} color={Colors.primary} /></TouchableOpacity>
      </View>
      {/* Stats */}
      <View style={st.statsRow}>
        <View style={st.statItem}><Text style={[st.statVal, { color: Colors.success }]}>{hadir + 4}</Text><Text style={st.statLbl}>Hadir</Text></View>
        <View style={st.statItem}><Text style={[st.statVal, { color: Colors.warning }]}>{terlambat + 1}</Text><Text style={st.statLbl}>Terlambat</Text></View>
        <View style={st.statItem}><Text style={[st.statVal, { color: Colors.textMuted }]}>1</Text><Text style={st.statLbl}>Libur</Text></View>
        <View style={st.statItem}><Text style={[st.statVal, { color: Colors.primary }]}>{persen || 92}%</Text><Text style={st.statLbl}>Persentase</Text></View>
      </View>
      <ScrollView contentContainerStyle={st.content}>
        {history.map((h, idx) => (
          <Card key={idx} style={st.card}>
            <View style={st.cardRow}>
              <View style={{ flex: 1 }}>
                <Text style={st.cardDate}>{h.tanggal}</Text>
                <Text style={st.cardDay}>{h.hari}</Text>
              </View>
              <View style={st.times}>
                <Text style={st.timeLabel}>Masuk: <Text style={st.timeVal}>{h.masuk}</Text></Text>
                <Text style={st.timeLabel}>Keluar: <Text style={st.timeVal}>{h.keluar}</Text></Text>
              </View>
              <Badge text={h.status === 'hadir' ? 'Hadir' : h.status === 'terlambat' ? 'Terlambat' : 'Libur'} variant={h.status === 'hadir' ? 'success' : h.status === 'terlambat' ? 'warning' : 'default'} />
            </View>
            {h.metode !== '-' && <Text style={st.metode}>Metode: {h.metode}</Text>}
          </Card>
        ))}
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}
const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgLight },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 50, paddingBottom: 12, paddingHorizontal: Spacing.base, backgroundColor: Colors.bgWhite, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { ...Typography.h3, color: Colors.textPrimary, flex: 1, textAlign: 'center' },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 12, backgroundColor: Colors.bgWhite },
  monthText: { ...Typography.bodyBold, color: Colors.textPrimary },
  statsRow: { flexDirection: 'row', paddingHorizontal: Spacing.base, paddingVertical: 12, backgroundColor: Colors.bgWhite, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  statItem: { flex: 1, alignItems: 'center' },
  statVal: { fontSize: 20, fontWeight: '800' },
  statLbl: { ...Typography.caption, color: Colors.textMuted },
  content: { padding: Spacing.base },
  card: { marginBottom: 8, padding: 14 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardDate: { ...Typography.bodyBold, color: Colors.textPrimary },
  cardDay: { ...Typography.caption, color: Colors.textMuted },
  times: { gap: 2 },
  timeLabel: { ...Typography.caption, color: Colors.textMuted },
  timeVal: { fontWeight: '700', color: Colors.textPrimary },
  metode: { ...Typography.caption, color: Colors.primary, marginTop: 6 },
});
