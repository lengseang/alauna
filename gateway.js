// Fast decision gateway (< 0.1ms)
const SHORTHANDS = new Set(['h', 'l', 'go on', 'go kn', 'continue', 'next']);
const DEBUG_RE = /(error|exception|fail|crash|trace|undefined|500|404)/i;
const ARCH_RE = /(architecture|design|pattern|scale|structure|orchestrat)/i;

export function route(input) {
  const t0 = performance.now();
  const text = input.trim();
  const lower = text.toLowerCase();

  // Tier 0: Shorthand
  if (SHORTHANDS.has(lower) || (text.length <= 3 && lower === 'h')) {
    return { category: 'SPEED_RUN', latencyMs: performance.now() - t0, rigor: 'terse' };
  }

  // Tier 1: Debug / Exception
  if (DEBUG_RE.test(text) || (text.includes('at ') && text.includes('('))) {
    return { category: 'DEEP_DEBUG', latencyMs: performance.now() - t0, rigor: 'verify_trace' };
  }

  // Tier 2: Architecture / Multi-agent
  if (ARCH_RE.test(text)) {
    return { category: 'ARCH_DESIGN', latencyMs: performance.now() - t0, rigor: 'triad' };
  }

  // Tier 3: Banter
  if (text.length < 40 && /^(hey|hi|yo|sup|hello)/i.test(text)) {
    return { category: 'RAPPORT', latencyMs: performance.now() - t0, rigor: 'skip' };
  }

  return { category: 'STANDARD', latencyMs: performance.now() - t0, rigor: 'verify_syntax' };
}
