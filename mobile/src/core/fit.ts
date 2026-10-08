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

/** Fallback KV-cache cost per token of context, per billion parameters (used only when a spec has no measured value). */
const KV_BYTES_PER_TOKEN_PER_B = 18_000;
/** Runtime buffers (batch 512), compute graph, llama.rn's 160 MB prompt-state cache, tokenizer, JS heap. */
const OVERHEAD_BYTES = 600_000_000;

export function estimateRamBytes(spec: Pick<ModelSpec, 'sizeBytes' | 'paramsB'> & { kvBytesPerToken?: number }, nCtx: number): number {
  const kv = nCtx * (spec.kvBytesPerToken ?? spec.paramsB * KV_BYTES_PER_TOKEN_PER_B);
  return Math.round(spec.sizeBytes * 1.05 + kv + OVERHEAD_BYTES);
}

export function rateFit(requiredBytes: number, totalRamBytes: number | null): FitRating {
  if (!totalRamBytes || totalRamBytes <= 0) return 'unknown';
  const ratio = requiredBytes / totalRamBytes;
  if (ratio <= 0.4) return 'great';
  if (ratio <= 0.55) return 'ok';
  if (ratio <= 0.7) return 'tight';
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

/**
 * The model we highlight and auto-download on first run.
 *
 * NOT "the biggest that fits": on a 12 GB phone that is an 8-9B model at 3-6 tok/s, a poor first impression.
 * Instead each catalog entry has an explicit `priority` (the 4B "Balanced (default)" model is highest), and we take
 * the highest-priority entry that rates "great" or "ok" on THIS phone. Heavier models stay available as opt-in.
 * Unknown RAM -> the "Fast" small model; nothing fits -> the smallest recommendable model.
 * Entries with `priority: 0` (uncensored, niche, tiny demos, 16 GB-only) are never auto-recommended.
 */
export function recommendModel(catalog: readonly ModelSpec[], totalRamBytes: number | null): ModelSpec | null {
  const candidates = catalog.filter((m) => m.priority > 0 && m.contentPolicy !== 'Uncensored');
  const bySize = [...(candidates.length > 0 ? candidates : catalog)].sort((a, b) => a.sizeBytes - b.sizeBytes);
  if (!totalRamBytes || totalRamBytes <= 0) return catalog.find((m) => m.role === 'Fast') ?? bySize[0] ?? null;
  const nCtx = defaultContext(totalRamBytes);
  const eligible = candidates.filter((m) => {
    if (m.paramsB < 1) return false;
    const rating = fitFor(m, totalRamBytes, nCtx);
    return rating === 'great' || rating === 'ok';
  });
  if (eligible.length === 0) return bySize[0] ?? null;
  return eligible.sort((a, b) => b.priority - a.priority || b.paramsB - a.paramsB)[0];
}
