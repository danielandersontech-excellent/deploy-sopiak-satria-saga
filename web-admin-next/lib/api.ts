/**
 * PT Sopiak Satria Saga Web Admin - Direct API Client
 * v18 - Klien Login, Berkas Upload, Enhanced Features
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const TOKEN_KEY = 'ptsss_admin_token';
const USER_KEY = 'ptsss_admin_user';
const REFRESH_KEY = 'ptsss_admin_refresh';

export function getToken(): string | null { return typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null; }
export function setToken(t: string) { if (typeof window !== "undefined") localStorage.setItem(TOKEN_KEY, t); }
export function getRefreshToken(): string | null { return typeof window !== 'undefined' ? localStorage.getItem(REFRESH_KEY) : null; }
export function setRefreshToken(t: string) { if (typeof window !== "undefined") localStorage.setItem(REFRESH_KEY, t); }
export function clearAuth() { if (typeof window === "undefined") return; localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); localStorage.removeItem(REFRESH_KEY); }
export function getUser(): any { if (typeof window === 'undefined') return null; const r = localStorage.getItem(USER_KEY); return r ? JSON.parse(r) : null; }
export function setUser(u: any) { if (typeof window !== "undefined") localStorage.setItem(USER_KEY, JSON.stringify(u)); }

export const ROLE_MENUS: Record<string, string[]> = {
  admin:      ['/', '/live-map', '/lokasi', '/clients', '/personil', '/absensi', '/patroli', '/laporan-harian', '/laporan-kejadian', '/serah-terima', '/geofence', '/checkpoint', '/routes', '/pos-jaga', '/jadwal', '/shift-assignment', '/broadcast', '/panic', '/export', '/backup', '/analytics', '/qr-generator'],
  supervisor: ['/', '/live-map', '/lokasi', '/clients', '/personil', '/absensi', '/patroli', '/laporan-harian', '/laporan-kejadian', '/serah-terima', '/geofence', '/checkpoint', '/routes', '/pos-jaga', '/jadwal', '/shift-assignment', '/broadcast', '/panic', '/export', '/analytics', '/qr-generator'],
  komandan:   ['/', '/live-map', '/personil', '/absensi', '/patroli', '/laporan-harian', '/laporan-kejadian', '/serah-terima', '/geofence', '/broadcast', '/panic', '/export'],
  anggota:    ['/', '/absensi', '/patroli', '/laporan-harian', '/laporan-kejadian', '/serah-terima'],
  // P1-15 (tahap 5): klien restricted to read-only. Previously listed
  // /absensi, /patroli, /panic, /broadcast, /export — those have write
  // intent (broadcast publishes, panic creates alerts, absensi/patroli
  // are operator workflows that don't belong to a client). Klien now
  // sees dashboard landing, live map (read-only view of their lokasi),
  // and the two laporan listings (which are scope-filtered by tahap 4
  // P0-6 anyway). Note: this is UI-layer gating only; the backend
  // route guards in /api/laporan/harian POST etc. are the actual
  // authorization barrier — see tahap 4 scope.js.
  klien:      ['/', '/live-map', '/laporan-harian', '/laporan-kejadian'],
};

export function isMenuAllowed(path: string): boolean {
  const user = getUser();
  const role = user?.role || 'anggota';
  return (ROLE_MENUS[role] || ROLE_MENUS.anggota).includes(path);
}

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  const rt = getRefreshToken();
  if (!rt) return false;
  try {
    const res = await fetch(`${API_URL}/api/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: rt }), credentials: 'include' });
    if (!res.ok) return false;
    const data = await res.json();
    setToken(data.token); if (data.refresh_token) setRefreshToken(data.refresh_token); if (data.user) setUser(data.user);
    return true;
  } catch { return false; }
}

export async function apiFetch(endpoint: string, opts: any = {}) {
  const { method = 'GET', body, noAuth } = opts;
  const headers: any = { 'Content-Type': 'application/json' };
  if (!noAuth) { const t = getToken(); if (t) headers['Authorization'] = `Bearer ${t}`; }
  const config: any = { method, headers, credentials: 'include' as RequestCredentials };
  if (body && method !== 'GET') config.body = JSON.stringify(body);
  let res = await fetch(`${API_URL}${endpoint}`, config);
  if (res.status === 401 && !noAuth) {
    const errData = await res.json().catch(() => ({}));
    if (errData.code === 'TOKEN_EXPIRED') {
      if (!isRefreshing) { isRefreshing = true; refreshPromise = tryRefresh(); }
      const refreshed = await refreshPromise;
      isRefreshing = false; refreshPromise = null;
      if (refreshed) { headers['Authorization'] = `Bearer ${getToken()}`; res = await fetch(`${API_URL}${endpoint}`, { ...config, headers }); }
      else { clearAuth(); if (typeof window !== 'undefined') window.location.href = '/login'; throw new Error('Session expired'); }
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
  const headers: any = {};
  const t = getToken(); if (t) headers['Authorization'] = `Bearer ${t}`;
  const res = await fetch(`${API_URL}${endpoint}`, { method: 'POST', headers, body: formData, credentials: 'include' });
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
    setToken(data.token); if (data.refresh_token) setRefreshToken(data.refresh_token); setUser(data.user);
    return data;
  },
  register: async (payload: any) => {
    const clean = (payload.nrp || '').replace(/@ptsss\.app$/i, '').toUpperCase();
    return apiFetch('/api/auth/register', { method: 'POST', body: { ...payload, nrp: clean, pin: payload.pin || '123456' } });
  },
  getUser: () => getUser(),
  getUserId: () => getUser()?.id || null,
  getUserRole: () => getUser()?.role || 'anggota',
  getClientId: () => getUser()?.client_id || null,
  isKlien: () => getUser()?.role === 'klien',
  logout: () => { try { apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {}); } catch {} clearAuth(); },
  isLoggedIn: () => !!getToken(),
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
