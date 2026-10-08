import type { TextStyle } from 'react-native';
import { palettes, schemeName, type Palette, type Scheme } from './palette.ts';
import { hit, line, motion, radius, size, space, textScales, type FontFamilies, type TextScale } from './tokens.ts';

/**
 * Text roles. Four sizes (14/16/20/28) x the user's text scale, two Inter weights, Cinzel for titles only.
 *  body 16 | strong 16 semibold | small 14 | label 14 semibold | title 20 semibold (Inter: card/sheet titles)
 *  heading 20 Cinzel (screen titles) | section 14 Cinzel tracked (section headers) | numeric 20 semibold tabular (stats)
 *  display 28 | wordmark 28 Cinzel tracked
 */
export type TextVariant = 'body' | 'strong' | 'small' | 'label' | 'title' | 'heading' | 'section' | 'numeric' | 'display' | 'wordmark';

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
  /** Hairline width (dp). */
  line: number;
  motion: typeof motion;
  type: Record<TextVariant, TextStyle>;
  /** True when the OS or the in-app setting asks for reduced motion: loops stop, transitions are instant. */
  reduceMotion: boolean;
  /** User's text-size multiplier (1, 1.15, 1.3). Already applied to `type`. */
  textScale: number;
  /** In-app haptics switch (Appearance). Buttons read it. */
  haptics: boolean;
}

/** Pure function (no React) so it can be unit-tested under Node. */
export function buildTheme(scheme: Scheme, fonts: FontFamilies, reduceMotion: boolean, textScale = 1, haptics = true): Theme {
  const k = Math.max(1, textScale);
  const face = (weight: 'regular' | 'semibold' | 'wordmark'): TextStyle => {
    const family = fonts[weight];
    return family ? { fontFamily: family } : { fontWeight: weight === 'regular' ? '400' : weight === 'semibold' ? '600' : '700' };
  };
  const t = (fontSize: number, lineHeight: number, weight: 'regular' | 'semibold' | 'wordmark', extra?: TextStyle): TextStyle => ({
    fontSize: Math.round(fontSize * k),
    lineHeight: Math.round(lineHeight * k),
    ...face(weight),
    ...extra,
  });
  return {
    scheme,
    isDark: scheme === 'dark',
    name: schemeName[scheme],
    colors: palettes[scheme],
    space,
    radius,
    size,
    hit,
    line,
    motion,
    reduceMotion,
    textScale: k,
    haptics,
    type: {
      body: t(size.md, 24, 'regular'),
      strong: t(size.md, 24, 'semibold'),
      small: t(size.sm, 20, 'regular'),
      label: t(size.sm, 20, 'semibold'),
      title: t(size.lg, 28, 'semibold'),
      heading: t(size.lg, 28, 'wordmark', { letterSpacing: 1 }),
      section: t(size.sm, 20, 'wordmark', { letterSpacing: 1.5 }),
      numeric: t(size.lg, 28, 'semibold', { fontVariant: ['tabular-nums'] }),
      display: t(size.xl, 36, 'semibold'),
      wordmark: t(size.xl, 36, 'wordmark', { letterSpacing: 4 }),
    },
  };
}

export type ThemePref = 'system' | 'light' | 'dark';
/** 'system' follows the phone's "remove animations"; 'reduce' forces calm motion in-app. */
export type MotionPref = 'system' | 'reduce';

/** Appearance choices persisted by prefs.ts (Settings > Appearance). */
export interface AppearancePrefs {
  pref: ThemePref;
  textScale: TextScale;
  motion: MotionPref;
  haptics: boolean;
}

export const defaultPrefs: AppearancePrefs = { pref: 'system', textScale: 1, motion: 'system', haptics: true };

/** Validates every field independently: one bad value never discards the others. */
export function parsePrefs(raw: unknown): AppearancePrefs {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    pref: o.pref === 'light' || o.pref === 'dark' || o.pref === 'system' ? o.pref : defaultPrefs.pref,
    textScale: (textScales as readonly unknown[]).includes(o.textScale) ? (o.textScale as TextScale) : defaultPrefs.textScale,
    motion: o.motion === 'reduce' ? 'reduce' : 'system',
    haptics: typeof o.haptics === 'boolean' ? o.haptics : defaultPrefs.haptics,
  };
}
