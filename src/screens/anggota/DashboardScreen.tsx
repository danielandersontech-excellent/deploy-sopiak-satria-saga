/**
 * DASHBOARD ANGGOTA - v8 Dark Mode + i18n
 */
import React, { useEffect, useRef, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, Animated, Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius, Shadows } from '../../constants';
import { Card, Badge, CountBadge, MenuCard } from '../../components';
import { useAuthStore } from '../../stores/authStore';
import { useDataStore } from '../../stores/dataStore';
import { useClock } from '../../hooks/useClock';
import { getPendingCount } from '../../services/offlineSync';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

const { width } = Dimensions.get('window');

export default function DashboardScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { theme, isDark } = useTheme();
  const user = useAuthStore((s) => s.user);
  const { jam, tanggal } = useClock();
  const notifikasi = useDataStore((s) => s.notifikasi);
  const absensiRecords = useDataStore((s) => s.absensiRecords);
  const activePatrol = useDataStore((s) => s.activePatrol);
  const laporanHarian = useDataStore((s) => s.laporanHarian);

  const MENU_ITEMS = [
    { key: 'Absensi', icon: 'finger-print', label: t('dash.menu.absensi'), color: '#2980b9' },
    { key: 'Patroli', icon: 'navigate-circle', label: t('dash.menu.patroli'), color: '#27ae60' },
    { key: 'LaporanHarian', icon: 'document-text', label: t('dash.menu.laporan_harian'), color: '#f39c12' },
    { key: 'LaporanKejadian', icon: 'alert-circle', label: t('dash.menu.laporan_kejadian'), color: '#e74c3c' },
    { key: 'SerahTerima', icon: 'swap-horizontal', label: t('dash.menu.serah_terima'), color: '#8e44ad' },
    { key: 'ProfilDetail', icon: 'person-circle', label: t('nav.profile'), color: '#5d6d7e' },
  ];

  const unreadCount = useMemo(() => notifikasi.filter((n) => !n.dibaca).length, [notifikasi]);
  const todayAbs = useMemo(() => {
    const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    const now = new Date();
    const td = `${String(now.getDate()).padStart(2, '0')} ${months[now.getMonth()]} ${now.getFullYear()}`;
    const uid = user?.id || 'T1';
    const recs = absensiRecords.filter((r) => r.userId === uid && r.tanggal === td);
    return { masuk: recs.find((r) => r.tipe === 'masuk'), keluar: recs.find((r) => r.tipe === 'keluar') };
  }, [absensiRecords, user?.id]);
  const laporanPending = useMemo(() => laporanHarian.filter((l) => l.status === 'revision' && l.userId === (user?.id || 'T1')).length, [laporanHarian, user?.id]);
  const [offlinePending, setOfflinePending] = useState(0);
  useEffect(() => { getPendingCount().then(setOfflinePending); const ti = setInterval(() => getPendingCount().then(setOfflinePending), 15000); return () => clearInterval(ti); }, []);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.12, duration: 900, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);

  const absenStep = todayAbs.keluar ? 2 : todayAbs.masuk ? 1 : 0;
  const absenLabel = [t('absensi.not_done'), `${t('absensi.clock_in')} âœ“`, `${t('general.done')} âœ“âœ“`][absenStep];
  const absenVariant: ('warning' | 'info' | 'success') = (['warning', 'info', 'success'] as const)[absenStep];

  const getBadge = (key: string): string | undefined => {
    if (key === 'LaporanHarian' && laporanPending > 0) return `${laporanPending}`;
    if (key === 'Patroli' && activePatrol) return '!';
    return undefined;
  };

  return (
    <View style={[s.container, { backgroundColor: theme.bg }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 12 }, { backgroundColor: isDark ? theme.bgCard : Colors.primaryDark }]}>
        <View style={s.headerContent}>
          <Image source={{ uri: user?.foto || 'https://via.placeholder.com/50' }} style={s.avatar} />
          <View style={s.headerInfo}>
            <Text style={s.greeting}>{t('dash.greeting')} ðŸ‘‹</Text>
            <Text style={s.userName}>{user?.nama || 'Security'}</Text>
            <Text style={s.userPos}>{user?.posJaga}</Text>
          </View>
          <TouchableOpacity style={s.bellBtn} onPress={() => navigation.navigate('Notifikasi')}>
            <Ionicons name="notifications-outline" size={22} color="#fff" />
            {unreadCount > 0 && <View style={s.bellBadge}><Text style={s.bellBadgeText}>{unreadCount}</Text></View>}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 16 }]} showsVerticalScrollIndicator={false}>
        {/* Status Card */}
        <View style={[s.statusCard, { backgroundColor: theme.bgCard }, isDark ? { borderWidth: 1, borderColor: theme.border } : Shadows.sm]}>
          <View style={s.statusLeft}>
            <View style={s.clockRow}>
              <View style={s.liveDot} />
              <Text style={[s.clockText, { color: theme.primary }]}>{jam}</Text>
            </View>
            <Text style={[s.dateText, { color: theme.textMuted }]}>{tanggal}</Text>
            <Text style={[s.shiftText, { color: theme.textSecondary }]}>{t('general.shift')}: {user?.shift || '08:00 - 16:00 WIB'}</Text>
          </View>
          <View style={s.statusRight}>
            <Badge text={absenLabel} variant={absenVariant} size="medium" />
            {activePatrol && <Badge text={t('patrol.active')} variant="info" size="medium" dot />}
          </View>
        </View>

        {/* Quick Absen Button */}
        {absenStep < 2 && (
          <TouchableOpacity
            style={[s.quickAbsen, { backgroundColor: theme.bgCard, borderColor: isDark ? theme.border : Colors.primarySoft }, isDark ? { borderWidth: 1 } : Shadows.sm]}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('Absensi')}
          >
            <View style={[s.quickAbsenIcon, { backgroundColor: theme.primary }]}>
              <Ionicons name={absenStep === 0 ? 'log-in' : 'log-out'} size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.quickAbsenTitle, { color: theme.primary }]}>{absenStep === 0 ? t('absensi.clock_in') : t('absensi.clock_out')}</Text>
              <Text style={[s.quickAbsenSub, { color: theme.textMuted }]}>
                {absenStep === 0 ? t('absensi.take_selfie') + ' & GPS' : t('absensi.clock_out')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.primary} />
          </TouchableOpacity>
        )}

        {/* Menu Grid */}
        <Text style={[s.sectionTitle, { color: theme.text }]}>{t('dash.quick_menu')}</Text>
        <View style={s.menuGrid}>
          {MENU_ITEMS.map((item) => (
            <MenuCard
              key={item.key}
              icon={item.icon as any}
              label={item.label}
              gradientColor={item.color}
              onPress={() => navigation.navigate(item.key)}
              badge={getBadge(item.key)}
              badgeVariant={item.key === 'Patroli' ? 'success' : 'danger'}
            />
          ))}
        </View>

        {/* Active Patrol Banner */}
        {activePatrol && (
          <TouchableOpacity style={s.patrolBanner} onPress={() => navigation.navigate('Patroli')}>
            <View style={s.patrolIcon}><Ionicons name="navigate" size={20} color="#fff" /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.patrolTitle}>{t('patrol.patrol_active')}</Text>
              <Text style={s.patrolSub}>{activePatrol.routeName} â€¢ {activePatrol.checkpoints.filter(c => c.scanned).length}/{activePatrol.checkpoints.length} checkpoint</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.success} />
          </TouchableOpacity>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Floating Panic Button */}
      <TouchableOpacity style={[s.panicBtn, { bottom: 22 + insets.bottom }]} onPress={() => navigation.navigate('PanicButton')} activeOpacity={0.8}>
        <Animated.View style={[s.panicInner, { transform: [{ scale: pulseAnim }] }]}>
          <Ionicons name="warning" size={22} color="#fff" />
          <Text style={s.panicText}>SOS</Text>
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingBottom: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerContent: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg },
  avatar: { width: 52, height: 52, borderRadius: 26, borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.35)' },
  headerInfo: { flex: 1, marginLeft: 14 },
  greeting: { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginBottom: 1 },
  userName: { fontSize: 18, fontWeight: '700', color: '#fff' },
  userPos: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 1 },
  bellBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  bellBadge: { position: 'absolute', top: 0, right: 0, backgroundColor: Colors.danger, borderRadius: 10, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  bellBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  scroll: { padding: Spacing.base },
  statusCard: { flexDirection: 'row', borderRadius: Radius.lg, padding: 16, marginBottom: 12 },
  statusLeft: { flex: 1 },
  clockRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success },
  clockText: { fontSize: 26, fontWeight: '800', fontVariant: ['tabular-nums'] },
  dateText: { ...Typography.caption, marginTop: 2, flexShrink: 1 },
  shiftText: { ...Typography.smallBold, marginTop: 4 },
  statusRight: { alignItems: 'flex-end', justifyContent: 'center', gap: 6 },
  quickAbsen: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: Radius.lg, padding: 14, marginBottom: 16, borderWidth: 1.5 },
  quickAbsenIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  quickAbsenTitle: { ...Typography.bodyBold },
  quickAbsenSub: { ...Typography.caption, marginTop: 1 },
  sectionTitle: { ...Typography.bodyBold, marginBottom: 6, marginTop: 4 },
  menuGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  patrolBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.successBg, borderRadius: Radius.lg, padding: 14, marginTop: 12, borderWidth: 1.5, borderColor: Colors.successSoft },
  patrolIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: Colors.success, alignItems: 'center', justifyContent: 'center' },
  patrolTitle: { ...Typography.bodyBold, color: Colors.successDark },
  patrolSub: { ...Typography.caption, color: Colors.success },
  panicBtn: { position: 'absolute', right: 18, zIndex: 10 },
  panicInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: Colors.danger, alignItems: 'center', justifyContent: 'center', ...Shadows.lg },
  panicText: { color: '#fff', fontSize: 10, fontWeight: '800', marginTop: -2 },
});
