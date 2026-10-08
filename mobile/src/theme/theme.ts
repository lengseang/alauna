import type { TextStyle } from 'react-native';
import { palettes, schemeName, type Palette, type Scheme } from './palette';
import { hit, motion, radius, size, space, type FontFamilies } from './tokens';

/**
 * Text roles. Four sizes (14/16/20/28) + the wordmark, two weights (400/600):
 *  body 16 regular | strong 16 semibold | small 14 regular | label 14 semibold | title 20 | display 28 | wordmark Cinzel 28
 */
export type TextVariant = 'body' | 'strong' | 'small' | 'label' | 'title' | 'display' | 'wordmark';

export interface Theme {
  scheme: Scheme;
  isDark: boolean;
  /** 'Nyx' or 'Helios'. */
  name: string;
  colors: Palette;
  space: typeof space;
  radius: typeof radius;
  size: typeof size;
  hit: number;
  motion: typeof motion;
  type: Record<TextVariant, TextStyle>;
  /** True when the OS asks for reduced motion: skip loops and slides. */
  reduceMotion: boolean;
}

/** Pure function (no React) so it can be unit-tested under Node. */
export function buildTheme(scheme: Scheme, fonts: FontFamilies, reduceMotion: boolean): Theme {
  const face = (weight: 'regular' | 'semibold'): TextStyle => {
    const family = fonts[weight];
    return family ? { fontFamily: family } : { fontWeight: weight === 'semibold' ? '600' : '400' };
  };
  const t = (fontSize: number, lineHeight: number, weight: 'regular' | 'semibold'): TextStyle => ({ fontSize, lineHeight, ...face(weight) });
  return {
    scheme,
    isDark: scheme === 'dark',
    name: schemeName[scheme],
    colors: palettes[scheme],
    space,
    radius,
    size,
    hit,
    motion,
    reduceMotion,
    type: {
      body: t(size.md, 24, 'regular'),
      strong: t(size.md, 24, 'semibold'),
      small: t(size.sm, 20, 'regular'),
      label: t(size.sm, 20, 'semibold'),
      title: t(size.lg, 28, 'semibold'),
      display: t(size.xl, 36, 'semibold'),
      wordmark: { fontSize: size.xl, lineHeight: 36, letterSpacing: 4, ...(fonts.wordmark ? { fontFamily: fonts.wordmark } : { fontWeight: '700' }) },
    },
  };
}
