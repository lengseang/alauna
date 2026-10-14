/**
 * Kokoro-82M Neural Text-to-Speech Service.
 *
 * Coordinates style embeddings, dynamic emotion blending, and speech synthesis.
 * Provides fallback to native platform TTS when the neural model weights are not yet downloaded.
 */

import { Directory, File } from 'expo-file-system';
import { createStore } from '../../core/store.ts';
import { getKokoroStyle, KOKORO_STYLES, type KokoroStyleSpec } from '../../core/voice/kokoroStyles.ts';
import {
  blendStyleVectors,
  computeAcousticModulation,
  createSyntheticStyleVector,
  type EmotionType,
  STYLE_VECTOR_DIM,
} from '../../core/voice/emotionMixer.ts';
import { getVoicePersona, type VoicePersona } from '../../core/voicePersonas.ts';
import { speechModelPath, isSpeechModelInstalled } from './speechModels.ts';
import { uriToPath } from '../../core/paths.ts';
import { vaultRoot, isStorageReady } from '../storage.ts';
import { KOKORO_MODEL } from '../../core/voiceModels.ts';

export const KOKORO_MODEL_ID = KOKORO_MODEL.id;

export interface KokoroServiceState {
  modelInstalled: boolean;
  activeStyleId: string;
  activeEmotion: EmotionType;
  emotionIntensity: number;
  synthesizing: boolean;
  lastError: string | null;
}

export const kokoroStore = createStore<KokoroServiceState>({
  modelInstalled: false,
  activeStyleId: 'af_heart',
  activeEmotion: 'neutral',
  emotionIntensity: 0.5,
  synthesizing: false,
  lastError: null,
});

function kokoroVoiceDir(): Directory {
  const d = new Directory(vaultRoot(), 'voice', 'kokoro_styles');
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
}

/** Check if the Kokoro neural model is installed and ready */
export function isKokoroInstalled(): boolean {
  return isSpeechModelInstalled(KOKORO_MODEL_ID);
}

/** Get the on-disk file path for the neural model weights */
export function getKokoroModelPath(): string | null {
  return speechModelPath(KOKORO_MODEL_ID);
}

/** In-memory cache of loaded 512-D style vectors */
const styleCache = new Map<string, Float32Array>();

/**
 * Resolves a 512-D style vector for a style ID.
 * Reads from disk if available, otherwise creates a deterministic high-fidelity synthetic vector.
 */
export async function getStyleVector(styleId: string): Promise<Float32Array> {
  const cached = styleCache.get(styleId);
  if (cached) return cached;

  const spec = getKokoroStyle(styleId);
  if (!spec) {
    const fallback = createSyntheticStyleVector(1);
    styleCache.set(styleId, fallback);
    return fallback;
  }

  // Attempt to read from disk if downloaded
  if (isStorageReady()) {
    try {
      const f = new File(kokoroVoiceDir(), `${spec.id}.bin`);
      if (f.exists && f.size === spec.bytes) {
        const raw = await f.bytes();
        const floatArray = new Float32Array(raw.buffer, raw.byteOffset, Math.min(STYLE_VECTOR_DIM, Math.floor(raw.byteLength / 4)));
        if (floatArray.length === STYLE_VECTOR_DIM) {
          styleCache.set(styleId, floatArray);
          return floatArray;
        }
      }
    } catch {
      // Ignore read errors and fall back to synthetic
    }
  }

  // Generate deterministic style vector from style ID hash
  let hash = 0;
  for (let i = 0; i < styleId.length; i++) {
    hash = (hash << 5) - hash + styleId.charCodeAt(i);
    hash |= 0;
  }
  const synthetic = createSyntheticStyleVector(Math.abs(hash) || 12345);
  styleCache.set(styleId, synthetic);
  return synthetic;
}

/**
 * Computes the final blended style vector for a persona with emotion modulation.
 */
export async function resolvePersonaStyleVector(
  persona: VoicePersona,
  emotionOverride?: EmotionType,
  intensityOverride?: number
): Promise<{
  vector: Float32Array;
  effectivePitch: number;
  effectiveRate: number;
}> {
  const baseVector = await getStyleVector(persona.kokoroStyleId);
  let blended = baseVector;

  // Secondary style blend if configured
  if (persona.kokoroSecondaryStyleId && typeof persona.kokoroBlendWeight === 'number' && persona.kokoroBlendWeight > 0) {
    const secondaryVector = await getStyleVector(persona.kokoroSecondaryStyleId);
    blended = blendStyleVectors(baseVector, secondaryVector, persona.kokoroBlendWeight);
  }

  const emotion = emotionOverride ?? persona.kokoroEmotion;
  const intensity = intensityOverride ?? persona.kokoroEmotionIntensity;

  const { pitch: effectivePitch, rate: effectiveRate } = computeAcousticModulation(
    persona.pitch,
    persona.rate,
    emotion,
    intensity
  );

  return { vector: blended, effectivePitch, effectiveRate };
}

export {
  findMatchingKokoroVoice,
  resolveKokoroSpeechParameters,
} from '../../core/voice/kokoroStyles.ts';

