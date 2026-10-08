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

/** The Greek-key rule: a hairline meander band, or a few keys running into a plain rule. Decorative, hidden from screen readers. */
export function Meander({ height = 10, tone = 'accent', units, style }: MeanderProps) {
  const { colors, line } = useTheme();
  const [width, setWidth] = useState(0);
  const pad = line; // keep the stroke inside the box
  return (
    <View
      onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
      style={[{ height: height + pad * 2, overflow: 'hidden' }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      {width > 0 ? (
        <Svg width={width} height={height + pad * 2}>
          <Path
            d={meanderPath(width - pad * 2, height, units)}
            transform={`translate(${pad} ${pad})`}
            fill="none"
            stroke={tone === 'accent' ? colors.accent : colors.border}
            strokeOpacity={tone === 'accent' ? 0.55 : 1}
            strokeWidth={line}
            strokeLinecap="square"
            strokeLinejoin="miter"
          />
        </Svg>
      ) : null}
    </View>
  );
}
