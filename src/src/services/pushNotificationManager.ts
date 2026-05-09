/**
 * ============================================================
 * PUSH NOTIFICATION MANAGER v3 - Fully Connected (FIXED)
 * ============================================================
 * UPGRADE (v3 - May 2026):
 *  ✅ FIX: Accepts EITHER a navigation object OR a React ref to a
 *     NavigationContainerRef. AppNavigator now passes the ref itself
 *     so navigation works after the container mounts (the old code
 *     passed `navigationRef.current` which was always null).
 *  ✅ Helper `resolveNav()` unwraps refs at call time.
 *
 * EXISTING FEATURES:
 *  ✅ Auto-register FCM token setelah login
 *  ✅ Handle foreground notification (in-app banner)
 *  ✅ Handle background tap → navigate to correct screen
 *  ✅ Badge count sync dengan unread notifikasi
 *  ✅ Retry pending token save on app resume
 *  ✅ Unregister on logout
 *  ✅ Schedule local reminders (absensi, patroli)
 *  ✅ Notification received → refresh data store
 *
 * USAGE di AppNavigator:
 *   const navigationRef = useRef<NavigationContainerRef<any> | null>(null);
 *   usePushNotificationManager(navigationRef);   // pass the REF, not .current
 *   <NavigationContainer ref={navigationRef} ...>
 */
import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  registerForPushNotifications,
  addNotificationReceivedListener,
  addNotificationResponseListener,
  sendLocalNotification,
  setupNotificationChannels,
  getNotificationNavigationTarget,
  retryPendingTokenSave,
} from './pushNotifications';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';

// Helper: unwrap a navigation prop that may be a ref { current } or a nav object directly.
function resolveNav(navOrRef: any): any | null {
  if (!navOrRef) return null;
  // React ref pattern: { current: ... }
  if (typeof navOrRef === 'object' && 'current' in navOrRef) {
    return navOrRef.current ?? null;
  }
  return navOrRef;
}

// ===== MAIN HOOK =====
export function usePushNotificationManager(navOrRef: any) {
  const user = useAuthStore((s) => s.user);
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const refreshData = useDataStore((s) => s.loadAllData);
  const notifikasi = useDataStore((s) => s.notifikasi);
  const notifRef = useRef<Notifications.Subscription | null>(null);
  const responseRef = useRef<Notifications.Subscription | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Keep latest reference around so listener closures always see current value
  const navOrRefStable = useRef<any>(navOrRef);
  useEffect(() => {
    navOrRefStable.current = navOrRef;
  }, [navOrRef]);

  // --- Register FCM on login ---
  useEffect(() => {
    if (!isLoggedIn || !user?.id) return;

    let mounted = true;

    const register = async () => {
      try {
        await setupNotificationChannels();
        const token = await registerForPushNotifications(user.id);
        if (token && mounted) {
          console.log('[PushManager] ✅ Registered FCM token for', user.nama);
        }
      } catch (err) {
        console.log('[PushManager] Registration failed:', err);
      }
    };

    register();

    return () => { mounted = false; };
  }, [isLoggedIn, user?.id]);

  // --- Handle foreground notification ---
  useEffect(() => {
    if (!isLoggedIn) return;

    notifRef.current = addNotificationReceivedListener((notification) => {
      const { title, body, data } = notification.request.content;
      console.log('[PushManager] 📬 Received foreground:', title);

      // Refresh data store to get latest
      refreshData?.();

      // For panic alerts, show an immediate in-app alert
      if (data?.type === 'panic') {
        sendLocalNotification(
          '🚨 PANIC ALERT',
          body || 'Anggota membutuhkan bantuan darurat!',
          'panic',
          data as Record<string, any>
        );
      }
    });

    return () => {
      if (notifRef.current) {
        notifRef.current.remove();
        notifRef.current = null;
      }
    };
  }, [isLoggedIn, refreshData]);

  // --- Handle notification tap (background / killed) ---
  useEffect(() => {
    if (!isLoggedIn) return;

    responseRef.current = addNotificationResponseListener((response) => {
      const data = response.notification.request.content.data || {};
      console.log('[PushManager] 👆 Notification tapped:', data);

      const target = getNotificationNavigationTarget(data as Record<string, any>);
      const nav = resolveNav(navOrRefStable.current);
      if (target && nav && typeof nav.navigate === 'function') {
        try {
          nav.navigate(target.screen, target.params);
        } catch (navErr) {
          console.log('[PushManager] Navigation failed:', navErr);
        }
      } else if (target && !nav) {
        console.log('[PushManager] No navigation ready yet, target deferred:', target.screen);
      }
    });

    return () => {
      if (responseRef.current) {
        responseRef.current.remove();
        responseRef.current = null;
      }
    };
  }, [isLoggedIn]);

  // --- Badge count sync ---
  useEffect(() => {
    if (!isLoggedIn) return;

    const unread = notifikasi?.filter((n: any) => !n.dibaca)?.length || 0;
    Notifications.setBadgeCountAsync(unread).catch(() => {});
  }, [isLoggedIn, notifikasi]);

  // --- Retry pending token on app resume ---
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        // App came to foreground
        if (isLoggedIn) {
          retryPendingTokenSave().catch(() => {});
          refreshData?.();
        }
      }
      appStateRef.current = nextState;
    });

    return () => subscription.remove();
  }, [isLoggedIn, refreshData]);
}

// ===== HELPER: Schedule absensi reminder =====
export async function scheduleAbsensiReminder(
  shiftStart: string,  // e.g. "08:00"
  minutesBefore: number = 15,
  lang: string = 'id',
): Promise<string | null> {
  try {
    const [hours, minutes] = shiftStart.split(':').map(Number);
    let reminderMin = minutes - minutesBefore;
    let reminderHour = hours;
    if (reminderMin < 0) {
      reminderMin += 60;
      reminderHour -= 1;
    }
    if (reminderHour < 0) reminderHour += 24;

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: lang === 'en' ? '⏰ Attendance Reminder' : '⏰ Pengingat Absensi',
        body: lang === 'en'
          ? `Your shift starts at ${shiftStart}. Don't forget to clock in!`
          : `Shift Anda dimulai pukul ${shiftStart}. Jangan lupa absen masuk!`,
        sound: 'default',
        ...(Platform.OS === 'android' ? { channelId: 'absensi' } : {}),
        data: { type: 'absensi' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: reminderHour,
        minute: reminderMin,
      },
    });
    console.log(`[PushManager] ⏰ Absensi reminder scheduled at ${reminderHour}:${String(reminderMin).padStart(2, '0')}`);
    return id;
  } catch (err) {
    console.log('[PushManager] Failed to schedule reminder:', err);
    return null;
  }
}

// ===== HELPER: Send patrol checkpoint reminder =====
export async function sendPatrolReminder(
  routeName: string,
  checkpointName: string,
  lang: string = 'id',
): Promise<void> {
  await sendLocalNotification(
    lang === 'en' ? '🚶 Patrol Checkpoint' : '🚶 Checkpoint Patroli',
    lang === 'en'
      ? `Scan checkpoint "${checkpointName}" on route ${routeName}`
      : `Scan checkpoint "${checkpointName}" di rute ${routeName}`,
    'patrol',
    { type: 'patrol' }
  );
}

// ===== HELPER: Clear all notifications on logout =====
export async function clearAllNotificationsOnLogout(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    await Notifications.setBadgeCountAsync(0);
    await Notifications.dismissAllNotificationsAsync();
    console.log('[PushManager] 🧹 All notifications cleared');
  } catch (err) {
    console.log('[PushManager] Clear failed:', err);
  }
}
