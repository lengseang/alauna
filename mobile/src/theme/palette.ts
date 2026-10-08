/**
 * Two skies, one metal. Nyx = night indigo with gold leaf; Helios = sunlit marble with bronze. No second hue anywhere.
 * Every pairing promise below is asserted by test/theme.test.ts (WCAG AA: text 4.5:1, UI boundaries 3:1).
 */
export type Scheme = 'dark' | 'light';

export interface Palette {
  /** Screen background. */
  bg: string;
  /** Sheets, drawer, composer, cards. */
  surface: string;
  /** Raised or pressed surface (user block, toast, selected segment). */
  surfaceAlt: string;
  /** Decorative hairlines only (dividers, card edges, meander). Fails 3:1 on purpose: never the only cue for a control. */
  border: string;
  /** Boundary of anything interactive (inputs, outlined buttons, switch track, tags). >= 3:1 on bg and surface. */
  borderStrong: string;
  text: string;
  /** Secondary text. >= 4.5:1 on bg, surface and surfaceAlt. */
  muted: string;
  /** The only brand hue: gold leaf (Nyx) / bronze (Helios). Text-safe on bg, surface and surfaceAlt. */
  accent: string;
  /** Accent wash for selected states. Put `text` on it, not `accent`. */
  accentSoft: string;
  /** Text/icons placed ON an accent fill. */
  onAccent: string;
  danger: string;
  dangerSoft: string;
  /** Modal backdrop (40-66% opaque). */
  scrim: string;
  /** Decorative light (stars, sun, eclipse corona). Never used for text. */
  glow: string;
}

export const nyx: Palette = {
  bg: '#080A17',
  surface: '#0F1329',
  surfaceAlt: '#171C38',
  border: '#262C4F',
  borderStrong: '#5D679B',
  text: '#EDEFF8',
  muted: '#9AA2C6',
  accent: '#E6C76A',
  accentSoft: 'rgba(230,199,106,0.12)',
  onAccent: '#080A17',
  danger: '#FF8E8E',
  dangerSoft: 'rgba(255,142,142,0.12)',
  scrim: 'rgba(4,5,12,0.66)',
  glow: '#EDEFF8',
};

export const helios: Palette = {
  bg: '#FAF6EC',
  surface: '#F3ECDB',
  surfaceAlt: '#EAE0C9',
  border: '#D6C8A7',
  borderStrong: '#8C7B52',
  text: '#29231A',
  muted: '#655941',
  accent: '#8A5A00',
  accentSoft: 'rgba(138,90,0,0.08)',
  onAccent: '#FFFFFF',
  danger: '#B3261E',
  dangerSoft: 'rgba(179,38,30,0.09)',
  scrim: 'rgba(41,35,26,0.48)',
  glow: '#F2C14E',
};

export const palettes: Record<Scheme, Palette> = { dark: nyx, light: helios };

/** Display names used in the theme picker. */
export const schemeName: Record<Scheme, string> = { dark: 'Nyx', light: 'Helios' };
