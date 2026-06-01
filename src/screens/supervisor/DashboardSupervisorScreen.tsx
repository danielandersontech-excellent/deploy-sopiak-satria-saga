/**
 * DASHBOARD SUPERVISOR - v9 (Bug-Fix Pass)
 *
 * FIXES (v9):
 *  âœ… Unread badge now uses `unreadCountForRole('supervisor')` instead of raw
 *     `notifikasi.filter(!dibaca).length`. Previously counted ALL unread
 *     notifications including those targeted at anggota/komandan only.
 *  âœ… Bell badge clamped to "99+" (was overflowing UI for large counts).
 *  âœ… Map markers: lat/lng null/NaN check (was `m.lastLatitude && m.lastLongitude`
 *     which excludes 0,0 even though they could be valid Atlantic coordinates).
 *  âœ… Off-duty status grouped correctly: `m.status !== 'off_duty'` counts
 *     `break` as on-duty (consistent with status meaning).
 *  âœ… Companies use `lokasiId` matching as primary (more reliable than name),
 *     `lokasi` name as fallback. Same fix as komandan screens.
 *  âœ… Top performers: stable sort with id tiebreaker (avoids reorder churn).
 *  âœ… MapMarker uses proper `MapMarker['type']` union (no `as const` mix).
 *  âœ… Cleanup: removed unused `width` Dimensions extraction.
 *  âœ… Interval clears properly on unmount (no leak).
 *  âœ… Pull-to-refresh on dashboard scroll view.
 *  âœ… Safer `mapMarkers.id` to string for navigation comparison.
 */
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

/** Safely get a field value, checking multiple key variants. */
function getField(obj: any, ...keys: string[]): any {
  if (!obj) return undefined;
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return undefined;
}

/** Validate coordinates - not null and not NaN and within Earth bounds */
function isValidLatLng(lat: any, lng: any): boolean {
  if (lat == null || lng == null) return false;
  const a = Number(lat), b = Number(lng);
  if (isNaN(a) || isNaN(b)) return false;
  if (a < -90 || a > 90 || b < -180 || b > 180) return false;
  return true;
}

export default function DashboardSupervisorScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { t, lang } = useI18n();
  const { theme, isDark } = useTheme();
  const user = useAuthStore((s) => s.user);
  const { jam, tanggal } = useClock();
  const team = useDataStore((s) => s.team);
  const absensi = useDataStore((s) => s.absensiRecords);
  const laporanH = useDataStore((s) => s.laporanHarian);
  const laporanK = useDataStore((s) => s.laporanKejadian);
  const lokasi = useDataStore((s) => s.lokasi);
  const unreadCountForRole = useDataStore((s) => s.unreadCountForRole);
  const loadAllData = useDataStore((s) => s.loadAllData);

  const [liveStats, setLiveStats] = useState<any>(null);
  const [offlinePending, setOfflinePending] = useState(0);
  const [showMap, setShowMap] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Re-render when notifikasi changes (otherwise unreadCountForRole won't update)
  const notifikasi = useDataStore((s) => s.notifikasi);

  // Periodic refresh of live stats + offline counter
  useEffect(() => {
    const fetchLive = () => {
      dataApi.stats().then(setLiveStats).catch(() => {});
      getPendingCount().then(setOfflinePending).catch(() => {});
    };
    fetchLive();
    const interval = setInterval(fetchLive, 60000);
    return () => clearInterval(interval);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        loadAllData?.(),
        dataApi.stats().then(setLiveStats).catch(() => {}),
        getPendingCount().then(setOfflinePending).catch(() => {}),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [loadAllData]);

  // CRITICAL FIX: Use role-targeted count not raw filter
  const unread = useMemo(() => {
    try {
      return unreadCountForRole?.('supervisor') ?? notifikasi.filter((n) => !n.dibaca).length;
    } catch {
      return notifikasi.filter((n) => !n.dibaca).length;
    }
  }, [unreadCountForRole, notifikasi]);

  // Clamp to 99+ for badge display
  const unreadLabel = unread > 99 ? '99+' : String(unread);

  const onDuty = useMemo(() => team.filter((m) => m.status !== 'off_duty').length, [team]);
  const pendingCount = useMemo(
    () => laporanH.filter((l) => l.status === 'pending').length + laporanK.filter((l) => l.status === 'pending').length,
    [laporanH, laporanK]
  );
  const totalInsiden = laporanK.length;

  // Build map markers - valid coords only
  const mapMarkers: MapMarker[] = useMemo(() => {
    return team
      .filter((m) => isValidLatLng(m.lastLatitude, m.lastLongitude))
      .map((m) => ({
        id: String(m.id),
        latitude: Number(m.lastLatitude),
        longitude: Number(m.lastLongitude),
        title: m.nama,
        description: `${m.pos || '-'} â€¢ ${m.shift || '-'}`,
        type: (m.status === 'patroli' ? 'patrol' : 'person') as MapMarker['type'],
        color: m.status === 'on_duty' ? Colors.success
          : m.status === 'patroli' ? Colors.primary
          : m.status === 'break' ? Colors.warning
          : Colors.textMuted,
        status: m.status,
      }));
  }, [team]);

  const mapCircles: MapCircle[] = useMemo(() => {
    return lokasi.flatMap((l) =>
      (Array.isArray(l.posList) ? l.posList : [])
        .filter((p) => isValidLatLng(p.latitude, p.longitude))
        .map((p) => ({
          latitude: Number(p.latitude),
          longitude: Number(p.longitude),
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

  const userRole = getField(user, 'role') || 'supervisor';

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

  const operationalMenu = [
    { icon: 'finger-print', label: t('dash.menu.absensi'), screen: 'RiwayatAbsensi', color: '#2980b9' },
    { icon: 'navigate-circle', label: t('dash.menu.patroli'), screen: 'MonitorRealtime', color: '#27ae60' },
    { icon: 'document-text', label: t('dash.menu.laporan_harian'), screen: 'ValidasiLaporan', color: '#f39c12' },
    { icon: 'alert-circle', label: t('dash.menu.laporan_kejadian'), screen: 'ValidasiLaporan', color: '#e74c3c' },
    { icon: 'swap-horizontal', label: t('dash.menu.serah_terima'), screen: 'SerahTerima', color: '#8e44ad' },
    { icon: 'megaphone', label: 'Broadcast', screen: 'BroadcastPesan', color: '#f39c12' },
    { icon: 'warning', label: lang === 'en' ? 'Panic Alert' : 'Panic Alert', screen: 'PanicButton', color: Colors.danger },
    { icon: 'download', label: 'Export', screen: 'DownloadLaporan', color: '#7f8c8d' },
  ];

  // Companies: match by lokasiId primarily, fall back to lokasi name
  const companies = useMemo(
    () =>
      lokasi.map((l) => {
        const members = team.filter((m) => {
          const mLokId = String(getField(m, 'lokasiId', 'lokasi_id') || '');
          if (mLokId && mLokId === String(l.id)) return true;
          return m.lokasi === l.nama;
        });
        const active = members.filter((m) => m.status !== 'off_duty').length;
        return {
          ...l,
          memberCount: members.length,
          active,
          avatars: members.slice(0, 3).map((m) => m.foto).filter(Boolean),
        };
      }),
    [lokasi, team]
  );

  // Top performers - stable sort with id tiebreaker
  const topPerformers = useMemo(
    () =>
      [...team]
        .sort((a, b) => {
          const diff = (b.skor || 0) - (a.skor || 0);
          return diff !== 0 ? diff : String(a.id).localeCompare(String(b.id));
        })
        .slice(0, 3),
    [team]
  );

  return (
    <View style={[s.container, { backgroundColor: theme.bg }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 12 }, { backgroundColor: isDark ? theme.bgCard : Colors.primaryDark }]}>
        <View style={s.headerTop}>
          <View>
            <Text style={s.greeting}>{t('dash.supervisor_dashboard')}</Text>
            <Text style={s.userName}>{getField(user, 'nama', 'name') || 'Supervisor'}</Text>
          </View>
          <TouchableOpacity style={s.bellBtn} onPress={() => navigation.navigate('Notifikasi')}>
            <Ionicons name="notifications-outline" size={22} color="#fff" />
            {unread > 0 && (
              <View style={s.bellBadge}>
                <Text style={s.bellBadgeText}>{unreadLabel}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
        <View style={s.headerClock}>
          <View style={s.liveDot} />
          <Text style={s.clockText}>{jam}</Text>
          <Text style={s.dateText}>{tanggal}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 16 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {/* KPI Row */}
        <View style={s.kpiRow}>
          {kpi.map((k, i) => (
            <View
              key={`kpi-${k.label}-${i}`}
              style={[
                s.kpiCard,
                { backgroundColor: theme.bgCard },
                isDark ? { borderWidth: 1, borderColor: theme.border } : Shadows.sm,
              ]}
            >
              <Ionicons name={k.icon as any} size={16} color={k.color} />
              <Text style={[s.kpiVal, { color: k.color }]}>{k.value}</Text>
              <Text style={[s.kpiLabel, { color: theme.textMuted }]}>{k.label}</Text>
            </View>
          ))}
        </View>

        {/* Map Section - Toggle */}
        <TouchableOpacity
          style={[
            s.mapToggle,
            { backgroundColor: theme.bgCard, borderColor: theme.border },
            isDark ? { borderWidth: 1 } : Shadows.sm,
          ]}
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
                const member = team.find((m) => String(m.id) === String(marker.id));
                if (member) navigation.navigate('DetailAnggota', { nrp: member.nrp });
              }}
            />
          </View>
        )}

        {/* Offline Sync */}
        {offlinePending > 0 && (
          <View
            style={[
              s.offlineBar,
              {
                backgroundColor: isDark ? '#3d3200' : '#FFF3CD',
                borderColor: isDark ? '#5a4a00' : '#ffe082',
              },
            ]}
          >
            <Ionicons name="cloud-offline-outline" size={18} color={isDark ? '#ffd54f' : '#856404'} />
            <Text style={{ color: isDark ? '#ffd54f' : '#856404', fontSize: 12, flex: 1 }}>
              {offlinePending} {t('general.pending_sync')}
            </Text>
            <ActivityIndicator size="small" color={isDark ? '#ffd54f' : '#856404'} />
          </View>
        )}

        {/* Live Stats */}
        {liveStats && (
          <Card variant="bordered" borderColor={theme.primary} style={{ marginBottom: 14 }}>
            <Text style={{ ...Typography.smallBold, color: theme.primary, marginBottom: 8 }}>
              {t('dash.live_stats')}
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
              <View style={{ alignItems: 'center', flex: 1 }}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: theme.success }}>
                  {liveStats.patrol_completion?.rate || 0}%
                </Text>
                <Text style={{ fontSize: 10, color: theme.textMuted }}>{t('dash.patrol_completion')}</Text>
              </View>
              <View style={{ alignItems: 'center', flex: 1 }}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: theme.primary }}>
                  {liveStats.absensi_today || 0}
                </Text>
                <Text style={{ fontSize: 10, color: theme.textMuted }}>{t('dash.attendance_today')}</Text>
              </View>
              <View style={{ alignItems: 'center', flex: 1 }}>
                <Text
                  style={{
                    fontSize: 22,
                    fontWeight: '800',
                    color: (liveStats.active_panic || 0) > 0 ? theme.danger : theme.success,
                  }}
                >
                  {liveStats.active_panic || 0}
                </Text>
                <Text style={{ fontSize: 10, color: theme.textMuted }}>{t('dash.active_panic')}</Text>
              </View>
            </View>
            {Array.isArray(liveStats.weekly_absensi) && liveStats.weekly_absensi.length > 0 && (
              <View>
                <Text style={{ fontSize: 10, color: theme.textMuted, marginBottom: 4 }}>
                  {t('dash.weekly_attendance')}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 40, gap: 3 }}>
                  {liveStats.weekly_absensi.map((d: any, i: number) => {
                    const maxVal = Math.max(...liveStats.weekly_absensi.map((x: any) => x.jumlah || 0), 1);
                    const h = Math.max(((d.jumlah || 0) / maxVal) * 36, 3);
                    return (
                      <View
                        key={`bar-${i}`}
                        style={{
                          flex: 1,
                          height: h,
                          backgroundColor: theme.primary,
                          borderRadius: 2,
                          opacity: 0.7 + i / 10,
                        }}
                      />
                    );
                  })}
                </View>
              </View>
            )}
            {Array.isArray(liveStats.top_performers) && liveStats.top_performers.length > 0 && (
              <View style={{ marginTop: 10 }}>
                <Text style={{ fontSize: 10, color: theme.textMuted, marginBottom: 4 }}>
                  {t('dash.top_performers')}
                </Text>
                {liveStats.top_performers.slice(0, 3).map((p: any, i: number) => (
                  <View
                    key={`tp-${getField(p, 'id', '_id') || i}`}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 2 }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '700',
                        color: i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : '#CD7F32',
                        width: 18,
                      }}
                    >
                      {i + 1}.
                    </Text>
                    <Text style={{ fontSize: 11, color: theme.text, flex: 1 }} numberOfLines={1}>
                      {p.nama || '-'}
                    </Text>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: theme.primary }}>{p.skor || 0}</Text>
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
            <Text style={[s.linkText, { color: theme.primary }]}>{t('dash.view_all')} â†’</Text>
          </TouchableOpacity>
        </View>
        {companies.map((c) => (
          <TouchableOpacity
            key={`co-${c.id}`}
            style={[
              s.companyCard,
              { backgroundColor: theme.bgCard },
              isDark ? { borderWidth: 1, borderColor: theme.border } : Shadows.sm,
            ]}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('DetailPerusahaan', { lokasiId: c.id })}
          >
            <View style={s.companyLeft}>
              <View
                style={[
                  s.companyIcon,
                  { backgroundColor: isDark ? `${theme.primary}25` : Colors.primarySoft },
                ]}
              >
                <Ionicons name="business" size={20} color={theme.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.companyName, { color: theme.text }]}>{c.nama}</Text>
                <Text style={[s.companyAddr, { color: theme.textMuted }]} numberOfLines={1}>
                  {c.alamat || '-'}
                </Text>
              </View>
            </View>
            <View
              style={[
                s.companyStats,
                { backgroundColor: isDark ? theme.bgInput : Colors.bgLight },
              ]}
            >
              <View style={s.companyStatItem}>
                <Text style={[s.companyStatVal, { color: theme.text }]}>
                  {c.active}/{c.memberCount}
                </Text>
                <Text style={[s.companyStatLabel, { color: theme.textMuted }]}>
                  {lang === 'en' ? 'Active' : 'Aktif'}
                </Text>
              </View>
              <View style={s.companyStatItem}>
                <Text style={[s.companyStatVal, { color: theme.text }]}>{c.posList.length}</Text>
                <Text style={[s.companyStatLabel, { color: theme.textMuted }]}>Pos</Text>
              </View>
              <View style={s.companyAvatarRow}>
                {c.avatars.map((uri, i) => (
                  <Image
                    key={`av-${c.id}-${i}`}
                    source={{ uri }}
                    style={[s.companyMiniAvatar, i > 0 && { marginLeft: -8 }]}
                  />
                ))}
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
            </View>
          </TouchableOpacity>
        ))}

        {companies.length === 0 && (
          <Card style={{ alignItems: 'center', paddingVertical: 24 }}>
            <Ionicons name="business-outline" size={36} color={theme.textMuted} />
            <Text style={{ color: theme.textMuted, marginTop: 8 }}>
              {lang === 'en' ? 'No client companies yet' : 'Belum ada perusahaan klien'}
            </Text>
          </Card>
        )}

        {/* Quick Menu */}
        <Text style={[s.sectionTitle, { color: theme.text }]}>{t('sv.management_menu')}</Text>
        <View style={s.menuGrid}>
          {quickMenu.map((m, i) => (
            <TouchableOpacity
              key={`qm-${m.screen}-${i}`}
              style={[
                s.menuItem,
                { backgroundColor: theme.bgCard },
                isDark ? { borderWidth: 1, borderColor: theme.border, borderRadius: Radius.lg } : {},
              ]}
              onPress={() => navigation.navigate(m.screen)}
              activeOpacity={0.7}
            >
              <View style={[s.menuIcon, { backgroundColor: `${m.color}18` }]}>
                <Ionicons name={m.icon as any} size={22} color={m.color} />
              </View>
              <Text style={[s.menuLabel, { color: theme.textSecondary }]}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Operational Menu - for admin role matching web admin features */}
        {(userRole === 'admin' || userRole === 'supervisor') && (
          <>
            <Text style={[s.sectionTitle, { color: theme.text }]}>
              {lang === 'en' ? 'Operational' : 'Operasional'}
            </Text>
            <View style={s.menuGrid}>
              {operationalMenu.map((m, i) => (
                <TouchableOpacity
                  key={`op-${m.screen}-${i}`}
                  style={[
                    s.menuItem,
                    { backgroundColor: theme.bgCard },
                    isDark ? { borderWidth: 1, borderColor: theme.border, borderRadius: Radius.lg } : {},
                  ]}
                  onPress={() => navigation.navigate(m.screen)}
                  activeOpacity={0.7}
                >
                  <View style={[s.menuIcon, { backgroundColor: `${m.color}18` }]}>
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
        {topPerformers.map((m, idx) => (
          <TouchableOpacity
            key={`perf-${m.id}`}
            style={[
              s.perfCard,
              { backgroundColor: theme.bgCard },
              isDark ? { borderWidth: 1, borderColor: theme.border } : Shadows.sm,
            ]}
            onPress={() => navigation.navigate('DetailAnggota', { nrp: m.nrp })}
          >
            <View style={[s.rankBadge, idx === 0 ? s.rank1 : idx === 1 ? s.rank2 : s.rank3]}>
              <Text style={s.rankText}>{idx + 1}</Text>
            </View>
            <Image source={{ uri: m.foto }} style={s.perfAvatar} />
            <View style={{ flex: 1 }}>
              <Text style={[s.perfName, { color: theme.text }]}>{m.nama}</Text>
              <Text style={[s.perfSub, { color: theme.textMuted }]}>
                {m.lokasi || '-'} â€¢ {m.pos || '-'}
              </Text>
            </View>
            <View style={s.scoreBox}>
              <Text style={[s.scoreVal, { color: theme.success }]}>{m.skor}</Text>
              <Ionicons name="star" size={12} color={Colors.warning} />
            </View>
          </TouchableOpacity>
        ))}

        {topPerformers.length === 0 && (
          <Card style={{ alignItems: 'center', paddingVertical: 20 }}>
            <Text style={{ color: theme.textMuted }}>
              {lang === 'en' ? 'No data yet' : 'Belum ada data'}
            </Text>
          </Card>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingBottom: 16,
    paddingHorizontal: Spacing.lg,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  greeting: { fontSize: 12, color: 'rgba(255,255,255,0.6)' },
  userName: { fontSize: 20, fontWeight: '700', color: '#fff' },
  bellBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: Colors.danger,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
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
  mapToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: Radius.lg,
    padding: 14,
    marginBottom: 12,
  },
  mapToggleText: { flex: 1, fontWeight: '700', fontSize: 14 },
  offlineBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8,
    borderWidth: 1,
  },
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
  menuIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  menuLabel: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
  perfCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: Radius.lg,
    padding: 12,
    marginBottom: 6,
  },
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
