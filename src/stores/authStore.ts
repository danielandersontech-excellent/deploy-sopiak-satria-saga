/**
 * AUTH STORE - Zustand (Express.js backend version) - FIXED v2
 *
 * FIXES (v2 - May 2026):
 *  ✅ restoreSession: distinguish network error vs token-invalid.
 *     - On network error → fall back to cached user (offline-friendly).
 *     - On 401/403/Unauthorized → clear token (avoid 401-loop).
 *  ✅ login: ensure `loading: false` is reset in ALL exit paths
 *     (catch block was OK; added safety on success path too).
 *  ✅ logout: reset `loading` and `error` together with auth state.
 *  ✅ Removed unused imports (`setToken`, `setRefreshToken`)
 *     — these are handled inside `authApi.login` already.
 *  ✅ updateUser: now returns the merged user (handy for callers).
 *  ✅ changePin: bubble up server error message to UI for transparency.
 */
import { create } from 'zustand';
import {
  authApi,
  clearToken,
  getToken,
  saveUser,
  getSavedUser,
} from '../lib/apiClient';

export interface User {
  id: string;
  nrp: string;
  nama: string;
  role: 'anggota' | 'komandan' | 'supervisor' | 'admin' | 'klien';
  no_hp?: string;
  foto_url?: string;
  lokasi_id?: string;
  pos_jaga_id?: string;
  shift?: string;
  status?: string;
  skor?: number;
  lokasi_nama?: string;
  pos_nama?: string;
  // Aliases for backward compatibility with UI screens
  foto?: string;
  posJaga?: string;
  lokasi?: string;
  noHp?: string;
  client_id?: string;
  lokasiId?: string;
}

interface AuthState {
  user: User | null;
  isLoggedIn: boolean;
  loading: boolean;
  error: string | null;

  login: (nrp: string, pin: string) => Promise<boolean>;
  loginAsRole: (role: string) => Promise<boolean>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<boolean>;
  updateUser: (updates: Partial<User>) => User | null;
  changePin: (oldPin: string, newPin: string) => Promise<boolean>;
}

// Helper: classify an error message as network (transient) vs auth (permanent)
function isNetworkError(msg: string): boolean {
  if (!msg) return false;
  const m = msg.toLowerCase();
  return m.includes('network')
      || m.includes('fetch')
      || m.includes('failed to fetch')
      || m.includes('timeout')
      || m.includes('gagal konek')
      || m.includes('backend')
      || m.includes('aborted')
      || m.includes('tidak merespon');
}

function isAuthError(msg: string): boolean {
  if (!msg) return false;
  const m = msg.toLowerCase();
  return m.includes('unauthorized')
      || m.includes('401')
      || m.includes('403')
      || m.includes('session expired')
      || m.includes('token');
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoggedIn: false,
  loading: false,
  error: null,

  login: async (nrp, pin) => {
    set({ loading: true, error: null });
    try {
      const result: any = await authApi.login(nrp, pin);
      // Token & refresh_token already saved by authApi.login
      const user = result?.user;
      if (!user) {
        set({ loading: false, error: 'Respons server tidak valid (no user)' });
        return false;
      }
      await saveUser(user);
      set({ user, isLoggedIn: true, loading: false, error: null });
      console.log('[Auth] Login OK:', user.nama, user.role);
      return true;
    } catch (err: any) {
      const msg = err?.message || 'Login gagal';
      const displayMsg = isNetworkError(msg)
        ? 'Gagal konek ke backend. Pastikan backend sudah dijalankan (cd backend && npm run dev)'
        : msg;
      console.log('[Auth] Login failed:', displayMsg);
      set({ loading: false, error: displayMsg, user: null, isLoggedIn: false });
      return false;
    }
  },

  loginAsRole: async (role) => {
    // P0-1: This function exists ONLY to make local development less
    // painful (one-tap login as each role). It must never execute in a
    // production bundle — the hardcoded credentials below would let
    // anyone with the APK sign in as admin. Metro/Hermes inlines
    // `__DEV__` as a boolean literal at build time, so the entire
    // credential map below is dead-code-eliminated from release builds.
    if (!__DEV__) {
      set({ error: 'Quick login tidak tersedia di production' });
      console.warn('[Auth] loginAsRole called in non-dev build — ignored.');
      return false;
    }
    const roleMap: Record<string, { nrp: string; pin: string }> = {
      anggota:    { nrp: 'AGT001', pin: '123456' },
      komandan:   { nrp: 'KMD001', pin: '123456' },
      supervisor: { nrp: 'SPV001', pin: '123456' },
      admin:      { nrp: 'ADM001', pin: '123456' },
      klien:      { nrp: 'K001', pin: '123456' },
    };
    const cred = roleMap[role];
    if (!cred) {
      set({ error: `Role tidak dikenal: ${role}` });
      return false;
    }
    return get().login(cred.nrp, cred.pin);
  },

  logout: async () => {
    try { await authApi.logout(); } catch { /* ignore network errors on logout */ }
    await clearToken();
    set({ user: null, isLoggedIn: false, error: null, loading: false });
    console.log('[Auth] Logged out');
  },

  restoreSession: async () => {
    try {
      const token = await getToken();
      if (!token) return false;

      // Verify token by calling /me
      try {
        const user: any = await authApi.me();
        if (user && user.id) {
          await saveUser(user);
          set({ user, isLoggedIn: true, error: null });
          console.log('[Auth] Session restored:', user.nama);
          return true;
        }
        // No user in response → treat as auth failure
        await clearToken();
        return false;
      } catch (verifyErr: any) {
        const msg = verifyErr?.message || '';
        // If it's a network error: keep token, fall back to cached user
        // (so app still loads when offline / backend down).
        if (isNetworkError(msg) && !isAuthError(msg)) {
          const cached = await getSavedUser();
          if (cached) {
            set({ user: cached, isLoggedIn: true, error: null });
            console.log('[Auth] Offline: using cached session for', cached.nama);
            return true;
          }
          // No cached user, can't restore offline
          return false;
        }
        // Auth error (401/403/expired) → token is bad, clear it
        await clearToken();
        console.log('[Auth] Token invalid, cleared:', msg);
        return false;
      }
    } catch (e: any) {
      console.log('[Auth] restoreSession error:', e?.message);
      return false;
    }
  },

  updateUser: (updates) => {
    const current = get().user;
    if (!current) return null;
    const updated = { ...current, ...updates };
    set({ user: updated });
    saveUser(updated).catch((e) => console.log('[Auth] saveUser warning:', e));
    return updated;
  },

  changePin: async (oldPin, newPin) => {
    try {
      await authApi.changePin(oldPin, newPin);
      set({ error: null });
      return true;
    } catch (e: any) {
      const msg = e?.message || 'Gagal mengganti PIN';
      set({ error: msg });
      console.log('[Auth] changePin failed:', msg);
      return false;
    }
  },
}));
