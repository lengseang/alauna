/** Static design tokens (identical in both themes). Colors live in palette.ts. */

/** Spacing: 4pt grid. Use these, never literals. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 20, pill: 999 } as const;

/** The ONLY font sizes in the app (sp). Nothing below 14. The wordmark reuses 28. */
export const size = { sm: 14, md: 16, lg: 20, xl: 28 } as const;

/** Minimum touch target (dp). */
export const hit = 48;

/** Icons are always 24dp with a 1.75 stroke. */
export const icon = { size: 24, stroke: 1.75 } as const;

/** Durations (ms). Enter slower than exit; nothing above 400 for UI feedback. */
export const motion = { fast: 150, base: 250, slow: 400 } as const;

/** Resolved font families. Undefined = font not loaded (system font + fontWeight is used instead). */
export interface FontFamilies {
  regular?: string;
  semibold?: string;
  wordmark?: string;
}
