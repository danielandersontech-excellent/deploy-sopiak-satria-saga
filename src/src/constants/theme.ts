/**
 * PT Sopiak Satria Saga - Mobile Design System v2.0
 * Consistent with web design tokens
 * 
 * EXPORTS (PascalCase for backward compatibility with screens):
 *   Typography, Spacing, Radius, Shadows, ButtonSize
 * Also exports camelCase for new code:
 *   colors, spacing, borderRadius, typography, shadows
 */

// === COLORS (also exported separately via colors.ts) ===
export const colors = {
  primary: '#1A56DB',
  primaryHover: '#1447B8',
  secondary: '#0EA5E9',
  brandGlow: 'rgba(26, 86, 219, 0.25)',
  bgPrimary: '#0F172A',
  bgSecondary: '#1E293B',
  bgTertiary: '#334155',
  textPrimary: '#0F172A',     // FIX: was #F1F5F9 (white)
  textSecondary: '#475569',   // FIX: was #94A3B8
  textMuted: '#64748B',
  success: '#10B981',
  successBg: 'rgba(16, 185, 129, 0.12)',
  danger: '#EF4444',
  dangerBg: 'rgba(239, 68, 68, 0.12)',
  warning: '#F59E0B',
  warningBg: 'rgba(245, 158, 11, 0.12)',
  info: '#0EA5E9',
  purple: '#8B5CF6',
  card: '#FFFFFF',            // FIX: was #1E293B (dark)
  border: '#E2E8F0',         // FIX: was #334155 (dark)
  inputBg: '#F1F5F9',        // FIX: was #0F172A (dark)
  white: '#FFFFFF',
  black: '#000000',
};

// === FONT FAMILIES ===
export const Fonts = {
  heading: 'Sora_700Bold',
  headingBold: 'Sora_800ExtraBold',
  headingSemiBold: 'Sora_600SemiBold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemiBold: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
};

// === TYPOGRAPHY (PascalCase export for screens) ===
export const Typography = {
  h1: { fontSize: 28, fontWeight: '800' as const, fontFamily: Fonts.headingBold, letterSpacing: -0.5 },
  h2: { fontSize: 22, fontWeight: '700' as const, fontFamily: Fonts.heading, letterSpacing: -0.3 },
  h3: { fontSize: 18, fontWeight: '700' as const, fontFamily: Fonts.heading },
  body: { fontSize: 14, fontWeight: '400' as const, fontFamily: Fonts.body, lineHeight: 20 },
  bodyBold: { fontSize: 14, fontWeight: '600' as const, fontFamily: Fonts.bodySemiBold, lineHeight: 20 },
  caption: { fontSize: 12, fontWeight: '400' as const, fontFamily: Fonts.body, lineHeight: 16 },
  small: { fontSize: 11, fontWeight: '400' as const, fontFamily: Fonts.body },
  smallBold: { fontSize: 11, fontWeight: '600' as const, fontFamily: Fonts.bodySemiBold },
  button: { fontSize: 15, fontWeight: '700' as const, fontFamily: Fonts.heading },
  buttonSmall: { fontSize: 13, fontWeight: '600' as const, fontFamily: Fonts.bodySemiBold },
  badge: { fontSize: 10, fontWeight: '700' as const, fontFamily: Fonts.bodySemiBold, textTransform: 'uppercase' as const },
};

// camelCase alias
export const typography = Typography;

// === SPACING (PascalCase export for screens) ===
export const Spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  base: 16,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  huge: 48,
};

// camelCase alias
export const spacing = Spacing;

// === RADIUS (PascalCase export for screens) ===
export const Radius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
};

// camelCase alias
export const borderRadius = Radius;

// === SHADOWS (PascalCase export for screens) ===
export const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
};

// camelCase alias
export const shadows = Shadows;

// === BUTTON SIZE (for backward compatibility) ===
export const ButtonSize: Record<string, number> = {
  small: 36,
  medium: 44,
  large: 52,
};

// === TOUCH TARGET ===
export const TOUCH_TARGET_MIN = 44;

export default { colors, Typography, Fonts, Spacing, Radius, Shadows, ButtonSize, TOUCH_TARGET_MIN };
