import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Radius, Shadows, ButtonSize } from '../../constants';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'success' | 'warning' | 'ghost';
type ButtonSizeType = 'small' | 'medium' | 'large';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSizeType;
  icon?: keyof typeof Ionicons.glyphMap;
  iconRight?: boolean;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

const variantStyles: Record<ButtonVariant, { bg: string; text: string; border: string }> = {
  primary: { bg: Colors.primary, text: '#ffffff', border: Colors.primary },
  secondary: { bg: '#ffffff', text: Colors.primary, border: Colors.primary },
  outline: { bg: 'transparent', text: Colors.textPrimary, border: Colors.border },
  danger: { bg: Colors.danger, text: '#ffffff', border: Colors.danger },
  success: { bg: Colors.success, text: '#ffffff', border: Colors.success },
  warning: { bg: Colors.warning, text: '#ffffff', border: Colors.warning },
  ghost: { bg: 'transparent', text: Colors.primary, border: 'transparent' },
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  icon,
  iconRight,
  loading,
  disabled,
  fullWidth,
  style,
  textStyle,
}: ButtonProps) {
  const v = variantStyles[variant];
  const height = ButtonSize[size];
  const iconSize = size === 'small' ? 16 : 20;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
      style={[
        styles.base,
        {
          height,
          backgroundColor: v.bg,
          borderColor: v.border,
          opacity: disabled ? 0.5 : 1,
        },
        fullWidth && styles.fullWidth,
        variant !== 'ghost' && Shadows.sm,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={v.text} />
      ) : (
        <>
          {icon && !iconRight && (
            <Ionicons name={icon} size={iconSize} color={v.text} style={{ marginRight: 8 }} />
          )}
          <Text
            style={[
              size === 'small' ? Typography.buttonSmall : Typography.button,
              { color: v.text },
              textStyle,
            ]}
          >
            {title}
          </Text>
          {icon && iconRight && (
            <Ionicons name={icon} size={iconSize} color={v.text} style={{ marginLeft: 8 }} />
          )}
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    borderWidth: 1.5,
    paddingHorizontal: 20,
  },
  fullWidth: {
    width: '100%',
  },
});
