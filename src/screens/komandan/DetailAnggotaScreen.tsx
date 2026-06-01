/**
 * DETAIL ANGGOTA SCREEN - v5 (Bug-Fix Pass)
 *
 * DATABASE ALIGNMENT:
 *   users: id, nama, nrp, role, no_hp, pos_jaga, shift, lokasi_id, foto, skor
 *   absensi: user_id, tipe, pos_jaga, alamat, status, dalam_radius, lokasi_id, created_at
 *   patroli: user_id, route_name, start_time, end_time, status, checkpoint_scanned, checkpoint_total, created_at
 *   laporan_harian: user_id, tanggal, shift, pos_jaga, kondisi, aktivitas, temuan, status, lokasi_id, created_at
 *   laporan_kejadian: user_id, jenis, prioritas, waktu_kejadian, lokasi_text, kronologi, status, lokasi_id, created_at
 *
 * CRITICAL FIXES (v5):
 *  ðŸš¨ All API fetches now use extractArray() to handle paginated response
 *     { data: [...], pagination: {...} }. Previously Array.isArray(result)
 *     was ALWAYS FALSE â†’ activity tab was ALWAYS empty (fell back to
 *     store filter which was also incomplete). Fixed for:
 *     - absensiApi.list (line 134)
 *     - patroliApi.list user-specific + global (line 157, 163)
 *     - laporanApi.harianList (line 172)
 *     - laporanApi.kejadianList (line 192)
 *
 *  âœ… fmtDate now detects Invalid Date and returns original string instead
 *     of literal "Invalid Date" text in the UI.
 *  âœ… useEffect deps include fetchActivityData (no stale closures)
 *  âœ… Refresh control now also refreshes when on profile/location tabs
 *  âœ… Safe key generation - no Math.random() in render (was causing
 *     React key churn on re-render â†’ unnecessary remounts)
 *  âœ… Type-safe member null-check earlier (avoid undefined member access)
 *  âœ… pos_jaga fallback chain includes pos_nama
 *  âœ… Map marker type uses proper union type instead of `as any`
 *
 * PRIOR FIXES:
 *  - getField() for dual snake_case/camelCase field access
 *  - member.pos_jaga (not pos), member.no_hp (not noHp), member.lokasi_id
 *  - Absensi fallback: user_id, pos_jaga, dalam_radius, created_at
 *  - Patroli: route_name, checkpoint_scanned, checkpoint_total, start_time, end_time
 *  - Lokasi tab: resolves lokasi_id â†’ lokasi table, finds pos in posList
 *  - Map markers: last_latitude/last_longitude
 *  - Checkpoint filter by lokasi_id (not lokasi name)
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../constants';
import { Card, Badge, Button } from '../../components';
import { useDataStore } from '../../stores/dataStore';
import { absensiApi, patroliApi, laporanApi } from '../../lib/apiClient';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';
import MapTracker, { MapMarker } from '../../components/map/MapTracker';

/**
 * Safely get a field value, checking multiple key variants (snake_case first).
 */
function getField(obj: any, ...keys: string[]): any {
  if (!obj) return undefined;
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return undefined;
}

/**
 * Extract array from API response (handles paginated { data: [...], pagination: {...} }).
 */
function extractArray(result: any): any[] {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.data)) return result.data;
  if (result && Array.isArray(result.rows)) return result.rows;
  if (result && Array.isArray(result.items)) return result.items;
  return [];
}

const TABS_ID = ['Profil', 'Aktivitas', 'Lokasi'];
const TABS_EN = ['Profile', 'Activity', 'Location'];

const STATUS_MAP: Record<string, { label: string; color: string; variant: 'success' | 'info' | 'warning' | 'default' }> = {
  on_duty: { label: 'On Duty', color: Colors.success, variant: 'success' },
  patroli: { label: 'Patroli', color: Colors.primary, variant: 'info' },
  break: { label: 'Break', color: Colors.warning, variant: 'warning' },
  off_duty: { label: 'Off Duty', color: Colors.textMuted, variant: 'default' },
};

export default function DetailAnggotaScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { t, lang } = useI18n();
  const { theme, isDark } = useTheme();
  const { nrp } = route.params || {};

  const team = useDataStore((s) => s.team);
  const storeAbsensi = useDataStore((s) => s.absensiRecords);
  const storeLH = useDataStore((s) => s.laporanHarian);
  const storeLK = useDataStore((s) => s.laporanKejadian);
  const storeCheckpoints = useDataStore((s) => s.checkpoints);
  const lokasiList = useDataStore((s) => s.lokasi);

  const [tab, setTab] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Activity data
  const [absensiList, setAbsensiList] = useState<any[]>([]);
  const [patroliList, setPatroliList] = useState<any[]>([]);
  const [laporanHList, setLaporanHList] = useState<any[]>([]);
  const [laporanKList, setLaporanKList] = useState<any[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  // Track if activity has been loaded at least once (avoid spinner on tab toggle)
  const activityFetchedRef = useRef(false);

  const TABS = lang === 'en' ? TABS_EN : TABS_ID;

  const member = useMemo(() => team.find((m) => getField(m, 'nrp') === nrp), [team, nrp]);
  const mStatus = member ? (getField(member, 'status') || 'off_duty') : 'off_duty';
  const ms = STATUS_MAP[mStatus] || STATUS_MAP.off_duty;

  // Member fields via getField - DB columns
  const memberId = String(getField(member, 'id', '_id') || '');
  const memberNama = getField(member, 'nama', 'name') || 'Anggota';
  const memberNrp = getField(member, 'nrp') || nrp || '-';
  const memberRole = getField(member, 'role') || 'anggota';
  const memberNoHp = getField(member, 'no_hp', 'noHp', 'nohp', 'phone') || '-';
  const memberFoto = getField(member, 'foto', 'foto_url', 'avatar') || 'https://via.placeholder.com/72';
  const memberPosJaga = getField(member, 'pos_jaga', 'posJaga', 'pos_nama', 'pos') || '-';
  const memberShift = getField(member, 'shift') || '-';
  const memberLokasiId = getField(member, 'lokasi_id', 'lokasiId') || null;
  const memberSkor = Number(getField(member, 'skor', 'score') || 0);
  const memberKehadiran = getField(member, 'kehadiran') || '-';
  const memberTotalPatroli = Number(getField(member, 'totalPatroli', 'total_patroli') || 0);
  const memberLastSeen = getField(member, 'lastSeen', 'last_seen') || '-';
  const memberLastLat = getField(member, 'last_latitude', 'lastLatitude');
  const memberLastLng = getField(member, 'last_longitude', 'lastLongitude');

  // Find member's lokasi from lokasi table by lokasi_id
  const memberLokasi = useMemo(() => {
    if (!memberLokasiId) return null;
    return lokasiList.find((l) => String(getField(l, 'id', '_id')) === String(memberLokasiId));
  }, [memberLokasiId, lokasiList]);

  const memberLokasiNama =
    getField(memberLokasi, 'nama', 'name') ||
    getField(member, 'lokasi', 'lokasi_nama') ||
    (lang === 'en' ? 'Not Assigned' : 'Belum Ditentukan');

  // Find member's pos within lokasi.posList
  const memberPos = useMemo(() => {
    if (!memberLokasi || !member) return null;
    const posList = getField(memberLokasi, 'posList', 'pos_list') || [];
    if (!Array.isArray(posList)) return null;
    return posList.find((p: any) => getField(p, 'nama', 'name') === memberPosJaga);
  }, [memberLokasi, member, memberPosJaga]);

  // Checkpoints at member's location - filter by lokasi_id (not lokasi name)
  const memberCheckpoints = useMemo(() => {
    if (!memberLokasiId) return [];
    return storeCheckpoints.filter((c) => {
      const cLokId = String(getField(c, 'lokasi_id', 'lokasiId') || '');
      const cLokNama = getField(c, 'lokasi') || '';
      return cLokId === String(memberLokasiId) || cLokNama === memberLokasiNama;
    });
  }, [storeCheckpoints, memberLokasiId, memberLokasiNama]);

  // === Fetch activity data (CRITICAL FIX: now uses extractArray for paginated response) ===
  const fetchActivityData = useCallback(async () => {
    if (!member || !memberId) return;
    setActivityLoading(true);
    try {
      // Fetch absensi for this user - DB: user_id
      let absArr: any[] = [];
      try {
        const abData = await absensiApi.list(`user_id=${memberId}`);
        absArr = extractArray(abData);
      } catch (e) {
        console.log('[Detail] absensi fetch error:', e);
      }

      if (absArr.length > 0) {
        setAbsensiList(
          absArr.sort((a: any, b: any) =>
            new Date(getField(b, 'created_at', 'createdAt') || 0).getTime() -
            new Date(getField(a, 'created_at', 'createdAt') || 0).getTime()
          )
        );
      } else {
        // Fallback to store
        const filtered = storeAbsensi.filter((a) => {
          const aUserId = String(getField(a, 'user_id', 'userId') || '');
          return aUserId === memberId;
        });
        setAbsensiList(
          filtered.map((a) => ({
            id: getField(a, 'id'),
            tipe: getField(a, 'tipe'),
            status: getField(a, 'status'),
            pos_jaga: getField(a, 'pos_jaga', 'posJaga'),
            alamat: getField(a, 'alamat'),
            dalam_radius: getField(a, 'dalam_radius', 'dalamRadius'),
            created_at: getField(a, 'created_at', 'createdAt', 'waktu'),
          }))
        );
      }

      // Fetch patroli - DB: user_id
      let ptArr: any[] = [];
      try {
        const ptData = await patroliApi.list(`user_id=${memberId}`);
        ptArr = extractArray(ptData);
      } catch (e) {
        console.log('[Detail] patroli fetch error:', e);
      }

      if (ptArr.length > 0) {
        setPatroliList(
          ptArr.sort((a: any, b: any) =>
            new Date(getField(b, 'created_at', 'createdAt') || 0).getTime() -
            new Date(getField(a, 'created_at', 'createdAt') || 0).getTime()
          )
        );
      } else {
        // Fall back to global patroli list filtered by user_id
        try {
          const allPtRaw = await patroliApi.list();
          const allPt = extractArray(allPtRaw);
          setPatroliList(
            allPt
              .filter((p: any) => String(getField(p, 'user_id', 'userId') || '') === memberId)
              .sort((a: any, b: any) =>
                new Date(getField(b, 'created_at', 'createdAt') || 0).getTime() -
                new Date(getField(a, 'created_at', 'createdAt') || 0).getTime()
              )
          );
        } catch (e) {
          console.log('[Detail] patroli fallback error:', e);
          setPatroliList([]);
        }
      }

      // Fetch laporan harian - DB: user_id
      let lhArr: any[] = [];
      try {
        const lhData = await laporanApi.harianList(`user_id=${memberId}`);
        lhArr = extractArray(lhData);
      } catch (e) {
        console.log('[Detail] LH fetch error:', e);
      }

      if (lhArr.length > 0) {
        setLaporanHList(lhArr);
      } else {
        setLaporanHList(
          storeLH
            .filter((l) => {
              const lUserId = String(getField(l, 'user_id', 'userId') || '');
              return lUserId === memberId;
            })
            .map((l) => ({
              id: getField(l, 'id'),
              tanggal: getField(l, 'tanggal'),
              shift: getField(l, 'shift'),
              kondisi: getField(l, 'kondisi'),
              aktivitas: getField(l, 'aktivitas') || '',
              temuan: getField(l, 'temuan') || '',
              status: getField(l, 'status'),
              created_at: getField(l, 'created_at', 'createdAt') || '',
            }))
        );
      }

      // Fetch laporan kejadian - DB: user_id
      let lkArr: any[] = [];
      try {
        const lkData = await laporanApi.kejadianList(`user_id=${memberId}`);
        lkArr = extractArray(lkData);
      } catch (e) {
        console.log('[Detail] LK fetch error:', e);
      }

      if (lkArr.length > 0) {
        setLaporanKList(lkArr);
      } else {
        setLaporanKList(
          storeLK
            .filter((l) => {
              const lUserId = String(getField(l, 'user_id', 'userId') || '');
              return lUserId === memberId;
            })
            .map((l) => ({
              id: getField(l, 'id'),
              jenis: getField(l, 'jenis'),
              prioritas: getField(l, 'prioritas'),
              status: getField(l, 'status'),
              kronologi: getField(l, 'kronologi') || '',
              lokasi_text: getField(l, 'lokasi_text', 'lokasi') || '',
              waktu_kejadian: getField(l, 'waktu_kejadian', 'waktuKejadian') || '',
              created_at: getField(l, 'created_at', 'createdAt') || '',
            }))
        );
      }

      activityFetchedRef.current = true;
    } catch (err) {
      console.log('[Detail] Activity fetch error:', err);
      // Last-resort fallback for absensi from store
      setAbsensiList(
        storeAbsensi
          .filter((a) => String(getField(a, 'user_id', 'userId') || '') === memberId)
          .map((a) => ({
            id: getField(a, 'id'),
            tipe: getField(a, 'tipe'),
            status: getField(a, 'status'),
            pos_jaga: getField(a, 'pos_jaga', 'posJaga'),
            alamat: getField(a, 'alamat'),
            created_at: getField(a, 'created_at', 'createdAt', 'waktu'),
          }))
      );
    } finally {
      setActivityLoading(false);
    }
  }, [member, memberId, storeAbsensi, storeLH, storeLK]);

  useEffect(() => {
    if (tab === 1) fetchActivityData();
  }, [tab, fetchActivityData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (tab === 1) await fetchActivityData();
      await useDataStore.getState().loadAllData?.();
    } catch (e) {
      console.log('[Detail] Refresh error:', e);
    } finally {
      setRefreshing(false);
    }
  }, [tab, fetchActivityData]);

  // Safe date formatter - returns "-" for empty/invalid input
  const fmtDate = useCallback((d: any) => {
    if (!d) return '-';
    try {
      const dt = new Date(d);
      if (isNaN(dt.getTime())) return String(d);
      return dt.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return String(d);
    }
  }, []);

  // --- EARLY RETURN: Member not found ---
  if (!member) {
    return (
      <View style={[styl.container, { backgroundColor: theme.bg }]}>
        <View style={[styl.header, { paddingTop: insets.top + 12 }, { backgroundColor: isDark ? theme.bgCard : Colors.primaryDark }]}>
          <TouchableOpacity style={styl.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styl.headerTitle}>{lang === 'en' ? 'Member Not Found' : 'Anggota Tidak Ditemukan'}</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Ionicons name="person-outline" size={48} color={theme.textMuted} />
          <Text style={{ color: theme.textMuted }}>NRP: {nrp || '-'}</Text>
          <Button
            title={lang === 'en' ? 'Go Back' : 'Kembali'}
            variant="outline"
            size="medium"
            onPress={() => navigation.goBack()}
          />
        </View>
      </View>
    );
  }

  // --- Pre-compute map marker for Lokasi tab ---
  const mapMarker: MapMarker | null =
    memberLastLat != null && memberLastLng != null && !isNaN(Number(memberLastLat)) && !isNaN(Number(memberLastLng))
      ? {
          id: memberId,
          latitude: Number(memberLastLat),
          longitude: Number(memberLastLng),
          title: memberNama,
          description: `${memberPosJaga} â€¢ ${memberShift}`,
          type: (mStatus === 'patroli' ? 'patrol' : 'person') as MapMarker['type'],
          color: ms.color,
          status: mStatus,
        }
      : null;

  return (
    <View style={[styl.container, { backgroundColor: theme.bg }]}>
      {/* Header with member info */}
      <View style={[styl.header, { paddingTop: insets.top + 12 }, { backgroundColor: isDark ? theme.bgCard : Colors.primaryDark }]}>
        <TouchableOpacity style={styl.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={isDark ? theme.text : '#fff'} />
        </TouchableOpacity>

        <View style={styl.profileSection}>
          <View style={styl.avatarWrap}>
            <Image source={{ uri: memberFoto }} style={styl.avatar} />
            <View style={[styl.statusDot, { backgroundColor: ms.color }]} />
          </View>
          <Text style={[styl.memberName, { color: isDark ? theme.text : '#fff' }]}>{memberNama}</Text>
          <Text style={[styl.memberNrp, { color: isDark ? theme.textMuted : 'rgba(255,255,255,0.6)' }]}>
            NRP: {memberNrp} â€¢ {memberRole}
          </Text>
          <View style={styl.badgeRow}>
            <Badge text={ms.label} variant={ms.variant} />
            {memberRole === 'komandan' && <Badge text="Komandan" variant="purple" />}
          </View>
        </View>

        {/* Quick stats */}
        <View style={styl.quickStats}>
          <View style={styl.qsItem}>
            <Text style={[styl.qsVal, { color: isDark ? theme.text : '#fff' }]}>{memberKehadiran}</Text>
            <Text style={[styl.qsLabel, { color: isDark ? theme.textMuted : 'rgba(255,255,255,0.5)' }]}>
              {lang === 'en' ? 'Attend.' : 'Kehadiran'}
            </Text>
          </View>
          <View style={styl.qsItem}>
            <Text style={[styl.qsVal, { color: isDark ? theme.text : '#fff' }]}>{memberTotalPatroli}</Text>
            <Text style={[styl.qsLabel, { color: isDark ? theme.textMuted : 'rgba(255,255,255,0.5)' }]}>
              {lang === 'en' ? 'Patrols' : 'Patroli'}
            </Text>
          </View>
          <View style={styl.qsItem}>
            <Text style={[styl.qsVal, { color: isDark ? theme.text : '#fff' }]}>{memberSkor}</Text>
            <Text style={[styl.qsLabel, { color: isDark ? theme.textMuted : 'rgba(255,255,255,0.5)' }]}>
              {lang === 'en' ? 'Score' : 'Skor'}
            </Text>
          </View>
          <View style={styl.qsItem}>
            <Text style={[styl.qsVal, { color: isDark ? theme.text : '#fff' }]} numberOfLines={1}>
              {memberLastSeen}
            </Text>
            <Text style={[styl.qsLabel, { color: isDark ? theme.textMuted : 'rgba(255,255,255,0.5)' }]}>
              {lang === 'en' ? 'Last Seen' : 'Terakhir'}
            </Text>
          </View>
        </View>
      </View>

      {/* Tabs */}
      <View style={[styl.tabRow, { backgroundColor: theme.bgCard, borderBottomColor: theme.border }]}>
        {TABS.map((name, i) => (
          <TouchableOpacity
            key={`tab-${i}`}
            style={[styl.tab, tab === i && { borderBottomColor: theme.primary }]}
            onPress={() => setTab(i)}
          >
            <Text style={[styl.tabText, { color: tab === i ? theme.primary : theme.textMuted }]}>{name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styl.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {/* ===== TAB: PROFIL ===== */}
        {tab === 0 && (
          <>
            <Card style={[styl.infoCard, { backgroundColor: theme.bgCard }]}>
              <InfoRow icon="person" label={lang === 'en' ? 'Full Name' : 'Nama'} value={memberNama} theme={theme} />
              <InfoRow icon="id-card" label="NRP" value={memberNrp} theme={theme} />
              <InfoRow icon="call" label={lang === 'en' ? 'Phone' : 'No. HP'} value={memberNoHp} theme={theme} />
              <InfoRow icon="shield" label="Role" value={memberRole} theme={theme} />
              <InfoRow icon="business" label={lang === 'en' ? 'Location' : 'Lokasi'} value={memberLokasiNama} theme={theme} />
              <InfoRow icon="location" label={lang === 'en' ? 'Guard Post' : 'Pos Jaga'} value={memberPosJaga} theme={theme} />
              <InfoRow icon="time" label="Shift" value={memberShift} theme={theme} />
              <InfoRow
                icon="star"
                label={lang === 'en' ? 'Score' : 'Skor'}
                value={`${memberSkor}`}
                theme={theme}
                color={Colors.success}
              />
            </Card>

            <View style={styl.actionsRow}>
              <Button
                title="Edit"
                variant="outline"
                size="small"
                icon="create-outline"
                onPress={() => navigation.navigate('TambahEditUser', { userId: memberId })}
                style={{ flex: 1 }}
              />
              <Button
                title={lang === 'en' ? 'Message' : 'Pesan'}
                variant="outline"
                size="small"
                icon="chatbubble-outline"
                onPress={() =>
                  Alert.alert('Info', lang === 'en' ? 'Messaging feature coming soon' : 'Fitur pesan segera hadir')
                }
                style={{ flex: 1 }}
              />
            </View>
          </>
        )}

        {/* ===== TAB: AKTIVITAS ===== */}
        {tab === 1 && (
          <>
            {activityLoading && !activityFetchedRef.current ? (
              <View style={styl.loadingWrap}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={[styl.loadingText, { color: theme.textMuted }]}>
                  {lang === 'en' ? 'Loading activity...' : 'Memuat aktivitas...'}
                </Text>
              </View>
            ) : (
              <>
                {/* Activity summary */}
                <View style={styl.actSummary}>
                  <View style={[styl.actSumCard, { backgroundColor: theme.bgCard, borderLeftColor: Colors.success }]}>
                    <Text style={[styl.actSumVal, { color: Colors.success }]}>{absensiList.length}</Text>
                    <Text style={[styl.actSumLbl, { color: theme.textMuted }]}>
                      {lang === 'en' ? 'Check-ins' : 'Absensi'}
                    </Text>
                  </View>
                  <View style={[styl.actSumCard, { backgroundColor: theme.bgCard, borderLeftColor: Colors.primary }]}>
                    <Text style={[styl.actSumVal, { color: Colors.primary }]}>{patroliList.length}</Text>
                    <Text style={[styl.actSumLbl, { color: theme.textMuted }]}>
                      {lang === 'en' ? 'Patrols' : 'Patroli'}
                    </Text>
                  </View>
                  <View style={[styl.actSumCard, { backgroundColor: theme.bgCard, borderLeftColor: Colors.warning }]}>
                    <Text style={[styl.actSumVal, { color: Colors.warning }]}>
                      {laporanHList.length + laporanKList.length}
                    </Text>
                    <Text style={[styl.actSumLbl, { color: theme.textMuted }]}>
                      {lang === 'en' ? 'Reports' : 'Laporan'}
                    </Text>
                  </View>
                </View>

                {/* Absensi */}
                <Text style={[styl.sectionTitle, { color: theme.text }]}>
                  {lang === 'en' ? 'Attendance Records' : 'Riwayat Absensi'} ({absensiList.length})
                </Text>
                {absensiList.length === 0 ? (
                  <Card style={{ backgroundColor: theme.bgCard }}>
                    <Text style={[styl.emptyText, { color: theme.textMuted }]}>
                      {lang === 'en' ? 'No attendance records yet' : 'Belum ada data absensi'}
                    </Text>
                  </Card>
                ) : (
                  absensiList.slice(0, 10).map((a: any, idx: number) => {
                    const aTipe = getField(a, 'tipe') || 'masuk';
                    const aStatus = getField(a, 'status') || 'hadir';
                    const aPos = getField(a, 'pos_jaga', 'posJaga') || getField(a, 'alamat') || '-';
                    const aDate = getField(a, 'created_at', 'createdAt', 'waktu') || '';
                    const aId = getField(a, 'id') || `abs-${idx}`;
                    return (
                      <Card key={`abs-${aId}`} style={[styl.actCard, { backgroundColor: theme.bgCard }]}>
                        <View style={styl.actRow}>
                          <View
                            style={[
                              styl.actIcon,
                              { backgroundColor: aTipe === 'masuk' ? `${Colors.success}15` : `${Colors.danger}15` },
                            ]}
                          >
                            <Ionicons
                              name={aTipe === 'masuk' ? 'log-in' : 'log-out'}
                              size={18}
                              color={aTipe === 'masuk' ? Colors.success : Colors.danger}
                            />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styl.actTitle, { color: theme.text }]}>
                              {aTipe === 'masuk'
                                ? lang === 'en'
                                  ? 'Check In'
                                  : 'Masuk'
                                : lang === 'en'
                                ? 'Check Out'
                                : 'Keluar'}
                            </Text>
                            <Text style={[styl.actSub, { color: theme.textMuted }]}>
                              {aPos} â€¢ {fmtDate(aDate)}
                            </Text>
                          </View>
                          <Badge
                            text={
                              aStatus === 'hadir'
                                ? lang === 'en'
                                  ? 'On Time'
                                  : 'Tepat'
                                : lang === 'en'
                                ? 'Late'
                                : 'Terlambat'
                            }
                            variant={aStatus === 'hadir' ? 'success' : 'warning'}
                          />
                        </View>
                      </Card>
                    );
                  })
                )}

                {/* Patroli */}
                <Text style={[styl.sectionTitle, { color: theme.text }]}>
                  {lang === 'en' ? 'Patrol History' : 'Riwayat Patroli'} ({patroliList.length})
                </Text>
                {patroliList.length === 0 ? (
                  <Card style={{ backgroundColor: theme.bgCard }}>
                    <Text style={[styl.emptyText, { color: theme.textMuted }]}>
                      {lang === 'en' ? 'No patrol records yet' : 'Belum ada data patroli'}
                    </Text>
                  </Card>
                ) : (
                  patroliList.slice(0, 10).map((p: any, idx: number) => {
                    const pId = getField(p, 'id') || `pt-${idx}`;
                    return (
                      <Card key={`pt-${pId}`} style={[styl.actCard, { backgroundColor: theme.bgCard }]}>
                        <View style={styl.actRow}>
                          <View style={[styl.actIcon, { backgroundColor: `${Colors.primary}15` }]}>
                            <Ionicons name="footsteps" size={18} color={Colors.primary} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styl.actTitle, { color: theme.text }]}>
                              {getField(p, 'route_name', 'routeName') || 'Patroli'}
                            </Text>
                            <Text style={[styl.actSub, { color: theme.textMuted }]}>
                              {getField(p, 'checkpoint_scanned', 'checkpointScanned') || 0}/
                              {getField(p, 'checkpoint_total', 'checkpointTotal') || 0} checkpoint â€¢{' '}
                              {fmtDate(getField(p, 'created_at', 'createdAt'))}
                            </Text>
                          </View>
                          <Badge
                            text={
                              getField(p, 'status') === 'completed'
                                ? lang === 'en'
                                  ? 'Done'
                                  : 'Selesai'
                                : lang === 'en'
                                ? 'In Progress'
                                : 'Berjalan'
                            }
                            variant={getField(p, 'status') === 'completed' ? 'success' : 'info'}
                          />
                        </View>
                      </Card>
                    );
                  })
                )}

                {/* Laporan */}
                {(laporanHList.length > 0 || laporanKList.length > 0) && (
                  <>
                    <Text style={[styl.sectionTitle, { color: theme.text }]}>
                      {lang === 'en' ? 'Reports' : 'Laporan'} ({laporanHList.length + laporanKList.length})
                    </Text>
                    {laporanHList.map((l: any, idx: number) => {
                      const lId = getField(l, 'id') || `lh-${idx}`;
                      const lKondisi = getField(l, 'kondisi');
                      return (
                        <Card key={`lh-${lId}`} style={[styl.actCard, { backgroundColor: theme.bgCard }]}>
                          <View style={styl.actRow}>
                            <View style={[styl.actIcon, { backgroundColor: `${Colors.warning}15` }]}>
                              <Ionicons name="document-text" size={18} color={Colors.warning} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={[styl.actTitle, { color: theme.text }]}>
                                {lang === 'en' ? 'Daily Report' : 'Laporan Harian'} -{' '}
                                {lKondisi === 'aman'
                                  ? lang === 'en'
                                    ? 'Safe'
                                    : 'Aman'
                                  : lKondisi === 'ada_masalah'
                                  ? lang === 'en'
                                    ? 'Issue'
                                    : 'Ada Masalah'
                                  : lKondisi || '-'}
                              </Text>
                              <Text style={[styl.actSub, { color: theme.textMuted }]}>
                                {getField(l, 'tanggal') || '-'} â€¢ {getField(l, 'shift') || '-'}
                              </Text>
                            </View>
                            <Badge
                              text={getField(l, 'status') === 'approved' ? 'âœ“' : 'â³'}
                              variant={getField(l, 'status') === 'approved' ? 'success' : 'warning'}
                            />
                          </View>
                        </Card>
                      );
                    })}
                    {laporanKList.map((l: any, idx: number) => {
                      const lId = getField(l, 'id') || `lk-${idx}`;
                      return (
                        <Card key={`lk-${lId}`} style={[styl.actCard, { backgroundColor: theme.bgCard }]}>
                          <View style={styl.actRow}>
                            <View style={[styl.actIcon, { backgroundColor: `${Colors.danger}15` }]}>
                              <Ionicons name="alert-circle" size={18} color={Colors.danger} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={[styl.actTitle, { color: theme.text }]}>
                                {getField(l, 'jenis') || '-'}
                              </Text>
                              <Text style={[styl.actSub, { color: theme.textMuted }]}>
                                {lang === 'en' ? 'Priority' : 'Prioritas'}: {getField(l, 'prioritas') || '-'} â€¢{' '}
                                {fmtDate(getField(l, 'created_at', 'createdAt'))}
                              </Text>
                            </View>
                            <Badge
                              text={getField(l, 'status') === 'approved' ? 'âœ“' : 'â³'}
                              variant={getField(l, 'status') === 'approved' ? 'success' : 'warning'}
                            />
                          </View>
                        </Card>
                      );
                    })}
                  </>
                )}

                {absensiList.length === 0 &&
                  patroliList.length === 0 &&
                  laporanHList.length === 0 &&
                  laporanKList.length === 0 && (
                    <View style={styl.emptyWrap}>
                      <Ionicons name="analytics-outline" size={48} color={theme.textMuted} />
                      <Text style={[styl.emptyTitle, { color: theme.text }]}>
                        {lang === 'en' ? 'No activity yet' : 'Belum ada aktivitas'}
                      </Text>
                      <Text style={[styl.emptyDesc, { color: theme.textMuted }]}>
                        {lang === 'en'
                          ? 'Attendance, patrols, and reports will appear here.'
                          : 'Absensi, patroli, dan laporan akan muncul di sini.'}
                      </Text>
                    </View>
                  )}
              </>
            )}
          </>
        )}

        {/* ===== TAB: LOKASI ===== */}
        {tab === 2 && (
          <>
            <Card style={[styl.locCard, { backgroundColor: theme.bgCard }]}>
              <View style={styl.locHeader}>
                <View style={[styl.locIcon, { backgroundColor: isDark ? `${Colors.primary}20` : Colors.primarySoft }]}>
                  <Ionicons name="business" size={22} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styl.locName, { color: theme.text }]}>{memberLokasiNama}</Text>
                  {memberLokasi && (
                    <Text style={[styl.locAddr, { color: theme.textMuted }]}>
                      {getField(memberLokasi, 'alamat', 'address') || ''}
                    </Text>
                  )}
                </View>
                {memberLokasi && (
                  <Badge
                    text={
                      getField(memberLokasi, 'status') === 'active' ? (lang === 'en' ? 'Active' : 'Aktif') : 'Off'
                    }
                    variant={getField(memberLokasi, 'status') === 'active' ? 'success' : 'default'}
                  />
                )}
              </View>
            </Card>

            <Text style={[styl.sectionTitle, { color: theme.text }]}>
              {lang === 'en' ? 'Assigned Guard Post' : 'Pos Jaga Ditugaskan'}
            </Text>
            <Card style={[styl.locCard, { backgroundColor: theme.bgCard }]}>
              {memberPos ? (
                <View style={styl.posInfo}>
                  <View
                    style={[
                      styl.posIcon,
                      {
                        backgroundColor:
                          getField(memberPos, 'status') === 'active' ? `${Colors.success}15` : `${Colors.textMuted}15`,
                      },
                    ]}
                  >
                    <Ionicons
                      name="location"
                      size={20}
                      color={getField(memberPos, 'status') === 'active' ? Colors.success : Colors.textMuted}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styl.posName, { color: theme.text }]}>
                      {getField(memberPos, 'nama', 'name') || '-'}
                    </Text>
                    <Text style={[styl.posMeta, { color: theme.textMuted }]}>
                      Radius: {getField(memberPos, 'radius') || 100}m
                    </Text>
                    {getField(memberPos, 'latitude') != null ? (
                      <Text style={[styl.posCoords, { color: theme.textMuted }]}>
                        ðŸ“ {Number(getField(memberPos, 'latitude')).toFixed(4)},{' '}
                        {Number(getField(memberPos, 'longitude')).toFixed(4)}
                      </Text>
                    ) : null}
                  </View>
                  <Badge
                    text={getField(memberPos, 'status') === 'active' ? (lang === 'en' ? 'Active' : 'Aktif') : 'Off'}
                    variant={getField(memberPos, 'status') === 'active' ? 'success' : 'default'}
                  />
                </View>
              ) : (
                <View style={styl.noPos}>
                  <Ionicons name="location-outline" size={24} color={theme.textMuted} />
                  <Text style={[styl.noPosText, { color: theme.textMuted }]}>
                    {memberPosJaga !== '-'
                      ? `${memberPosJaga} (${lang === 'en' ? 'post data not found' : 'data pos tidak ditemukan'})`
                      : lang === 'en'
                      ? 'No post assigned'
                      : 'Belum ada pos ditugaskan'}
                  </Text>
                </View>
              )}
            </Card>

            <Text style={[styl.sectionTitle, { color: theme.text }]}>GPS Tracking</Text>
            <Card style={[styl.locCard, { backgroundColor: theme.bgCard }]}>
              {mapMarker ? (
                <>
                  <View style={styl.gpsRow}>
                    <View style={[styl.gpsIcon, { backgroundColor: `${Colors.success}15` }]}>
                      <Ionicons name="navigate" size={20} color={Colors.success} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styl.gpsTitle, { color: theme.text }]}>
                        {lang === 'en' ? 'GPS Active' : 'GPS Aktif'}
                      </Text>
                      <Text style={[styl.gpsMeta, { color: theme.textMuted }]}>
                        {Number(memberLastLat).toFixed(6)}, {Number(memberLastLng).toFixed(6)}
                      </Text>
                      <Text style={[styl.gpsMeta, { color: theme.textMuted }]}>
                        {lang === 'en' ? 'Last update' : 'Terakhir diperbarui'}: {memberLastSeen}
                      </Text>
                    </View>
                    <Badge text={lang === 'en' ? 'Tracked' : 'Terlacak'} variant="success" />
                  </View>
                  <View style={{ marginTop: 12, borderRadius: Radius.md, overflow: 'hidden' }}>
                    <MapTracker
                      markers={[mapMarker]}
                      circles={
                        getField(memberPos, 'latitude') != null
                          ? [
                              {
                                latitude: Number(getField(memberPos, 'latitude')),
                                longitude: Number(getField(memberPos, 'longitude')),
                                radius: Number(getField(memberPos, 'radius')) || 100,
                                color: Colors.purple,
                                label: getField(memberPos, 'nama', 'name') || '',
                              },
                            ]
                          : []
                      }
                      isDark={isDark}
                      height={200}
                    />
                  </View>
                </>
              ) : (
                <View style={styl.noGps}>
                  <Ionicons name="navigate-outline" size={28} color={theme.textMuted} />
                  <Text style={[styl.noGpsTitle, { color: theme.text }]}>
                    {lang === 'en' ? 'GPS Not Available' : 'GPS Tidak Tersedia'}
                  </Text>
                  <Text style={[styl.noGpsDesc, { color: theme.textMuted }]}>
                    {lang === 'en'
                      ? 'Location data will appear when the member enables GPS on their device.'
                      : 'Data lokasi akan muncul saat anggota mengaktifkan GPS di perangkat mereka.'}
                  </Text>
                </View>
              )}
            </Card>

            {memberCheckpoints.length > 0 && (
              <>
                <Text style={[styl.sectionTitle, { color: theme.text }]}>
                  {lang === 'en' ? 'Nearby Checkpoints' : 'Checkpoint Terdekat'} ({memberCheckpoints.length})
                </Text>
                {memberCheckpoints.map((cp, idx) => {
                  const cpId = getField(cp, 'id') || `cp-${idx}`;
                  return (
                    <Card key={`cp-${cpId}`} style={[styl.cpCard, { backgroundColor: theme.bgCard }]}>
                      <View style={styl.cpRow}>
                        <View
                          style={[
                            styl.cpIcon,
                            { backgroundColor: isDark ? `${Colors.purple}20` : Colors.purpleSoft },
                          ]}
                        >
                          <Ionicons name="qr-code" size={16} color={Colors.purple} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styl.cpName, { color: theme.text }]}>
                            {getField(cp, 'nama', 'name') || '-'}
                          </Text>
                          <Text style={[styl.cpMeta, { color: theme.textMuted }]}>
                            {getField(cp, 'area') || '-'} â€¢ Radius {getField(cp, 'radius') || 100}m
                          </Text>
                        </View>
                        <Badge
                          text={
                            getField(cp, 'status') === 'active' ? (lang === 'en' ? 'Active' : 'Aktif') : 'Off'
                          }
                          variant={getField(cp, 'status') === 'active' ? 'success' : 'default'}
                        />
                      </View>
                    </Card>
                  );
                })}
              </>
            )}

            <Text style={[styl.sectionTitle, { color: theme.text }]}>
              {lang === 'en' ? 'Shift Schedule' : 'Jadwal Shift'}
            </Text>
            <Card style={[styl.locCard, { backgroundColor: theme.bgCard }]}>
              <View style={styl.shiftInfo}>
                <View style={[styl.shiftIcon, { backgroundColor: `${Colors.warning}15` }]}>
                  <Ionicons name="time" size={20} color={Colors.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styl.shiftLabel, { color: theme.text }]}>{memberShift}</Text>
                  <Text style={[styl.shiftDesc, { color: theme.textMuted }]}>
                    {lang === 'en' ? 'Current assigned shift' : 'Shift yang sedang ditugaskan'}
                  </Text>
                </View>
              </View>
            </Card>
          </>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

function InfoRow({
  icon,
  label,
  value,
  theme,
  color,
}: {
  icon: string;
  label: string;
  value: string;
  theme: any;
  color?: string;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: theme.border || '#eee',
      }}
    >
      <Ionicons name={icon as any} size={18} color={theme.textMuted} />
      <Text style={{ fontSize: 12, color: theme.textMuted, width: 80 }}>{label}</Text>
      <Text style={{ fontSize: 14, fontWeight: '600', color: color || theme.text, flex: 1 }}>{value}</Text>
    </View>
  );
}

const styl = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingBottom: 16,
    paddingHorizontal: Spacing.lg,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#fff', textAlign: 'center' },
  profileSection: { alignItems: 'center', marginBottom: 12 },
  avatarWrap: { position: 'relative', marginBottom: 8 },
  avatar: { width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderColor: 'rgba(255,255,255,0.3)' },
  statusDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 3,
    borderColor: '#fff',
  },
  memberName: { fontSize: 20, fontWeight: '700', color: '#fff' },
  memberNrp: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  badgeRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  quickStats: { flexDirection: 'row', gap: 8, marginTop: 8 },
  qsItem: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: Radius.md,
    paddingVertical: 8,
  },
  qsVal: { fontSize: 16, fontWeight: '800', color: '#fff' },
  qsLabel: { fontSize: 9, color: 'rgba(255,255,255,0.5)', marginTop: 1 },
  tabRow: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 14, borderBottomWidth: 2.5, borderBottomColor: 'transparent' },
  tabText: { fontSize: 13, fontWeight: '700' },
  content: { padding: Spacing.base },
  infoCard: { marginBottom: 12 },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  loadingWrap: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  loadingText: { fontSize: 14 },
  actSummary: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  actSumCard: { flex: 1, borderRadius: Radius.md, padding: 12, alignItems: 'center', borderLeftWidth: 3 },
  actSumVal: { fontSize: 22, fontWeight: '800' },
  actSumLbl: { fontSize: 10, marginTop: 2 },
  sectionTitle: { fontSize: 14, fontWeight: '700', marginBottom: 8, marginTop: 12 },
  actCard: { marginBottom: 6 },
  actRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  actIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actTitle: { fontSize: 13, fontWeight: '700' },
  actSub: { fontSize: 11, marginTop: 1 },
  emptyText: { textAlign: 'center', paddingVertical: 16, fontSize: 13 },
  emptyWrap: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '700' },
  emptyDesc: { fontSize: 12, textAlign: 'center', paddingHorizontal: 24, lineHeight: 18 },
  locCard: { marginBottom: 8 },
  locHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  locIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  locName: { fontSize: 16, fontWeight: '700' },
  locAddr: { fontSize: 12, marginTop: 2 },
  posInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  posIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  posName: { fontSize: 14, fontWeight: '700' },
  posMeta: { fontSize: 12, marginTop: 1 },
  posCoords: { fontSize: 11, marginTop: 2 },
  noPos: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  noPosText: { fontSize: 13, flex: 1 },
  gpsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  gpsIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  gpsTitle: { fontSize: 14, fontWeight: '700' },
  gpsMeta: { fontSize: 11, marginTop: 1 },
  noGps: { alignItems: 'center', paddingVertical: 20, gap: 6 },
  noGpsTitle: { fontSize: 14, fontWeight: '700' },
  noGpsDesc: { fontSize: 12, textAlign: 'center', lineHeight: 18, paddingHorizontal: 16 },
  cpCard: { marginBottom: 6 },
  cpRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cpIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  cpName: { fontSize: 13, fontWeight: '600' },
  cpMeta: { fontSize: 11, marginTop: 1 },
  shiftInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  shiftIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  shiftLabel: { fontSize: 16, fontWeight: '700' },
  shiftDesc: { fontSize: 12, marginTop: 1 },
});
