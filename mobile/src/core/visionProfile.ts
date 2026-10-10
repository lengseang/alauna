/**
 * Vision accuracy (pure core): per-family image token budget, the honest "vision quality" class of a model, and the
 * grounded sampling/prompt used on turns that carry an image.
 *
 * Nothing here is measured on the phone. The class comes from the projector family and parameter count (a larger vision
 * model reads more detail); the budget comes from what each projector accepts (llama.rn mtmd `image_min/max_tokens`).
 */
import type { ModelSpec } from './catalog.ts';
import type { SamplingSettings } from './settingsModel.ts';

type VisionSpec = Pick<ModelSpec, 'id' | 'family' | 'paramsB' | 'chatTemplate' | 'contentPolicy'>;

// ------------------------------------------------------------------ token budget

/** -1 = "leave the projector's own default" (llama.rn: image_*_tokens = -1). */
export const PROJECTOR_DEFAULT = -1;

export interface ImageBudget {
  min: number;
  max: number;
}

/** The pre-v3 flat budget; still used for projectors we have no family rule for. */
const FALLBACK: ImageBudget = { min: 64, max: 512 };

/**
 * Budget the engine loads the projector with when Settings > Advanced > Vision token budget is "Auto" (0).
 *  - Qwen2.5-VL / Qwen3-VL / Qwen3.5 / Omni: dynamic resolution; llama.cpp itself warns they need >= ~1024 tokens for
 *    grounding, so 256-1280 (more detail than the old flat 512, bounded for phone memory).
 *  - Gemma 4: trained budgets 70-1120 soft tokens; 140-560 keeps small photos from being starved (the projector default
 *    minimum of 40 is documented as poor) without a 1120-token prefill on a phone.
 *  - Gemma 3, SmolVLM/Idefics3, LFM2-VL, MiniCPM-V, Moondream, Ministral: fixed or tile-based projectors that ignore a
 *    custom budget or are tuned for their own range, so their default is kept.
 */
export function autoImageBudget(spec: Pick<ModelSpec, 'id' | 'family' | 'chatTemplate'>): ImageBudget {
  if (spec.chatTemplate === 'gemma4') return { min: 140, max: 560 };
  if (spec.family === 'Qwen' || /qwen/i.test(spec.id)) return { min: 256, max: 1280 };
  if (spec.chatTemplate === 'gemma' || spec.chatTemplate === 'smolvlm' || /^(Gemma|SmolVLM|LFM2\.5|MiniCPM|Moondream|Ministral)$/.test(spec.family)) {
    return { min: PROJECTOR_DEFAULT, max: PROJECTOR_DEFAULT };
  }
  return { ...FALLBACK };
}

/** Auto (override 0/undefined) = per-family; otherwise the user's number caps the budget. */
export function resolveImageBudget(spec: Pick<ModelSpec, 'id' | 'family' | 'chatTemplate'>, override: number | null | undefined): ImageBudget {
  const auto = autoImageBudget(spec);
  if (!override || override <= 0) return auto;
  const floor = auto.min > 0 ? auto.min : FALLBACK.min;
  return { min: Math.min(floor, override), max: override };
}

/** Tokens one image can take in the prompt (an upper bound, used to keep history from crowding the image out). */
export function imageTokenAllowance(spec: Pick<ModelSpec, 'id' | 'family' | 'chatTemplate'>, override: number | null | undefined): number {
  const b = resolveImageBudget(spec, override);
  if (b.max > 0) return b.max;
  // Projector default: fixed-size or tiled encoders. Gemma 3 = 256; the tiled ones (SmolVLM, MiniCPM...) can reach ~1k.
  return spec.chatTemplate === 'gemma' ? 256 : 1024;
}

// ------------------------------------------------------------------ quality class

export type VisionQuality = 'best' | 'fair' | 'weak';

export interface VisionQualityInfo {
  quality: VisionQuality;
  /** Short tag text, e.g. "Vision: best". */
  label: string;
  /** One honest sentence for the detail screen and the attach notice. */
  note: string;
}

const NOTE: Record<VisionQuality, string> = {
  best: 'Strong vision for its size: reads small text and details well.',
  fair: 'Fair vision: good for the main subject and large text, can miss small details or invent a detail. Check important answers.',
  weak: 'Weak vision: may call a normal photo something else. Use it for quick captions, not for facts you depend on.',
};

/** Class from family + parameter count (expectation, not a benchmark on this phone). Null = the model cannot see images. */
export function visionQuality(spec: VisionSpec & { capabilities: readonly string[] }): VisionQualityInfo | null {
  if (!spec.capabilities.includes('Image')) return null;
  let q: VisionQuality;
  if (spec.family === 'SmolVLM' || spec.family === 'Moondream' || spec.paramsB < 1.5) q = 'weak';
  else if (spec.paramsB >= 7) q = 'best';
  else q = 'fair';
  // Abliterated/heretic fine-tunes shift the language side without re-training the vision link: one step lower.
  if (spec.contentPolicy === 'Uncensored') q = spec.paramsB < 5 ? 'weak' : q === 'best' ? 'fair' : q;
  return { quality: q, label: `Vision: ${q}`, note: NOTE[q] };
}

// ------------------------------------------------------------------ grounded turn

export const VISION_GROUNDING_LINE = 'Describe only what is visibly in the image; if unsure, say so; do not invent objects or text.';

/** System prompt for one image turn (never persisted, never shown as status). */
export function groundSystemPrompt(system: string): string {
  return system ? `${system}\n\n${VISION_GROUNDING_LINE}` : VISION_GROUNDING_LINE;
}

/** Low-temperature sampling for a turn with images: fewer invented details, repetition penalty eased so OCR can repeat. */
export function groundSampling(base: SamplingSettings): SamplingSettings {
  return {
    ...base,
    temperature: Math.min(base.temperature, 0.2),
    topK: base.topK > 0 ? Math.min(base.topK, 20) : 20,
    repeatPenalty: Math.min(base.repeatPenalty, 1.05),
  };
}

/**
 * Keep images out of history unless a text-only follow-up needs them: a turn that brings its own image drops every
 * older image; a text-only turn keeps only the newest one. Dropped images leave a note so the model does not guess.
 */
export function pruneHistoryImages<T extends { role: string; content: string; images?: string[] }>(history: T[], currentTurnHasImages: boolean): T[] {
  let keepIndex = -1;
  if (!currentTurnHasImages) {
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === 'user' && history[i].images?.length) {
        keepIndex = i;
        break;
      }
    }
  }
  return history.map((m, i) => {
    if (!m.images?.length || i === keepIndex) return m;
    const { images: _dropped, ...rest } = m;
    const note = '[An image was attached here earlier; it is no longer in context.]';
    return { ...rest, content: [m.content, note].filter(Boolean).join('\n') } as T;
  });
}
