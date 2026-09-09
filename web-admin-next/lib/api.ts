/**
 * PT Sopiak Satria Saga Web Admin - Direct API Client
 * v19 - AUDIT FIX: P0-17 LocalStorage Token Removal
 *
 * History:
 *   v18 (Tahap 2 attempt): backend started setting httpOnly cookies
 *     (ptsss_token / ptsss_refresh) for web-admin auth. BUT this file
 *     ALSO kept localStorage.{set,get}Item for the access and refresh
 *     tokens and added them as `Authorization: Bearer` on every fetch.
 *     The httpOnly cookie protection was undermined because any XSS
 *     could still read the token straight out of localStorage.
 *
 *   v19 (audit fix): localStorage is purged for tokens entirely. The
 *     backend already supports cookie-only auth:
 *       - middleware/auth.js reads req.cookies.ptsss_token
 *       - controllers/auth.controller.js refresh path reads
 *         req.cookies.ptsss_refresh
 *     Frontend now relies exclusively on credentials: 'include' so the
 *     browser ships the cookie automatically. No JS-readable token
 *     anywhere — an XSS can no longer exfiltrate the session.
 *
 *     User object (nama, role, client_id, ...) still lives in
 *     localStorage because it's not sensitive and is read on every
 *     page render. Stealing it via XSS yields no privilege the user
 *     doesn't already have.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const USER_KEY = 'ptsss_admin_user';

// User-object helpers ONLY. No token helpers — tokens live in httpOnly
// cookies set by the backend; JS cannot and should not read them.
export function clearAuth() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(USER_KEY);
  // Best-effort: wipe any leftover token keys from v18 installs so a
  // refreshing browser doesn't carry stale plaintext tokens forward.
  localStorage.removeItem('ptsss_admin_token');
  localStorage.removeItem('ptsss_admin_refresh');
}
export function getUser(): any {
  if (typeof window === 'undefined') return null;
  const r = localStorage.getItem(USER_KEY);
  return r ? JSON.parse(r) : null;
}
export function setUser(u: any) {
  if (typeof window !== 'undefined') localStorage.setItem(USER_KEY, JSON.stringify(u));
}

export const ROLE_MENUS: Record<string, string[]> = {
  admin:      ['/', '/live-map', '/lokasi', '/clients', '/personil', '/rekrutmen', '/absensi', '/patroli', '/laporan-harian', '/laporan-kejadian', '/serah-terima', '/geofence', '/checkpoint', '/routes', '/pos-jaga', '/jadwal', '/shift-assignment', '/broadcast', '/panic', '/export', '/backup', '/analytics', '/qr-generator'],
  supervisor: ['/', '/live-map', '/lokasi', '/clients', '/personil', '/rekrutmen', '/absensi', '/patroli', '/laporan-harian', '/laporan-kejadian', '/serah-terima', '/geofence', '/checkpoint', '/routes', '/pos-jaga', '/jadwal', '/shift-assignment', '/broadcast', '/panic', '/export', '/analytics', '/qr-generator'],
  komandan:   ['/', '/live-map', '/personil', '/absensi', '/patroli', '/laporan-harian', '/laporan-kejadian', '/serah-terima', '/geofence', '/broadcast', '/panic', '/export'],
  anggota:    ['/', '/absensi', '/patroli', '/laporan-harian', '/laporan-kejadian', '/serah-terima'],
  // P1-15 (tahap 5): klien restricted to read-only.
  klien:      ['/', '/live-map', '/laporan-harian', '/laporan-kejadian'],
};

export function isMenuAllowed(path: string): boolean {
  const user = getUser();
  const role = user?.role || 'anggota';
  return (ROLE_MENUS[role] || ROLE_MENUS.anggota).includes(path);
}

// Refresh coordination: collapse concurrent 401s into a single refresh
// attempt so we don't issue N parallel refresh requests when N requests
// race against an expired token.
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  // The refresh token rides in the httpOnly cookie 'ptsss_refresh'.
  // credentials:'include' is the only thing that ships it; we don't
  // need (and can't read) the token in JS. The backend rotates it
  // and sets new ptsss_token + ptsss_refresh cookies on success.
  try {
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data.user) setUser(data.user);
    return true;
  } catch {
    return false;
  }
}

export async function apiFetch(endpoint: string, opts: any = {}) {
  const { method = 'GET', body /* noAuth ignored: cookies decide */ } = opts;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  // No Authorization header — the httpOnly cookie carries auth, sent
  // automatically by the browser when credentials:'include' is set.
  const config: RequestInit = { method, headers, credentials: 'include' };
  if (body && method !== 'GET') (config as any).body = JSON.stringify(body);

  let res = await fetch(`${API_URL}${endpoint}`, config);

  // Auto-refresh on expired access token. The refresh endpoint itself
  // is excluded so a failing refresh doesn't infinite-loop.
  if (res.status === 401 && !endpoint.startsWith('/api/auth/refresh') && !endpoint.startsWith('/api/auth/login')) {
    const errData = await res.clone().json().catch(() => ({}));
    if (errData.code === 'TOKEN_EXPIRED' || errData.error === 'Token tidak ditemukan') {
      // [Audit 2B] "Token tidak ditemukan" = cookie akses sudah hilang (mis.
      // browser dibuka ulang setelah 30 menit) — coba refresh juga, jangan
      // langsung gagal.
      if (!isRefreshing) {
        isRefreshing = true;
        refreshPromise = tryRefresh();
      }
      const refreshed = await refreshPromise;
      isRefreshing = false;
      refreshPromise = null;
      if (refreshed) {
        // Retry once — the new ptsss_token cookie is already set.
        res = await fetch(`${API_URL}${endpoint}`, config);
      } else {
        clearAuth();
        if (typeof window !== 'undefined') window.location.href = '/login';
        throw new Error('Sesi berakhir, silakan login kembali');
      }
    } else if (errData.code === 'ACCOUNT_DEACTIVATED' || /tidak valid|tidak ditemukan|tidak aktif|dinonaktifkan/i.test(String(errData.error || ''))) {
      // [Audit 2B] 401 yang tidak bisa dipulihkan (akun dinonaktifkan, token
      // rusak) — sebelumnya halaman hanya menampilkan toast error berulang.
      clearAuth();
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.href = `/login?reason=${encodeURIComponent(errData.error || 'Sesi tidak valid')}`;
      }
      throw new Error(errData.error || 'Sesi tidak valid');
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
  // No Authorization header. multipart/form-data Content-Type is
  // auto-set by the browser when body is FormData.
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
    // Backend sets ptsss_token + ptsss_refresh cookies. We only need
    // to remember the user object for client-side rendering.
    const data = await apiFetch('/api/auth/login', { method: 'POST', body: { nrp: clean, pin } });
    if (data.user) setUser(data.user);
    return data;
  },
  register: async (payload: any) => {
    const clean = (payload.nrp || '').replace(/@ptsss\.app$/i, '').toUpperCase();
    return apiFetch('/api/auth/register', { method: 'POST', body: { ...payload, nrp: clean, pin: payload.pin || '123456' } });
  },
  // [Audit 2B/2G] Web-admin tidak punya jalur ganti PIN padahal akun baru
  // dibuat dengan must_change_pin = true.
  changePin: (old_pin: string, new_pin: string) =>
    apiFetch('/api/auth/change-pin', { method: 'PUT', body: { old_pin, new_pin } }),
  me: () => apiFetch('/api/auth/me'),
  getUser: () => getUser(),
  getUserId: () => getUser()?.id || null,
  getUserRole: () => getUser()?.role || 'anggota',
  getClientId: () => getUser()?.client_id || null,
  isKlien: () => getUser()?.role === 'klien',
  logout: async () => {
    try { await apiFetch('/api/auth/logout', { method: 'POST' }); } catch { /* network fail OK on logout */ }
    clearAuth();
  },
  // We don't have JS access to the token anymore. "Logged in" now
  // means "we have a user object stored", which Reflects-by-construction
  // the last successful login. apiFetch will detect a stale session at
  // its next call and redirect to /login.
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
export const dashboardApi = {
  stats: () => apiFetch('/api/data/dashboard/stats'),
  // [Audit 2B] agregat Analytics dihitung di server (bukan dari 20 baris pertama).
  analytics: (params = '') => apiFetch(`/api/data/dashboard/analytics${params ? '?' + params : ''}`),
};

/**
 * [Audit 2B] Ambil daftar ber-pagination APA ADANYA ({ data, pagination, summary })
 * — berbeda dari crud().list yang meratakan ke array dan membuang total.
 */
export async function apiFetchPaged(base: string, params: URLSearchParams | string = '') {
  const qs = typeof params === 'string' ? params : params.toString();
  const d: any = await apiFetch(`${base}${qs ? '?' + qs : ''}`);
  if (Array.isArray(d)) return { data: d, pagination: { total: d.length, page: 1, limit: d.length || 1, totalPages: 1 }, summary: undefined as any };
  return {
    data: Array.isArray(d?.data) ? d.data : [],
    pagination: d?.pagination || { total: Number(d?.total) || 0, page: Number(d?.page) || 1, limit: Number(d?.limit) || 20, totalPages: Number(d?.totalPages) || 1 },
    summary: d?.summary,
  };
}

/**
 * Unduh berkas ber-auth (cookie httpOnly) sebagai Blob — untuk berkas privat
 * yang TIDAK dilayani express.static (mis. berkas pelamar rekrutmen).
 * Meniru refresh-on-401 apiFetch, lalu mengembalikan object URL siap dibuka.
 */
export async function apiFetchBlobUrl(endpoint: string): Promise<string> {
  const init: RequestInit = { method: 'GET', credentials: 'include' };
  let res = await fetch(`${API_URL}${endpoint}`, init);
  if (res.status === 401) {
    const refreshed = await tryRefresh();
    if (refreshed) res = await fetch(`${API_URL}${endpoint}`, init);
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); if (j?.error) msg = j.error; } catch { /* bukan JSON */ }
    throw new Error(msg);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

// [Rekrutmen] Pelamar dari formulir publik website /karir.
export const rekrutmenApi = {
  list: (params = '') => apiFetch(`/api/rekrutmen${params ? '?' + params : ''}`),
  ringkasan: () => apiFetch('/api/rekrutmen/ringkasan'),
  get: (id: string) => apiFetch(`/api/rekrutmen/${id}`),
  ubahStatus: (id: string, status: string, catatan_admin?: string) =>
    apiFetch(`/api/rekrutmen/${id}/status`, { method: 'PUT', body: { status, catatan_admin: catatan_admin || null } }),
  jadikanAnggota: (id: string, data: { lokasi_id?: string | null; shift?: string; role?: string }) =>
    apiFetch(`/api/rekrutmen/${id}/jadikan-anggota`, { method: 'POST', body: data }),
  del: (id: string) => apiFetch(`/api/rekrutmen/${id}`, { method: 'DELETE' }),
  berkasBlobUrl: (id: string, jenis: string) => apiFetchBlobUrl(`/api/rekrutmen/${id}/berkas/${jenis}`),
};

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
  // [Audit 2B] DELETE /api/backup/:filename sudah ada di backend tapi tak pernah dipakai UI.
  del: (filename: string) => apiFetch(`/api/backup/${encodeURIComponent(filename)}`, { method: 'DELETE' }),
};

export function getExportUrl(type: string, startDate: string, endDate: string, lokasiId?: string) {
  const base = `${API_URL}/api/export/${type}?start_date=${startDate}&end_date=${endDate}`;
  return lokasiId ? `${base}&lokasi_id=${lokasiId}` : base;
}

export { API_URL };