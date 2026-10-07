import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { icon as iconToken, useTheme } from '../theme';

/**
 * The whole icon set: ten simple strokes, 24dp, 1.75 stroke, round caps. Nothing else ships.
 * Rule: a screen shows at most 4 icons (the drawer rows count as one group). Icons never replace a label on a Button.
 */
const PATHS = {
  menu: 'M4 7h16M4 12h16M4 17h10',
  compose: 'M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4Z',
  send: 'M12 19V5M5.5 11.5 12 5l6.5 6.5',
  stop: 'M8 6h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z',
  back: 'M19 12H5M11.5 5.5 5 12l6.5 6.5',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12.5 9.5 17 19 7.5',
  models: 'M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14',
  persona: 'M5 5.5C8.5 4 15.5 4 19 5.5V11a7 7 0 0 1-14 0ZM8.5 10c.7-.9 2-.9 2.7 0M12.8 10c.7-.9 2-.9 2.7 0M9 13.5c1.7 1.6 4.3 1.6 6 0',
  settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M13 7a2 2 0 1 0 4 0a2 2 0 1 0-4 0M7 17a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
} as const;

export type IconName = keyof typeof PATHS;

interface IconProps {
  name: IconName;
  /** Defaults to the text color. */
  color?: string;
  /** Keep 24 except for illustration. */
  size?: number;
  /** Degrees. `back` rotated 180 is the "go forward" arrow; rotated -90 is a down arrow. */
  rotate?: number;
}

/** Decorative: the parent control carries the accessibility label. */
export function Icon({ name, color, size = iconToken.size, rotate }: IconProps) {
  const { colors } = useTheme();
  const c = color ?? colors.text;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={name === 'stop' ? c : 'none'}
      stroke={c}
      strokeWidth={iconToken.stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={rotate ? { transform: [{ rotate: `${rotate}deg` }] } : undefined}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Path d={PATHS[name]} />
    </Svg>
  );
}
