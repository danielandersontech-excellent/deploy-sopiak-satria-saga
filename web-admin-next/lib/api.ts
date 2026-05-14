/**
 * PT Sopiak Satria Saga Web Admin - Direct API Client
 * v18 - Klien Login, Berkas Upload, Enhanced Features
 * v19 - P0-17: tokens are no longer stored in localStorage. The backend
 *       sets ptsss_token / ptsss_refresh as httpOnly cookies on login,
 *       and middleware.ts already gates routes by reading that cookie;
 *       keeping a parallel localStorage copy added XSS exposure (any
 *       script on this origin could read the access token) without any
 *       functional benefit, because the cookie was already the source
 *       of truth for middleware-side route protection. All fetch() calls
 *       now send `credentials: 'include'` so the browser attaches the
 *       cookie automatically — no Authorization header needed.
 *
 *       User data (id, nama, role, client_id) STILL lives in localStorage.
 *       It's not security-sensitive (the backend re-derives the same
 *       fields from the cookie on every request) but client-side code
 *       reads it constantly for UI decisions (menu visibility, profile
 *       header, etc), and going async to fetch /api/auth/me on every
 *       page render would be costly. The cookie is what authenticates;
 *       the localStorage user blob is just a UI hint that can be
 *       discarded at any time.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const USER_KEY = 'ptsss_admin_user';

// P0-17: legacy localStorage keys, kept only so we can purge any leftover
// values on first load. Anything that previously called getToken() now
// returns null — the auth cookie does the work.
const LEGACY_TOKEN_KEY = 'ptsss_admin_token';
const LEGACY_REFRESH_KEY = 'ptsss_admin_refresh';

// One-time migration: wipe any pre-fix tokens that might still be sitting
// in localStorage from earlier sessions. Without this, a user upgrading
// from v18 would still have the (now unused) plaintext token visible to
// any script running on this origin.
if (typeof window !== 'undefined') {
  try {
    if (localStorage.getItem(LEGACY_TOKEN_KEY) || localStorage.getItem(LEGACY_REFRESH_KEY)) {
      localStorage.removeItem(LEGACY_TOKEN_KEY);
      localStorage.removeItem(LEGACY_REFRESH_KEY);
      console.log('[api] Purged legacy localStorage tokens (P0-17).');
    }
  } catch {}
}

// P0-17: token accessors are intentionally absent from the public API.
// Components that previously imported getToken()/setToken() should be
// updated to rely on the cookie. Login no longer needs to "store"
// anything — the Set-Cookie from /api/auth/login does it.

export function clearAuth() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(USER_KEY);
  // Belt-and-suspenders: if a downstream/legacy code path ever wrote to
  // these again, make sure logout still nukes them. The backend logout
  // endpoint clears the httpOnly cookie itself.
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  localStorage.removeItem(LEGACY_REFRESH_KEY);
}

export function getUser(): any { if (typeof window === 'undefined') return null; const r = localStorage.getItem(USER_KEY); return r ? JSON.parse(r) : null; }
export function setUser(u: any) { if (typeof window !== "undefined") localStorage.setItem(USER_KEY, JSON.stringify(u)); }

export const ROLE_MENUS: Record<string, string[]> = {
  admin:      ['/', '/live-map', '/lokasi', '/clients', '/personil', '/absensi', '/patroli', '/laporan-harian', '/laporan-kejadian', '/serah-terima', '/geofence', '/checkpoint', '/routes', '/pos-jaga', '/jadwal', '/shift-assignment', '/broadcast', '/panic', '/export', '/backup', '/analytics', '/qr-generator'],
  supervisor: ['/', '/live-map', '/lokasi', '/clients', '/personil', '/absensi', '/patroli', '/laporan-harian', '/laporan-kejadian', '/serah-terima', '/geofence', '/checkpoint', '/routes', '/pos-jaga', '/jadwal', '/shift-assignment', '/broadcast', '/panic', '/export', '/analytics', '/qr-generator'],
  komandan:   ['/', '/live-map', '/personil', '/absensi', '/patroli', '/laporan-harian', '/laporan-kejadian', '/serah-terima', '/geofence', '/broadcast', '/panic', '/export'],
  anggota:    ['/', '/absensi', '/patroli', '/laporan-harian', '/laporan-kejadian', '/serah-terima'],
  klien:      ['/', '/live-map', '/absensi', '/patroli', '/laporan-harian', '/laporan-kejadian', '/panic', '/export'],
};

export function isMenuAllowed(path: string): boolean {
  const user = getUser();
  const role = user?.role || 'anggota';
  return (ROLE_MENUS[role] || ROLE_MENUS.anggota).includes(path);
}

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  // P0-17: the refresh token is in the httpOnly ptsss_refresh cookie.
  // The browser attaches it automatically when credentials:'include'
  // is set, so we just POST an empty body. The backend's refreshToken
  // handler reads `req.cookies.ptsss_refresh` and replies with a
  // fresh access cookie via Set-Cookie — no token round-trip in JS.
  try {
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      credentials: 'include',
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data.user) setUser(data.user);
    return true;
  } catch { return false; }
}

export async function apiFetch(endpoint: string, opts: any = {}) {
  const { method = 'GET', body, noAuth } = opts;
  const headers: any = { 'Content-Type': 'application/json' };
  // P0-17: no Authorization header. The cookie handles auth — the only
  // reason to send a Bearer header would be to defeat third-party-cookie
  // blocking, but we already require credentials:'include' to work
  // (cross-site or first-party) so we're committed to that path.
  const config: any = { method, headers, credentials: 'include' as RequestCredentials };
  if (body && method !== 'GET') config.body = JSON.stringify(body);
  let res = await fetch(`${API_URL}${endpoint}`, config);
  if (res.status === 401 && !noAuth) {
    const errData = await res.json().catch(() => ({}));
    if (errData.code === 'TOKEN_EXPIRED') {
      if (!isRefreshing) { isRefreshing = true; refreshPromise = tryRefresh(); }
      const refreshed = await refreshPromise;
      isRefreshing = false; refreshPromise = null;
      if (refreshed) {
        // Retry with the new cookie that the refresh just installed.
        res = await fetch(`${API_URL}${endpoint}`, config);
      } else {
        clearAuth();
        if (typeof window !== 'undefined') window.location.href = '/login';
        throw new Error('Session expired');
      }
    }
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
  return data;
}

export async function apiUploadFile(endpoint: string, file: File, extraFields?: Record<string, string>) {
  const formData = new FormData();
  formData.append('file', file);
  if (extraFields) for (const [k, v] of Object.entries(extraFields)) formData.append(k, v);
  // P0-17: same cookie-only model for multipart uploads.
  const res = await fetch(`${API_URL}${endpoint}`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function toArray(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (data?.data && Array.isArray(data.data)) return data.data;
  if (data?.rows && Array.isArray(data.rows)) return data.rows;
  return data ? [data] : [];
}

export const authApi = {
  login: async (nrp: string, pin: string) => {
    const clean = nrp.replace(/@ptsss\.app$/i, '').toUpperCase();
    const data = await apiFetch('/api/auth/login', { method: 'POST', body: { nrp: clean, pin }, noAuth: true });
    // P0-17: only the user blob lands in localStorage. Tokens are in
    // the httpOnly cookie that the backend just set via Set-Cookie.
    if (data.user) setUser(data.user);
    return data;
  },
  register: async (payload: any) => {
    const clean = (payload.nrp || '').replace(/@ptsss\.app$/i, '').toUpperCase();
    // P0-14: backend now generates a random temp PIN if `pin` is not
    // provided. We deliberately do NOT default to '123456' here — let
    // the server decide.
    return apiFetch('/api/auth/register', { method: 'POST', body: { ...payload, nrp: clean } });
  },
  getUser: () => getUser(),
  getUserId: () => getUser()?.id || null,
  getUserRole: () => getUser()?.role || 'anggota',
  getClientId: () => getUser()?.client_id || null,
  isKlien: () => getUser()?.role === 'klien',
  logout: () => { try { apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {}); } catch {} clearAuth(); },
  // P0-17: "logged in?" is now a UI hint based on whether we've cached
  // a user blob. The authoritative answer is "did the server accept
  // the cookie?" which we only know on the next request. middleware.ts
  // handles the route-level check.
  isLoggedIn: () => !!getUser(),
};

export function crud(base: string) {
  return {
    list: async (params = '') => { const d = await apiFetch(`${base}${params ? '?' + params : ''}`); return toArray(d); },
    get: (id: string) => apiFetch(`${base}/${id}`),
    create: (data: any) => apiFetch(base, { method: 'POST', body: data }),
    update: (id: string, data: any) => apiFetch(`${base}/${id}`, { method: 'PUT', body: data }),
    del: (id: string) => apiFetch(`${base}/${id}`, { method: 'DELETE' }),
  };
}

export const usersApi = { ...crud('/api/users'), updateBerkas: (id: string, data: any) => apiFetch(`/api/users/${id}`, { method: 'PUT', body: data }) };
export const absensiApi = { ...crud('/api/absensi'), today: async () => toArray(await apiFetch('/api/absensi/today')), byDate: async (date: string) => toArray(await apiFetch(`/api/absensi?date=${date}`)) };
export const patroliApi = crud('/api/patroli');
export const laporanHarianApi = { ...crud('/api/laporan/harian'), validate: (id: string, status: string, userId: string, catatan?: string) => apiFetch(`/api/laporan/harian/${id}/validate`, { method: 'PUT', body: { status, catatan: catatan || null } }) };
export const laporanKejadianApi = { ...crud('/api/laporan/kejadian'), validate: (id: string, status: string, userId: string, catatan?: string) => apiFetch(`/api/laporan/kejadian/${id}/validate`, { method: 'PUT', body: { status, catatan } }) };
export const lokasiApi = crud('/api/data/lokasi');
export const posJagaApi = crud('/api/data/pos-jaga');
export const checkpointsApi = crud('/api/data/checkpoints');
export const routesApi = crud('/api/data/routes');
export const jadwalApi = crud('/api/data/jadwal-shift');
export const shiftAssignApi = crud('/api/data/shift-assignments');
export const broadcastsApi = crud('/api/data/broadcasts');
export const serahTerimaApi = crud('/api/data/serah-terima');
export const panicApi = { ...crud('/api/data/panic'), resolve: (id: string, status: string, userId: string, catatan?: string) => apiFetch(`/api/data/panic/${id}/resolve`, { method: 'PUT', body: { status, catatan_resolver: catatan } }) };
export const notifApi = crud('/api/data/notifikasi');
export const reportExportsApi = crud('/api/data/report-exports');
export const clientsApi = crud('/api/data/clients');
export const dashboardApi = { stats: () => apiFetch('/api/data/dashboard/stats') };

export const geofenceApi = {
  liveMap: (lokasiId?: string) => apiFetch(`/api/geofence/live-map${lokasiId ? '?lokasi_id=' + lokasiId : ''}`),
  izinList: async (params = '') => toArray(await apiFetch(`/api/geofence/izin${params ? '?' + params : ''}`)),
  izinApprove: (id: string, durasi_menit: number, catatan?: string) => apiFetch(`/api/geofence/izin/${id}/approve`, { method: 'PUT', body: { durasi_menit, catatan } }),
  izinReject: (id: string, catatan?: string) => apiFetch(`/api/geofence/izin/${id}/reject`, { method: 'PUT', body: { catatan } }),
  violations: async (params = '') => toArray(await apiFetch(`/api/geofence/violations${params ? '?' + params : ''}`)),
  ackViolation: (id: string) => apiFetch(`/api/geofence/violations/${id}/ack`, { method: 'PUT' }),
};

export const backupApi = {
  create: () => apiFetch('/api/backup/create', { method: 'POST' }),
  list: async () => toArray(await apiFetch('/api/backup/list')),
  restore: (filename: string) => apiFetch('/api/backup/restore', { method: 'POST', body: { filename } }),
  schedule: (enabled: boolean, time: string) => apiFetch('/api/backup/schedule', { method: 'PUT', body: { enabled, time } }),
  getSchedule: () => apiFetch('/api/backup/schedule'),
  uploadDrive: (filename: string) => apiFetch('/api/backup/upload-drive', { method: 'POST', body: { filename } }),
};

export function getExportUrl(type: string, startDate: string, endDate: string, lokasiId?: string) {
  const base = `${API_URL}/api/export/${type}?start_date=${startDate}&end_date=${endDate}`;
  return lokasiId ? `${base}&lokasi_id=${lokasiId}` : base;
}

export { API_URL };
