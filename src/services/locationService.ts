/**
 * LOCATION SERVICE - Express.js Backend version
 * GPS tracking, geofence, background location, offline queue
 */
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usersApi, api } from '../lib/apiClient';
import { useAuthStore } from '../stores/authStore';

const OFFLINE_QUEUE_KEY = '@ptsss_offline_queue';
const LOCATION_PING_INTERVAL = 5 * 60 * 1000; // 5 minutes (geofence needs frequent checking)
let pingInterval: ReturnType<typeof setInterval> | null = null;

// ===== BACKGROUND LOCATION TASK DEFINITION =====
// AUDIT-B1A (BUG-08): TaskManager.defineTask MUST run at module scope. When the
// OS relaunches the app in the background (headless) to deliver a location
// update, it only runs top-level module code — it does NOT call
// registerBackgroundLocationTask(). The task was previously defined INSIDE that
// async function, so after the app was killed the handler was never registered
// and background pings were silently dropped. Defining it here guarantees the
// handler exists as soon as this module is imported at startup.
export const BG_LOCATION_TASK = 'ptsss-bg-location';
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const TaskManager = require('expo-task-manager');
  TaskManager.defineTask(BG_LOCATION_TASK, async ({ data, error }: any) => {
    if (error || !data) return;
    const { locations } = data;
    if (locations?.length > 0) {
      const { latitude, longitude } = locations[0].coords;
      try {
        const user = useAuthStore.getState().user;
        if (user) await usersApi.updateLocation(user.id, latitude, longitude);
      } catch {}
    }
  });
} catch {
  // expo-task-manager not available (e.g. Expo Go) — registration is skipped.
}

// ===== LOCATION HELPERS =====

export async function getCurrentLocation() {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      console.log('[Location] Permission denied');
      return null;
    }

    // Try high accuracy first with retry
    const MAX_RETRIES = 2;
    let position: Location.LocationObject | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES && !position; attempt++) {
      try {
        position = await Location.getCurrentPositionAsync({ 
          accuracy: Location.Accuracy.High,
          timeInterval: 10000 + attempt * 5000,
          mayShowUserSettingsDialog: true,
        });
        console.log(`[Location] High accuracy OK (attempt ${attempt + 1}, accuracy: ${position.coords.accuracy?.toFixed(1)}m)`);
      } catch (e) {
        console.log(`[Location] High accuracy failed (attempt ${attempt + 1}):`, (e as any)?.message);
        try {
          position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          console.log(`[Location] Balanced accuracy OK (accuracy: ${position.coords.accuracy?.toFixed(1)}m)`);
        } catch (e2) {
          console.log('[Location] Balanced failed, trying last known:', (e2 as any)?.message);
          try {
            const lastKnown = await Location.getLastKnownPositionAsync();
            // Reject stale positions (older than 5 minutes)
            if (lastKnown && (Date.now() - lastKnown.timestamp) < 5 * 60 * 1000) {
              position = lastKnown;
              console.log('[Location] Using last known (fresh)');
            } else {
              console.log('[Location] Last known too stale or null, retrying...');
            }
          } catch (e3) {
            console.log('[Location] Last known also failed:', (e3 as any)?.message);
          }
        }
      }
    }

    if (!position) {
      console.log('[Location] Could not get position after retries');
      return null;
    }

    // Reverse geocode to get address
    let address = `${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`;
    try {
      const geocode = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      if (geocode && geocode.length > 0) {
        const g = geocode[0];
        const parts = [g.street, g.subregion || g.district, g.city, g.region].filter(Boolean);
        if (parts.length > 0) {
          address = parts.join(', ');
        }
      }
    } catch (e) {
      console.log('[Location] Reverse geocode failed (using coords):', (e as any)?.message);
    }

    return {
      coords: position.coords,
      address,
      timestamp: position.timestamp,
    };
  } catch (e: any) {
    console.log('[Location] getCurrentLocation error:', e?.message);
    return null;
  }
}

export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)}m` : `${(meters / 1000).toFixed(1)}km`;
}

export interface GeofenceResult { isInside: boolean; distance: number; posName: string; posId: string; radius: number; }

// Max GPS-uncertainty (meters) we add on top of a pos radius. GPS at a guard
// post legitimately reads tens of meters off (buildings/walls), so a guard
// standing ON the spot was being flagged "outside". We expand the effective
// radius by the reported accuracy, but cap it so a garbage/huge accuracy fix
// can't make the geofence meaningless.
export const GPS_ACCURACY_TOLERANCE_CAP_M = 75;

export function checkGeofence(
  lat: number,
  lng: number,
  posJagaList: any[],
  accuracyMeters?: number | null,
): GeofenceResult | null {
  if (!posJagaList || posJagaList.length === 0) {
    console.log('[Geofence] No pos jaga data available');
    return null; // FIX: return null instead of fake result when no data
  }

  // FIX (bug absensi): use GPS accuracy as tolerance so being physically at the
  // post is not reported as "outside" due to normal GPS error. Capped + clamped.
  const tolerance = Math.min(Math.max(accuracyMeters ?? 0, 0), GPS_ACCURACY_TOLERANCE_CAP_M);

  let closest: GeofenceResult = { isInside: false, distance: Infinity, posName: '-', posId: '', radius: 100 };
  let hasValidPos = false;

  for (const pos of posJagaList) {
    // FIX: was !pos.latitude || !pos.longitude which fails when value is 0 (falsy)
    // Now uses proper null/undefined check
    if (pos.latitude == null || pos.longitude == null) continue;
    if (pos.status === 'inactive') continue; // Skip inactive pos

    hasValidPos = true;
    const dist = calculateDistance(lat, lng, pos.latitude, pos.longitude);
    const radius = pos.radius || 100;
    if (dist < closest.distance) {
      closest = { 
        isInside: dist <= radius + tolerance, 
        distance: dist, 
        posName: pos.nama || '-', 
        posId: pos.id || '',
        radius: radius,
      };
    }
  }

  if (!hasValidPos) {
    console.log('[Geofence] No pos jaga with valid coordinates');
    return null;
  }

  console.log(`[Geofence] Closest: ${closest.posName} (${Math.round(closest.distance)}m, radius ${closest.radius}m, tol ±${Math.round(tolerance)}m, inside=${closest.isInside})`);
  return closest;
}

// ===== LOCATION PING (every 30 min) =====

export function startLocationPing(intervalMs?: number) {
  if (pingInterval) clearInterval(pingInterval);
  const interval = intervalMs || LOCATION_PING_INTERVAL;
  sendLocationPing(); // immediate first ping
  pingInterval = setInterval(sendLocationPing, interval);
  console.log(`[Location] Ping started (every ${Math.round(interval / 60000)} min)`);
}

export function stopLocationPing() {
  if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
  console.log('[Location] Ping stopped');
}

async function sendLocationPing() {
  try {
    const user = useAuthStore.getState().user;
    if (!user) return;
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    // Update location AND check geofence in one call
    try {
      const { geofenceApi } = await import('../lib/apiClient');
      const result = await geofenceApi.check(loc.coords.latitude, loc.coords.longitude, loc.coords.accuracy ?? undefined);
      if (result && !result.dalam_radius && !result.izin_aktif) {
        console.log(`[Location] ⚠️ OUTSIDE GEOFENCE! Jarak: ${result.jarak}m (radius: ${result.radius}m)`);
      }
    } catch {
      // Fallback: just update location
      await usersApi.updateLocation(user.id, loc.coords.latitude, loc.coords.longitude);
    }
    console.log(`[Location] Ping: ${loc.coords.latitude.toFixed(5)}, ${loc.coords.longitude.toFixed(5)}`);
  } catch (e) {
    console.log('[Location] Ping failed:', e);
  }
}

// ===== BACKGROUND LOCATION TASK =====

export async function registerBackgroundLocationTask() {
  try {
    // The task handler itself is defined at module scope (see BG_LOCATION_TASK
    // above) so it survives headless relaunches. Here we only request the
    // background permission and start the updates.
    const { status } = await Location.requestBackgroundPermissionsAsync();
    if (status === 'granted') {
      await Location.startLocationUpdatesAsync(BG_LOCATION_TASK, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: LOCATION_PING_INTERVAL,
        distanceInterval: 100,
        showsBackgroundLocationIndicator: true,
        foregroundService: { notificationTitle: 'PT Sopiak Satria Saga', notificationBody: 'Monitoring lokasi aktif', notificationColor: '#2980b9' },
      });
      console.log('[Location] Background task registered');
    }
  } catch (e) {
    console.log('[Location] Background task not available (Expo Go):', (e as any)?.message);
  }
}

// ===== OFFLINE QUEUE =====

export async function addToOfflineQueue(action: { type: string; data: any }) {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    const queue: any[] = raw ? JSON.parse(raw) : [];
    queue.push({ ...action, timestamp: Date.now() });
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    console.log(`[Offline] Queued: ${action.type}`);
  } catch {}
}

export async function processOfflineQueue() {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return;
    const queue: any[] = JSON.parse(raw);
    if (queue.length === 0) return;
    console.log(`[Offline] Processing ${queue.length} queued actions...`);
    const failed: any[] = [];
    for (const item of queue) {
      try {
        switch (item.type) {
          case 'absensi': await api('/api/absensi', { method: 'POST', body: item.data }); break;
          case 'patrol_scan': await api(`/api/patroli/${item.data.patroli_id}/scan`, { method: 'POST', body: item.data }); break;
          case 'laporan_harian': await api('/api/laporan/harian', { method: 'POST', body: item.data }); break;
          case 'laporan_kejadian': await api('/api/laporan/kejadian', { method: 'POST', body: item.data }); break;
          case 'location_ping': await usersApi.updateLocation(item.data.user_id, item.data.latitude, item.data.longitude); break;
          default: console.log(`[Offline] Unknown type: ${item.type}`);
        }
      } catch { failed.push(item); }
    }
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(failed));
    console.log(`[Offline] Done. Success: ${queue.length - failed.length}, Failed: ${failed.length}`);
  } catch {}
}

export async function isOnline(): Promise<boolean> {
  try {
    const Network = require('expo-network');
    const state = await Network.getNetworkStateAsync();
    return state.isConnected && state.isInternetReachable;
  } catch { return true; }
}