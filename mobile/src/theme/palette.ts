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
  bg: '#0A0818',
  surface: '#14112E',
  surfaceAlt: '#1F1A45',
  border: '#2A245C',
  borderStrong: '#9D4EDD',
  text: '#F5F3FF',
  muted: '#A5A0CD',
  accent: '#F472B6',
  accentSoft: 'rgba(244,114,182,0.14)',
  onAccent: '#0A0818',
  danger: '#FB7185',
  dangerSoft: 'rgba(251,113,133,0.14)',
  scrim: 'rgba(5,4,12,0.72)',
  glow: '#EC4899',
};

export const helios: Palette = {
  bg: '#F5F3FF',
  surface: '#FFFFFF',
  surfaceAlt: '#ECE8FD',
  border: '#DCD7F5',
  borderStrong: '#6366F1',
  text: '#191538',
  muted: '#5C567E',
  accent: '#5B21B6',
  accentSoft: 'rgba(91,33,182,0.08)',
  onAccent: '#FFFFFF',
  danger: '#B91C1C',
  dangerSoft: 'rgba(185,28,28,0.09)',
  scrim: 'rgba(25,21,56,0.45)',
  glow: '#8B5CF6',
};

export const palettes: Record<Scheme, Palette> = { dark: nyx, light: helios };

/** Display names used in the theme picker. */
export const schemeName: Record<Scheme, string> = { dark: 'Nyx', light: 'Helios' };
