/**
 * Two palettes, one gold. Nyx = night sky, Helios = day sun. No second hue anywhere.
 * Every text/background pair below is >= 4.5:1 (borderStrong >= 3:1); measured ratios live in docs/DESIGN.md.
 */
export type Scheme = 'dark' | 'light';

export interface Palette {
  /** Screen background. */
  bg: string;
  /** Cards, sheets, drawer. */
  surface: string;
  /** Raised or pressed surface (user bubble, toast, input fill). */
  surfaceAlt: string;
  /** Decorative hairlines only (dividers). Fails 3:1 on purpose: never the only cue for a control. */
  border: string;
  /** Boundary of anything interactive (inputs, outlined buttons, composer). >= 3:1. */
  borderStrong: string;
  text: string;
  /** Secondary text. Passes 4.5:1 on bg, surface and surfaceAlt. */
  muted: string;
  /** The only brand hue: starlight (dark) / sunlight (light). Text-safe on bg and surface. */
  accent: string;
  /** Accent wash for selected states. Put `text`, not `accent`, on top of it. */
  accentSoft: string;
  /** Text/icons placed ON an accent fill. */
  onAccent: string;
  danger: string;
  dangerSoft: string;
  /** Modal backdrop (40-60% opaque). */
  scrim: string;
  /** Decorative glow (stars, sun). Never used for text. */
  glow: string;
}

export const nyx: Palette = {
  bg: '#0A0D1C',
  surface: '#141935',
  surfaceAlt: '#1B2246',
  border: '#2E3660',
  borderStrong: '#5F6AA0',
  text: '#EEF0FA',
  muted: '#9EA7CB',
  accent: '#E6C76A',
  accentSoft: 'rgba(230,199,106,0.14)',
  onAccent: '#0A0D1C',
  danger: '#FF8B8B',
  dangerSoft: 'rgba(255,139,139,0.14)',
  scrim: 'rgba(5,7,16,0.62)',
  glow: '#EEF0FA',
};

export const helios: Palette = {
  bg: '#FBF6EA',
  surface: '#F3EBD5',
  surfaceAlt: '#EBE0C2',
  border: '#CDBE98',
  borderStrong: '#8F7F55',
  text: '#2B2417',
  muted: '#675B40',
  accent: '#8A5A00',
  accentSoft: 'rgba(138,90,0,0.07)',
  onAccent: '#FFFFFF',
  danger: '#B3261E',
  dangerSoft: 'rgba(179,38,30,0.10)',
  scrim: 'rgba(43,36,23,0.48)',
  glow: '#F2C14E',
};

export const palettes: Record<Scheme, Palette> = { dark: nyx, light: helios };

/** Display names used in the theme picker. */
export const schemeName: Record<Scheme, string> = { dark: 'Nyx', light: 'Helios' };
