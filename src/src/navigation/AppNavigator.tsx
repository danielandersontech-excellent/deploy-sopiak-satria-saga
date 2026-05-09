/**
 * ============================================
 * Navigation - PT Sopiak Satria Saga v8
 * ============================================
 * FIXES:
 * - Splash screen uses PTSSS logo (same as Login)
 * - Dark mode fully integrated in navigation theme
 * - i18n tab labels reactive to language changes
 * - All tabs/screens respect theme + language
 */
import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Image, Animated } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Shadows } from '../constants';
import { CountBadge } from '../components';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import { useTheme } from '../lib/theme';
import { usePushNotificationManager } from '../services/pushNotificationManager';
import { useI18n } from '../lib/i18n';
import {
  registerForPushNotifications,
  savePushToken,
  addNotificationReceivedListener,
  addNotificationResponseListener,
} from '../services/pushNotifications';

// ===== ANGGOTA SCREENS =====
import LoginScreen from '../screens/anggota/LoginScreen';
import DashboardScreen from '../screens/anggota/DashboardScreen';
import AktivitasScreen from '../screens/anggota/AktivitasScreen';
import NotifikasiScreen from '../screens/anggota/NotifikasiScreen';
import ProfilScreen from '../screens/anggota/ProfilScreen';
import AbsensiScreen from '../screens/anggota/AbsensiScreen';
import PatroliScreen from '../screens/anggota/PatroliScreen';
import QRScannerScreen from '../screens/anggota/QRScannerScreen';
import LaporanHarianScreen from '../screens/anggota/LaporanHarianScreen';
import LaporanKejadianScreen from '../screens/anggota/LaporanKejadianScreen';
import PanicButtonScreen from '../screens/anggota/PanicButtonScreen';
import SerahTerimaScreen from '../screens/anggota/SerahTerimaScreen';

// ===== KOMANDAN SCREENS =====
import DashboardKomandanScreen from '../screens/komandan/DashboardKomandanScreen';
import ValidasiLaporanScreen from '../screens/komandan/ValidasiLaporanScreen';
import MonitorRealtimeScreen from '../screens/komandan/MonitorRealtimeScreen';
import BroadcastPesanScreen from '../screens/komandan/BroadcastPesanScreen';
import DetailAnggotaScreen from '../screens/komandan/DetailAnggotaScreen';

// ===== SUPERVISOR / ADMIN SCREENS =====
import DashboardSupervisorScreen from '../screens/supervisor/DashboardSupervisorScreen';
import ManajemenPenggunaScreen from '../screens/supervisor/ManajemenPenggunaScreen';
import TambahEditUserScreen from '../screens/supervisor/TambahEditUserScreen';
import SetupCheckpointScreen from '../screens/supervisor/SetupCheckpointScreen';
import SetupRuteScreen from '../screens/supervisor/SetupRuteScreen';
import QRGeneratorScreen from '../screens/supervisor/QRGeneratorScreen';
import AnalyticsScreen from '../screens/supervisor/AnalyticsScreen';
import ManajemenLokasiScreen from '../screens/supervisor/ManajemenLokasiScreen';
import JadwalShiftScreen from '../screens/supervisor/JadwalShiftScreen';
import PerusahaanListScreen from '../screens/supervisor/PerusahaanListScreen';
import DetailPerusahaanScreen from '../screens/supervisor/DetailPerusahaanScreen';

// ===== KLIEN SCREENS =====
import DashboardKlienScreen from '../screens/klien/DashboardKlienScreen';
import AktivitasKlienScreen from '../screens/klien/AktivitasKlienScreen';
import InsidenKlienScreen from '../screens/klien/InsidenKlienScreen';
import DownloadLaporanScreen from '../screens/klien/DownloadLaporanScreen';

// ===== SHARED SCREENS =====
import EditProfilScreen from '../screens/shared/EditProfilScreen';
import UbahPINScreen from '../screens/shared/UbahPINScreen';
import RiwayatAbsensiScreen from '../screens/shared/RiwayatAbsensiScreen';
import RiwayatLaporanScreen from '../screens/shared/RiwayatLaporanScreen';
import TentangAplikasiScreen from '../screens/shared/TentangAplikasiScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function TabIcon({ route, focused, color }: { route: any; focused: boolean; color: string }) {
  const { theme } = useTheme();
  const ICONS: Record<string, [string, string]> = {
    Home: ['home', 'home-outline'],
    Aktivitas: ['list', 'list-outline'],
    Notifications: ['notifications', 'notifications-outline'],
    Profil: ['person', 'person-outline'],
    Monitor: ['pulse', 'pulse-outline'],
    Validasi: ['checkmark-done', 'checkmark-done-outline'],
    Tim: ['people', 'people-outline'],
    Perusahaan: ['business', 'business-outline'],
    Dashboard: ['grid', 'grid-outline'],
    Kelola: ['settings', 'settings-outline'],
    Analytics: ['bar-chart', 'bar-chart-outline'],
    Insiden: ['alert-circle', 'alert-circle-outline'],
    Laporan: ['document-text', 'document-text-outline'],
    DownloadLaporan: ['download', 'download-outline'],
  };
  const pair = ICONS[route.name] || ['ellipse', 'ellipse-outline'];
  const iconName = focused ? pair[0] : pair[1];

  return (
    <View style={{ alignItems: 'center' }}>
      {focused && (
        <View style={{
          position: 'absolute', top: -6, width: 24, height: 3,
          borderRadius: 2, backgroundColor: theme.tabActive,
        }} />
      )}
      <Ionicons name={iconName as any} size={22} color={color} />
    </View>
  );
}

const BADGE_STYLE = { backgroundColor: Colors.danger, fontSize: 10, fontWeight: '700' as const, minWidth: 16, height: 16, lineHeight: 16 };

// ========== ANGGOTA TABS ==========
function AnggotaTabs() {
  const { theme, isDark } = useTheme();
  const { t } = useI18n();
  const unreadCount = useDataStore((s) => s.unreadCountForRole('anggota'));

  return (
    <Tab.Navigator screenOptions={({ route }) => ({
      headerShown: false,
      tabBarStyle: {
        backgroundColor: theme.tabBg,
        borderTopWidth: 1,
        borderTopColor: theme.border,
        height: 64,
        paddingBottom: 8,
        paddingTop: 6,
        ...(isDark ? {} : Shadows.sm),
      },
      tabBarActiveTintColor: theme.tabActive,
      tabBarInactiveTintColor: theme.tabInactive,
      tabBarLabelStyle: { fontSize: 11, fontWeight: '600' as const },
      tabBarIcon: ({ focused, color }) => <TabIcon route={route} focused={focused} color={color} />,
    })}>
      <Tab.Screen name="Home" component={DashboardScreen} options={{ tabBarLabel: t('nav.home') }} />
      <Tab.Screen name="Aktivitas" component={AktivitasScreen} options={{ tabBarLabel: t('nav.activity') }} />
      <Tab.Screen name="Notifications" component={NotifikasiScreen} options={{
        tabBarLabel: t('nav.notifications'),
        tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
        tabBarBadgeStyle: BADGE_STYLE,
      }} />
      <Tab.Screen name="Profil" component={ProfilScreen} options={{ tabBarLabel: t('nav.profile') }} />
    </Tab.Navigator>
  );
}

// ========== KOMANDAN TABS ==========
function KomandanTabs() {
  const { theme, isDark } = useTheme();
  const { t } = useI18n();
  const unreadCount = useDataStore((s) => s.unreadCountForRole('komandan'));
  const laporanHarian = useDataStore((s) => s.laporanHarian);
  const laporanKejadian = useDataStore((s) => s.laporanKejadian);
  const pendingCount = laporanHarian.filter((l) => l.status === 'pending').length +
                       laporanKejadian.filter((l) => l.status === 'pending').length;

  return (
    <Tab.Navigator screenOptions={({ route }) => ({
      headerShown: false,
      tabBarStyle: {
        backgroundColor: theme.tabBg,
        borderTopWidth: 1,
        borderTopColor: theme.border,
        height: 64,
        paddingBottom: 8,
        paddingTop: 6,
        ...(isDark ? {} : Shadows.sm),
      },
      tabBarActiveTintColor: theme.tabActive,
      tabBarInactiveTintColor: theme.tabInactive,
      tabBarLabelStyle: { fontSize: 11, fontWeight: '600' as const },
      tabBarIcon: ({ focused, color }) => <TabIcon route={route} focused={focused} color={color} />,
    })}>
      <Tab.Screen name="Home" component={DashboardKomandanScreen} options={{ tabBarLabel: t('nav.home') }} />
      <Tab.Screen name="Validasi" component={ValidasiLaporanScreen} options={{
        tabBarLabel: t('nav.validation'),
        tabBarBadge: pendingCount > 0 ? pendingCount : undefined,
        tabBarBadgeStyle: BADGE_STYLE,
      }} />
      <Tab.Screen name="Notifications" component={NotifikasiScreen} options={{
        tabBarLabel: t('nav.notifications'),
        tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
        tabBarBadgeStyle: BADGE_STYLE,
      }} />
      <Tab.Screen name="Profil" component={ProfilScreen} options={{ tabBarLabel: t('nav.profile') }} />
    </Tab.Navigator>
  );
}

// ========== SUPERVISOR / ADMIN TABS ==========
function SupervisorTabs() {
  const { theme, isDark } = useTheme();
  const { t } = useI18n();
  const unreadCount = useDataStore((s) => s.unreadCountForRole('supervisor'));

  return (
    <Tab.Navigator screenOptions={({ route }) => ({
      headerShown: false,
      tabBarStyle: {
        backgroundColor: theme.tabBg,
        borderTopWidth: 1,
        borderTopColor: theme.border,
        height: 64,
        paddingBottom: 8,
        paddingTop: 6,
        ...(isDark ? {} : Shadows.sm),
      },
      tabBarActiveTintColor: theme.tabActive,
      tabBarInactiveTintColor: theme.tabInactive,
      tabBarLabelStyle: { fontSize: 11, fontWeight: '600' as const },
      tabBarIcon: ({ focused, color }) => <TabIcon route={route} focused={focused} color={color} />,
    })}>
      <Tab.Screen name="Dashboard" component={DashboardSupervisorScreen} options={{ tabBarLabel: t('nav.home') }} />
      <Tab.Screen name="Tim" component={PerusahaanListScreen} options={{ tabBarLabel: t('dash.companies') }} />
      <Tab.Screen name="Notifications" component={NotifikasiScreen} options={{
        tabBarLabel: t('nav.notifications'),
        tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
        tabBarBadgeStyle: BADGE_STYLE,
      }} />
      <Tab.Screen name="Profil" component={ProfilScreen} options={{ tabBarLabel: t('nav.profile') }} />
    </Tab.Navigator>
  );
}

// ========== KLIEN TABS ==========
function KlienTabs() {
  const { theme, isDark } = useTheme();
  const { t } = useI18n();

  return (
    <Tab.Navigator screenOptions={({ route }) => ({
      headerShown: false,
      tabBarStyle: {
        backgroundColor: theme.tabBg,
        borderTopWidth: 1,
        borderTopColor: theme.border,
        height: 64,
        paddingBottom: 8,
        paddingTop: 6,
        ...(isDark ? {} : Shadows.sm),
      },
      tabBarActiveTintColor: theme.tabActive,
      tabBarInactiveTintColor: theme.tabInactive,
      tabBarLabelStyle: { fontSize: 11, fontWeight: '600' as const },
      tabBarIcon: ({ focused, color }) => <TabIcon route={route} focused={focused} color={color} />,
    })}>
      <Tab.Screen name="Dashboard" component={DashboardKlienScreen} options={{ tabBarLabel: t('nav.home') }} />
      <Tab.Screen name="Laporan" component={AktivitasKlienScreen} options={{ tabBarLabel: 'Aktivitas' }} />
      <Tab.Screen name="Insiden" component={InsidenKlienScreen} options={{ tabBarLabel: 'Insiden' }} />
      <Tab.Screen name="DownloadLaporan" component={DownloadLaporanScreen} options={{ tabBarLabel: 'Laporan' }} />
      <Tab.Screen name="Profil" component={ProfilScreen} options={{ tabBarLabel: t('nav.profile') }} />
    </Tab.Navigator>
  );
}

// ========== ROLE-BASED TAB SELECTOR ==========
function MainTabs() {
  const user = useAuthStore((s) => s.user);
  const role = user?.role || 'anggota';

  switch (role) {
    case 'komandan': return <KomandanTabs />;
    case 'supervisor':
    case 'admin': return <SupervisorTabs />;
    case 'klien': return <KlienTabs />;
    default: return <AnggotaTabs />;
  }
}

// ========== SPLASH SCREEN with PTSSS Logo ==========
function SplashScreen() {
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const scaleAnim = React.useRef(new Animated.Value(0.7)).current;
  const slideAnim = React.useRef(new Animated.Value(30)).current;
  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 6, tension: 40, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
    ]).start();
  }, []);
  return (
    <View style={splashStyles.container}>
      <View style={splashStyles.centerContent}>
        <Animated.View style={{ opacity: fadeAnim, transform: [{ scale: scaleAnim }], alignItems: 'center' }}>
          <View style={splashStyles.logoContainer}>
            <Image source={require('../../assets/logo-ptsss.png')} style={splashStyles.logo} resizeMode="contain" />
          </View>
        </Animated.View>
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }], alignItems: 'center' }}>
          <Text style={splashStyles.title}>PT Sopiak Satria Saga</Text>
          <View style={splashStyles.divider} />
          <Text style={splashStyles.subtitle}>Security Management System</Text>
        </Animated.View>
        <ActivityIndicator size="large" color="#ffffff" style={{ marginTop: 32 }} />
        <Text style={splashStyles.loadingText}>Menghubungkan ke server...</Text>
      </View>
      <Text style={splashStyles.version}>v13.0.0</Text>
    </View>
  );
}
const splashStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a5276', alignItems: 'center', justifyContent: 'center' },
  centerContent: { alignItems: 'center', paddingHorizontal: 40, flex: 1, justifyContent: 'center' },
  logoContainer: {
    width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20, overflow: 'hidden',
  },
  logo: { width: 130, height: 130 },
  title: { fontSize: 20, fontWeight: '800', color: '#ffffff', letterSpacing: 1.2, textAlign: 'center' },
  divider: { width: 60, height: 2, backgroundColor: 'rgba(255,255,255,0.3)', marginVertical: 10, borderRadius: 1 },
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.65)', textAlign: 'center', letterSpacing: 0.5 },
  loadingText: { fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 14 },
  version: { position: 'absolute', bottom: 40, fontSize: 11, color: 'rgba(255,255,255,0.3)' },
});

// ========== MAIN STACK NAVIGATOR ==========
export default function AppNavigator() {
  const [initializing, setInitializing] = useState(true);
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const restoreSession = useAuthStore((s) => s.restoreSession);
  const loadAllData = useDataStore((s) => s.loadAllData);
  const { theme, isDark } = useTheme();

  // Realtime subscriptions
  useRealtimeSync();

  // Push notification manager (auto-register, handle taps, badge sync)
  const navigationRef = React.useRef<any>(null);
  usePushNotificationManager(navigationRef.current);

  useEffect(() => {
    (async () => {
      try {
        await restoreSession();
        const loggedIn = useAuthStore.getState().isLoggedIn;
        if (loggedIn) {
          await loadAllData();
          try {
            const token = await registerForPushNotifications();
            const userId = useAuthStore.getState().user?.id;
            if (token && userId) {
              await savePushToken(userId, token);
            }
          } catch (pushErr) {
            console.log('Push registration skipped:', pushErr);
          }
          try {
            const { startLocationPing, registerBackgroundLocationTask } = require('../services/locationService');
            const { startAutoSync, processQueue, isOnline } = require('../services/offlineSync');
            startLocationPing(30 * 60 * 1000);
            startAutoSync();
            registerBackgroundLocationTask().catch(() => console.log('BG location: dev build required'));
            isOnline().then((online: boolean) => {
              if (online) processQueue().then((r: any) => r.synced > 0 && console.log(`Synced ${r.synced} offline actions`));
            });
          } catch (locErr) {
            console.log('Location services skipped:', locErr);
          }
        }
      } catch (e) {
        console.error('Session restore error:', e);
      }
      setInitializing(false);
    })();
  }, []);

  if (initializing) {
    return <SplashScreen />;
  }

  // Dynamic navigation theme based on dark mode
  const navTheme = isDark
    ? {
        ...DarkTheme,
        colors: {
          ...DarkTheme.colors,
          primary: theme.primary,
          background: theme.bg,
          card: theme.bgCard,
          text: theme.text,
          border: theme.border,
          notification: theme.danger,
        },
      }
    : {
        ...DefaultTheme,
        colors: {
          ...DefaultTheme.colors,
          primary: Colors.primary,
          background: Colors.bgLight,
          card: Colors.bgWhite,
          text: Colors.textPrimary,
          border: Colors.borderLight,
          notification: Colors.danger,
        },
      };

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        initialRouteName={isLoggedIn ? 'MainTabs' : 'Login'}
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: theme.bg },
        }}
      >
        <Stack.Screen name="Login" component={LoginScreen} options={{ animation: 'fade' }} />
        <Stack.Screen name="MainTabs" component={MainTabs} options={{ animation: 'fade' }} />

        {/* ANGGOTA STACK */}
        <Stack.Screen name="Absensi" component={AbsensiScreen} />
        <Stack.Screen name="Patroli" component={PatroliScreen} />
        <Stack.Screen name="QRScanner" component={QRScannerScreen} options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="LaporanHarian" component={LaporanHarianScreen} />
        <Stack.Screen name="LaporanKejadian" component={LaporanKejadianScreen} />
        <Stack.Screen name="PanicButton" component={PanicButtonScreen} options={{ animation: 'fade' }} />
        <Stack.Screen name="SerahTerima" component={SerahTerimaScreen} />
        <Stack.Screen name="Notifikasi" component={NotifikasiScreen} />
        <Stack.Screen name="ProfilDetail" component={ProfilScreen} />

        {/* KOMANDAN STACK */}
        <Stack.Screen name="ValidasiLaporan" component={ValidasiLaporanScreen} />
        <Stack.Screen name="MonitorRealtime" component={MonitorRealtimeScreen} />
        <Stack.Screen name="BroadcastPesan" component={BroadcastPesanScreen} />
        <Stack.Screen name="DetailAnggota" component={DetailAnggotaScreen} />

        {/* SUPERVISOR / ADMIN STACK */}
        <Stack.Screen name="ManajemenPengguna" component={ManajemenPenggunaScreen} />
        <Stack.Screen name="TambahEditUser" component={TambahEditUserScreen} />
        <Stack.Screen name="SetupCheckpoint" component={SetupCheckpointScreen} />
        <Stack.Screen name="SetupRute" component={SetupRuteScreen} />
        <Stack.Screen name="QRGenerator" component={QRGeneratorScreen} />
        <Stack.Screen name="Analytics" component={AnalyticsScreen} />
        <Stack.Screen name="ManajemenLokasi" component={ManajemenLokasiScreen} />
        <Stack.Screen name="JadwalShift" component={JadwalShiftScreen} />
        <Stack.Screen name="PerusahaanList" component={PerusahaanListScreen} />
        <Stack.Screen name="DetailPerusahaan" component={DetailPerusahaanScreen} />

        {/* KLIEN STACK */}
        <Stack.Screen name="DownloadLaporan" component={DownloadLaporanScreen} />

        {/* SHARED */}
        <Stack.Screen name="EditProfil" component={EditProfilScreen} />
        <Stack.Screen name="UbahPIN" component={UbahPINScreen} />
        <Stack.Screen name="RiwayatAbsensi" component={RiwayatAbsensiScreen} />
        <Stack.Screen name="RiwayatLaporan" component={RiwayatLaporanScreen} />
        <Stack.Screen name="TentangAplikasi" component={TentangAplikasiScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
