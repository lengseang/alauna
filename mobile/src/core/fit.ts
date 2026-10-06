/**
 * Device-aware model fitting. Pure functions: RAM in, ratings out.
 *
 * Android's low-memory killer starts evicting a foreground app once it holds
 * roughly 70% of physical RAM, so the thresholds below are deliberately
 * conservative. `totalMemory` reported by the OS is a little under the marketing
 * number (a "12 GB" phone reports ~11.2 GB), which is fine: we compare against
 * what the OS actually reports.
 */
import type { ModelSpec } from './catalog.ts';

export type FitRating = 'great' | 'ok' | 'tight' | 'too_heavy' | 'unknown';

/** Rough KV-cache cost per token of context, per billion parameters. */
const KV_BYTES_PER_TOKEN_PER_B = 18_000;
/** Runtime buffers, compute graph, tokenizer, JS heap, etc. */
const OVERHEAD_BYTES = 350_000_000;

export function estimateRamBytes(spec: Pick<ModelSpec, 'sizeBytes' | 'paramsB'>, nCtx: number): number {
  const kv = nCtx * spec.paramsB * KV_BYTES_PER_TOKEN_PER_B;
  return Math.round(spec.sizeBytes * 1.05 + kv + OVERHEAD_BYTES);
}

export function rateFit(requiredBytes: number, totalRamBytes: number | null): FitRating {
  if (!totalRamBytes || totalRamBytes <= 0) return 'unknown';
  const ratio = requiredBytes / totalRamBytes;
  if (ratio <= 0.45) return 'great';
  if (ratio <= 0.6) return 'ok';
  if (ratio <= 0.75) return 'tight';
  return 'too_heavy';
}

export const FIT_LABEL: Record<FitRating, string> = {
  great: 'Runs great',
  ok: 'Runs well',
  tight: 'Tight - close other apps',
  too_heavy: 'Too heavy for this phone',
  unknown: 'Fit unknown',
};

/** Context window sized to the phone; the user can override it in Settings. */
export function defaultContext(totalRamBytes: number | null): number {
  if (!totalRamBytes) return 2048;
  const gb = totalRamBytes / 1e9;
  if (gb >= 10) return 4096;
  if (gb >= 7) return 3072;
  if (gb >= 5) return 2048;
  return 1536;
}

export function fitFor(spec: ModelSpec, totalRamBytes: number | null, nCtx: number = defaultContext(totalRamBytes)): FitRating {
  return rateFit(estimateRamBytes(spec, nCtx), totalRamBytes);
}

const FIT_ORDER: FitRating[] = ['great', 'ok', 'tight', 'too_heavy', 'unknown'];

/**
 * The model we highlight: the most capable one that still rates "ok" or better.
 * "Most capable" = most parameters among non-uncensored, non-tiny models.
 */
export function recommendModel(catalog: ModelSpec[], totalRamBytes: number | null): ModelSpec | null {
  const nCtx = defaultContext(totalRamBytes);
  const eligible = catalog.filter((m) => {
    if (m.contentPolicy === 'Uncensored') return false;
    if (m.paramsB < 1) return false;
    const rating = fitFor(m, totalRamBytes, nCtx);
    return rating === 'great' || rating === 'ok';
  });
  if (eligible.length === 0) {
    // Very small phone: fall back to the smallest model overall.
    return [...catalog].sort((a, b) => a.sizeBytes - b.sizeBytes)[0] ?? null;
  }
  // Prefer mid-size sweet spot first (<= 4B) on small phones; otherwise the biggest that fits.
  return eligible.sort((a, b) => b.paramsB - a.paramsB || FIT_ORDER.indexOf(fitFor(a, totalRamBytes, nCtx)) - FIT_ORDER.indexOf(fitFor(b, totalRamBytes, nCtx)))[0];
}
