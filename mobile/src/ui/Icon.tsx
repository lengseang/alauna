import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { icon as iconToken, useTheme } from '../theme';

/**
 * One coherent stroke set: 24dp grid, 1.5 stroke, square caps, mitred joins (cut stone, no rounded corners).
 * Only `stop` and `more` are filled. Rule: a view shows few icons (Chat: menu, new, attach, send/stop); icons never
 * replace a label on a Button, and every IconButton carries a spoken label.
 */
const D = {
  menu: 'M4 7h16M4 12h16M4 17h10',
  compose: 'M11 4H4v16h16v-7M17.5 3.5l3 3L11 16H8v-3z',
  send: 'M12 20V5M5.5 11.5 12 5l6.5 6.5',
  stop: 'M7 7h10v10H7z',
  back: 'M20 12H4.5M11 5.5 4.5 12l6.5 6.5',
  chevron: 'M9 5l7 7-7 7',
  plus: 'M12 4v16M4 12h16',
  check: 'M4.5 12.5l5 5 10-10',
  close: 'M5.5 5.5l13 13M18.5 5.5l-13 13',
  more: 'M4.5 10.5h3v3h-3zM10.5 10.5h3v3h-3zM16.5 10.5h3v3h-3z',
  chat: 'M4 5h16v11H11l-5 4v-4H4z',
  search: 'M10.5 4a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13zM15.5 15.5 20.5 20.5',
  filter: 'M4 5h16l-6 7.5V18l-4 2v-7.5z',
  sort: 'M7 4v15.5M3.5 16 7 19.5 10.5 16M13 6h8M13 11h6M13 16h3.5',
  download: 'M12 3.5v12M7 10.5l5 5 5-5M4 20h16',
  /** Model Vault: a temple front. */
  models: 'M3 9 12 4l9 5zM5.5 9.5v8.5M10 9.5v8.5M14 9.5v8.5M18.5 9.5v8.5M3 20.5h18',
  pause: 'M8 5v14M16 5v14',
  play: 'M7 4.5v15L19 12z',
  mic: 'M9 3h6v10H9zM5.5 10.5v1a6.5 6.5 0 0 0 13 0v-1M12 18v3M8.5 21h7',
  camera: 'M3 7h4.5l2-3h5l2 3H21v13H3zM12 9.5a3.75 3.75 0 1 0 0 7.5a3.75 3.75 0 1 0 0-7.5z',
  image: 'M3 4h18v16H3zM3 16l5-5 4 4 3-3 6 6M15 7.5h2.5V10H15z',
  file: 'M6 3h8l5 5v13H6zM14 3v5h5M9 13h6M9 17h6',
  attach: 'M16.5 7v8.5a4.5 4.5 0 0 1-9 0V6a3 3 0 0 1 6 0v9a1.5 1.5 0 0 1-3 0V8',
  settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M13 5h4v4h-4zM7 15h4v4H7z',
  /** Soul / persona: a theatre mask, cut square. */
  persona: 'M5 4h14v8l-7 8-7-8zM8 9.5h3M13 9.5h3M10 14h4',
  /** Memory: stacked tablets (Mnemosyne). */
  memory: 'M12 3l9 5-9 5-9-5zM3 12.5l9 5 9-5M3 16.5l9 5 9-5',
  shield: 'M12 3l8 3v7l-8 8-8-8V6z',
  lock: 'M5 11h14v10H5zM8 11V4h8v7M12 15v2.5',
  storage: 'M4 4h16v6H4zM4 14h16v6H4zM7 7h2M7 17h2',
  chip: 'M7 7h10v10H7zM10 10h4v4h-4zM9.5 3v4M14.5 3v4M9.5 17v4M14.5 17v4M3 9.5h4M3 14.5h4M17 9.5h4M17 14.5h4',
  speaker: 'M4 9h4l5-4v14l-5-4H4zM16 9.5l1.5 2.5-1.5 2.5M19 7l3 5-3 5',
  bolt: 'M13.5 3 5 13.5h6.5L10.5 21 19 10.5h-6.5z',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6',
  pin: 'M8.5 3h7M10 3v6l-3.5 4h11L14 9V3M12 13v8',
  edit: 'M15 4l5 5L9 20H4v-5zM12.5 6.5l5 5',
  incognito: 'M2.5 12C5 7.5 8.5 5.5 12 5.5s7 2 9.5 6.5c-2.5 4.5-6 6.5-9.5 6.5S5 16.5 2.5 12zM12 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5zM4 4l16 16',
  sun: 'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1',
  moon: 'M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
} as const;

/** Alias names used in the plan (new, soul, voice, turbo, compute, eye-off) map onto the same glyphs. */
const PATHS = { ...D, new: D.compose, soul: D.persona, voice: D.speaker, turbo: D.bolt, compute: D.chip, 'eye-off': D.incognito } as const;
const FILLED = new Set<string>(['stop', 'more']);

export type IconName = keyof typeof PATHS;
export const iconNames = Object.keys(PATHS) as IconName[];

export interface IconProps {
  name: IconName;
  /** Defaults to the text color. */
  color?: string;
  /** Keep 24 except inside a Tag (16) or for illustration. */
  size?: number;
  /** Degrees. `chevron` rotated 90 is a down chevron; `back` rotated 180 is a forward arrow. */
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
      fill={FILLED.has(name) ? c : 'none'}
      stroke={c}
      strokeWidth={iconToken.stroke}
      strokeLinecap="square"
      strokeLinejoin="miter"
      style={rotate ? { transform: [{ rotate: `${rotate}deg` }] } : undefined}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Path d={PATHS[name]} />
    </Svg>
  );
}
