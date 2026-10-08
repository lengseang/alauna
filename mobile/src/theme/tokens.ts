/** Static design tokens (identical in both themes). Colors live in palette.ts. See docs/DESIGN.md ("Temple"). */

/** Spacing: 4pt grid. Use these, never literals. Screen gutter = lg (16). */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/**
 * Temple geometry: every corner is square. The keys stay so older call sites (`radius.md`, `radius.pill`) compile and
 * render square. Never write a literal borderRadius; the only round things are the Eclipse disc and icon glyphs.
 */
export const radius = { none: 0, sm: 0, md: 0, lg: 0, pill: 0 } as const;

/** The ONLY font sizes in the app (sp), before the user's text-size choice. Nothing below 14. */
export const size = { sm: 14, md: 16, lg: 20, xl: 28 } as const;

/** Minimum touch target (dp). */
export const hit = 48;

/** Hairline rule width (dp). Dividers, card edges, inputs, meander. */
export const line = 1;

/** Icons are always 24dp, 1.5 stroke, square caps and mitred joins (sharp, like cut stone). */
export const icon = { size: 24, stroke: 1.5 } as const;

/**
 * Durations (ms). Enter slower than exit; nothing above 400 for UI feedback.
 * push = stack slide in, pop = slide out.
 */
export const motion = { fast: 150, base: 250, slow: 400, push: 320, pop: 240 } as const;

/** Text-size choices offered in Appearance (multiplies every size; never below 1 so nothing drops under 14sp). */
export const textScales = [1, 1.15, 1.3] as const;
export type TextScale = (typeof textScales)[number];

/** Resolved font families. Undefined = font not loaded (system font + fontWeight is used instead). */
export interface FontFamilies {
  regular?: string;
  semibold?: string;
  wordmark?: string;
}
