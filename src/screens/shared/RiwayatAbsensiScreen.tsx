/**
 * RIWAYAT ABSENSI - v2 (Bug-Fix Pass)
 *
 * FIXES (v2):
 *  🚨 HARDCODED DUMMY DATA REMOVED — original had hardcoded Feb 2026 records
 *     (lines 31-36) mixed into the history list, making real records show
 *     alongside fake ones.
 *  🚨 STATS FIXED — original added "+4" to hadir and "+1" to terlambat, and
 *     fallback to hardcoded "92%". Now uses pure real data.
 *  🚨 MONTH NAVIGATION FIXED — original changed `monthIdx` state but the
 *     records filter ignored it. Now filters by selected month.
 *  🚨 YEAR HARDCODED "2026" FIXED — now uses current year, with prev/next-year
 *     navigation when month rolls over.
 *  🚨 RECORD GROUPING FIXED — original treated each absensi entry as a "day",
 *     but each user has 2 entries per day (masuk + keluar). Now groups by
 *     `tanggal` so each day shows masuk AND keluar times in one card.
 *  🚨 `uid = 'T1'` fallback removed — was a dev demo fallback that bypassed
 *     auth. Now properly handles no-user state.
 *
 *  ✅ Dark mode support (was importing useTheme but using Colors).
 *  ✅ i18n support (was importing useI18n but using hardcoded Indonesian).
 *  ✅ Pull-to-refresh added.
 *  ✅ Empty state when no records exist for the selected month.
 *  ✅ Real day-of-week computation per record.
 *  ✅ Future months disabled (can't navigate to future).
 *  ✅ Records sorted newest first.
 */
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../constants';
import { Card, Badge } from '../../components';
import { useAuthStore } from '../../stores/authStore';
import { absensiApi } from '../../lib/apiClient';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

const MONTHS_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
                   'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June',
                   'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT_MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const SHORT_MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const DAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface DayGroup {
  tanggal: string;
  hari: string;
  masuk: string;
  keluar: string;
  status: 'hadir' | 'terlambat' | 'tidak_hadir' | 'libur';
  metode: string;
  sortKey: number;
}

// Parse "DD MMM YYYY" tanggal string from store
function parseStoredDate(tanggal: string): Date | null {
  if (!tanggal) return null;
  // Try ISO first
  if (tanggal.includes('-') || tanggal.includes('T')) {
    const d = new Date(tanggal);
    return isNaN(d.getTime()) ? null : d;
  }
  // Try "DD MMM YYYY" (the format store uses)
  const parts = tanggal.split(' ');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const monIdx = SHORT_MONTHS_ID.findIndex(m => m.toLowerCase() === parts[1].toLowerCase());
    const year = parseInt(parts[2], 10);
    if (!isNaN(day) && monIdx >= 0 && !isNaN(year)) {
      return new Date(year, monIdx, day);
    }
  }
  return null;
}

export default function RiwayatAbsensiScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { t, lang } = useI18n();
  const { theme, isDark } = useTheme();
  const user = useAuthStore((s) => s.user);

  // [3-4] Riwayat absensi mengambil data SENDIRI dari backend per rentang
  // tanggal bulan terpilih (bukan store yang hanya berisi HARI INI). Backend
  // sudah men-scope anggota ke user_id-nya (Fase 1), jadi hanya milik sendiri.
  const [monthData, setMonthData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Default to current month/year (NOT hardcoded 2026)
  const now = new Date();
  const [monthIdx, setMonthIdx] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [refreshing, setRefreshing] = useState(false);

  const MONTHS = lang === 'en' ? MONTHS_EN : MONTHS_ID;
  const DAYS = lang === 'en' ? DAYS_EN : DAYS_ID;
  const SHORT_MONTHS = lang === 'en' ? SHORT_MONTHS_EN : SHORT_MONTHS_ID;

  const uid = user?.id;

  // Ambil absensi bulan terpilih dari backend (rentang tanggal).
  const fetchMonth = useCallback(async () => {
    if (!uid) { setMonthData([]); return; }
    setLoading(true);
    try {
      const start = new Date(year, monthIdx, 1, 0, 0, 0).toISOString();
      const end = new Date(year, monthIdx + 1, 0, 23, 59, 59).toISOString();
      const qs = `user_id=${encodeURIComponent(uid)}&created_at_gte=${encodeURIComponent(start)}&created_at_lte=${encodeURIComponent(end)}&limit=300&sort=created_at&order=desc`;
      const res: any = await absensiApi.list(qs);
      const rows: any[] = Array.isArray(res) ? res : (res?.data || res?.items || []);
      const mapped = rows.map((a: any) => {
        const d = new Date(a.created_at || a.waktu || Date.now());
        return {
          // tanggal pakai bulan-singkat ID agar bisa di-parse parseStoredDate.
          tanggal: `${d.getDate()} ${SHORT_MONTHS_ID[d.getMonth()]} ${d.getFullYear()}`,
          waktu: a.waktu || d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          tipe: a.tipe,
          status: a.status || 'hadir',
        };
      });
      setMonthData(mapped);
    } catch {
      setMonthData([]);
    } finally {
      setLoading(false);
    }
  }, [uid, monthIdx, year]);

  useEffect(() => { fetchMonth(); }, [fetchMonth]);

  const monthRecords = monthData;

  // Group by date (combine masuk + keluar into one day card)
  const dayGroups: DayGroup[] = useMemo(() => {
    const map = new Map<string, DayGroup>();
    for (const r of monthRecords) {
      const d = parseStoredDate(r.tanggal);
      if (!d) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const existing = map.get(key);
      const dayName = DAYS[d.getDay()];
      if (existing) {
        // Merge masuk/keluar
        if (r.tipe === 'masuk' && existing.masuk === '-') existing.masuk = r.waktu;
        if (r.tipe === 'keluar' && existing.keluar === '-') existing.keluar = r.waktu;
        // Worst-case status wins (terlambat > hadir)
        if (r.status === 'terlambat' && existing.status === 'hadir') existing.status = 'terlambat';
      } else {
        map.set(key, {
          tanggal: r.tanggal,
          hari: dayName,
          masuk: r.tipe === 'masuk' ? r.waktu : '-',
          keluar: r.tipe === 'keluar' ? r.waktu : '-',
          status: r.status,
          metode: 'GPS+Selfie',
          sortKey: d.getTime(),
        });
      }
    }
    // Newest first
    return Array.from(map.values()).sort((a, b) => b.sortKey - a.sortKey);
  }, [monthRecords, DAYS]);

  // Real stats from grouped days (NOT fake +4 / +1)
  const hadir = dayGroups.filter((g) => g.status === 'hadir').length;
  const terlambat = dayGroups.filter((g) => g.status === 'terlambat').length;
  const libur = dayGroups.filter((g) => g.status === 'libur').length;
  const totalActive = hadir + terlambat;
  const persen = totalActive > 0 ? Math.round((hadir / totalActive) * 100) : 0;

  // Month navigation: handle year rollover, disable future
  const isCurrentMonth = monthIdx === now.getMonth() && year === now.getFullYear();

  const goPrevMonth = () => {
    if (monthIdx === 0) {
      setMonthIdx(11);
      setYear(year - 1);
    } else {
      setMonthIdx(monthIdx - 1);
    }
  };

  const goNextMonth = () => {
    if (isCurrentMonth) return; // Don't allow future
    if (monthIdx === 11) {
      setMonthIdx(0);
      setYear(year + 1);
    } else {
      setMonthIdx(monthIdx + 1);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await fetchMonth(); } catch {}
    finally { setRefreshing(false); }
  }, [fetchMonth]);

  const statusLabel = (s: string) => {
    if (s === 'hadir') return lang === 'en' ? 'Present' : 'Hadir';
    if (s === 'terlambat') return lang === 'en' ? 'Late' : 'Terlambat';
    if (s === 'libur') return lang === 'en' ? 'Holiday' : 'Libur';
    return lang === 'en' ? 'Absent' : 'Tidak Hadir';
  };

  const statusVariant = (s: string): 'success' | 'warning' | 'default' | 'danger' => {
    if (s === 'hadir') return 'success';
    if (s === 'terlambat') return 'warning';
    if (s === 'tidak_hadir') return 'danger';
    return 'default';
  };

  return (
    <View style={[st.container, { backgroundColor: theme.bg }]}>
      <View style={[st.header, { paddingTop: insets.top + 12 }, { backgroundColor: theme.bgCard, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[st.headerTitle, { color: theme.text }]}>{t('history.attendance')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Month Navigation */}
      <View style={[st.monthNav, { backgroundColor: theme.bgCard }]}>
        <TouchableOpacity onPress={goPrevMonth} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={22} color={Colors.primary} />
        </TouchableOpacity>
        <Text style={[st.monthText, { color: theme.text }]}>
          {MONTHS[monthIdx]} {year}
        </Text>
        <TouchableOpacity
          onPress={goNextMonth}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          disabled={isCurrentMonth}
        >
          <Ionicons
            name="chevron-forward"
            size={22}
            color={isCurrentMonth ? theme.textMuted : Colors.primary}
          />
        </TouchableOpacity>
      </View>

      {/* Stats — REAL DATA, no fake +4/+1 */}
      <View style={[st.statsRow, { backgroundColor: theme.bgCard, borderBottomColor: theme.border }]}>
        <View style={st.statItem}>
          <Text style={[st.statVal, { color: Colors.success }]}>{hadir}</Text>
          <Text style={[st.statLbl, { color: theme.textMuted }]}>
            {lang === 'en' ? 'Present' : 'Hadir'}
          </Text>
        </View>
        <View style={st.statItem}>
          <Text style={[st.statVal, { color: Colors.warning }]}>{terlambat}</Text>
          <Text style={[st.statLbl, { color: theme.textMuted }]}>
            {lang === 'en' ? 'Late' : 'Terlambat'}
          </Text>
        </View>
        <View style={st.statItem}>
          <Text style={[st.statVal, { color: theme.textMuted }]}>{libur}</Text>
          <Text style={[st.statLbl, { color: theme.textMuted }]}>
            {lang === 'en' ? 'Off' : 'Libur'}
          </Text>
        </View>
        <View style={st.statItem}>
          <Text style={[st.statVal, { color: Colors.primary }]}>{persen}%</Text>
          <Text style={[st.statLbl, { color: theme.textMuted }]}>
            {lang === 'en' ? 'Rate' : 'Persentase'}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={st.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {!uid && (
          <View style={st.emptyWrap}>
            <Ionicons name="person-outline" size={48} color={theme.textMuted} />
            <Text style={[st.emptyText, { color: theme.textMuted }]}>
              {lang === 'en' ? 'Not logged in' : 'Belum login'}
            </Text>
          </View>
        )}

        {uid && loading && dayGroups.length === 0 && (
          <View style={st.emptyWrap}>
            <ActivityIndicator color={theme.primary} />
          </View>
        )}

        {uid && !loading && dayGroups.length === 0 && (
          <View style={st.emptyWrap}>
            <Ionicons name="calendar-outline" size={48} color={theme.textMuted} />
            <Text style={[st.emptyText, { color: theme.textMuted }]}>
              {lang === 'en'
                ? `No attendance records for ${MONTHS[monthIdx]} ${year}`
                : `Tidak ada record absensi untuk ${MONTHS[monthIdx]} ${year}`}
            </Text>
          </View>
        )}

        {dayGroups.map((h, idx) => (
          <Card key={`${h.tanggal}-${idx}`} style={[st.card, { backgroundColor: theme.bgCard }]}>
            <View style={st.cardRow}>
              <View style={{ flex: 1 }}>
                <Text style={[st.cardDate, { color: theme.text }]}>{h.tanggal}</Text>
                <Text style={[st.cardDay, { color: theme.textMuted }]}>{h.hari}</Text>
              </View>
              <View style={st.times}>
                <Text style={[st.timeLabel, { color: theme.textMuted }]}>
                  {lang === 'en' ? 'In' : 'Masuk'}: <Text style={[st.timeVal, { color: theme.text }]}>{h.masuk}</Text>
                </Text>
                <Text style={[st.timeLabel, { color: theme.textMuted }]}>
                  {lang === 'en' ? 'Out' : 'Keluar'}: <Text style={[st.timeVal, { color: theme.text }]}>{h.keluar}</Text>
                </Text>
              </View>
              <Badge text={statusLabel(h.status)} variant={statusVariant(h.status)} />
            </View>
            {h.metode !== '-' && h.status !== 'libur' && (
              <Text style={[st.metode, { color: Colors.primary }]}>
                {lang === 'en' ? 'Method' : 'Metode'}: {h.metode}
              </Text>
            )}
          </Card>
        ))}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 12,
    paddingHorizontal: Spacing.base,
    borderBottomWidth: 1,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { ...Typography.h3, flex: 1, textAlign: 'center' },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  monthText: { ...Typography.bodyBold },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.base,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statVal: { fontSize: 20, fontWeight: '800' },
  statLbl: { ...Typography.caption },
  content: { padding: Spacing.base },
  card: { marginBottom: 8, padding: 14 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardDate: { ...Typography.bodyBold },
  cardDay: { ...Typography.caption },
  times: { gap: 2 },
  timeLabel: { ...Typography.caption },
  timeVal: { fontWeight: '700' },
  metode: { ...Typography.caption, marginTop: 6 },
  emptyWrap: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { ...Typography.body, textAlign: 'center', paddingHorizontal: 32 },
});
