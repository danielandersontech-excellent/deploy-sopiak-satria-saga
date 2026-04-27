import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Colors, Spacing, Radius, Shadows } from '../../constants';
import { useTheme } from '../../lib/theme';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: 'default' | 'bordered' | 'alert';
  borderColor?: string;
  padding?: number;
}

export function Card({
  children,
  style,
  variant = 'default',
  borderColor,
  padding = Spacing.base,
}: CardProps) {
  const { theme, isDark } = useTheme();

  return (
    <View
      style={[
        styles.base,
        {
          padding,
          backgroundColor: theme.bgCard,
        },
        isDark ? { elevation: 0, shadowOpacity: 0, borderWidth: 1, borderColor: theme.border } : Shadows.sm,
        variant === 'bordered' && { borderLeftWidth: 4, borderLeftColor: borderColor || theme.primary },
        variant === 'alert' && { borderWidth: 1, borderColor: borderColor || theme.danger },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.lg,
  },
});
