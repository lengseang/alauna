import React, { useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../theme';
import { meanderPath } from './logic';

export interface MeanderProps {
  /** Band height in dp (default 10). The pattern scales with it. */
  height?: number;
  /** accent = gold leaf / bronze at reduced strength (under section headers); border = quiet hairline. */
  tone?: 'accent' | 'border';
  /** Draw only this many keys, then a plain hairline to the end (the section-header fillet). Omit for a full band. */
  units?: number;
  style?: StyleProp<ViewStyle>;
}

/** Modern minimalist liquid glass hairline accent divider. Decorative, hidden from screen readers. */
export function Meander({ tone = 'accent', style }: MeanderProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          height: 1,
          backgroundColor: tone === 'accent' ? colors.accent : colors.border,
          opacity: tone === 'accent' ? 0.35 : 0.6,
          marginVertical: 4,
        },
        style,
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    />
  );
}
