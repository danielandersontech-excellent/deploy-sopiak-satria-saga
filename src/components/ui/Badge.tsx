import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Radius } from '../../constants';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'default' | 'purple';

interface BadgeProps {
  text: string;
  variant?: BadgeVariant;
  size?: 'small' | 'medium';
  dot?: boolean;
  style?: any;
}

const variantColors: Record<BadgeVariant, { bg: string; text: string; dot: string }> = {
  success: { bg: Colors.successSoft, text: Colors.successDark, dot: Colors.success },
  warning: { bg: Colors.warningSoft, text: Colors.warningDark, dot: Colors.warning },
  danger: { bg: Colors.dangerSoft, text: Colors.dangerDark, dot: Colors.danger },
  info: { bg: Colors.primarySoft, text: Colors.primaryDark, dot: Colors.primary },
  default: { bg: Colors.bgGray, text: Colors.textSecondary, dot: Colors.offline },
  purple: { bg: Colors.purpleSoft, text: Colors.purple, dot: Colors.purple },
};

export function Badge({ text, variant = 'default', size = 'small', dot, style }: BadgeProps) {
  const v = variantColors[variant];

  return (
    <View style={[styles.base, { backgroundColor: v.bg }, size === 'medium' && styles.medium, style]}>
      {dot && <View style={[styles.dot, { backgroundColor: v.dot }]} />}
      <Text
        style={[
          size === 'small' ? Typography.caption : Typography.badge,
          { color: v.text, fontWeight: '600' },
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

// Count badge (notification style)
export function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <View style={styles.countBadge}>
      <Text style={styles.countText}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
    gap: 4,
  },
  medium: {
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  countBadge: {
    backgroundColor: Colors.danger,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  countText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
});
