/**
 * ============================================================
 * SESSION CLEANUP — full logout teardown
 * ============================================================
 * AUDIT-B1A (BUG-01): Before this existed, logout only called
 * authStore.logout() (token + auth-state reset). Everything else survived:
 *   - dataStore kept the previous user's team/absensi/laporan/notifikasi in
 *     memory → a different user logging in on the same device briefly saw the
 *     old user's data (cross-user / cross-tenant bleed).
 *   - The SQLite offline cache kept the previous user's rows on disk → the
 *     offline fallback could load them for the next user.
 *   - The offline action queue kept the previous user's unsynced creates →
 *     they would later sync under the NEW user's token (mis-attribution).
 *   - Background auto-sync + location ping intervals kept running.
 *   - Local/scheduled notifications + app badge were not cleared.
 *   - The device push token stayed attached to the logged-out user on the
 *     backend → pushes for user A could land on user B's hands.
 *
 * performLogout() runs the whole teardown in a safe order. Every step is
 * best-effort and isolated so one failure can't block the rest of logout.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { stopAutoSync, clearQueue } from './offlineSync';
import { clearAllCache } from './offlineDatabase';
import { clearAllNotificationsOnLogout } from './pushNotificationManager';
import { stopLocationPing } from './locationService';
import { usersApi } from '../lib/apiClient';

export async function performLogout(): Promise<void> {
  // Capture identity BEFORE auth state is cleared so we can detach the push
  // token while the access token is still valid.
  const userId = useAuthStore.getState().user?.id;

  // 1) Detach this device's push token from the (still-authenticated) user so
  //    it stops receiving that user's notifications once someone else logs in.
  //    Best-effort: the backend may ignore an empty token — that is fine here.
  if (userId) {
    try { await usersApi.updatePushToken(userId, ''); } catch { /* ignore */ }
  }

  // 2) Cancel local/scheduled notifications and reset the OS badge.
  try { await clearAllNotificationsOnLogout(); } catch { /* ignore */ }

  // 3) Stop background loops tied to the (now ending) session.
  try { stopAutoSync(); } catch { /* ignore */ }
  try { stopLocationPing(); } catch { /* ignore */ }

  // 4) Auth teardown: server logout (best-effort) + clear tokens + auth state.
  try { await useAuthStore.getState().logout(); } catch { /* ignore */ }

  // 5) Wipe in-memory app data so nothing leaks into the next session.
  try { useDataStore.getState().reset(); } catch { /* ignore */ }

  // 6) Wipe the on-disk SQLite cache (cached data tables).
  try { await clearAllCache(); } catch { /* ignore */ }

  // 7) Drop any unsynced offline actions. We deliberately discard them rather
  //    than risk replaying the previous user's creates under the next user's
  //    token (data mis-attribution is worse than losing an abandoned action).
  try { await clearQueue(); } catch { /* ignore */ }

  // 8) Clear locally cached FCM token + any pending save so the next login
  //    re-registers a fresh token instead of reusing a stale one.
  try {
    await AsyncStorage.multiRemove(['@ptsss_fcm_token', '@ptsss_pending_fcm_save']);
  } catch { /* ignore */ }
}
