/**
 * PERUSAHAAN LIST SCREEN - Supervisor
 * Shows all companies with summary stats, tap to drill-down
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius, Shadows } from '../../constants';
import { Card, Badge } from '../../components';
import { useDataStore } from '../../stores/dataStore';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

export default function PerusahaanListScreen({ navigation }: any) {
  const { t } = useI18n();
  const { theme, isDark } = useTheme();
  const lokasi = useDataStore((s) => s.lokasi);
  const team = useDataStore((s) => s.team);
  const absensi = useDataStore((s) => s.absensiRecords);
  const laporanK = useDataStore((s) => s.laporanKejadian);
  const [search, setSearch] = useState('');

  const companies = useMemo(() => {
    return lokasi
      .filter((l) => l.nama.toLowerCase().includes(search.toLowerCase()))
      .map((l) => {
        const members = team.filter((m) => m.lokasi === l.nama);
        const onDuty = members.filter((m) => m.status !== 'off_duty').length;
        const incidents = laporanK.filter((r) => members.some((m) => m.id === r.userId));
        const todayAbsen = absensi.filter((a) => members.some((m) => m.id === a.userId));
        const avgSkor = members.length > 0 ? Math.round(members.reduce((s, m) => s + m.skor, 0) / members.length) : 0;
        return { ...l, members, onDuty, incidents: incidents.length, todayAbsen: todayAbsen.length, avgSkor };
      });
  }, [lokasi, team, absensi, laporanK, search]);

  const totalPersonil = team.length;
  const totalOnDuty = useMemo(() => team.filter((m) => m.status !== 'off_duty').length, [team]);

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Perusahaan Klien</Text>
        <Text style={s.headerSub}>{lokasi.length} perusahaan • {totalPersonil} personil ({totalOnDuty} aktif)</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Search */}
        <View style={s.searchBar}>
          <Ionicons name="search" size={18} color={Colors.textMuted} />
          <TextInput
            style={s.searchInput}
            placeholder="Cari perusahaan..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {/* Summary KPI */}
        <View style={s.kpiRow}>
          <View style={[s.kpiCard, { borderLeftColor: Colors.primary }]}>
            <Text style={[s.kpiVal, { color: Colors.primary }]}>{lokasi.length}</Text>
            <Text style={s.kpiLabel}>Perusahaan</Text>
          </View>
          <View style={[s.kpiCard, { borderLeftColor: Colors.success }]}>
            <Text style={[s.kpiVal, { color: Colors.success }]}>{totalOnDuty}</Text>
            <Text style={s.kpiLabel}>On Duty</Text>
          </View>
          <View style={[s.kpiCard, { borderLeftColor: Colors.danger }]}>
            <Text style={[s.kpiVal, { color: Colors.danger }]}>{laporanK.length}</Text>
            <Text style={s.kpiLabel}>Insiden</Text>
          </View>
        </View>

        {/* Company Cards */}
        {companies.map((c) => (
          <TouchableOpacity
            key={c.id}
            style={s.companyCard}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('DetailPerusahaan', { lokasiId: c.id })}
          >
            {/* Company Header */}
            <View style={s.companyHeader}>
              <View style={s.companyIcon}>
                <Ionicons name="business" size={22} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.companyName}>{c.nama}</Text>
                <View style={s.addressRow}>
                  <Ionicons name="location-outline" size={12} color={Colors.textMuted} />
                  <Text style={s.companyAddr}>{c.alamat}</Text>
                </View>
              </View>
              <Badge text={c.status === 'active' ? 'Aktif' : 'Nonaktif'} variant={c.status === 'active' ? 'success' : 'default'} />
            </View>

            {/* Stats Row */}
            <View style={s.statsRow}>
              <View style={s.statItem}>
                <Ionicons name="people" size={14} color={Colors.primary} />
                <Text style={s.statVal}>{c.onDuty}/{c.members.length}</Text>
                <Text style={s.statLabel}>Personil</Text>
              </View>
              <View style={s.statDivider} />
              <View style={s.statItem}>
                <Ionicons name="location" size={14} color={Colors.success} />
                <Text style={s.statVal}>{c.posList.length}</Text>
                <Text style={s.statLabel}>Pos</Text>
              </View>
              <View style={s.statDivider} />
              <View style={s.statItem}>
                <Ionicons name="checkmark-circle" size={14} color={Colors.warning} />
                <Text style={s.statVal}>{c.todayAbsen}</Text>
                <Text style={s.statLabel}>Absensi</Text>
              </View>
              <View style={s.statDivider} />
              <View style={s.statItem}>
                <Ionicons name="star" size={14} color={Colors.warning} />
                <Text style={s.statVal}>{c.avgSkor}</Text>
                <Text style={s.statLabel}>Skor</Text>
              </View>
            </View>

            {/* Member Avatars */}
            <View style={s.membersRow}>
              <View style={s.avatarStack}>
                {c.members.slice(0, 5).map((m, i) => (
                  <Image key={m.id} source={{ uri: m.foto }} style={[s.miniAvatar, { marginLeft: i > 0 ? -10 : 0, zIndex: 5 - i }]} />
                ))}
                {c.members.length > 5 && (
                  <View style={[s.miniAvatar, s.moreCircle, { marginLeft: -10 }]}>
                    <Text style={s.moreText}>+{c.members.length - 5}</Text>
                  </View>
                )}
              </View>
              <View style={s.tapHint}>
                <Text style={s.tapHintText}>Lihat Detail</Text>
                <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
              </View>
            </View>
          </TouchableOpacity>
        ))}

        {companies.length === 0 && (
          <View style={s.emptyState}>
            <Ionicons name="business-outline" size={48} color={Colors.textMuted} />
            <Text style={s.emptyText}>Tidak ada perusahaan ditemukan</Text>
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgLight },
  header: { backgroundColor: Colors.primaryDark, paddingTop: 52, paddingBottom: 18, paddingHorizontal: Spacing.lg, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#fff' },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 4 },
  scroll: { padding: Spacing.base },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.bgWhite, borderRadius: Radius.lg, padding: 12, marginBottom: 14, ...Shadows.sm },
  searchInput: { flex: 1, fontSize: 14, color: Colors.textPrimary },
  kpiRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  kpiCard: { flex: 1, backgroundColor: Colors.bgWhite, borderRadius: Radius.md, padding: 12, alignItems: 'center', borderLeftWidth: 3, ...Shadows.sm },
  kpiVal: { fontSize: 22, fontWeight: '800' },
  kpiLabel: { fontSize: 10, color: Colors.textMuted, marginTop: 2 },
  companyCard: { backgroundColor: Colors.bgWhite, borderRadius: Radius.lg, padding: 16, marginBottom: 12, ...Shadows.sm },
  companyHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  companyIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  companyName: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  companyAddr: { fontSize: 11, color: Colors.textMuted, flex: 1 },
  statsRow: { flexDirection: 'row', backgroundColor: Colors.bgLight, borderRadius: Radius.md, padding: 12, marginBottom: 12 },
  statItem: { flex: 1, alignItems: 'center', gap: 2 },
  statVal: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  statLabel: { fontSize: 10, color: Colors.textMuted },
  statDivider: { width: 1, backgroundColor: Colors.border, marginVertical: 4 },
  membersRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  avatarStack: { flexDirection: 'row', alignItems: 'center' },
  miniAvatar: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: '#fff' },
  moreCircle: { backgroundColor: Colors.bgGray, alignItems: 'center', justifyContent: 'center' },
  moreText: { fontSize: 10, fontWeight: '700', color: Colors.textSecondary },
  tapHint: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tapHintText: { fontSize: 12, fontWeight: '600', color: Colors.primary },
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyText: { ...Typography.body, color: Colors.textMuted },
});
