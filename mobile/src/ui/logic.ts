/** Pure helpers behind the Temple primitives (no React, no react-native): unit-tested in test/designSystem.test.ts. */

/** 1 -> "I", 4 -> "IV", 9 -> "IX", 14 -> "XIV". Out of range (<1, >3999, non-integer) -> "". */
export function toRoman(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 3999) return '';
  const table: [number, string][] = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let out = '';
  for (const [v, s] of table) while (n >= v) (out += s), (n -= v);
  return out;
}

/** Decimal places of a step (0.05 -> 2), so snapped values carry no float noise (0.30000000000000004). */
function decimals(step: number): number {
  const s = String(step);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

/** Clamp to [min, max] and snap to the step grid anchored at `min`. Non-finite input -> min. */
export function snapValue(v: number, min: number, max: number, step: number): number {
  if (!Number.isFinite(v)) return min;
  const c = Math.max(min, Math.min(max, v));
  if (!(step > 0)) return c;
  const snapped = min + Math.round((c - min) / step) * step;
  return Number(Math.max(min, Math.min(max, snapped)).toFixed(decimals(step) + decimals(min)));
}

/** Position of `v` along [min, max] as 0..1 (clamped; a zero-width range is 0). */
export function toFraction(v: number, min: number, max: number): number {
  if (!(max > min) || !Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, (v - min) / (max - min)));
}

const f2 = (n: number) => Number(n.toFixed(2));

/**
 * SVG path of a waxing moon lit `lit` (0..1) from the right: 0 = new (empty path), 0.5 = first quarter, 1 = full.
 * Outer limb = right semicircle; terminator = ellipse arc with rx = r*|1-2*lit|, bulging right while a crescent.
 */
export function moonPhasePath(lit: number, cx: number, cy: number, r: number): string {
  const f = Math.max(0, Math.min(1, Number.isFinite(lit) ? lit : 0));
  if (f <= 0.001) return '';
  const rx = f2(r * Math.abs(1 - 2 * f));
  const top = `${f2(cx)} ${f2(cy - r)}`;
  const bottom = `${f2(cx)} ${f2(cy + r)}`;
  return `M${top}A${f2(r)} ${f2(r)} 0 0 1 ${bottom}A${rx} ${f2(r)} 0 0 ${f < 0.5 ? 0 : 1} ${top}Z`;
}

/**
 * Continuous Greek key (meander), `height` tall. One unit is a 10x10 cell grid (a two-turn spiral that leaves along the
 * baseline), scaled to `height`. Without `units` the keys repeat across the whole `width` (a band); with `units` only
 * that many keys are drawn and the baseline runs on as a plain hairline to `width` (a fillet: the section-header rule).
 */
export function meanderPath(width: number, height: number, units?: number): string {
  if (!(width > 0) || !(height > 0)) return '';
  const k = height / 10;
  const n = units === undefined ? Math.ceil(width / (10 * k)) : Math.max(0, Math.floor(units));
  const p = (x: number, y: number) => `${f2(x * k)} ${f2(y * k)}`;
  let d = `M${p(0, 10)}`;
  for (let i = 0; i < n; i++) {
    const o = i * 10;
    d += `L${p(o, 0)}L${p(o + 8, 0)}L${p(o + 8, 6)}L${p(o + 4, 6)}L${p(o + 4, 4)}L${p(o + 6, 4)}L${p(o + 6, 2)}L${p(o + 2, 2)}L${p(o + 2, 10)}L${p(o + 10, 10)}`;
  }
  if (units !== undefined) d += `L${f2(width)} ${f2(height)}`;
  return d;
}

/** One screen on the navigation stack. `key` is unique per push (the same route can sit twice with different params). */
export interface StackEntry<R extends string = string> {
  key: string;
  route: R;
  params?: Record<string, unknown>;
}

const sameParams = (a?: Record<string, unknown>, b?: Record<string, unknown>) => JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});

/**
 * Push, except when the top already shows the same route with the same params (a double tap must not stack twins):
 * then the SAME array comes back, so callers can skip the update.
 */
export function stackPush<R extends string>(stack: readonly StackEntry<R>[], entry: StackEntry<R>): readonly StackEntry<R>[] {
  const top = stack[stack.length - 1];
  if (top && top.route === entry.route && sameParams(top.params, entry.params)) return stack;
  return [...stack, entry];
}

/** Pop one screen; null at the root (the caller lets Android minimise the app). */
export function stackPop<R extends string>(stack: readonly StackEntry<R>[]): readonly StackEntry<R>[] | null {
  return stack.length <= 1 ? null : stack.slice(0, -1);
}
