import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme';

/** 1dp hairline in the decorative border color. Hidden from screen readers. */
export function Divider({ inset = 0, style }: { inset?: number; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ height: 1, backgroundColor: colors.border, marginLeft: inset }, style]} />;
}
