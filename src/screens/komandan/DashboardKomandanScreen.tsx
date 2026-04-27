/**
 * DASHBOARD KOMANDAN - v9 DB Aligned
 *
 * DATABASE ALIGNMENT:
 *   users: id, nama, nrp, role, no_hp, pos_jaga, shift, lokasi_id, foto
 *   absensi: user_id, tipe, pos_jaga, status, dalam_radius, lokasi_id, created_at
 *   laporan_harian: user_id, kondisi, status, pos_jaga, lokasi_id
 *   laporan_kejadian: user_id, jenis, prioritas, waktu_kejadian, lokasi_text, status, lokasi_id
 *   notifikasi: dibaca, target_lokasi_id
 *
 * FIXES:
 * - getField() for dual snake_case/camelCase field access
 * - user.pos_jaga (not posJaga) - DB column
 * - Absensi filter by user_id (not userId), created_at date comparison
 * - Team/map: last_latitude/last_longitude + pos_jaga
 * - Notifikasi: dibaca (DB column)
 * - lokasi_id filtering for komandan scope
 * - Pending laporan uses DB field names
 */
import React, { useEffect, useRef, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius, Shadows } from '../../constants';
import { Card, Badge, MenuCard } from '../../components';
import { useAuthStore } from '../../stores/authStore';
import { useDataStore } from '../../stores/dataStore';
import { useClock } from '../../hooks/useClock';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';
import MapTracker from '../../components/map/MapTracker';

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

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  on_duty: { label: 'On Duty', color: Colors.success },
  patroli: { label: 'Patroli', color: Colors.primary },
  break: { label: 'Break', color: Colors.warning },
  off_duty: { label: 'Off', color: Colors.textMuted },
};

export default function DashboardKomandanScreen({ navigation }: any) {
  const { t, lang } = useI18n();
  const { theme, isDark } = useTheme();
  const user = useAuthStore((s) => s.user);
  const { jam, tanggal } = useClock();
  const team = useDataStore((s) => s.team);
  const notifikasi = useDataStore((s) => s.notifikasi);
  const laporanHarian = useDataStore((s) => s.laporanHarian);
  const laporanKejadian = useDataStore((s) => s.laporanKejadian);
  const absensiRecords = useDataStore((s) => s.absensiRecords);
  const activePatrol = useDataStore((s) => s.activePatrol);
  const panicActive = useDataStore((s) => s.panicActive);
  const [showMap, setShowMap] = useState(false);

  // Komandan lokasi_id - DB column
  const myLokasiId = getField(user, 'lokasi_id', 'lokasiId') || null;

  // Filter team to this company only
  const myTeam = useMemo(() => {
    if (!myLokasiId) return team;
    return team.filter(m => {
      const mLokId = String(getField(m, 'lokasi_id', 'lokasiId') || '');
      return mLokId === String(myLokasiId);
    });
  }, [team, myLokasiId]);

  // Filter laporan by lokasi_id
  const myLaporanH = useMemo(() => {
    if (!myLokasiId) return laporanHarian;
    return laporanHarian.filter(l => String(getField(l, 'lokasi_id', 'lokasiId') || '') === String(myLokasiId));
  }, [laporanHarian, myLokasiId]);

  const myLaporanK = useMemo(() => {
    if (!myLokasiId) return laporanKejadian;
    return laporanKejadian.filter(l => String(getField(l, 'lokasi_id', 'lokasiId') || '') === String(myLokasiId));
  }, [laporanKejadian, myLokasiId]);

  // Filter absensi by lokasi_id
  const myAbsensi = useMemo(() => {
    if (!myLokasiId) return absensiRecords;
    return absensiRecords.filter(a => String(getField(a, 'lokasi_id', 'lokasiId') || '') === String(myLokasiId));
  }, [absensiRecords, myLokasiId]);

  // Notifikasi: use DB column 'dibaca'
  const unreadCount = useMemo(() => notifikasi.filter((n) => !getField(n, 'dibaca', 'read')).length, [notifikasi]);

  // Pending laporan
  const pendingH = useMemo(() => myLaporanH.filter((l) => getField(l, 'status') === 'pending'), [myLaporanH]);
  const pendingK = useMemo(() => myLaporanK.filter((l) => getField(l, 'status') === 'pending'), [myLaporanK]);
  const totalPending = pendingH.length + pendingK.length;

  // Team on duty
  const onDuty = useMemo(() => myTeam.filter((m) => getField(m, 'status') !== 'off_duty').length, [myTeam]);

  // Today's absensi for komandan - DB: user_id, created_at
  const todayAbs = useMemo(() => {
    const uid = getField(user, 'id', '_id') || '';
    const todayStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const recs = myAbsensi.filter((r) => {
      const rUserId = String(getField(r, 'user_id', 'userId') || '');
      if (rUserId !== uid) return false;
      // Check date from created_at or tanggal
      const createdAt = getField(r, 'created_at', 'createdAt') || '';
      const tanggalField = getField(r, 'tanggal') || '';
      return String(createdAt).startsWith(todayStr) || String(tanggalField).includes(todayStr);
    });
    return {
      masuk: recs.find((r) => getField(r, 'tipe') === 'masuk'),
      keluar: recs.find((r) => getField(r, 'tipe') === 'keluar'),
    };
  }, [myAbsensi, user]);

  const absenStep = todayAbs.keluar ? 2 : todayAbs.masuk ? 1 : 0;

  // Map markers - uses last_latitude/last_longitude (DB) with camelCase fallback
  const mapMarkers = useMemo(() => {
    return myTeam.filter(m => {
      const lat = getField(m, 'last_latitude', 'lastLatitude');
      const lng = getField(m, 'last_longitude', 'lastLongitude');
      return lat && lng;
    }).map(m => {
      const lat = getField(m, 'last_latitude', 'lastLatitude');
      const lng = getField(m, 'last_longitude', 'lastLongitude');
      const mStatus = getField(m, 'status') || 'off_duty';
      return {
        id: getField(m, 'id', '_id'),
        latitude: Number(lat),
        longitude: Number(lng),
        title: getField(m, 'nama', 'name') || 'Anggota',
        description: `${getField(m, 'pos_jaga', 'posJaga', 'pos') || '-'} • ${getField(m, 'shift') || '-'}`,
        type: (mStatus === 'patroli' ? 'patrol' : 'person') as any,
        color: (STATUS_MAP[mStatus] || STATUS_MAP.off_duty).color,
        status: mStatus,
      };
    });
  }, [myTeam]);

  // Pulse animation for SOS FAB
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.12, duration: 900, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);

  // User info - DB columns
  const userName = getField(user, 'nama', 'name') || 'Komandan';
  const userPosJaga = getField(user, 'pos_jaga', 'posJaga', 'pos') || '-';
  const userShift = getField(user, 'shift') || '-';
  const userFoto = getField(user, 'foto', 'foto_url', 'avatar') || 'https://via.placeholder.com/50';

  const stats = [
    { icon: 'people', label: lang === 'en' ? 'Team Active' : 'Tim Aktif', value: `${onDuty}/${myTeam.length}`, color: Colors.primary },
    { icon: 'checkmark-circle', label: t('dash.menu.absensi'), value: `${myAbsensi.length}`, color: Colors.success },
    { icon: 'document-text', label: 'Pending', value: `${totalPending}`, color: Colors.warning },
    { icon: 'alert-circle', label: t('dash.incidents'), value: `${pendingK.length}`, color: Colors.danger },
  ];

  return (
    <View style={[st.container, { backgroundColor: theme.bg }]}>
      <View style={[st.header, { backgroundColor: isDark ? theme.bgCard : Colors.primaryDark }]}>
        <View style={st.headerContent}>
          <Image source={{ uri: userFoto }} style={st.avatar} />
          <View style={st.headerInfo}>
            <Text style={st.greeting}>{t('dash.komandan_dashboard')}</Text>
            <Text style={st.userName}>{userName}</Text>
            <Text style={st.userPos}>{userPosJaga} • {userShift}</Text>
          </View>
          <TouchableOpacity style={st.bellBtn} onPress={() => navigation.navigate('Notifikasi')}>
            <Ionicons name="notifications-outline" size={22} color="#fff" />
            {unreadCount > 0 && <View style={st.bellBadge}><Text style={st.bellBadgeText}>{unreadCount}</Text></View>}
          </TouchableOpacity>
        </View>
        <View style={st.headerClock}>
          <View style={st.liveDot} />
          <Text style={st.clockText}>{jam}</Text>
          <Text style={st.dateText}>{tanggal}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>
        {panicActive && (
          <TouchableOpacity style={st.panicBanner}>
            <Ionicons name="warning" size={22} color="#fff" />
            <View style={{ flex: 1 }}><Text style={st.panicTitle}>PANIC ALERT</Text><Text style={st.panicSub}>{lang === 'en' ? 'Member needs emergency help!' : 'Anggota membutuhkan bantuan darurat!'}</Text></View>
            <Ionicons name="chevron-forward" size={20} color="#fff" />
          </TouchableOpacity>
        )}

        <View style={st.kpiRow}>
          {stats.map((s, i) => (
            <View key={i} style={[st.kpiCard, { backgroundColor: theme.bgCard }, isDark ? { borderWidth: 1, borderColor: theme.border } : Shadows.sm]}>
              <Ionicons name={s.icon as any} size={18} color={s.color} />
              <Text style={[st.kpiVal, { color: s.color }]}>{s.value}</Text>
              <Text style={[st.kpiLabel, { color: theme.textMuted }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Map Toggle */}
        <TouchableOpacity
          style={[st.mapToggle, { backgroundColor: theme.bgCard, borderColor: theme.border }, isDark ? { borderWidth: 1 } : Shadows.sm]}
          onPress={() => setShowMap(!showMap)}
        >
          <Ionicons name="map" size={20} color={theme.primary} />
          <Text style={[{ flex: 1, fontWeight: '700', fontSize: 14, color: theme.text }]}>{t('cmd.live_map')}</Text>
          <Badge text={`${mapMarkers.length} ${lang === 'en' ? 'tracked' : 'terlacak'}`} variant="info" />
          <Ionicons name={showMap ? 'chevron-up' : 'chevron-down'} size={18} color={theme.textMuted} />
        </TouchableOpacity>
        {showMap && (
          <View style={{ marginBottom: 12 }}>
            <MapTracker markers={mapMarkers} isDark={isDark} height={280}
              onMarkerPress={(marker) => {
                const m = myTeam.find(x => getField(x, 'id', '_id') === marker.id);
                if (m) navigation.navigate('DetailAnggota', { nrp: getField(m, 'nrp') });
              }} />
          </View>
        )}

        <Text style={[st.sectionTitle, { color: theme.text }]}>{lang === 'en' ? 'My Tasks' : 'Tugas Saya'}</Text>
        <View style={st.menuGrid}>
          <MenuCard icon="finger-print" label={t('dash.menu.absensi')} gradientColor="#2980b9" onPress={() => navigation.navigate('Absensi')} badge={absenStep === 0 ? '!' : undefined} badgeVariant="warning" size="small" />
          <MenuCard icon="navigate-circle" label={t('dash.menu.patroli')} gradientColor="#27ae60" onPress={() => navigation.navigate('Patroli')} badge={activePatrol ? '!' : undefined} badgeVariant="success" size="small" />
          <MenuCard icon="document-text" label={t('dash.menu.laporan_harian')} gradientColor="#f39c12" onPress={() => navigation.navigate('LaporanHarian')} size="small" />
          <MenuCard icon="alert-circle" label={t('dash.menu.laporan_kejadian')} gradientColor="#e74c3c" onPress={() => navigation.navigate('LaporanKejadian')} size="small" />
          <MenuCard icon="swap-horizontal" label={t('dash.menu.serah_terima')} gradientColor="#8e44ad" onPress={() => navigation.navigate('SerahTerima')} size="small" />
          <MenuCard icon="warning" label={t('panic.title')} gradientColor={Colors.danger} onPress={() => navigation.navigate('PanicButton')} size="small" />
        </View>

        <Text style={[st.sectionTitle, { color: theme.text }]}>{lang === 'en' ? 'Team Management' : 'Manajemen Tim'}</Text>
        <View style={st.menuGrid}>
          <MenuCard icon="checkmark-done-circle" label={t('cmd.validate')} gradientColor="#2980b9" onPress={() => navigation.navigate('ValidasiLaporan')} badge={totalPending > 0 ? `${totalPending}` : undefined} badgeVariant="danger" size="small" />
          <MenuCard icon="pulse" label={t('cmd.realtime')} gradientColor="#27ae60" onPress={() => navigation.navigate('MonitorRealtime')} size="small" />
          <MenuCard icon="megaphone" label={t('cmd.broadcast')} gradientColor="#f39c12" onPress={() => navigation.navigate('BroadcastPesan')} size="small" />
        </View>

        {totalPending > 0 && (
          <>
            <View style={st.sectionRow}>
              <Text style={[st.sectionTitle, { color: theme.text }]}>{lang === 'en' ? 'Pending Validation' : 'Menunggu Validasi'}</Text>
              <TouchableOpacity onPress={() => navigation.navigate('ValidasiLaporan')}>
                <Text style={[st.linkText, { color: theme.primary }]}>{t('dash.view_all')} →</Text>
              </TouchableOpacity>
            </View>
            {[...pendingH.slice(0, 2), ...pendingK.slice(0, 1)].map((item: any, idx) => {
              const itemJenis = getField(item, 'jenis');
              const itemKondisi = getField(item, 'kondisi');
              const itemNama = getField(item, 'nama', 'user_nama', 'name') || 'Anggota';
              return (
                <Card key={idx} style={st.pendingCard} variant="bordered" borderColor={itemJenis ? Colors.danger : Colors.warning}>
                  <View style={st.pendingRow}>
                    <Ionicons name={itemJenis ? 'alert-circle' : 'document-text'} size={18} color={itemJenis ? Colors.danger : Colors.warning} />
                    <View style={{ flex: 1 }}>
                      <Text style={[st.pendingName, { color: theme.text }]}>{itemNama}</Text>
                      <Text style={[st.pendingDesc, { color: theme.textMuted }]}>
                        {itemJenis
                          ? `${lang === 'en' ? 'Incident' : 'Kejadian'}: ${itemJenis}`
                          : `${lang === 'en' ? 'Daily' : 'Harian'}: ${itemKondisi || '-'}`}
                      </Text>
                    </View>
                    <Badge text="Pending" variant="warning" />
                  </View>
                </Card>
              );
            })}
          </>
        )}

        <View style={st.sectionRow}>
          <Text style={[st.sectionTitle, { color: theme.text }]}>{lang === 'en' ? 'My Team' : 'Tim Saya'}</Text>
          <TouchableOpacity onPress={() => navigation.navigate('MonitorRealtime')}>
            <Text style={[st.linkText, { color: theme.primary }]}>{t('dash.view_all')} →</Text>
          </TouchableOpacity>
        </View>
        {myTeam.slice(0, 4).map((m: any) => {
          const mStatus = getField(m, 'status') || 'off_duty';
          const ms = STATUS_MAP[mStatus] || STATUS_MAP.off_duty;
          const mFoto = getField(m, 'foto', 'foto_url', 'avatar') || 'https://via.placeholder.com/40';
          const mNama = getField(m, 'nama', 'name') || 'Anggota';
          const mPos = getField(m, 'pos_jaga', 'posJaga', 'pos') || '-';
          const mShift = getField(m, 'shift') || '-';
          const mNrp = getField(m, 'nrp') || '';
          return (
            <TouchableOpacity key={getField(m, 'id', '_id')} style={[st.memberCard, { backgroundColor: theme.bgCard }, isDark ? { borderWidth: 1, borderColor: theme.border } : Shadows.sm]} onPress={() => navigation.navigate('DetailAnggota', { nrp: mNrp })}>
              <Image source={{ uri: mFoto }} style={st.memberAvatar} />
              <View style={[st.memberDot, { backgroundColor: ms.color }]} />
              <View style={{ flex: 1 }}>
                <Text style={[st.memberName, { color: theme.text }]}>{mNama}</Text>
                <Text style={[st.memberPos, { color: theme.textMuted }]}>{mPos} • {mShift}</Text>
              </View>
              <Badge text={ms.label} variant={mStatus === 'on_duty' ? 'success' : mStatus === 'patroli' ? 'info' : mStatus === 'break' ? 'warning' : 'default'} />
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity style={[st.broadcastBtn, { backgroundColor: Colors.warning }]} onPress={() => navigation.navigate('BroadcastPesan')}>
          <Ionicons name="megaphone" size={18} color="#fff" />
          <Text style={st.broadcastText}>{t('cmd.broadcast_send')}</Text>
        </TouchableOpacity>

        <View style={{ height: 100 }} />
      </ScrollView>

      <TouchableOpacity style={st.panicFab} onPress={() => navigation.navigate('PanicButton')} activeOpacity={0.8}>
        <Animated.View style={[st.panicInner, { transform: [{ scale: pulseAnim }] }]}>
          <Ionicons name="warning" size={20} color="#fff" />
          <Text style={st.panicFabText}>SOS</Text>
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingTop: 46, paddingBottom: 16, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerContent: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg },
  avatar: { width: 50, height: 50, borderRadius: 25, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
  headerInfo: { flex: 1, marginLeft: 12 },
  greeting: { fontSize: 12, color: 'rgba(255,255,255,0.65)' },
  userName: { fontSize: 18, fontWeight: '700', color: '#fff' },
  userPos: { fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 1 },
  bellBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  bellBadge: { position: 'absolute', top: 0, right: 0, backgroundColor: Colors.danger, borderRadius: 10, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  bellBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  headerClock: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.lg, marginTop: 10 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#2ecc71' },
  clockText: { fontSize: 16, fontWeight: '700', color: '#fff', fontVariant: ['tabular-nums'] },
  dateText: { fontSize: 12, color: 'rgba(255,255,255,0.55)', flex: 1 },
  scroll: { padding: Spacing.base },
  panicBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.danger, borderRadius: Radius.lg, padding: 14, marginBottom: 12 },
  panicTitle: { ...Typography.bodyBold, color: '#fff' },
  panicSub: { ...Typography.caption, color: 'rgba(255,255,255,0.8)' },
  kpiRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  kpiCard: { flex: 1, borderRadius: Radius.lg, padding: 12, alignItems: 'center', gap: 2 },
  kpiVal: { fontSize: 18, fontWeight: '800' },
  kpiLabel: { fontSize: 10, textAlign: 'center' },
  mapToggle: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: Radius.lg, padding: 14, marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 8, marginTop: 8 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  linkText: { ...Typography.smallBold },
  menuGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 },
  pendingCard: { marginBottom: 8 },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pendingName: { ...Typography.bodyBold },
  pendingDesc: { ...Typography.caption },
  memberCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: Radius.md, padding: 12, marginBottom: 6 },
  memberAvatar: { width: 40, height: 40, borderRadius: 20 },
  memberDot: { position: 'absolute', left: 40, top: 38, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#fff' },
  memberName: { ...Typography.bodyBold },
  memberPos: { ...Typography.caption },
  broadcastBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: Radius.lg, padding: 14, marginTop: 16 },
  broadcastText: { ...Typography.bodyBold, color: '#fff' },
  panicFab: { position: 'absolute', bottom: 22, right: 18, zIndex: 10 },
  panicInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.danger, alignItems: 'center', justifyContent: 'center', ...Shadows.lg },
  panicFabText: { color: '#fff', fontSize: 9, fontWeight: '800', marginTop: -2 },
});