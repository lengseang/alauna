/**
 * WCAG 2.x contrast math (pure, no React) so palette claims are computed by a test, never typed by hand.
 * Accepts '#RRGGBB' and 'rgba(r,g,b,a)'; translucent colors are composited over a solid backdrop first.
 */
type RGB = [number, number, number];

export function parseColor(c: string): { rgb: RGB; a: number } {
  const hex = /^#([0-9a-f]{6})$/i.exec(c);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], a: 1 };
  }
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(c);
  if (m) return { rgb: [+m[1], +m[2], +m[3]], a: m[4] === undefined ? 1 : +m[4] };
  throw new Error(`Unsupported color: ${c}`);
}

/** `top` (possibly translucent) painted over the solid `bottom`, as '#RRGGBB'. */
export function over(top: string, bottom: string): string {
  const t = parseColor(top);
  const b = parseColor(bottom).rgb;
  const mix = t.rgb.map((v, i) => Math.round(v * t.a + b[i] * (1 - t.a)));
  return `#${mix.map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

export function luminance(c: string): number {
  const [r, g, b] = parseColor(c).rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio 1..21 between two solid colors. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
