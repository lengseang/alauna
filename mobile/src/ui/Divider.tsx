import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme';

/** 1dp hairline rule in the decorative border color. Hidden from screen readers. `inset` indents the left end. */
export function Divider({ inset = 0, style }: { inset?: number; style?: StyleProp<ViewStyle> }) {
  const { colors, line } = useTheme();
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ height: line, backgroundColor: colors.border, marginLeft: inset }, style]} />;
}
