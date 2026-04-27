/**
 * THEME PROVIDER - Dark Mode Support
 * v2.0: Colors consistent with web design tokens
 * Default: Dark mode
 * Usage: const { isDark, toggleTheme, theme } = useTheme();
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants';

export type ThemeMode = 'light' | 'dark';

interface ThemeColors {
  bg: string;
  bgCard: string;
  bgInput: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  borderLight: string;
  headerBg: string;
  headerText: string;
  tabBg: string;
  tabActive: string;
  tabInactive: string;
  shadowColor: string;
  danger: string;
  success: string;
  warning: string;
  primary: string;
  primarySoft: string;
  overlay: string;
}

interface ThemeState {
  mode: ThemeMode;
  isDark: boolean;
  theme: ThemeColors;
  toggleTheme: () => void;
  setMode: (mode: ThemeMode) => void;
}

const lightTheme: ThemeColors = {
  bg: '#F0F2F5',
  bgCard: '#FFFFFF',
  bgInput: '#F1F5F9',
  text: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  headerBg: Colors.primaryDark,
  headerText: '#FFFFFF',
  tabBg: '#FFFFFF',
  tabActive: Colors.primary,
  tabInactive: '#94A3B8',
  shadowColor: '#000000',
  danger: Colors.danger,
  success: Colors.success,
  warning: Colors.warning,
  primary: Colors.primary,
  primarySoft: Colors.primarySoft,
  overlay: 'rgba(0,0,0,0.5)',
};

const darkTheme: ThemeColors = {
  bg: '#0F172A',
  bgCard: '#1E293B',
  bgInput: '#334155',
  text: '#F1F5F9',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  border: '#334155',
  borderLight: '#1E293B',
  headerBg: '#1E293B',
  headerText: '#F1F5F9',
  tabBg: '#1E293B',
  tabActive: Colors.primary,
  tabInactive: '#64748B',
  shadowColor: '#000000',
  danger: Colors.danger,
  success: Colors.success,
  warning: Colors.warning,
  primary: Colors.primary,
  primarySoft: '#1E3A5F',
  overlay: 'rgba(0,0,0,0.7)',
};

export const useTheme = create<ThemeState>((set, get) => ({
  mode: 'dark',
  isDark: true,
  theme: darkTheme,
  toggleTheme: () => {
    const newMode = get().mode === 'light' ? 'dark' : 'light';
    const newTheme = newMode === 'dark' ? darkTheme : lightTheme;
    set({ mode: newMode, isDark: newMode === 'dark', theme: newTheme });
    AsyncStorage.setItem('@ptsss_theme', newMode);
  },
  setMode: (mode) => {
    const newTheme = mode === 'dark' ? darkTheme : lightTheme;
    set({ mode, isDark: mode === 'dark', theme: newTheme });
    AsyncStorage.setItem('@ptsss_theme', mode);
  },
}));

// Restore saved theme on app start
AsyncStorage.getItem('@ptsss_theme').then((saved) => {
  if (saved === 'light') {
    useTheme.setState({ mode: 'light', isDark: false, theme: lightTheme });
  }
  // Default stays dark if no saved preference
});
