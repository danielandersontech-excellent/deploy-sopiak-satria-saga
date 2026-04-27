/**
 * DASHBOARD SUPERVISOR - v8 Dark Mode + i18n + Map
 */
import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Dimensions, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius, Shadows } from '../../constants';
import { Card, Badge } from '../../components';
import { useAuthStore } from '../../stores/authStore';
import { useDataStore } from '../../stores/dataStore';
import { useClock } from '../../hooks/useClock';
import { dataApi } from '../../lib/apiClient';
import { getPendingCount } from '../../services/offlineSync';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';
import MapTracker from '../../components/map/MapTracker';
import type { MapMarker, MapCircle } from '../../components/map/MapTracker';

const { width } = Dimensions.get('window');

export default function DashboardSupervisorScreen({ navigation }: any) {
  const { t, lang } = useI18n();
  const { theme, isDark } = useTheme();
  const user = useAuthStore((s) => s.user);
  const { jam, tanggal } = useClock();
  const team = useDataStore((s) => s.team);
  const absensi = useDataStore((s) => s.absensiRecords);
  const laporanH = useDataStore((s) => s.laporanHarian);
  const laporanK = useDataStore((s) => s.laporanKejadian);
  const lokasi = useDataStore((s) => s.lokasi);
  const notifikasi = useDataStore((s) => s.notifikasi);

  const [liveStats, setLiveStats] = useState<any>(null);
  const [offlinePending, setOfflinePending] = useState(0);
  const [showMap, setShowMap] = useState(false);

  useEffect(() => {
    dataApi.stats().then(setLiveStats).catch(() => {});
    getPendingCount().then(setOfflinePending);
    const interval = setInterval(() => {
      dataApi.stats().then(setLiveStats).catch(() => {});
      getPendingCount().then(setOfflinePending);
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const unread = useMemo(() => notifikasi.filter((n) => !n.dibaca).length, [notifikasi]);
  const onDuty = useMemo(() => team.filter((m) => m.status !== 'off_duty').length, [team]);
  const pendingCount = useMemo(() => laporanH.filter((l) => l.status === 'pending').length + laporanK.filter((l) => l.status === 'pending').length, [laporanH, laporanK]);
  const totalInsiden = laporanK.length;

  // Build map markers for all tracked members
  const mapMarkers: MapMarker[] = useMemo(() => {
    return team.filter(m => m.lastLatitude && m.lastLongitude).map(m => ({
      id: m.id,
      latitude: m.lastLatitude!,
      longitude: m.lastLongitude!,
      title: m.nama,
      description: `${m.pos} • ${m.shift}`,
      type: m.status === 'patroli' ? 'patrol' as const : 'person' as const,
      color: m.status === 'on_duty' ? Colors.success : m.status === 'patroli' ? Colors.primary : Colors.textMuted,
      status: m.status,
    }));
  }, [team]);

  const mapCircles: MapCircle[] = useMemo(() => {
    return lokasi.flatMap(l =>
      l.posList.filter(p => p.latitude && p.longitude).map(p => ({
        latitude: p.latitude,
        longitude: p.longitude,
        radius: p.radius || 100,
        color: Colors.purple,
        label: p.nama,
      }))
    );
  }, [lokasi]);

  const kpi = [
    { icon: 'people', value: `${onDuty}/${team.length}`, label: t('dash.personnel'), color: Colors.primary },
    { icon: 'checkmark-circle', value: `${absensi.length}`, label: t('dash.menu.absensi'), color: Colors.success },
    { icon: 'document-text', value: `${pendingCount}`, label: t('report.pending'), color: Colors.warning },
    { icon: 'alert-circle', value: `${totalInsiden}`, label: t('dash.incidents'), color: Colors.danger },
  ];

  const userRole = user?.role || 'supervisor';

  const quickMenu = [
    { icon: 'people', label: t('sv.users'), screen: 'ManajemenPengguna', color: Colors.primary },
    { icon: 'location', label: 'Checkpoint', screen: 'SetupCheckpoint', color: Colors.success },
    { icon: 'navigate', label: lang === 'en' ? 'Routes' : 'Rute', screen: 'SetupRute', color: '#e67e22' },
    { icon: 'qr-code', label: 'QR Code', screen: 'QRGenerator', color: Colors.purple },
    { icon: 'bar-chart', label: t('sv.analytics'), screen: 'Analytics', color: '#2980b9' },
    { icon: 'business', label: t('sv.locations'), screen: 'ManajemenLokasi', color: '#27ae60' },
    { icon: 'calendar', label: t('sv.schedule'), screen: 'JadwalShift', color: '#f39c12' },
    { icon: 'notifications', label: t('nav.notifications'), screen: 'Notifikasi', color: Colors.danger },
  ];

  // Operational menus - available for admin role (matching web admin features)
  const operationalMenu = [
    { icon: 'finger-print', label: t('dash.menu.absensi'), screen: 'RiwayatAbsensi', color: '#2980b9' },
    { icon: 'navigate-circle', label: t('dash.menu.patroli'), screen: 'MonitorRealtime', color: '#27ae60' },
    { icon: 'document-text', label: t('dash.menu.laporan_harian'), screen: 'ValidasiLaporan', color: '#f39c12' },
    { icon: 'alert-circle', label: t('dash.menu.laporan_kejadian'), screen: 'ValidasiLaporan', color: '#e74c3c' },
    { icon: 'swap-horizontal', label: t('dash.menu.serah_terima'), screen: 'SerahTerima', color: '#8e44ad' },
    { icon: 'megaphone', label: lang === 'en' ? 'Broadcast' : 'Broadcast', screen: 'BroadcastPesan', color: '#f39c12' },
    { icon: 'warning', label: lang === 'en' ? 'Panic Alert' : 'Panic Alert', screen: 'PanicButton', color: Colors.danger },
    { icon: 'download', label: 'Export', screen: 'DownloadLaporan', color: '#7f8c8d' },
  ];

  const companies = useMemo(() => lokasi.map((l) => {
    const members = team.filter((m) => m.lokasi === l.nama);
    const active = members.filter((m) => m.status !== 'off_duty').length;
    return { ...l, memberCount: members.length, active, avatars: members.slice(0, 3).map(m => m.foto) };
  }), [lokasi, team]);

  return (
    <View style={[s.container, { backgroundColor: theme.bg }]}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: isDark ? theme.bgCard : Colors.primaryDark }]}>
        <View style={s.headerTop}>
          <View>
            <Text style={s.greeting}>{t('dash.supervisor_dashboard')}</Text>
            <Text style={s.userName}>{user?.nama || 'Supervisor'}</Text>
          </View>
          <TouchableOpacity style={s.bellBtn} onPress={() => navigation.navigate('Notifikasi')}>
            <Ionicons name="notifications-outline" size={22} color="#fff" />
            {unread > 0 && <View style={s.bellBadge}><Text style={s.bellBadgeText}>{unread}</Text></View>}
          </TouchableOpacity>
        </View>
        <View style={s.headerClock}>
          <View style={s.liveDot} />
          <Text style={s.clockText}>{jam}</Text>
          <Text style={s.dateText}>{tanggal}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* KPI Row */}
        <View style={s.kpiRow}>
          {kpi.map((k, i) => (
            <View key={i} style={[s.kpiCard, { backgroundColor: theme.bgCard }, isDark ? { borderWidth: 1, borderColor: theme.border } : Shadows.sm]}>
              <Ionicons name={k.icon as any} size={16} color={k.color} />
              <Text style={[s.kpiVal, { color: k.color }]}>{k.value}</Text>
              <Text style={[s.kpiLabel, { color: theme.textMuted }]}>{k.label}</Text>
            </View>
          ))}
        </View>

        {/* Map Section - Toggle */}
        <TouchableOpacity
          style={[s.mapToggle, { backgroundColor: theme.bgCard, borderColor: theme.border }, isDark ? { borderWidth: 1 } : Shadows.sm]}
          onPress={() => setShowMap(!showMap)}
        >
          <Ionicons name="map" size={20} color={theme.primary} />
          <Text style={[s.mapToggleText, { color: theme.text }]}>{t('cmd.live_map')}</Text>
          <Badge text={`${mapMarkers.length} ${lang === 'en' ? 'tracked' : 'terlacak'}`} variant="info" />
          <Ionicons name={showMap ? 'chevron-up' : 'chevron-down'} size={18} color={theme.textMuted} />
        </TouchableOpacity>

        {showMap && (
          <View style={{ marginBottom: 12 }}>
            <MapTracker
              markers={mapMarkers}
              circles={mapCircles}
              isDark={isDark}
              height={300}
              onMarkerPress={(marker) => {
                const member = team.find(m => m.id === marker.id);
                if (member) navigation.navigate('DetailAnggota', { nrp: member.nrp });
              }}
            />
          </View>
        )}

        {/* Offline Sync */}
        {offlinePending > 0 && (
          <View style={[s.offlineBar, { backgroundColor: isDark ? '#3d3200' : '#FFF3CD', borderColor: isDark ? '#5a4a00' : '#ffe082' }]}>
            <Ionicons name="cloud-offline-outline" size={18} color={isDark ? '#ffd54f' : '#856404'} />
            <Text style={{ color: isDark ? '#ffd54f' : '#856404', fontSize: 12, flex: 1 }}>{offlinePending} {t('general.pending_sync')}</Text>
            <ActivityIndicator size="small" color={isDark ? '#ffd54f' : '#856404'} />
          </View>
        )}

        {/* Live Stats */}
        {liveStats && (
          <Card variant="bordered" borderColor={theme.primary} style={{ marginBottom: 14 }}>
            <Text style={{ ...Typography.smallBold, color: theme.primary, marginBottom: 8 }}>{t('dash.live_stats')}</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
              <View style={{ alignItems: 'center', flex: 1 }}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: theme.success }}>{liveStats.patrol_completion?.rate || 0}%</Text>
                <Text style={{ fontSize: 10, color: theme.textMuted }}>{t('dash.patrol_completion')}</Text>
              </View>
              <View style={{ alignItems: 'center', flex: 1 }}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: theme.primary }}>{liveStats.absensi_today || 0}</Text>
                <Text style={{ fontSize: 10, color: theme.textMuted }}>{t('dash.attendance_today')}</Text>
              </View>
              <View style={{ alignItems: 'center', flex: 1 }}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: liveStats.active_panic > 0 ? theme.danger : theme.success }}>{liveStats.active_panic || 0}</Text>
                <Text style={{ fontSize: 10, color: theme.textMuted }}>{t('dash.active_panic')}</Text>
              </View>
            </View>
            {liveStats.weekly_absensi?.length > 0 && (
              <View>
                <Text style={{ fontSize: 10, color: theme.textMuted, marginBottom: 4 }}>{t('dash.weekly_attendance')}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 40, gap: 3 }}>
                  {liveStats.weekly_absensi.map((d: any, i: number) => {
                    const maxVal = Math.max(...liveStats.weekly_absensi.map((x: any) => x.jumlah), 1);
                    const h = Math.max((d.jumlah / maxVal) * 36, 3);
                    return <View key={i} style={{ flex: 1, height: h, backgroundColor: theme.primary, borderRadius: 2, opacity: 0.7 + (i / 10) }} />;
                  })}
                </View>
              </View>
            )}
            {liveStats.top_performers?.length > 0 && (
              <View style={{ marginTop: 10 }}>
                <Text style={{ fontSize: 10, color: theme.textMuted, marginBottom: 4 }}>{t('dash.top_performers')}</Text>
                {liveStats.top_performers.slice(0, 3).map((p: any, i: number) => (
                  <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 2 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : '#CD7F32', width: 18 }}>{i + 1}.</Text>
                    <Text style={{ fontSize: 11, color: theme.text, flex: 1 }}>{p.nama}</Text>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: theme.primary }}>{p.skor}</Text>
                  </View>
                ))}
              </View>
            )}
          </Card>
        )}

        {/* Companies */}
        <View style={s.sectionRow}>
          <Text style={[s.sectionTitle, { color: theme.text }]}>{t('dash.companies')}</Text>
          <TouchableOpacity onPress={() => navigation.navigate('PerusahaanList')}>
            <Text style={[s.linkText, { color: theme.primary }]}>{t('dash.view_all')} →</Text>
          </TouchableOpacity>
        </View>
        {companies.map((c) => (
          <TouchableOpacity
            key={c.id}
            style={[s.companyCard, { backgroundColor: theme.bgCard }, isDark ? { borderWidth: 1, borderColor: theme.border } : Shadows.sm]}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('DetailPerusahaan', { lokasiId: c.id })}
          >
            <View style={s.companyLeft}>
              <View style={[s.companyIcon, { backgroundColor: isDark ? `${theme.primary}25` : Colors.primarySoft }]}>
                <Ionicons name="business" size={20} color={theme.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.companyName, { color: theme.text }]}>{c.nama}</Text>
                <Text style={[s.companyAddr, { color: theme.textMuted }]} numberOfLines={1}>{c.alamat}</Text>
              </View>
            </View>
            <View style={[s.companyStats, { backgroundColor: isDark ? theme.bgInput : Colors.bgLight }]}>
              <View style={s.companyStatItem}>
                <Text style={[s.companyStatVal, { color: theme.text }]}>{c.active}/{c.memberCount}</Text>
                <Text style={[s.companyStatLabel, { color: theme.textMuted }]}>{lang === 'en' ? 'Active' : 'Aktif'}</Text>
              </View>
              <View style={s.companyStatItem}>
                <Text style={[s.companyStatVal, { color: theme.text }]}>{c.posList.length}</Text>
                <Text style={[s.companyStatLabel, { color: theme.textMuted }]}>Pos</Text>
              </View>
              <View style={s.companyAvatarRow}>
                {c.avatars.map((uri, i) => (
                  <Image key={i} source={{ uri }} style={[s.companyMiniAvatar, i > 0 && { marginLeft: -8 }]} />
                ))}
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
            </View>
          </TouchableOpacity>
        ))}

        {/* Quick Menu */}
        <Text style={[s.sectionTitle, { color: theme.text }]}>{t('sv.management_menu')}</Text>
        <View style={s.menuGrid}>
          {quickMenu.map((m, i) => (
            <TouchableOpacity
              key={i}
              style={[s.menuItem, { backgroundColor: theme.bgCard }, isDark ? { borderWidth: 1, borderColor: theme.border, borderRadius: Radius.lg } : {}]}
              onPress={() => navigation.navigate(m.screen)}
              activeOpacity={0.7}
            >
              <View style={[s.menuIcon, { backgroundColor: `${m.color}18` }]}>{/* @ts-ignore */}
                <Ionicons name={m.icon as any} size={22} color={m.color} />
              </View>
              <Text style={[s.menuLabel, { color: theme.textSecondary }]}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Operational Menu - for admin role matching web admin features */}
        {(userRole === 'admin' || userRole === 'supervisor') && (
          <>
            <Text style={[s.sectionTitle, { color: theme.text }]}>{lang === 'en' ? 'Operational' : 'Operasional'}</Text>
            <View style={s.menuGrid}>
              {operationalMenu.map((m, i) => (
                <TouchableOpacity
                  key={`op-${i}`}
                  style={[s.menuItem, { backgroundColor: theme.bgCard }, isDark ? { borderWidth: 1, borderColor: theme.border, borderRadius: Radius.lg } : {}]}
                  onPress={() => navigation.navigate(m.screen)}
                  activeOpacity={0.7}
                >
                  <View style={[s.menuIcon, { backgroundColor: `${m.color}18` }]}>{/* @ts-ignore */}
                    <Ionicons name={m.icon as any} size={22} color={m.color} />
                  </View>
                  <Text style={[s.menuLabel, { color: theme.textSecondary }]}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Top Performers */}
        <Text style={[s.sectionTitle, { color: theme.text }]}>{t('dash.top_performers')}</Text>
        {[...team].sort((a, b) => b.skor - a.skor).slice(0, 3).map((m, idx) => (
          <TouchableOpacity key={m.id} style={[s.perfCard, { backgroundColor: theme.bgCard }, isDark ? { borderWidth: 1, borderColor: theme.border } : Shadows.sm]} onPress={() => navigation.navigate('DetailAnggota', { nrp: m.nrp })}>
            <View style={[s.rankBadge, idx === 0 ? s.rank1 : idx === 1 ? s.rank2 : s.rank3]}>
              <Text style={s.rankText}>{idx + 1}</Text>
            </View>
            <Image source={{ uri: m.foto }} style={s.perfAvatar} />
            <View style={{ flex: 1 }}>
              <Text style={[s.perfName, { color: theme.text }]}>{m.nama}</Text>
              <Text style={[s.perfSub, { color: theme.textMuted }]}>{m.lokasi} • {m.pos}</Text>
            </View>
            <View style={s.scoreBox}>
              <Text style={[s.scoreVal, { color: theme.success }]}>{m.skor}</Text>
              <Ionicons name="star" size={12} color={Colors.warning} />
            </View>
          </TouchableOpacity>
        ))}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingTop: 48, paddingBottom: 16, paddingHorizontal: Spacing.lg, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  greeting: { fontSize: 12, color: 'rgba(255,255,255,0.6)' },
  userName: { fontSize: 20, fontWeight: '700', color: '#fff' },
  bellBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  bellBadge: { position: 'absolute', top: 0, right: 0, backgroundColor: Colors.danger, borderRadius: 10, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  bellBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  headerClock: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#2ecc71' },
  clockText: { fontSize: 16, fontWeight: '700', color: '#fff', fontVariant: ['tabular-nums'] },
  dateText: { fontSize: 12, color: 'rgba(255,255,255,0.5)', flex: 1 },
  scroll: { padding: Spacing.base },
  kpiRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  kpiCard: { flex: 1, borderRadius: Radius.lg, padding: 12, alignItems: 'center', gap: 2 },
  kpiVal: { fontSize: 18, fontWeight: '800' },
  kpiLabel: { fontSize: 10 },
  mapToggle: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: Radius.lg, padding: 14, marginBottom: 12 },
  mapToggleText: { flex: 1, fontWeight: '700', fontSize: 14 },
  offlineBar: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 8, marginBottom: 12, gap: 8, borderWidth: 1 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 8, marginTop: 8 },
  linkText: { fontSize: 12, fontWeight: '600' },
  companyCard: { borderRadius: Radius.lg, padding: 14, marginBottom: 8 },
  companyLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  companyIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  companyName: { fontSize: 14, fontWeight: '700' },
  companyAddr: { fontSize: 11, marginTop: 1 },
  companyStats: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: Radius.md, padding: 10 },
  companyStatItem: { alignItems: 'center' },
  companyStatVal: { fontSize: 14, fontWeight: '700' },
  companyStatLabel: { fontSize: 9 },
  companyAvatarRow: { flexDirection: 'row', flex: 1, justifyContent: 'flex-end' },
  companyMiniAvatar: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: '#fff' },
  menuGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  menuItem: { width: '25%', alignItems: 'center', marginBottom: 16 },
  menuIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  menuLabel: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
  perfCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: Radius.lg, padding: 12, marginBottom: 6 },
  rankBadge: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  rank1: { backgroundColor: '#f39c12' },
  rank2: { backgroundColor: '#bdc3c7' },
  rank3: { backgroundColor: '#cd7f32' },
  rankText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  perfAvatar: { width: 38, height: 38, borderRadius: 19 },
  perfName: { fontSize: 13, fontWeight: '700' },
  perfSub: { fontSize: 11 },
  scoreBox: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  scoreVal: { fontSize: 18, fontWeight: '800' },
});
