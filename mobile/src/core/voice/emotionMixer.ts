/**
 * Emotion Mixing & Mathematical Vector Blending Engine for Kokoro-82M.
 *
 * Kokoro-82M conditions speech generation on a 512-dimensional continuous style latent vector.
 * Because style space is continuous and locally Euclidean, linear combinations of style embeddings
 * allow continuous interpolation between base character voices and emotional modulations:
 *
 *   V_final = (1 - alpha) * V_base + alpha * V_emotion
 *   V_normalized = V_final * (targetNorm / ||V_final||_2)
 *
 * This enables nuanced personality rendering (e.g. sweet girlfriend tenderness, sultry bedroom pillow talk,
 * or alpha dominant rasp) without retraining the underlying neural network.
 */

import { getKokoroStyle } from './kokoroStyles.ts';

export type EmotionType =
  | 'neutral'
  | 'affectionate'
  | 'excited'
  | 'whisper'
  | 'sultry'
  | 'dominant'
  | 'playful'
  | 'calm';

export interface EmotionProfile {
  type: EmotionType;
  label: string;
  description: string;
  /** Pitch multiplier adjustment relative to baseline (e.g. +0.06 for excited, -0.08 for sultry) */
  pitchDelta: number;
  /** Speed multiplier adjustment relative to baseline (e.g. -0.08 for slow pillow talk) */
  speedDelta: number;
  /** Suggested female secondary style to blend for this emotion */
  suggestedFemaleModifier: string;
  /** Suggested male secondary style to blend for this emotion */
  suggestedMaleModifier: string;
}

export const EMOTION_PROFILES: Record<EmotionType, EmotionProfile> = {
  neutral: {
    type: 'neutral',
    label: 'Natural',
    description: 'Balanced, standard conversational cadence.',
    pitchDelta: 0.0,
    speedDelta: 0.0,
    suggestedFemaleModifier: 'af_heart',
    suggestedMaleModifier: 'am_adam',
  },
  affectionate: {
    type: 'affectionate',
    label: 'Affectionate',
    description: 'Tender, caring, and loving companion warmth with gentle cadence.',
    pitchDelta: 0.04,
    speedDelta: -0.05,
    suggestedFemaleModifier: 'af_nicole',
    suggestedMaleModifier: 'am_echo',
  },
  excited: {
    type: 'excited',
    label: 'Excited',
    description: 'Upbeat, cheerful, high-energy cadence with lively inflection.',
    pitchDelta: 0.08,
    speedDelta: 0.06,
    suggestedFemaleModifier: 'af_bella',
    suggestedMaleModifier: 'am_puck',
  },
  whisper: {
    type: 'whisper',
    label: 'Whisper / Pillow Talk',
    description: 'Breathy, quiet, close-mic bedroom intimacy with slow acoustic release.',
    pitchDelta: 0.02,
    speedDelta: -0.1,
    suggestedFemaleModifier: 'af_kore',
    suggestedMaleModifier: 'am_echo',
  },
  sultry: {
    type: 'sultry',
    label: 'Sultry & Erotic',
    description: 'Slow, seductive, unfiltered adult magnetism with provocative pacing.',
    pitchDelta: -0.04,
    speedDelta: -0.08,
    suggestedFemaleModifier: 'af_sarah',
    suggestedMaleModifier: 'am_fenrir',
  },
  dominant: {
    type: 'dominant',
    label: 'Dominant & Commanding',
    description: 'Deep, assertive authority with firm pitch stability and resolute pace.',
    pitchDelta: -0.1,
    speedDelta: -0.04,
    suggestedFemaleModifier: 'af_jessica',
    suggestedMaleModifier: 'am_fenrir',
  },
  playful: {
    type: 'playful',
    label: 'Playful & Teasing',
    description: 'Lighthearted, mischievous inflection with rhythmic lilt and giggles.',
    pitchDelta: 0.06,
    speedDelta: 0.04,
    suggestedFemaleModifier: 'af_bella',
    suggestedMaleModifier: 'am_puck',
  },
  calm: {
    type: 'calm',
    label: 'Calm & Soothing',
    description: 'Peaceful, grounded pacing that lowers anxiety and relaxes listener.',
    pitchDelta: -0.03,
    speedDelta: -0.06,
    suggestedFemaleModifier: 'af_river',
    suggestedMaleModifier: 'am_adam',
  },
};

export const STYLE_VECTOR_DIM = 512;

/**
 * Calculates Euclidean L2 norm of a vector: ||v|| = sqrt(sum(v_i^2))
 */
export function vectorNorm(v: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < v.length; i++) {
    sum += v[i] * v[i];
  }
  return Math.sqrt(sum);
}

/**
 * Normalizes a style vector to maintain consistent energy across blends.
 * If targetNorm is not supplied, uses the base vector's norm or sqrt(dim).
 */
export function normalizeStyleVector(v: Float32Array, targetNorm = Math.sqrt(STYLE_VECTOR_DIM)): Float32Array {
  const norm = vectorNorm(v);
  if (norm < 1e-6) return new Float32Array(v);
  const scale = targetNorm / norm;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) {
    out[i] = v[i] * scale;
  }
  return out;
}

/**
 * Linearly interpolates two 512-D style vectors:
 *   out = (1 - weight) * base + weight * mod
 * then preserves acoustic power via L2 energy normalization.
 */
export function blendStyleVectors(
  base: Float32Array,
  mod: Float32Array,
  weight: number
): Float32Array {
  if (base.length !== mod.length) {
    throw new Error(`Vector dimension mismatch: ${base.length} vs ${mod.length}`);
  }
  const w = Math.max(0, Math.min(1, weight));
  if (w <= 0) return new Float32Array(base);
  if (w >= 1) return new Float32Array(mod);

  const baseNorm = vectorNorm(base) || Math.sqrt(STYLE_VECTOR_DIM);
  const out = new Float32Array(base.length);
  for (let i = 0; i < base.length; i++) {
    out[i] = (1 - w) * base[i] + w * mod[i];
  }
  return normalizeStyleVector(out, baseNorm);
}

/**
 * Multi-vector weighted convex combination:
 *   out = sum(w_i * v_i) / sum(w_i)
 */
export function interpolateMultiStyles(
  items: Array<{ vec: Float32Array; weight: number }>
): Float32Array {
  if (items.length === 0) return new Float32Array(STYLE_VECTOR_DIM);
  const dim = items[0].vec.length;
  const out = new Float32Array(dim);
  let totalWeight = 0;

  for (const item of items) {
    if (item.weight <= 0) continue;
    totalWeight += item.weight;
    for (let i = 0; i < dim; i++) {
      out[i] += item.vec[i] * item.weight;
    }
  }

  if (totalWeight <= 0) return new Float32Array(items[0].vec);

  for (let i = 0; i < dim; i++) {
    out[i] /= totalWeight;
  }
  return normalizeStyleVector(out, Math.sqrt(dim));
}

/**
 * Compute the effective pitch and rate given baseline parameters, emotion, and intensity.
 */
export function computeAcousticModulation(
  basePitch: number,
  baseRate: number,
  emotion: EmotionType,
  intensity: number
): { pitch: number; rate: number } {
  const profile = EMOTION_PROFILES[emotion] ?? EMOTION_PROFILES.neutral;
  const k = Math.max(0, Math.min(1, intensity));

  const finalPitch = Math.max(0.5, Math.min(2.0, basePitch + profile.pitchDelta * k));
  const finalRate = Math.max(0.5, Math.min(2.0, baseRate + profile.speedDelta * k));

  return { pitch: Number(finalPitch.toFixed(3)), rate: Number(finalRate.toFixed(3)) };
}

/**
 * Create a deterministic synthetic style vector (used for testing or fallback when style files are loading).
 */
export function createSyntheticStyleVector(seed: number, dim = STYLE_VECTOR_DIM): Float32Array {
  const vec = new Float32Array(dim);
  let state = Math.abs(seed) || 12345;
  for (let i = 0; i < dim; i++) {
    // Simple LCG PRNG
    state = (state * 1664525 + 1013904223) >>> 0;
    const uniform = (state / 4294967296) * 2 - 1; // -1 to 1
    vec[i] = uniform;
  }
  return normalizeStyleVector(vec, Math.sqrt(dim));
}
