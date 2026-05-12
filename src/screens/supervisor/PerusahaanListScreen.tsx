/**
 * PERUSAHAAN LIST SCREEN - v2 (Bug-Fix Pass)
 *
 * FIXES (v2):
 *  ✅ Conditional back button — shows when reached via stack push (e.g. dashboard
 *     "View All" link), hidden when used as bottom tab.
 *  ✅ Dark mode support (was importing useTheme but using Colors directly).
 *  ✅ i18n support (was importing useI18n but using hardcoded Indonesian strings).
 *  ✅ Members matched by `lokasiId` first (more reliable than name), with name
 *     fallback. Same fix as komandan/dashboard screens.
 *  ✅ "Today's absen" now filters by actual today's date (was misleading label
 *     showing ALL absen across all dates).
 *  ✅ Foto URI filter for member avatars (avoid empty/broken image).
 *  ✅ Pull-to-refresh.
 */
import React, { useMemo, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, TextInput,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius, Shadows } from '../../constants';
import { Badge } from '../../components';
import { useDataStore } from '../../stores/dataStore';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

function getField(obj: any, ...keys: string[]): any {
  if (!obj) return undefined;
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  return undefined;
}

// Today's date in Indonesian format used by store: "DD MMM YYYY"
function todayLabelId(): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export default function PerusahaanListScreen({ navigation }: any) {
  const { t, lang } = useI18n();
  const { theme, isDark } = useTheme();
  const lokasi = useDataStore((s) => s.lokasi);
  const team = useDataStore((s) => s.team);
  const absensi = useDataStore((s) => s.absensiRecords);
  const laporanK = useDataStore((s) => s.laporanKejadian);
  const loadAllData = useDataStore((s) => s.loadAllData);

  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await loadAllData?.(); } catch {}
    finally { setRefreshing(false); }
  }, [loadAllData]);

  const today = todayLabelId();
  const canGoBack = navigation.canGoBack?.() ?? false;

  const companies = useMemo(() => {
    return lokasi
      .filter((l) => l.nama.toLowerCase().includes(search.toLowerCase()))
      .map((l) => {
        // Match members by lokasiId first, fall back to name
        const members = team.filter((m) => {
          const mLokId = String(getField(m, 'lokasiId', 'lokasi_id') || '');
          if (mLokId && mLokId === String(l.id)) return true;
          return m.lokasi === l.nama;
        });
        const onDuty = members.filter((m) => m.status !== 'off_duty').length;
        const incidents = laporanK.filter((r) => members.some((m) => m.id === r.userId));
        // Filter absensi by today's date for accurate "absen hari ini"
        const todayAbsen = absensi.filter(
          (a) => a.tanggal === today && members.some((m) => m.id === a.userId)
        );
        const avgSkor = members.length > 0
          ? Math.round(members.reduce((s, m) => s + (m.skor || 0), 0) / members.length)
          : 0;
        return {
          ...l,
          members,
          onDuty,
          incidents: incidents.length,
          todayAbsen: todayAbsen.length,
          avgSkor,
        };
      });
  }, [lokasi, team, absensi, laporanK, search, today]);

  const totalPersonil = team.length;
  const totalOnDuty = useMemo(
    () => team.filter((m) => m.status !== 'off_duty').length,
    [team]
  );

  return (
    <View style={[s.container, { backgroundColor: theme.bg }]}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: isDark ? theme.bgCard : Colors.primaryDark }]}>
        {canGoBack && (
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={s.backBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>
            {lang === 'en' ? 'Client Companies' : 'Perusahaan Klien'}
          </Text>
          <Text style={s.headerSub}>
            {lokasi.length} {lang === 'en' ? 'companies' : 'perusahaan'} • {totalPersonil} {lang === 'en' ? 'personnel' : 'personil'} ({totalOnDuty} {lang === 'en' ? 'active' : 'aktif'})
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {/* Search */}
        <View
          style={[
            s.searchBar,
            { backgroundColor: theme.bgCard },
            isDark ? { borderWidth: 1, borderColor: theme.border } : Shadows.sm,
          ]}
        >
          <Ionicons name="search" size={18} color={theme.textMuted} />
          <TextInput
            style={[s.searchInput, { color: theme.text }]}
            placeholder={lang === 'en' ? 'Search company...' : 'Cari perusahaan...'}
            placeholderTextColor={theme.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {/* Summary KPI */}
        <View style={s.kpiRow}>
          <View
            style={[
              s.kpiCard,
              { backgroundColor: theme.bgCard, borderLeftColor: Colors.primary },
              isDark ? { borderWidth: 1, borderColor: theme.border } : Shadows.sm,
            ]}
          >
            <Text style={[s.kpiVal, { color: Colors.primary }]}>{lokasi.length}</Text>
            <Text style={[s.kpiLabel, { color: theme.textMuted }]}>
              {lang === 'en' ? 'Companies' : 'Perusahaan'}
            </Text>
          </View>
          <View
            style={[
              s.kpiCard,
              { backgroundColor: theme.bgCard, borderLeftColor: Colors.success },
              isDark ? { borderWidth: 1, borderColor: theme.border } : Shadows.sm,
            ]}
          >
            <Text style={[s.kpiVal, { color: Colors.success }]}>{totalOnDuty}</Text>
            <Text style={[s.kpiLabel, { color: theme.textMuted }]}>On Duty</Text>
          </View>
          <View
            style={[
              s.kpiCard,
              { backgroundColor: theme.bgCard, borderLeftColor: Colors.danger },
              isDark ? { borderWidth: 1, borderColor: theme.border } : Shadows.sm,
            ]}
          >
            <Text style={[s.kpiVal, { color: Colors.danger }]}>{laporanK.length}</Text>
            <Text style={[s.kpiLabel, { color: theme.textMuted }]}>
              {lang === 'en' ? 'Incidents' : 'Insiden'}
            </Text>
          </View>
        </View>

        {/* Company Cards */}
        {companies.map((c) => (
          <TouchableOpacity
            key={c.id}
            style={[
              s.companyCard,
              { backgroundColor: theme.bgCard },
              isDark ? { borderWidth: 1, borderColor: theme.border } : Shadows.sm,
            ]}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('DetailPerusahaan', { lokasiId: c.id })}
          >
            <View style={s.companyHeader}>
              <View
                style={[
                  s.companyIcon,
                  { backgroundColor: isDark ? `${Colors.primary}25` : Colors.primarySoft },
                ]}
              >
                <Ionicons name="business" size={22} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.companyName, { color: theme.text }]}>{c.nama}</Text>
                <View style={s.addressRow}>
                  <Ionicons name="location-outline" size={12} color={theme.textMuted} />
                  <Text style={[s.companyAddr, { color: theme.textMuted }]} numberOfLines={1}>
                    {c.alamat || '-'}
                  </Text>
                </View>
              </View>
              <Badge
                text={c.status === 'active' ? (lang === 'en' ? 'Active' : 'Aktif') : (lang === 'en' ? 'Inactive' : 'Nonaktif')}
                variant={c.status === 'active' ? 'success' : 'default'}
              />
            </View>

            <View style={[s.statsRow, { backgroundColor: isDark ? theme.bgInput : Colors.bgLight }]}>
              <View style={s.statItem}>
                <Ionicons name="people" size={14} color={Colors.primary} />
                <Text style={[s.statVal, { color: theme.text }]}>
                  {c.onDuty}/{c.members.length}
                </Text>
                <Text style={[s.statLabel, { color: theme.textMuted }]}>
                  {lang === 'en' ? 'Personnel' : 'Personil'}
                </Text>
              </View>
              <View style={[s.statDivider, { backgroundColor: theme.border }]} />
              <View style={s.statItem}>
                <Ionicons name="location" size={14} color={Colors.success} />
                <Text style={[s.statVal, { color: theme.text }]}>{c.posList.length}</Text>
                <Text style={[s.statLabel, { color: theme.textMuted }]}>Pos</Text>
              </View>
              <View style={[s.statDivider, { backgroundColor: theme.border }]} />
              <View style={s.statItem}>
                <Ionicons name="checkmark-circle" size={14} color={Colors.warning} />
                <Text style={[s.statVal, { color: theme.text }]}>{c.todayAbsen}</Text>
                <Text style={[s.statLabel, { color: theme.textMuted }]}>
                  {lang === 'en' ? 'Today' : 'Hari Ini'}
                </Text>
              </View>
              <View style={[s.statDivider, { backgroundColor: theme.border }]} />
              <View style={s.statItem}>
                <Ionicons name="star" size={14} color={Colors.warning} />
                <Text style={[s.statVal, { color: theme.text }]}>{c.avgSkor}</Text>
                <Text style={[s.statLabel, { color: theme.textMuted }]}>
                  {lang === 'en' ? 'Score' : 'Skor'}
                </Text>
              </View>
            </View>

            <View style={s.membersRow}>
              <View style={s.avatarStack}>
                {c.members
                  .filter((m) => m.foto && typeof m.foto === 'string' && m.foto.length > 0)
                  .slice(0, 5)
                  .map((m, i) => (
                    <Image
                      key={`av-${c.id}-${m.id}`}
                      source={{ uri: m.foto }}
                      style={[
                        s.miniAvatar,
                        { marginLeft: i > 0 ? -10 : 0, zIndex: 5 - i, borderColor: theme.bgCard },
                      ]}
                    />
                  ))}
                {c.members.length > 5 && (
                  <View
                    style={[
                      s.miniAvatar,
                      s.moreCircle,
                      {
                        marginLeft: -10,
                        backgroundColor: isDark ? theme.bgInput : Colors.bgGray,
                        borderColor: theme.bgCard,
                      },
                    ]}
                  >
                    <Text style={[s.moreText, { color: theme.textSecondary }]}>+{c.members.length - 5}</Text>
                  </View>
                )}
              </View>
              <View style={s.tapHint}>
                <Text style={[s.tapHintText, { color: Colors.primary }]}>
                  {lang === 'en' ? 'View Details' : 'Lihat Detail'}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
              </View>
            </View>
          </TouchableOpacity>
        ))}

        {companies.length === 0 && (
          <View style={s.emptyState}>
            <Ionicons name="business-outline" size={48} color={theme.textMuted} />
            <Text style={[s.emptyText, { color: theme.textMuted }]}>
              {search
                ? (lang === 'en' ? 'No company found' : 'Tidak ada perusahaan ditemukan')
                : (lang === 'en' ? 'No companies yet' : 'Belum ada perusahaan')}
            </Text>
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 52,
    paddingBottom: 18,
    paddingHorizontal: Spacing.lg,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    gap: 10,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#fff' },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 4 },
  scroll: { padding: Spacing.base },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: Radius.lg,
    padding: 12,
    marginBottom: 14,
  },
  searchInput: { flex: 1, fontSize: 14 },
  kpiRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  kpiCard: { flex: 1, borderRadius: Radius.md, padding: 12, alignItems: 'center', borderLeftWidth: 3 },
  kpiVal: { fontSize: 22, fontWeight: '800' },
  kpiLabel: { fontSize: 10, marginTop: 2 },
  companyCard: { borderRadius: Radius.lg, padding: 16, marginBottom: 12 },
  companyHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  companyIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  companyName: { fontSize: 16, fontWeight: '700' },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  companyAddr: { fontSize: 11, flex: 1 },
  statsRow: { flexDirection: 'row', borderRadius: Radius.md, padding: 12, marginBottom: 12 },
  statItem: { flex: 1, alignItems: 'center', gap: 2 },
  statVal: { fontSize: 16, fontWeight: '700' },
  statLabel: { fontSize: 10 },
  statDivider: { width: 1, marginVertical: 4 },
  membersRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  avatarStack: { flexDirection: 'row', alignItems: 'center' },
  miniAvatar: { width: 32, height: 32, borderRadius: 16, borderWidth: 2 },
  moreCircle: { alignItems: 'center', justifyContent: 'center' },
  moreText: { fontSize: 10, fontWeight: '700' },
  tapHint: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tapHintText: { fontSize: 12, fontWeight: '600' },
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyText: { ...Typography.body },
});
