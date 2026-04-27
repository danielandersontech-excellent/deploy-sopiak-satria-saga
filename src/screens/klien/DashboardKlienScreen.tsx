/**
 * DASHBOARD KLIEN - v24 DB-ALIGNED
 * Executive-grade monitoring dashboard for client companies
 * Features: Live map, guard roster, pos jaga status, contract info, real-time KPIs
 * DB tables: users, absensi, laporan_harian, laporan_kejadian, lokasi, shifts, notifikasi
 * All field access normalized for snake_case (DB) + camelCase (store) compatibility
 */
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, RefreshControl, Image, Dimensions, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius, Shadows } from '../../constants';
import { Card, Badge, Button, MenuCard } from '../../components';
import { useAuthStore } from '../../stores/authStore';
import { useDataStore } from '../../stores/dataStore';
import { dataApi } from '../../lib/apiClient';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';
import MapTracker from '../../components/map/MapTracker';
import type { MapMarker, MapCircle } from '../../components/map/MapTracker';

const { width: SW } = Dimensions.get('window');

/* ── helper: flexible field access (snake_case DB ↔ camelCase store) ── */
function getField(obj: any, ...keys: string[]): any {
  if (!obj) return undefined;
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return undefined;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string; bg: string }> = {
  on_duty: { label: 'On Duty', color: Colors.success, icon: 'shield-checkmark', bg: Colors.successBg },
  patroli: { label: 'Patroli', color: Colors.primary, icon: 'walk', bg: Colors.primaryBg },
  break: { label: 'Istirahat', color: Colors.warning, icon: 'cafe', bg: Colors.warningBg },
  off_duty: { label: 'Off Duty', color: Colors.textMuted, icon: 'moon', bg: Colors.bgGray },
};

export default function DashboardKlienScreen({ navigation }: any) {
  const { t, lang } = useI18n();
  const { theme, isDark } = useTheme();
  const user = useAuthStore((s) => s.user);
  const team = useDataStore((s) => s.team);
  const absensi = useDataStore((s) => s.absensiRecords);
  const laporanH = useDataStore((s) => s.laporanHarian);
  const laporanK = useDataStore((s) => s.laporanKejadian);
  const lokasi = useDataStore((s) => s.lokasi);
  const shifts = useDataStore((s) => s.shifts);
  const notifikasi = useDataStore((s) => s.notifikasi);
  const [refreshing, setRefreshing] = useState(false);
  const [showAllGuards, setShowAllGuards] = useState(false);

  // DB: users.lokasi_id
  const myLokasiId = getField(user, 'lokasi_id', 'lokasiId') || null;

  const myLokasi = useMemo(() =>
    lokasi.filter(l => !myLokasiId || String(l.id) === String(myLokasiId)),
    [lokasi, myLokasiId]);

  // Filter team by lokasi_id (DB: users.lokasi_id)
  const myTeam = useMemo(() => myLokasiId
    ? team.filter(m => String(getField(m, 'lokasi_id', 'lokasiId') || '') === String(myLokasiId))
    : team, [team, myLokasiId]);

  // Filter absensi by lokasi_id (DB: absensi.lokasi_id)
  const myAbsensi = useMemo(() => myLokasiId
    ? absensi.filter(a => String(getField(a, 'lokasi_id', 'lokasiId') || '') === String(myLokasiId))
    : absensi, [absensi, myLokasiId]);

  // Filter laporan_harian by lokasi_id
  const myLaporanH = useMemo(() => myLokasiId
    ? laporanH.filter(l => String(getField(l, 'lokasi_id', 'lokasiId') || '') === String(myLokasiId))
    : laporanH, [laporanH, myLokasiId]);

  // Filter laporan_kejadian by lokasi_id
  const myLaporanK = useMemo(() => myLokasiId
    ? laporanK.filter(l => String(getField(l, 'lokasi_id', 'lokasiId') || '') === String(myLokasiId))
    : laporanK, [laporanK, myLokasiId]);

  // KPI calculations
  const onDutyCount = myTeam.filter(m => getField(m, 'status') !== 'off_duty').length;
  const offDutyCount = myTeam.filter(m => getField(m, 'status') === 'off_duty').length;
  const patrolCount = myTeam.filter(m => getField(m, 'status') === 'patroli').length;
  const hadirCount = myAbsensi.filter(a => getField(a, 'status') === 'hadir').length;
  const terlambatCount = myAbsensi.filter(a => getField(a, 'status') === 'terlambat').length;
  // DB: laporan_kejadian.status
  const openInsiden = myLaporanK.filter(l => {
    const s = getField(l, 'status');
    return s === 'pending' || s === 'draft';
  }).length;
  const resolvedInsiden = myLaporanK.filter(l => getField(l, 'status') === 'approved').length;
  const pendingLaporan = myLaporanH.filter(l => getField(l, 'status') === 'pending').length;

  const companyName = useMemo(() => {
    if (myLokasi.length > 0) return getField(myLokasi[0], 'nama', 'name') || 'Perusahaan';
    return getField(user, 'nama', 'name') || getField(user, 'lokasi_nama', 'lokasiNama') || 'Perusahaan';
  }, [myLokasi, user]);

  // DB: notifikasi.dibaca
  const unreadNotif = useMemo(() =>
    notifikasi.filter(n => !getField(n, 'dibaca', 'read')).length,
    [notifikasi]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await useDataStore.getState().loadAllData();
    setRefreshing(false);
  }, []);

  // Map markers - all guards
  const mapMarkers: MapMarker[] = useMemo(() => {
    return myTeam.filter(m => {
      const lat = getField(m, 'lastLatitude', 'last_latitude', 'latitude');
      const lng = getField(m, 'lastLongitude', 'last_longitude', 'longitude');
      return lat && lng;
    }).map(m => {
      const status = getField(m, 'status') || 'off_duty';
      const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.off_duty;
      const lat = getField(m, 'lastLatitude', 'last_latitude', 'latitude');
      const lng = getField(m, 'lastLongitude', 'last_longitude', 'longitude');
      const nama = getField(m, 'nama', 'name') || 'Petugas';
      const pos = getField(m, 'pos_jaga', 'posJaga', 'pos') || '-';
      return {
        id: m.id,
        latitude: lat,
        longitude: lng,
        title: nama,
        description: `${pos} • ${cfg.label}`,
        type: status === 'patroli' ? 'patrol' as const : 'person' as const,
        color: cfg.color,
        status: status,
      };
    });
  }, [myTeam]);

  // Map circles - pos jaga from lokasi data
  const mapCircles: MapCircle[] = useMemo(() => {
    return myLokasi.flatMap(l =>
      (l.posList || []).filter((p: any) => p.latitude && p.longitude).map((p: any) => ({
        latitude: p.latitude,
        longitude: p.longitude,
        radius: p.radius || 100,
        color: Colors.primary,
        label: getField(p, 'nama', 'name') || 'Pos',
      }))
    );
  }, [myLokasi]);

  const posList = useMemo(() => myLokasi.flatMap(l => l.posList || []), [myLokasi]);
  const displayedGuards = showAllGuards ? myTeam : myTeam.slice(0, 5);

  // Security score (based on attendance & incidents)
  const securityScore = useMemo(() => {
    const base = 100;
    const penalty = openInsiden * 5 + terlambatCount * 2;
    return Math.max(60, Math.min(100, base - penalty));
  }, [openInsiden, terlambatCount]);

  const scoreColor = securityScore >= 90 ? Colors.success : securityScore >= 75 ? Colors.warning : Colors.danger;

  return (
    <View style={[s.container, { backgroundColor: theme.bg }]}>
      {/* Premium Header */}
      <View style={[s.header, { backgroundColor: isDark ? '#1a2332' : Colors.primaryDark }]}>
        <View style={s.headerTop}>
          <View style={s.headerLeft}>
            <View style={s.companyBadge}>
              <Ionicons name="business" size={16} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.headerGreeting}>{lang === 'en' ? 'Welcome,' : 'Selamat datang,'}</Text>
              <Text style={s.headerName} numberOfLines={1}>{getField(user, 'nama', 'name') || 'Klien'}</Text>
            </View>
          </View>
          <View style={s.headerRight}>
            <TouchableOpacity style={s.headerBtn} onPress={onRefresh}>
              <Ionicons name="refresh-outline" size={18} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
            <TouchableOpacity style={s.headerBtn} onPress={() => navigation.navigate('Notifikasi')}>
              <Ionicons name="notifications-outline" size={18} color="rgba(255,255,255,0.8)" />
              {unreadNotif > 0 && <View style={s.notifDot}><Text style={s.notifDotText}>{unreadNotif}</Text></View>}
            </TouchableOpacity>
          </View>
        </View>
        <View style={s.headerCompany}>
          <Ionicons name="shield-checkmark" size={14} color={Colors.successLight} />
          <Text style={s.headerCompanyText}>{companyName}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}>

        {/* Security Score Card */}
        <View style={[s.scoreCard, { backgroundColor: isDark ? theme.bgCard : '#fff', borderColor: theme.border }]}>
          <View style={s.scoreLeft}>
            <Text style={[s.scoreLabel, { color: theme.textMuted }]}>{lang === 'en' ? 'Security Score' : 'Skor Keamanan'}</Text>
            <View style={s.scoreRow}>
              <Text style={[s.scoreValue, { color: scoreColor }]}>{securityScore}</Text>
              <Text style={[s.scoreMax, { color: theme.textMuted }]}>/100</Text>
            </View>
            <View style={s.scoreBar}>
              <View style={[s.scoreBarFill, { width: `${securityScore}%`, backgroundColor: scoreColor }]} />
            </View>
          </View>
          <View style={[s.scoreBadge, { backgroundColor: `${scoreColor}15` }]}>
            <Ionicons name={securityScore >= 90 ? 'shield-checkmark' : securityScore >= 75 ? 'shield-half' : 'warning'} size={28} color={scoreColor} />
            <Text style={[s.scoreBadgeText, { color: scoreColor }]}>{securityScore >= 90 ? 'Excellent' : securityScore >= 75 ? 'Good' : 'Alert'}</Text>
          </View>
        </View>

        {/* KPI Grid */}
        <View style={s.kpiGrid}>
          {[
            { icon: 'people', label: lang === 'en' ? 'On Duty' : 'Bertugas', val: `${onDutyCount}`, sub: `dari ${myTeam.length}`, color: Colors.success, bg: Colors.successBg },
            { icon: 'finger-print', label: lang === 'en' ? 'Attendance' : 'Kehadiran', val: `${hadirCount}`, sub: lang === 'en' ? 'today' : 'hari ini', color: Colors.primary, bg: Colors.primaryBg },
            { icon: 'alert-circle', label: lang === 'en' ? 'Incidents' : 'Insiden', val: `${openInsiden}`, sub: 'open', color: openInsiden > 0 ? Colors.danger : Colors.success, bg: openInsiden > 0 ? Colors.dangerBg : Colors.successBg },
            { icon: 'navigate', label: 'Patroli', val: `${patrolCount}`, sub: lang === 'en' ? 'active' : 'aktif', color: Colors.warning, bg: Colors.warningBg },
          ].map((kpi, i) => (
            <View key={i} style={[s.kpiCard, { backgroundColor: isDark ? theme.bgCard : '#fff', borderColor: theme.border }]}>
              <View style={[s.kpiIcon, { backgroundColor: kpi.bg }]}>
                <Ionicons name={kpi.icon as any} size={18} color={kpi.color} />
              </View>
              <Text style={[s.kpiValue, { color: kpi.color }]}>{kpi.val}</Text>
              <Text style={[s.kpiLabel, { color: theme.text }]}>{kpi.label}</Text>
              <Text style={[s.kpiSub, { color: theme.textMuted }]}>{kpi.sub}</Text>
            </View>
          ))}
        </View>

        {/* Live Map */}
        <View style={[s.section, { backgroundColor: isDark ? theme.bgCard : '#fff', borderColor: theme.border }]}>
          <View style={s.sectionHeader}>
            <Ionicons name="map" size={18} color={theme.primary} />
            <Text style={[s.sectionTitle, { color: theme.text }]}>{lang === 'en' ? 'Live Guard Map' : 'Peta Petugas Live'}</Text>
            <View style={[s.liveDot, { backgroundColor: Colors.success }]} />
            <Text style={[s.liveText, { color: Colors.success }]}>LIVE</Text>
          </View>
          <MapTracker markers={mapMarkers} circles={mapCircles} isDark={isDark} height={260} />
          <View style={s.mapLegend}>
            {[
              { color: Colors.success, label: 'On Duty' },
              { color: Colors.primary, label: 'Patroli' },
              { color: Colors.textMuted, label: 'Off Duty' },
              { color: Colors.primary, label: 'Pos Jaga', isCircle: true },
            ].map((item, i) => (
              <View key={i} style={s.legendItem}>
                <View style={[item.isCircle ? s.legendCircle : s.legendDot, { borderColor: item.color, backgroundColor: item.isCircle ? `${item.color}30` : item.color }]} />
                <Text style={[s.legendText, { color: theme.textMuted }]}>{item.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Guard Roster */}
        <View style={[s.section, { backgroundColor: isDark ? theme.bgCard : '#fff', borderColor: theme.border }]}>
          <View style={s.sectionHeader}>
            <Ionicons name="people" size={18} color={theme.primary} />
            <Text style={[s.sectionTitle, { color: theme.text }]}>{lang === 'en' ? 'Guard Roster' : 'Daftar Petugas'}</Text>
            <View style={{ flex: 1 }} />
            <Badge text={`${myTeam.length} ${lang === 'en' ? 'guards' : 'orang'}`} variant="info" />
          </View>

          {/* Status summary pills */}
          <View style={s.statusPills}>
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
              const count = myTeam.filter(m => getField(m, 'status') === key).length;
              if (count === 0) return null;
              return (
                <View key={key} style={[s.statusPill, { backgroundColor: `${cfg.color}12` }]}>
                  <View style={[s.pillDot, { backgroundColor: cfg.color }]} />
                  <Text style={[s.pillText, { color: cfg.color }]}>{count} {cfg.label}</Text>
                </View>
              );
            })}
          </View>

          {displayedGuards.map(m => {
            const mStatus = getField(m, 'status') || 'off_duty';
            const cfg = STATUS_CONFIG[mStatus] || STATUS_CONFIG.off_duty;
            const mNama = getField(m, 'nama', 'name') || 'Petugas';
            const mNrp = getField(m, 'nrp') || '-';
            // DB: users.pos_jaga
            const mPos = getField(m, 'pos_jaga', 'posJaga', 'pos') || '-';
            // DB: users.shift (or from shifts table)
            const mShift = getField(m, 'shift') || '-';
            const mFoto = getField(m, 'foto', 'photo', 'avatar');

            return (
              <View key={m.id} style={[s.guardRow, { borderBottomColor: theme.border }]}>
                <View style={s.guardAvatar}>
                  {mFoto ? (
                    <Image source={{ uri: mFoto }} style={s.guardImg} />
                  ) : (
                    <View style={[s.guardImg, { backgroundColor: isDark ? theme.border : Colors.bgGray, alignItems: 'center', justifyContent: 'center' }]}>
                      <Ionicons name="person" size={20} color={theme.textMuted} />
                    </View>
                  )}
                  <View style={[s.guardDot, { backgroundColor: cfg.color }]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.guardName, { color: theme.text }]}>{mNama}</Text>
                  <Text style={[s.guardMeta, { color: theme.textMuted }]}>{mNrp} • {mPos} • {mShift}</Text>
                </View>
                <Badge text={cfg.label} variant={mStatus === 'on_duty' ? 'success' : mStatus === 'patroli' ? 'info' : 'default'} />
              </View>
            );
          })}
          {myTeam.length > 5 && (
            <TouchableOpacity style={s.showMoreBtn} onPress={() => setShowAllGuards(!showAllGuards)}>
              <Text style={[s.showMoreText, { color: theme.primary }]}>
                {showAllGuards ? (lang === 'en' ? 'Show less' : 'Tampilkan sedikit') : `${lang === 'en' ? 'Show all' : 'Tampilkan semua'} ${myTeam.length} ${lang === 'en' ? 'guards' : 'petugas'}`}
              </Text>
              <Ionicons name={showAllGuards ? 'chevron-up' : 'chevron-down'} size={16} color={theme.primary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Pos Jaga Overview */}
        {posList.length > 0 && (
          <View style={[s.section, { backgroundColor: isDark ? theme.bgCard : '#fff', borderColor: theme.border }]}>
            <View style={s.sectionHeader}>
              <Ionicons name="location" size={18} color={theme.primary} />
              <Text style={[s.sectionTitle, { color: theme.text }]}>{lang === 'en' ? 'Guard Posts' : 'Pos Jaga'}</Text>
              <View style={{ flex: 1 }} />
              <Badge text={`${posList.filter((p: any) => getField(p, 'status') === 'active').length} aktif`} variant="success" />
            </View>
            <View style={s.posGrid}>
              {posList.map((p: any) => {
                const pNama = getField(p, 'nama', 'name') || 'Pos';
                const pStatus = getField(p, 'status') || 'active';
                const guardsHere = myTeam.filter(m => {
                  const mPos = getField(m, 'pos_jaga', 'posJaga', 'pos') || '';
                  return mPos === pNama;
                }).length;
                return (
                  <View key={p.id} style={[s.posCard, { backgroundColor: isDark ? `${theme.primary}08` : Colors.primaryBg, borderColor: isDark ? theme.border : Colors.primarySoft }]}>
                    <View style={s.posHeader}>
                      <Ionicons name="shield" size={16} color={pStatus === 'active' ? Colors.primary : Colors.textMuted} />
                      <Text style={[s.posName, { color: theme.text }]} numberOfLines={1}>{pNama}</Text>
                    </View>
                    <View style={s.posInfo}>
                      <View style={s.posChip}>
                        <Ionicons name="people-outline" size={12} color={theme.textMuted} />
                        <Text style={[s.posChipText, { color: theme.textMuted }]}>{guardsHere} petugas</Text>
                      </View>
                      <View style={s.posChip}>
                        <Ionicons name="radio-button-on" size={10} color={pStatus === 'active' ? Colors.success : Colors.textMuted} />
                        <Text style={[s.posChipText, { color: pStatus === 'active' ? Colors.success : theme.textMuted }]}>{pStatus === 'active' ? 'Aktif' : 'Nonaktif'}</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Quick Actions */}
        <View style={[s.section, { backgroundColor: isDark ? theme.bgCard : '#fff', borderColor: theme.border }]}>
          <View style={s.sectionHeader}>
            <Ionicons name="grid" size={18} color={theme.primary} />
            <Text style={[s.sectionTitle, { color: theme.text }]}>Menu</Text>
          </View>
          <View style={s.menuGrid}>
            <TouchableOpacity style={[s.menuItem, { backgroundColor: isDark ? `${Colors.primary}15` : Colors.primaryBg }]} onPress={() => navigation.navigate('DownloadLaporan')}>
              <Ionicons name="download-outline" size={24} color={Colors.primary} />
              <Text style={[s.menuItemText, { color: theme.text }]}>{lang === 'en' ? 'Reports' : 'Laporan'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.menuItem, { backgroundColor: isDark ? `${Colors.danger}15` : Colors.dangerBg }]} onPress={() => navigation.navigate('Insiden')}>
              <Ionicons name="alert-circle-outline" size={24} color={Colors.danger} />
              <Text style={[s.menuItemText, { color: theme.text }]}>Insiden</Text>
              {openInsiden > 0 && <View style={s.menuBadge}><Text style={s.menuBadgeText}>{openInsiden}</Text></View>}
            </TouchableOpacity>
            <TouchableOpacity style={[s.menuItem, { backgroundColor: isDark ? `${Colors.success}15` : Colors.successBg }]} onPress={() => navigation.navigate('Laporan')}>
              <Ionicons name="list-outline" size={24} color={Colors.success} />
              <Text style={[s.menuItemText, { color: theme.text }]}>{lang === 'en' ? 'Activity' : 'Aktivitas'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.menuItem, { backgroundColor: isDark ? `${Colors.warning}15` : Colors.warningBg }]} onPress={() => navigation.navigate('Notifikasi')}>
              <Ionicons name="notifications-outline" size={24} color={Colors.warning} />
              <Text style={[s.menuItemText, { color: theme.text }]}>Notifikasi</Text>
              {unreadNotif > 0 && <View style={s.menuBadge}><Text style={s.menuBadgeText}>{unreadNotif}</Text></View>}
            </TouchableOpacity>
          </View>
        </View>

        {/* Recent Incidents */}
        {myLaporanK.length > 0 && (
          <View style={[s.section, { backgroundColor: isDark ? theme.bgCard : '#fff', borderColor: theme.border }]}>
            <View style={s.sectionHeader}>
              <Ionicons name="alert-circle" size={18} color={Colors.danger} />
              <Text style={[s.sectionTitle, { color: theme.text }]}>{lang === 'en' ? 'Recent Incidents' : 'Insiden Terbaru'}</Text>
              <View style={{ flex: 1 }} />
              <TouchableOpacity onPress={() => navigation.navigate('Insiden')}>
                <Text style={[s.viewAll, { color: theme.primary }]}>{lang === 'en' ? 'View All' : 'Lihat Semua'} →</Text>
              </TouchableOpacity>
            </View>
            {myLaporanK.slice(0, 3).map(l => {
              const prioritas = getField(l, 'prioritas') || 'sedang';
              const prioColor = prioritas === 'kritis' ? Colors.danger : prioritas === 'tinggi' ? Colors.warning : Colors.primary;
              const jenis = getField(l, 'jenis') || 'Insiden';
              const nama = getField(l, 'nama', 'name', 'user_nama') || 'Pelapor';
              // DB: waktu_kejadian, created_at
              const waktu = getField(l, 'waktu_kejadian', 'waktuKejadian') || getField(l, 'created_at', 'createdAt', 'waktuSubmit', 'waktu_submit') || '';
              const displayWaktu = typeof waktu === 'string' && waktu.includes('T')
                ? new Date(waktu).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                : waktu;
              const status = getField(l, 'status') || 'pending';

              return (
                <View key={l.id} style={[s.incidentRow, { borderBottomColor: theme.border }]}>
                  <View style={[s.incidentDot, { backgroundColor: prioColor }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.incidentTitle, { color: theme.text }]}>{jenis}</Text>
                    <Text style={[s.incidentMeta, { color: theme.textMuted }]}>{nama} • {displayWaktu}</Text>
                  </View>
                  <Badge text={status === 'approved' ? '✓' : '●'} variant={status === 'approved' ? 'success' : 'warning'} />
                </View>
              );
            })}
          </View>
        )}

        {/* Company Info Footer */}
        <View style={[s.companyInfo, { backgroundColor: isDark ? theme.bgCard : '#fff', borderColor: theme.border }]}>
          <View style={s.companyRow}>
            <View style={[s.companyIcon, { backgroundColor: isDark ? `${theme.primary}15` : Colors.primaryBg }]}>
              <Ionicons name="business" size={22} color={theme.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.companyName, { color: theme.text }]}>{companyName}</Text>
              <Text style={[s.companyAddr, { color: theme.textMuted }]}>{getField(myLokasi[0], 'alamat', 'address') || ''}</Text>
            </View>
          </View>
          <View style={s.companyStats}>
            <View style={s.companyStat}>
              <Text style={[s.companyStatVal, { color: theme.primary }]}>{posList.length}</Text>
              <Text style={[s.companyStatLabel, { color: theme.textMuted }]}>Pos Jaga</Text>
            </View>
            <View style={[s.companyDivider, { backgroundColor: theme.border }]} />
            <View style={s.companyStat}>
              <Text style={[s.companyStatVal, { color: theme.primary }]}>{myTeam.length}</Text>
              <Text style={[s.companyStatLabel, { color: theme.textMuted }]}>Personil</Text>
            </View>
            <View style={[s.companyDivider, { backgroundColor: theme.border }]} />
            <View style={s.companyStat}>
              <Text style={[s.companyStatVal, { color: theme.primary }]}>{myAbsensi.length}</Text>
              <Text style={[s.companyStatLabel, { color: theme.textMuted }]}>Absensi</Text>
            </View>
          </View>
        </View>

        {/* Powered by */}
        <View style={s.footerBrand}>
          <Ionicons name="shield-checkmark" size={14} color={theme.textMuted} />
          <Text style={[s.footerText, { color: theme.textMuted }]}>PT Sopiak Satria Saga - Security Management System</Text>
        </View>
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingTop: 48, paddingBottom: 16, paddingHorizontal: Spacing.base, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  companyBadge: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  headerGreeting: { fontSize: 11, color: 'rgba(255,255,255,0.6)' },
  headerName: { fontSize: 18, fontWeight: '800', color: '#fff' },
  headerRight: { flexDirection: 'row', gap: 6 },
  headerBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  notifDot: { position: 'absolute', top: -2, right: -2, backgroundColor: Colors.danger, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  notifDotText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  headerCompany: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, alignSelf: 'flex-start' },
  headerCompanyText: { fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: '600' },
  content: { padding: 14 },
  scoreCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, marginBottom: 14, borderWidth: 1 },
  scoreLeft: { flex: 1 },
  scoreLabel: { fontSize: 11, fontWeight: '600', marginBottom: 4 },
  scoreRow: { flexDirection: 'row', alignItems: 'baseline' },
  scoreValue: { fontSize: 36, fontWeight: '900' },
  scoreMax: { fontSize: 14, fontWeight: '600', marginLeft: 2 },
  scoreBar: { height: 6, backgroundColor: '#ecf0f1', borderRadius: 3, marginTop: 8, overflow: 'hidden' },
  scoreBarFill: { height: '100%', borderRadius: 3 },
  scoreBadge: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginLeft: 14 },
  scoreBadgeText: { fontSize: 10, fontWeight: '800', marginTop: 2 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  kpiCard: { width: (SW - 36) / 2 - 4, padding: 14, borderRadius: 14, alignItems: 'center', borderWidth: 1 },
  kpiIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  kpiValue: { fontSize: 26, fontWeight: '900' },
  kpiLabel: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  kpiSub: { fontSize: 10, marginTop: 1 },
  section: { borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  sectionTitle: { fontSize: 15, fontWeight: '800' },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveText: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  viewAll: { fontSize: 12, fontWeight: '700' },
  mapLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#ecf0f1' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendCircle: { width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  legendText: { fontSize: 10 },
  statusPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 11, fontWeight: '700' },
  guardRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 0.5 },
  guardAvatar: { position: 'relative' },
  guardImg: { width: 40, height: 40, borderRadius: 20 },
  guardDot: { position: 'absolute', bottom: 0, right: -1, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#fff' },
  guardName: { fontSize: 13, fontWeight: '700' },
  guardMeta: { fontSize: 11, marginTop: 1 },
  showMoreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingTop: 12 },
  showMoreText: { fontSize: 13, fontWeight: '700' },
  posGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  posCard: { width: (SW - 60) / 2 - 4, padding: 12, borderRadius: 12, borderWidth: 1 },
  posHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  posName: { fontSize: 12, fontWeight: '700', flex: 1 },
  posInfo: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  posChip: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  posChipText: { fontSize: 10 },
  menuGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  menuItem: { width: (SW - 60) / 2 - 4, padding: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 8, position: 'relative' },
  menuItemText: { fontSize: 12, fontWeight: '700' },
  menuBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: Colors.danger, borderRadius: 10, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  menuBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  incidentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 0.5 },
  incidentDot: { width: 8, height: 8, borderRadius: 4 },
  incidentTitle: { fontSize: 13, fontWeight: '700' },
  incidentMeta: { fontSize: 11, marginTop: 1 },
  companyInfo: { borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1 },
  companyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  companyIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  companyName: { fontSize: 15, fontWeight: '800' },
  companyAddr: { fontSize: 11, marginTop: 2 },
  companyStats: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 14, borderTopWidth: 1, borderTopColor: '#ecf0f1' },
  companyStat: { alignItems: 'center' },
  companyStatVal: { fontSize: 20, fontWeight: '900' },
  companyStatLabel: { fontSize: 10, marginTop: 2 },
  companyDivider: { width: 1, height: 32 },
  footerBrand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 16 },
  footerText: { fontSize: 10 },
});