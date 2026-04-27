import React from 'react';
import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius, Shadows } from '../../constants';
import { Badge } from './Badge';
import { useTheme } from '../../lib/theme';

interface MenuCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  gradient?: [string, string];
  gradientColor?: string;
  onPress: () => void;
  badge?: string;
  badgeText?: string;
  badgeVariant?: 'success' | 'warning' | 'danger' | 'info' | 'default';
  progress?: string;
  size?: 'normal' | 'small';
}

export function MenuCard({
  icon, label, gradient, gradientColor, onPress,
  badge, badgeText, badgeVariant = 'danger', progress, size = 'normal',
}: MenuCardProps) {
  const { theme, isDark } = useTheme();
  const bgColor = gradientColor || (gradient ? gradient[0] : Colors.primary);
  const displayBadge = badge || badgeText;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        { backgroundColor: theme.bgCard },
        size === 'small' && styles.cardSmall,
        isDark ? { borderWidth: 1, borderColor: theme.border } : Shadows.sm,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.iconCircle, { backgroundColor: bgColor }]}>
        <Ionicons name={icon} size={size === 'small' ? 22 : 26} color="#ffffff" />
      </View>
      <Text style={[styles.label, size === 'small' && styles.labelSmall, { color: theme.text }]} numberOfLines={2}>{label}</Text>
      {displayBadge && (
        <View style={styles.badgeWrap}>
          <Badge text={displayBadge} variant={badgeVariant} />
        </View>
      )}
      {progress && <Text style={[styles.progress, { color: theme.textMuted }]}>{progress}</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    padding: 12,
    alignItems: 'center',
    width: '30%',
    marginHorizontal: '1.66%',
    marginVertical: 6,
    minHeight: 105,
    justifyContent: 'center',
    gap: 6,
  },
  cardSmall: { minHeight: 88, padding: 10 },
  iconCircle: {
    width: 48, height: 48, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  label: {
    ...Typography.smallBold,
    textAlign: 'center', lineHeight: 16,
  },
  labelSmall: { fontSize: 11 },
  badgeWrap: { position: 'absolute', top: 4, right: 4 },
  progress: { ...Typography.caption },
});
