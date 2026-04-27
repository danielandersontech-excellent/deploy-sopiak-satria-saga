/**
 * AUTH STORE - Zustand (Express.js backend version)
 * Replaces Supabase Auth with JWT token auth
 */
import { create } from 'zustand';
import { authApi, setToken, clearToken, getToken, saveUser, getSavedUser, setRefreshToken } from '../lib/apiClient';

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
  updateUser: (updates: Partial<User>) => void;
  changePin: (oldPin: string, newPin: string) => Promise<boolean>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoggedIn: false,
  loading: false,
  error: null,

  login: async (nrp, pin) => {
    set({ loading: true, error: null });
    try {
      const result = await authApi.login(nrp, pin);
      // Token & refresh_token already saved by authApi.login
      const user = result.user;
      await saveUser(user);
      set({ user, isLoggedIn: true, loading: false });
      console.log('[Auth] Login OK:', user.nama, user.role);
      return true;
    } catch (err: any) {
      const msg = err.message || 'Login gagal';
      const isNetworkError = msg.includes('Network') || msg.includes('fetch') || msg.includes('Failed') || msg.includes('timeout') || msg.includes('Gagal konek') || msg.includes('server') || msg.includes('Backend');
      const displayMsg = isNetworkError
        ? 'Gagal konek ke backend. Pastikan backend sudah dijalankan (cd backend && npm run dev)'
        : msg;
      console.log('[Auth] Login failed:', displayMsg);
      set({ loading: false, error: displayMsg });
      return false;
    }
  },

  loginAsRole: async (role) => {
    const roleMap: Record<string, { nrp: string; pin: string }> = {
      anggota:    { nrp: 'AGT001', pin: '123456' },
      komandan:   { nrp: 'KMD001', pin: '123456' },
      supervisor: { nrp: 'SPV001', pin: '123456' },
      admin:      { nrp: 'ADM001', pin: '123456' },
      klien:      { nrp: 'K001', pin: '123456' },
    };
    const cred = roleMap[role];
    if (!cred) return false;
    return get().login(cred.nrp, cred.pin);
  },

  logout: async () => {
    try { await authApi.logout(); } catch {}
    await clearToken();
    set({ user: null, isLoggedIn: false, error: null });
    console.log('[Auth] Logged out');
  },

  restoreSession: async () => {
    try {
      const token = await getToken();
      if (!token) return false;

      // Verify token by calling /me
      const user = await authApi.me();
      await saveUser(user);
      set({ user, isLoggedIn: true });
      console.log('[Auth] Session restored:', user.nama);
      return true;
    } catch {
      // Token invalid/expired - try cached user
      const cached = await getSavedUser();
      if (cached) {
        set({ user: cached, isLoggedIn: true });
        return true;
      }
      await clearToken();
      return false;
    }
  },

  updateUser: (updates) => {
    const current = get().user;
    if (current) {
      const updated = { ...current, ...updates };
      set({ user: updated });
      saveUser(updated);
    }
  },

  changePin: async (oldPin, newPin) => {
    try {
      await authApi.changePin(oldPin, newPin);
      return true;
    } catch {
      return false;
    }
  },
}));
