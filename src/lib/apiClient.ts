/**
 * API CLIENT - Express.js Backend via Metro Proxy
 * 
 * CARA KERJA:
 * Dalam mode development, API request dikirim ke Metro bundler (port 8081)
 * yang kemudian di-proxy ke backend (port 3000) secara internal.
 * 
 * Ini menyelesaikan masalah firewall karena HP sudah bisa konek ke port 8081.
 * 
 * FLOW: HP → Metro:8081/api/* → proxy → localhost:3000/api/* → Backend
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// ===== GET API BASE URL =====
// In dev: use the SAME URL as Metro (port 8081) - proxy handles forwarding
// In prod: use the real backend URL
function getDevUrl(): string {
  // Get Metro URL from Expo (the URL that phone is ALREADY connected to)
  const hostUri = Constants.expoConfig?.hostUri;  // e.g. "192.168.1.15:8081"
  if (hostUri) {
    // Use the EXACT same host:port as Metro - API requests are proxied through it
    console.log('[API] Using Metro proxy via:', hostUri);
    return `http://${hostUri}`;
  }

  const debuggerHost = (Constants as any).manifest?.debuggerHost
    || (Constants as any).manifest2?.extra?.expoGo?.debuggerHost;
  if (debuggerHost) {
    console.log('[API] Using Metro proxy via debuggerHost:', debuggerHost);
    return `http://${debuggerHost}`;
  }

  if (Platform.OS === 'android') return 'http://10.0.2.2:8081';
  return 'http://localhost:8081';
}

const _devUrl = getDevUrl();

// In production, the API URL comes from app.json → expo.extra.apiUrl.
// This way, changing the backend domain only requires editing app.json
// and rebuilding the APK — no code edits in the source tree.
// Fallback to the canonical production domain if the field is missing.
const _prodUrl: string =
  (Constants.expoConfig?.extra as any)?.apiUrl ||
  (Constants as any).manifest?.extra?.apiUrl ||
  'https://api.sopiaksatriasaga.com';

export const API_URL = __DEV__ ? _devUrl : _prodUrl;

console.log('[API] Base URL:', API_URL);

// ===== TOKEN STORAGE =====
const TOKEN_KEY = '@ptsss_token';
const REFRESH_KEY = '@ptsss_refresh';
const USER_KEY = '@ptsss_user';
let _token: string | null = null;
let _refreshToken: string | null = null;

export async function getToken(): Promise<string | null> {
  if (_token) return _token;
  _token = await AsyncStorage.getItem(TOKEN_KEY);
  return _token;
}
export async function setToken(token: string) { _token = token; await AsyncStorage.setItem(TOKEN_KEY, token); }
export async function getRefreshToken(): Promise<string | null> {
  if (_refreshToken) return _refreshToken;
  _refreshToken = await AsyncStorage.getItem(REFRESH_KEY);
  return _refreshToken;
}
export async function setRefreshToken(token: string) { _refreshToken = token; await AsyncStorage.setItem(REFRESH_KEY, token); }
export async function clearToken() { _token = null; _refreshToken = null; await AsyncStorage.multiRemove([TOKEN_KEY, REFRESH_KEY, USER_KEY]); }
export async function saveUser(user: any) { await AsyncStorage.setItem(USER_KEY, JSON.stringify(user)); }
export async function getSavedUser(): Promise<any | null> { const r = await AsyncStorage.getItem(USER_KEY); return r ? JSON.parse(r) : null; }

// ===== For LoginScreen settings compatibility =====
export async function getCustomUrl(): Promise<string | null> { return null; }
export async function setCustomUrl(_url: string | null) { /* no-op in proxy mode */ }
export function getApiUrl(): string { return API_URL; }
export function getAutoDetectedUrl(): string { return _devUrl; }

export async function testConnection(url: string): Promise<{ ok: boolean; ms: number; error?: string }> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${url}/ping`, { signal: controller.signal });
    clearTimeout(timer);
    const text = await res.text();
    const ms = Date.now() - start;
    if (text.trim() === 'pong') return { ok: true, ms };
    // Backend might return JSON error
    try {
      const json = JSON.parse(text);
      if (json.error) return { ok: false, ms, error: json.error };
    } catch {}
    return { ok: false, ms, error: `Unexpected response: ${text.substring(0, 100)}` };
  } catch (err: any) {
    return { ok: false, ms: Date.now() - start, error: err.message };
  }
}

// ===== AUTO REFRESH TOKEN =====
let _isRefreshing = false;
let _refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  const rt = await getRefreshToken();
  if (!rt) return false;
  try {
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: rt }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    await setToken(data.token);
    if (data.refresh_token) await setRefreshToken(data.refresh_token);
    if (data.user) await saveUser(data.user);
    console.log('[API] Token refreshed successfully');
    return true;
  } catch { return false; }
}

// ===== CORE FETCH (with auto-refresh) =====
interface ApiOpts { method?: 'GET'|'POST'|'PUT'|'DELETE'; body?: any; noAuth?: boolean; timeout?: number; }

export async function api<T = any>(endpoint: string, opts: ApiOpts = {}): Promise<T> {
  const { method = 'GET', body, noAuth = false, timeout = 15000 } = opts;
  const url = `${API_URL}${endpoint}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!noAuth) { const t = await getToken(); if (t) headers['Authorization'] = `Bearer ${t}`; }
  const config: RequestInit = { method, headers };
  if (body && method !== 'GET') config.body = JSON.stringify(body);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  config.signal = controller.signal;

  try {
    console.log(`[API] ${method} ${url}`);
    let res = await fetch(url, config);
    clearTimeout(timer);
    
    // Auto-refresh if token expired
    if (res.status === 401 && !noAuth) {
      // Clone response before reading body so we can still use it later if needed
      const resClone = res.clone();
      const errData = await resClone.json().catch(() => ({}));
      if (errData.code === 'TOKEN_EXPIRED') {
        if (!_isRefreshing) { _isRefreshing = true; _refreshPromise = tryRefreshToken(); }
        const refreshed = await _refreshPromise;
        _isRefreshing = false; _refreshPromise = null;
        if (refreshed) {
          // Retry with new token
          const newToken = await getToken();
          const retryHeaders = { ...headers, 'Authorization': `Bearer ${newToken}` };
          const retryController = new AbortController();
          const retryTimer = setTimeout(() => retryController.abort(), timeout);
          res = await fetch(url, { ...config, headers: retryHeaders, signal: retryController.signal });
          clearTimeout(retryTimer);
        } else {
          await clearToken();
          throw new Error('Session expired. Silakan login ulang.');
        }
      } else {
        // 401 but NOT token expired - throw the error directly (don't fall through)
        throw new Error(errData.error || 'Unauthorized');
      }
    }
    
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await res.text();
      console.log(`[API] Non-JSON response (${res.status}):`, text.substring(0, 200));
      throw new Error(`Server error: ${text.substring(0, 100)}`);
    }
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data as T;
  } catch (err: any) {
    clearTimeout(timer);
    console.log(`[API] ERROR: ${err.name}: ${err.message}`);
    
    if (err.name === 'AbortError') {
      throw new Error('Timeout: Backend tidak merespon. Pastikan backend berjalan.');
    }
    if (err.message?.includes('Backend tidak berjalan') || err.message?.includes('502')) {
      throw new Error('Backend belum dijalankan. Buka terminal baru: cd backend && npm run dev');
    }
    if (err.message?.includes('Network') || err.message?.includes('Failed') || err.message?.includes('TypeError')) {
      throw new Error('Gagal konek ke server. Restart Expo: npx expo start -c');
    }
    throw err;
  }
}

export async function apiUpload<T = any>(endpoint: string, formData: FormData): Promise<T> {
  const url = `${API_URL}${endpoint}`;
  const token = await getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, { method: 'POST', headers, body: formData });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as T;
}

// ===== TYPED API HELPERS =====
export const authApi = {
  login: async (nrp: string, pin: string) => {
    const data = await api('/api/auth/login', { method: 'POST', body: { nrp, pin }, noAuth: true });
    if (data.token) await setToken(data.token);
    if (data.refresh_token) await setRefreshToken(data.refresh_token);
    return data;
  },
  me: () => api('/api/auth/me'),
  changePin: (old_pin: string, new_pin: string) => api('/api/auth/change-pin', { method: 'PUT', body: { old_pin, new_pin } }),
  register: (data: any) => api('/api/auth/register', { method: 'POST', body: data }),
  logout: async () => {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
    await clearToken();
  },
};

export const usersApi = {
  list: (params?: string) => api(`/api/users${params ? '?' + params : ''}`),
  get: (id: string) => api(`/api/users/${id}`),
  update: (id: string, data: any) => api(`/api/users/${id}`, { method: 'PUT', body: data }),
  delete: (id: string) => api(`/api/users/${id}`, { method: 'DELETE' }),
  updateLocation: (id: string, lat: number, lng: number) => api(`/api/users/${id}/location`, { method: 'PUT', body: { latitude: lat, longitude: lng } }),
  updatePushToken: (id: string, token: string) => api(`/api/users/${id}/push-token`, { method: 'PUT', body: { token } }),
};

export const absensiApi = {
  list: (params?: string) => api(`/api/absensi${params ? '?' + params : ''}`),
  today: () => api('/api/absensi/today'),
  create: (data: any) => api('/api/absensi', { method: 'POST', body: data }),
};

export const patroliApi = {
  list: (params?: string) => api(`/api/patroli${params ? '?' + params : ''}`),
  get: (id: string) => api(`/api/patroli/${id}`),
  start: (data: any) => api('/api/patroli/start', { method: 'POST', body: data }),
  scan: (patroliId: string, data: any) => api(`/api/patroli/${patroliId}/scan`, { method: 'POST', body: data }),
  end: (patroliId: string, data: any) => api(`/api/patroli/${patroliId}/end`, { method: 'PUT', body: data }),
};

export const laporanApi = {
  harianList: (params?: string) => api(`/api/laporan/harian${params ? '?' + params : ''}`),
  harianCreate: (data: any) => api('/api/laporan/harian', { method: 'POST', body: data }),
  harianValidate: (id: string, status: string, catatan?: string) => api(`/api/laporan/harian/${id}/validate`, { method: 'PUT', body: { status, catatan } }),
  kejadianList: (params?: string) => api(`/api/laporan/kejadian${params ? '?' + params : ''}`),
  kejadianCreate: (data: any) => api('/api/laporan/kejadian', { method: 'POST', body: data }),
  kejadianValidate: (id: string, status: string, catatan?: string) => api(`/api/laporan/kejadian/${id}/validate`, { method: 'PUT', body: { status, catatan } }),
};

export const dataApi = {
  lokasi: { list: () => api('/api/data/lokasi'), create: (d: any) => api('/api/data/lokasi', { method: 'POST', body: d }), update: (id: string, d: any) => api(`/api/data/lokasi/${id}`, { method: 'PUT', body: d }), delete: (id: string) => api(`/api/data/lokasi/${id}`, { method: 'DELETE' }) },
  posJaga: { list: () => api('/api/data/pos-jaga'), create: (d: any) => api('/api/data/pos-jaga', { method: 'POST', body: d }), update: (id: string, d: any) => api(`/api/data/pos-jaga/${id}`, { method: 'PUT', body: d }), delete: (id: string) => api(`/api/data/pos-jaga/${id}`, { method: 'DELETE' }) },
  checkpoints: { list: () => api('/api/data/checkpoints'), create: (d: any) => api('/api/data/checkpoints', { method: 'POST', body: d }), update: (id: string, d: any) => api(`/api/data/checkpoints/${id}`, { method: 'PUT', body: d }), delete: (id: string) => api(`/api/data/checkpoints/${id}`, { method: 'DELETE' }) },
  routes: { list: () => api('/api/data/routes'), create: (d: any) => api('/api/data/routes', { method: 'POST', body: d }), update: (id: string, d: any) => api(`/api/data/routes/${id}`, { method: 'PUT', body: d }), delete: (id: string) => api(`/api/data/routes/${id}`, { method: 'DELETE' }) },
  jadwalShift: { list: () => api('/api/data/jadwal-shift'), create: (d: any) => api('/api/data/jadwal-shift', { method: 'POST', body: d }), update: (id: string, d: any) => api(`/api/data/jadwal-shift/${id}`, { method: 'PUT', body: d }), delete: (id: string) => api(`/api/data/jadwal-shift/${id}`, { method: 'DELETE' }) },
  shiftAssignments: { list: () => api('/api/data/shift-assignments'), create: (d: any) => api('/api/data/shift-assignments', { method: 'POST', body: d }), delete: (id: string) => api(`/api/data/shift-assignments/${id}`, { method: 'DELETE' }) },
  broadcasts: { list: () => api('/api/data/broadcasts'), create: (d: any) => api('/api/data/broadcasts', { method: 'POST', body: d }) },
  serahTerima: { list: () => api('/api/data/serah-terima'), create: (d: any) => api('/api/data/serah-terima', { method: 'POST', body: d }) },
  panic: { list: () => api('/api/data/panic'), create: (d: any) => api('/api/data/panic', { method: 'POST', body: d }), resolve: (id: string, status: string) => api(`/api/data/panic/${id}/resolve`, { method: 'PUT', body: { status } }) },
  notifikasi: { list: () => api('/api/data/notifikasi'), create: (d: any) => api('/api/data/notifikasi', { method: 'POST', body: d }), readAll: () => api('/api/data/notifikasi/read-all', { method: 'PUT' }), read: (id: string) => api(`/api/data/notifikasi/${id}/read`, { method: 'PUT' }) },
  reportExports: { list: () => api('/api/data/report-exports'), create: (d: any) => api('/api/data/report-exports', { method: 'POST', body: d }) },
  auditLog: { list: (params?: string) => api(`/api/audit-log${params ? '?' + params : ''}`), summary: () => api('/api/audit-log/summary'), user: (id: string) => api(`/api/audit-log/user/${id}`) },
  stats: () => api('/api/data/dashboard/stats'),
  lokasiStats: () => api('/api/export/lokasi-stats'),
  upload: (formData: FormData) => apiUpload('/api/data/upload', formData),
  uploadMultiple: (formData: FormData) => apiUpload('/api/data/upload/multiple', formData),
};

export const exportApi = {
  absensi: (s: string, e: string, l?: string) => `${API_URL}/api/export/absensi?start_date=${s}&end_date=${e}${l ? '&lokasi_id=' + l : ''}`,
  laporan: (s: string, e: string, l?: string) => `${API_URL}/api/export/laporan?start_date=${s}&end_date=${e}${l ? '&lokasi_id=' + l : ''}`,
  patroli: (s: string, e: string, l?: string) => `${API_URL}/api/export/patroli?start_date=${s}&end_date=${e}${l ? '&lokasi_id=' + l : ''}`,
  complete: (s: string, e: string, l?: string) => `${API_URL}/api/export/complete?start_date=${s}&end_date=${e}${l ? '&lokasi_id=' + l : ''}`,
};

export const geofenceApi = {
  check: (latitude: number, longitude: number, accuracy?: number) => api('/api/geofence/check', { method: 'POST', body: { latitude, longitude, accuracy } }),
  requestIzin: (alasan: string, latitude?: number, longitude?: number) => api('/api/geofence/izin', { method: 'POST', body: { alasan, latitude, longitude } }),
  myStatus: () => api('/api/geofence/status'),
  izinList: (params?: string) => api(`/api/geofence/izin${params ? '?' + params : ''}`),
  approveIzin: (id: string, durasi_menit: number, catatan?: string) => api(`/api/geofence/izin/${id}/approve`, { method: 'PUT', body: { durasi_menit, catatan } }),
  rejectIzin: (id: string, catatan?: string) => api(`/api/geofence/izin/${id}/reject`, { method: 'PUT', body: { catatan } }),
  violations: () => api('/api/geofence/violations'),
  liveMap: (lokasiId?: string) => api(`/api/geofence/live-map${lokasiId ? '?lokasi_id=' + lokasiId : ''}`),
};
