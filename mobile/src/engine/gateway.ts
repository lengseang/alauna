/**
 * CHIWIWI Fast Decision Gateway (< 0.1ms)
 * Deterministic, lossless tier-based router running directly in JS
 */

export type RouteCategory = 'SPEED_RUN' | 'DEEP_DEBUG' | 'ARCH_DESIGN' | 'RAPPORT' | 'STANDARD';

export interface RouteResult {
  category: RouteCategory;
  latencyMs: number;
  rigor: 'terse' | 'verify_trace' | 'triad' | 'skip' | 'verify_syntax';
}

const SHORTHANDS = new Set(['h', 'l', 'go on', 'go kn', 'continue', 'next']);
const DEBUG_RE = /(error|exception|fail|crash|trace|undefined|500|404)/i;
const ARCH_RE = /(architecture|design|pattern|scale|structure|orchestrat)/i;

export function routeDecision(input: string): RouteResult {
  const start = performance.now();
  const text = input.trim();
  const lower = text.toLowerCase();

  // Tier 0: Shorthand (< 0.05ms)
  if (SHORTHANDS.has(lower) || (text.length <= 3 && lower === 'h')) {
    return { category: 'SPEED_RUN', latencyMs: performance.now() - start, rigor: 'terse' };
  }

  // Tier 1: Debug / Exception
  if (DEBUG_RE.test(text) || (text.includes('at ') && text.includes('('))) {
    return { category: 'DEEP_DEBUG', latencyMs: performance.now() - start, rigor: 'verify_trace' };
  }

  // Tier 2: Architecture
  if (ARCH_RE.test(text)) {
    return { category: 'ARCH_DESIGN', latencyMs: performance.now() - start, rigor: 'triad' };
  }

  // Tier 3: Casual Banter
  if (text.length < 40 && /^(hey|hi|yo|sup|hello)/i.test(text)) {
    return { category: 'RAPPORT', latencyMs: performance.now() - start, rigor: 'skip' };
  }

  return { category: 'STANDARD', latencyMs: performance.now() - start, rigor: 'verify_syntax' };
}
