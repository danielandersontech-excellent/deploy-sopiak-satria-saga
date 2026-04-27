/**
 * ============================================
 * PT Sopiak Satria Saga - Color Palette v2.0
 * Consistent with web design tokens
 * ============================================
 */

export const Colors = {
  // === PRIMARY (Brand Blue) ===
  primary: '#1A56DB',
  primaryDark: '#1447B8',
  primaryLight: '#3B82F6',
  primarySoft: '#DBEAFE',
  primaryBg: '#EFF6FF',

  // === SECONDARY (Cyan) ===
  secondary: '#0EA5E9',
  secondaryDark: '#0284C7',
  secondaryLight: '#38BDF8',

  // === SUCCESS (Green) ===
  success: '#10B981',
  successDark: '#059669',
  successLight: '#34D399',
  successSoft: '#D1FAE5',
  successBg: '#ECFDF5',

  // === WARNING (Amber) ===
  warning: '#F59E0B',
  warningDark: '#D97706',
  warningLight: '#FBBF24',
  warningSoft: '#FEF3C7',
  warningBg: '#FFFBEB',

  // === DANGER (Red) ===
  danger: '#EF4444',
  dangerDark: '#DC2626',
  dangerLight: '#F87171',
  dangerSoft: '#FEE2E2',
  dangerBg: '#FEF2F2',

  // === PURPLE (Accent) ===
  purple: '#8B5CF6',
  purpleLight: '#A78BFA',
  purpleSoft: '#EDE9FE',

  // === TEXT ===
  textPrimary: '#F1F5F9',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  textWhite: '#FFFFFF',
  textLink: '#1A56DB',

  // === BACKGROUNDS (Dark first) ===
  bgWhite: '#FFFFFF',
  bgLight: '#F0F2F5',
  bgGray: '#F1F5F9',
  bgDark: '#0F172A',
  bgOverlay: 'rgba(0,0,0,0.5)',

  // Dark theme surfaces
  bgPrimary: '#0F172A',
  bgSecondary: '#1E293B',
  bgTertiary: '#334155',

  // === BORDERS ===
  border: '#334155',
  borderLight: '#1E293B',
  borderFocus: '#1A56DB',

  // === STATUS DOT ===
  online: '#10B981',
  away: '#F59E0B',
  busy: '#EF4444',
  offline: '#64748B',

  // === GRADIENT PAIRS (for menu cards) ===
  gradAbsensi: ['#1A56DB', '#3B82F6'],
  gradPatroli: ['#10B981', '#34D399'],
  gradLaporanHarian: ['#F59E0B', '#FBBF24'],
  gradLaporanKejadian: ['#EF4444', '#F87171'],
  gradSerahTerima: ['#8B5CF6', '#A78BFA'],
  gradProfil: ['#475569', '#64748B'],
} as const;
