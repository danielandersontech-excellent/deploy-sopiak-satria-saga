/**
 * MONITOR REALTIME SCREEN - v11 (Bug-Fix Pass)
 *
 * DATABASE ALIGNMENT:
 *   users: id, nama, nrp, role, pos_jaga, shift, lokasi_id, foto, last_latitude, last_longitude, last_seen
 *   lokasi: id, nama, alamat, posList (JSON with pos details)
 *
 * CRITICAL FIX (v11):
 *  🚨 fetchLiveLocations now uses extractArray() to handle paginated
 *     backend response { data: [...], pagination: {...} }.
 *     Previously Array.isArray(data) was ALWAYS FALSE → liveData was
 *     always empty → map markers never updated from live API.
 *  ✅ useEffect deps include fetchLiveLocations (lint-safe)
 *  ✅ Filtered list is memoized to avoid recomputation each render
 *  ✅ `filtered.map` uses stable key (id || nrp) instead of random
 *  ✅ MapMarker.id coerced to string for safe comparison
 *  ✅ Lat/Lng validity check (rejects NaN values)
 *
 * PRIOR FIXES:
 *  - getField() for dual snake_case/camelCase field access
 *  - Team filtered by lokasi_id (DB column)
 *  - Map markers: last_latitude/last_longitude (DB columns) with camelCase fallback
 *  - Member fields: pos_jaga (not pos), shift, nama via getField
 *  - Geofence circles from lokasi.posList
 *  - Company scope restricted by komandan's lokasi_id
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, RefreshControl, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../../constants';
import { Card, Badge } from '../../components';
import { useDataStore } from '../../stores/dataStore';
import { useAuthStore } from '../../stores/authStore';
import { usersApi } from '../../lib/apiClient';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';
import MapTracker from '../../components/map/MapTracker';
import type { MapMarker, MapCircle } from '../../components/map/MapTracker';

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
 * Extract array from API response.
 * Backend may return:
 *   - Array directly: [...]
 *   - Paginated object: { data: [...], pagination: {...} }
 *   - Wrapped object: { rows: [...] } or { items: [...] }
 */
function extractArray(result: any): any[] {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.data)) return result.data;
  if (result && Array.isArray(result.rows)) return result.rows;
  if (result && Array.isArray(result.items)) return result.items;
  return [];
}

const { width: SW } = Dimensions.get('window');

const STATUS_MAP: Record<
  string,
  { label: string; labelEn: string; variant: 'success' | 'info' | 'warning' | 'default'; color: string; icon: string }
> = {
  on_duty: { label: 'On Duty', labelEn: 'On Duty', variant: 'success', color: Colors.success, icon: 'shield-checkmark' },
  patroli: { label: 'Patroli', labelEn: 'Patrol', variant: 'info', color: Colors.primary, icon: 'walk' },
  break: { label: 'Istirahat', labelEn: 'Break', variant: 'warning', color: Colors.warning, icon: 'cafe' },
  off_duty: { label: 'Off Duty', labelEn: 'Off Duty', variant: 'default', color: Colors.textMuted, icon: 'moon' },
};

type ViewMode = 'map' | 'list';

export default function MonitorRealtimeScreen({ navigation }: any) {
  const { t, lang } = useI18n();
  const { theme, isDark } = useTheme();
  const user = useAuthStore((s) => s.user);
  const team = useDataStore((s) => s.team);
  const allLokasi = useDataStore((s) => s.lokasi);
  const [filter, setFilter] = useState<string>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [liveData, setLiveData] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('map');

  // Komandan's lokasi_id - DB column
  const myLokasiId = getField(user, 'lokasi_id', 'lokasiId') || null;

  // CRITICAL FIX: Use extractArray to handle paginated response
  const fetchLiveLocations = useCallback(async () => {
    try {
      const result = await usersApi.list('role=anggota&role=komandan');
      setLiveData(extractArray(result));
    } catch (e) {
      console.log('[Monitor] Fetch error:', e);
    }
  }, []);

  useEffect(() => {
    fetchLiveLocations();
  }, [fetchLiveLocations]);

  // Filter team to ONLY this company by lokasi_id
  const filteredTeam = useMemo(() => {
    if (!myLokasiId) return team;
    return team.filter((m) => {
      const mLokId = String(getField(m, 'lokasi_id', 'lokasiId') || '');
      return mLokId === String(myLokasiId);
    });
  }, [team, myLokasiId]);

  // Filter lokasi to ONLY this company
  const lokasi = useMemo(() => {
    if (!myLokasiId) return allLokasi;
    return allLokasi.filter((l) => String(getField(l, 'id', '_id')) === String(myLokasiId));
  }, [allLokasi, myLokasiId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchLiveLocations();
      await useDataStore.getState().loadAllData();
    } catch (e) {
      console.log('[Monitor] Refresh error:', e);
    } finally {
      setRefreshing(false);
    }
  }, [fetchLiveLocations]);

  // Get member location from live API data or team store - DB: last_latitude, last_longitude
  const getMemberLocation = useCallback(
    (memberId: string) => {
      const live = liveData.find((d) => String(getField(d, 'id', '_id') || '') === String(memberId));
      if (live) {
        const lat = getField(live, 'last_latitude', 'lastLatitude');
        const lng = getField(live, 'last_longitude', 'lastLongitude');
        if (lat != null && lng != null && !isNaN(Number(lat)) && !isNaN(Number(lng))) {
          return { lat: Number(lat), lng: Number(lng), seen: getField(live, 'last_seen', 'lastSeen') };
        }
      }
      const member = team.find((m) => String(getField(m, 'id', '_id') || '') === String(memberId));
      if (member) {
        const lat = getField(member, 'last_latitude', 'lastLatitude');
        const lng = getField(member, 'last_longitude', 'lastLongitude');
        if (lat != null && lng != null && !isNaN(Number(lat)) && !isNaN(Number(lng))) {
          return { lat: Number(lat), lng: Number(lng), seen: null as string | null };
        }
      }
      return null;
    },
    [liveData, team]
  );

  const timeAgo = useCallback(
    (dateStr: string) => {
      if (!dateStr) return '';
      const then = new Date(dateStr).getTime();
      if (isNaN(then)) return '';
      const now = Date.now();
      const diff = Math.floor((now - then) / 1000);
      if (diff < 60) return t('general.just_now');
      if (diff < 3600) return `${Math.floor(diff / 60)} ${t('general.minutes')} ${t('general.ago')}`;
      if (diff < 86400) return `${Math.floor(diff / 3600)} ${t('general.hours')} ${t('general.ago')}`;
      return `${Math.floor(diff / 86400)} ${t('general.days')} ${t('general.ago')}`;
    },
    [t]
  );

  // Memoized filtered list
  const filtered = useMemo(() => {
    if (filter === 'all') return filteredTeam;
    if (filter === 'off_duty') {
      // "Off" chip groups off_duty + break together
      return filteredTeam.filter((m) => {
        const s = getField(m, 'status');
        return s === 'off_duty' || s === 'break';
      });
    }
    return filteredTeam.filter((m) => getField(m, 'status') === filter);
  }, [filteredTeam, filter]);

  // Counts - always computed from full filteredTeam (not the active-filter view)
  const counts = useMemo(
    () => ({
      total: filteredTeam.length,
      on_duty: filteredTeam.filter((m) => getField(m, 'status') === 'on_duty').length,
      patroli: filteredTeam.filter((m) => getField(m, 'status') === 'patroli').length,
      off_duty: filteredTeam.filter((m) => getField(m, 'status') === 'off_duty' || getField(m, 'status') === 'break').length,
      tracked: filteredTeam.filter((m) => {
        const lat = getField(m, 'last_latitude', 'lastLatitude');
        const lng = getField(m, 'last_longitude', 'lastLongitude');
        return lat != null && lng != null;
      }).length,
    }),
    [filteredTeam]
  );

  const companyName = useMemo(() => {
    if (lokasi.length > 0) return getField(lokasi[0], 'nama', 'name') || '';
    return getField(user, 'lokasi_nama', 'lokasiNama', 'lokasi') || (lang === 'en' ? 'My Company' : 'Perusahaan Saya');
  }, [lokasi, user, lang]);

  // Map markers - filter by current filter chip and only include members with valid location
  const mapMarkers: MapMarker[] = useMemo(() => {
    return filteredTeam
      .filter((m) => {
        if (filter !== 'all') {
          const s = getField(m, 'status');
          if (filter === 'off_duty') {
            if (s !== 'off_duty' && s !== 'break') return false;
          } else if (s !== filter) {
            return false;
          }
        }
        return getMemberLocation(String(getField(m, 'id', '_id') || '')) !== null;
      })
      .map((m) => {
        const memberId = String(getField(m, 'id', '_id') || '');
        const loc = getMemberLocation(memberId)!;
        const mStatus = getField(m, 'status') || 'off_duty';
        const st2 = STATUS_MAP[mStatus] || STATUS_MAP.off_duty;
        return {
          id: memberId,
          latitude: loc.lat,
          longitude: loc.lng,
          title: getField(m, 'nama', 'name') || 'Anggota',
          description: `${getField(m, 'pos_jaga', 'posJaga', 'pos_nama', 'pos') || '-'} • ${getField(m, 'shift') || '-'}`,
          type: (mStatus === 'patroli' ? 'patrol' : 'person') as MapMarker['type'],
          color: st2.color,
          status: mStatus,
        };
      });
  }, [filteredTeam, filter, getMemberLocation]);

  // Geofence circles from lokasi.posList
  const mapCircles: MapCircle[] = useMemo(() => {
    return lokasi.flatMap((l) => {
      const posList = getField(l, 'posList', 'pos_list') || [];
      if (!Array.isArray(posList)) return [];
      return posList
        .filter((p: any) => {
          const lat = getField(p, 'latitude');
          const lng = getField(p, 'longitude');
          return lat != null && lng != null && !isNaN(Number(lat)) && !isNaN(Number(lng));
        })
        .map((p: any) => ({
          latitude: Number(getField(p, 'latitude')),
          longitude: Number(getField(p, 'longitude')),
          radius: Number(getField(p, 'radius')) || 100,
          color: Colors.purple,
          label: getField(p, 'nama', 'name') || '',
        }));
    });
  }, [lokasi]);

  const statItems = [
    { key: 'all', label: lang === 'en' ? 'All' : 'Semua', count: counts.total, color: theme.primary, icon: 'people' as const },
    { key: 'on_duty', label: 'On Duty', count: counts.on_duty, color: Colors.success, icon: 'shield-checkmark' as const },
    { key: 'patroli', label: lang === 'en' ? 'Patrol' : 'Patroli', count: counts.patroli, color: Colors.primary, icon: 'walk' as const },
    { key: 'off_duty', label: 'Off', count: counts.off_duty, color: Colors.textMuted, icon: 'moon' as const },
  ];

  return (
    <View style={[s.container, { backgroundColor: theme.bg }]}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: isDark ? theme.bgCard : Colors.primaryDark }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={s.headerSub}>{companyName}</Text>
            <Text style={s.headerTitle}>{t('cmd.realtime')}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={s.trackedBadge}>
              <Ionicons name="radio" size={12} color="#fff" />
              <Text style={s.trackedText}>
                {counts.tracked}/{counts.total}
              </Text>
            </View>
            <View style={[s.viewToggle, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
              <TouchableOpacity
                style={[s.viewToggleBtn, viewMode === 'map' && { backgroundColor: 'rgba(255,255,255,0.3)' }]}
                onPress={() => setViewMode('map')}
              >
                <Ionicons name="map" size={16} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.viewToggleBtn, viewMode === 'list' && { backgroundColor: 'rgba(255,255,255,0.3)' }]}
                onPress={() => setViewMode('list')}
              >
                <Ionicons name="list" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      {/* Stats */}
      <View style={[s.statsRow, { backgroundColor: theme.bgCard, borderBottomColor: theme.border }]}>
        {statItems.map((item) => {
          const active = filter === item.key;
          return (
            <TouchableOpacity
              key={item.key}
              style={[s.statChip, { backgroundColor: active ? item.color : theme.bgCard, borderColor: active ? item.color : theme.border }]}
              onPress={() => setFilter(item.key)}
              activeOpacity={0.7}
            >
              <Ionicons name={item.icon} size={14} color={active ? '#fff' : item.color} />
              <Text style={[s.statCount, { color: active ? '#fff' : item.color }]}>{item.count}</Text>
              <Text style={[s.statLabel, { color: active ? 'rgba(255,255,255,0.85)' : theme.textMuted }]}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Map */}
      {viewMode === 'map' && (
        <View style={{ paddingHorizontal: Spacing.base, paddingTop: 12 }}>
          <MapTracker
            markers={mapMarkers}
            circles={mapCircles}
            isDark={isDark}
            height={320}
            onMarkerPress={(marker) => {
              const member = filteredTeam.find((m) => String(getField(m, 'id', '_id') || '') === String(marker.id));
              if (member) navigation.navigate('DetailAnggota', { nrp: getField(member, 'nrp') });
            }}
          />
        </View>
      )}

      {/* Info bar */}
      <View style={[s.pingInfo, { backgroundColor: isDark ? `${theme.primary}15` : '#EFF6FF' }]}>
        <Ionicons name="business-outline" size={14} color={theme.primary} />
        <Text style={[s.pingText, { color: theme.primary }]} numberOfLines={1}>
          Monitoring: {companyName}
        </Text>
        <TouchableOpacity onPress={onRefresh} style={s.refreshBtn}>
          <Ionicons name="refresh" size={14} color={theme.primary} />
          <Text style={[s.refreshText, { color: theme.primary }]}>{t('general.refresh')}</Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {filtered.map((m: any) => {
          const mStatus = getField(m, 'status') || 'off_duty';
          const st2 = STATUS_MAP[mStatus] || STATUS_MAP.off_duty;
          const memberId = String(getField(m, 'id', '_id') || '');
          const loc = getMemberLocation(memberId);
          const mFoto = getField(m, 'foto', 'foto_url', 'avatar') || 'https://via.placeholder.com/46';
          const mNama = getField(m, 'nama', 'name') || 'Anggota';
          const mPos = getField(m, 'pos_jaga', 'posJaga', 'pos_nama', 'pos') || '-';
          const mShift = getField(m, 'shift') || '-';
          const mNrp = getField(m, 'nrp') || '';
          return (
            <TouchableOpacity
              key={memberId || mNrp || `m-${Math.random()}`}
              onPress={() => navigation.navigate('DetailAnggota', { nrp: mNrp })}
              activeOpacity={0.7}
            >
              <Card style={s.memberCard}>
                <View style={s.memberRow}>
                  <View style={s.avatarWrap}>
                    <Image source={{ uri: mFoto }} style={s.avatar} />
                    <View style={[s.statusDot, { backgroundColor: st2.color }]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.memberName, { color: theme.text }]}>{mNama}</Text>
                    <Text style={[s.memberMeta, { color: theme.textMuted }]}>
                      {mPos} • {mShift}
                    </Text>
                    {loc ? (
                      <View style={s.locRow}>
                        <Ionicons name="location" size={12} color={Colors.success} />
                        <Text style={s.locText}>
                          {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
                        </Text>
                        {loc.seen ? <Text style={[s.locTime, { color: theme.textMuted }]}>• {timeAgo(loc.seen)}</Text> : null}
                      </View>
                    ) : (
                      <View style={s.locRow}>
                        <Ionicons name="location-outline" size={12} color={theme.textMuted} />
                        <Text style={[s.locText, { color: theme.textMuted }]}>
                          {lang === 'en' ? 'No location' : 'Belum ada lokasi'}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View style={s.memberRight}>
                    <Badge text={lang === 'en' ? st2.labelEn : st2.label} variant={st2.variant} />
                    <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
                  </View>
                </View>
              </Card>
            </TouchableOpacity>
          );
        })}
        {filtered.length === 0 && (
          <View style={s.emptyWrap}>
            <Ionicons name="people-outline" size={48} color={theme.textMuted} />
            <Text style={[s.emptyText, { color: theme.textMuted }]}>{t('general.no_data')}</Text>
            <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 4, textAlign: 'center' }}>
              {lang === 'en'
                ? 'No members match this filter for your company'
                : 'Tidak ada anggota sesuai filter untuk perusahaan Anda'}
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
  header: { paddingTop: 48, paddingBottom: 14, paddingHorizontal: Spacing.base, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  headerSub: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginBottom: 2 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  trackedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  trackedText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  viewToggle: { flexDirection: 'row', borderRadius: 8, padding: 2, gap: 2 },
  viewToggleBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  statsRow: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: Spacing.base, gap: 8, borderBottomWidth: 1 },
  statChip: { flex: 1, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4, borderRadius: Radius.md, borderWidth: 1.5, minHeight: 68, justifyContent: 'center', gap: 2 },
  statCount: { fontSize: 22, fontWeight: '800', lineHeight: 26 },
  statLabel: { fontSize: 10, fontWeight: '600' },
  pingInfo: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.base, paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: '#BFDBFE' },
  pingText: { ...Typography.caption, flex: 1, fontWeight: '600' },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  refreshText: { fontSize: 12, fontWeight: '700' },
  content: { padding: Spacing.base },
  memberCard: { marginBottom: 8, padding: 14 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarWrap: { position: 'relative' },
  avatar: { width: 46, height: 46, borderRadius: 23 },
  statusDot: { position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#fff' },
  memberName: { ...Typography.bodyBold },
  memberMeta: { ...Typography.caption, marginTop: 1 },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  locText: { fontSize: 11, color: Colors.success },
  locTime: { fontSize: 11 },
  memberRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  emptyWrap: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { ...Typography.body, marginTop: 8 },
});
