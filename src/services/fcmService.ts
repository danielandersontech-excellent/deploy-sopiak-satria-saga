/**
 * ============================================================
 * FCM PUSH NOTIFICATION SERVICE - for Expo React Native
 * ============================================================
 *
 * CARA KERJA TOKEN:
 *
 *   Di Expo Go:
 *     - getDevicePushTokenAsync() â†’ FCM token milik PROJECT Expo Go
 *     - Token ini TIDAK BISA dipakai oleh Firebase Admin SDK project kamu
 *     - Error: "SenderId mismatch"
 *     - SOLUSI: Harus pakai Expo Push Token â†’ kirim via Expo Push API
 *
 *   Di Development Build / Production:
 *     - getDevicePushTokenAsync() â†’ FCM token milik PROJECT kamu
 *     - getExpoPushTokenAsync() juga tetap bekerja
 *
 * STRATEGI:
 *   1. SELALU coba getExpoPushTokenAsync() dulu - works everywhere
 *   2. Jika gagal, fallback ke getDevicePushTokenAsync()
 *   3. Backend detect token type â†’ Expo token via Expo API, FCM via Firebase Admin
 *   4. Jika Firebase Admin kena "SenderId mismatch", auto-fallback ke Expo Push API
 */
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usersApi } from '../lib/apiClient';

const FCM_TOKEN_KEY = '@ptsss_fcm_token';

// ===== NOTIFICATION HANDLER (foreground) =====
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
    priority: Notifications.AndroidNotificationPriority.MAX,
  }),
});

// ===== NOTIFICATION CHANNELS (Android) =====
export async function setupNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync('default', {
    name: 'Notifikasi Umum',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#2980b9',
    sound: 'default',
    enableVibrate: true,
    enableLights: true,
  });

  await Notifications.setNotificationChannelAsync('panic', {
    name: 'Panic Alert',
    description: 'Notifikasi darurat dengan suara dan getar kuat',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 200, 500, 200, 500],
    lightColor: '#e74c3c',
    sound: 'default',
    enableVibrate: true,
    enableLights: true,
    bypassDnd: true,
  });

  await Notifications.setNotificationChannelAsync('absensi', {
    name: 'Absensi',
    description: 'Pengingat dan konfirmasi absensi',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    enableVibrate: true,
  });

  await Notifications.setNotificationChannelAsync('patrol', {
    name: 'Patroli',
    description: 'Update dan reminder patroli',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
  });

  await Notifications.setNotificationChannelAsync('laporan', {
    name: 'Laporan',
    description: 'Status laporan harian dan kejadian',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
  });

  console.log('[FCM] âœ… Notification channels created');
}

// ===== REGISTER FOR PUSH NOTIFICATIONS =====
export async function registerForPushNotifications(userId?: string): Promise<string | null> {
  try {
    if (!Device.isDevice) {
      console.log('[FCM] Not a physical device - push disabled');
      return null;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true, allowCriticalAlerts: true },
      });
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[FCM] Permission denied');
      return null;
    }

    await setupNotificationChannels();

    // ===== TOKEN STRATEGY =====
    // PRIORITY 1: Expo Push Token (works in Expo Go + dev builds + production)
    // PRIORITY 2: Native FCM token (only works in dev/prod builds with your own Firebase)
    let token: string | null = null;

    // --- Try Expo Push Token FIRST ---
    try {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      const expoToken = await Notifications.getExpoPushTokenAsync({
        projectId: projectId || undefined,
      });
      token = expoToken.data;
      console.log('[FCM] âœ… Expo Push Token:', token?.substring(0, 30) + '...');
    } catch (expoError: any) {
      console.log('[FCM] Expo Push Token not available:', expoError?.message?.substring(0, 80));

      // --- Fallback: Native FCM token ---
      try {
        const pushToken = await Notifications.getDevicePushTokenAsync();
        token = pushToken.data;
        console.log('[FCM] Device push token (FCM):', token?.substring(0, 30) + '...');
      } catch (fcmError: any) {
        console.log('[FCM] FCM token also failed:', fcmError?.message?.substring(0, 80));
        return null;
      }
    }

    if (!token) return null;

    await AsyncStorage.setItem(FCM_TOKEN_KEY, token);

    if (userId) {
      await saveFcmToken(userId, token);
    }

    return token;
  } catch (err) {
    console.error('[FCM] Registration error:', err);
    return null;
  }
}

// ===== SAVE FCM TOKEN TO BACKEND =====
export async function saveFcmToken(userId: string, token: string): Promise<void> {
  try {
    await usersApi.updatePushToken(userId, token);
    console.log('[FCM] âœ… Token saved to backend');
  } catch (err) {
    console.log('[FCM] Token save failed (will retry):', err);
    await AsyncStorage.setItem('@ptsss_pending_fcm_save', JSON.stringify({ userId, token }));
  }
}

export async function retryPendingTokenSave(): Promise<void> {
  try {
    const pending = await AsyncStorage.getItem('@ptsss_pending_fcm_save');
    if (!pending) return;
    const { userId, token } = JSON.parse(pending);
    await usersApi.updatePushToken(userId, token);
    await AsyncStorage.removeItem('@ptsss_pending_fcm_save');
    console.log('[FCM] âœ… Pending token save completed');
  } catch { /* Will retry next time */ }
}

export async function getSavedFcmToken(): Promise<string | null> {
  return AsyncStorage.getItem(FCM_TOKEN_KEY);
}

// ===== NOTIFICATION LISTENERS =====
export function addNotificationReceivedListener(
  callback: (notification: Notifications.Notification) => void
) { return Notifications.addNotificationReceivedListener(callback); }

export function addNotificationResponseListener(
  callback: (response: Notifications.NotificationResponse) => void
) { return Notifications.addNotificationResponseReceivedListener(callback); }

// ===== SEND LOCAL NOTIFICATION =====
export async function sendLocalNotification(
  title: string, body: string, channelId: string = 'default', data?: Record<string, any>
): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, sound: 'default', data: data || {},
      ...(Platform.OS === 'android' ? { channelId } : {}),
    },
    trigger: null,
  });
}

export async function scheduleNotification(
  title: string, body: string, triggerSeconds: number, channelId: string = 'default'
): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content: { title, body, sound: 'default',
      ...(Platform.OS === 'android' ? { channelId } : {}),
    },
    trigger: { type: 'timeInterval' as any, seconds: triggerSeconds, repeats: false },
  });
}

export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function setBadgeCount(count: number): Promise<void> {
  await Notifications.setBadgeCountAsync(count);
}

export function getNotificationNavigationTarget(
  data: Record<string, any>
): { screen: string; params?: any } | null {
  if (!data?.type) return null;
  switch (data.type) {
    case 'panic': return { screen: 'MonitorRealtime', params: { tab: 'panic' } };
    case 'absensi': return { screen: 'Absensi' };
    case 'laporan': return { screen: 'ValidasiLaporan', params: { id: data.id } };
    case 'patrol': return { screen: 'Patroli' };
    case 'broadcast': return { screen: 'Notifikasi' };
    default: return { screen: 'Notifikasi' };
  }
}
