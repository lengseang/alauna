/**
 * Text-to-speech with the phone's own TTS engine (expo-speech): real voice list, voice/rate/pitch from the voice
 * prefs, sentence queue (Android QUEUE_ADD), preview and stop. Offline as long as the chosen voice is installed on the
 * phone; network voices are flagged (see voiceNeedsNetwork).
 */
import { useSyncExternalStore } from 'react';
import type { Voice } from 'expo-speech';
import { createStore } from '../../core/store.ts';
import { voiceNeedsNetwork } from '../../core/voiceModels.ts';
import { getVoicePrefs } from './prefs.ts';

type SpeechModule = typeof import('expo-speech');

function speech(): SpeechModule | null {
  try {
    return require('expo-speech') as SpeechModule;
  } catch {
    return null;
  }
}

export const TTS_MISSING = 'Text-to-speech (expo-speech) is not in this build of the app. Install the latest APK.';

export interface TtsVoice {
  id: string;
  name: string;
  /** BCP-47-ish, e.g. "en-US". */
  language: string;
  enhanced: boolean;
  /** true = streamed from the internet, false = on the phone, null = cannot tell from the name. */
  needsNetwork: boolean | null;
}

export interface TtsState {
  speaking: boolean;
  /** Sentences queued and not finished. */
  pending: number;
  lastError: string | null;
}

export const ttsStore = createStore<TtsState>({ speaking: false, pending: 0, lastError: null });

export function useTts(): TtsState {
  return useSyncExternalStore(ttsStore.subscribe, ttsStore.getState);
}

let voices: TtsVoice[] | null = null;

/** Voices installed in the phone's TTS engine, on-device ones first. Cached; pass refresh after installing voices. */
export async function listVoices(refresh = false): Promise<TtsVoice[]> {
  if (voices && !refresh) return voices;
  const s = speech();
  if (!s) throw new Error(TTS_MISSING);
  const raw: Voice[] = await s.getAvailableVoicesAsync();
  voices = raw
    .map((v) => ({ id: v.identifier, name: v.name, language: v.language, enhanced: String(v.quality) === 'Enhanced', needsNetwork: voiceNeedsNetwork(v.identifier) }))
    .sort((a, b) => a.language.localeCompare(b.language) || Number(a.needsNetwork === true) - Number(b.needsNetwork === true) || a.name.localeCompare(b.name));
  return voices;
}

import { getVoicePersona, type VoicePersona } from '../../core/voicePersonas.ts';
import { getActiveSoul } from '../soulStore.ts';
import { computeAcousticModulation, type EmotionType } from '../../core/voice/emotionMixer.ts';
import { getKokoroStyle, DEFAULT_KOKORO_STYLE_ID, type KokoroStyleSpec } from '../../core/voice/kokoroStyles.ts';
import { findMatchingKokoroVoice, resolveKokoroSpeechParameters } from './kokoroTts.ts';
import { isNeuralReady, isModelDownloaded, synthesizeNeural, stopNeuralSynthesis } from './kokoroNeuralTts.ts';

// Pre-fetch voices eagerly in background so cache is primed
listVoices().catch(() => {});

export interface SpeakOptions {
  voice?: string | null;
  rate?: number;
  pitch?: number;
  personaId?: string | null;
  emotion?: EmotionType;
  emotionIntensity?: number;
  /** Called once when this sentence finished, was stopped by the system, or failed. Not called after stopSpeaking(). */
  onDone?: () => void;
}

// Bumped by stopSpeaking(): callbacks of utterances flushed by a stop are ignored (Android drops queued ones silently).
let generation = 0;

/** Match the best installed native voice given a persona's voicePattern */
export function findMatchingNativeVoice(patternStr?: string): string | null {
  if (!patternStr || !voices || voices.length === 0) return null;
  try {
    const rx = new RegExp(patternStr, 'i');
    // Prefer on-device/local voices matching the pattern first
    const localMatch = voices.find((v) => !v.needsNetwork && (rx.test(v.name) || rx.test(v.id)));
    if (localMatch) return localMatch.id;
    const anyMatch = voices.find((v) => rx.test(v.name) || rx.test(v.id));
    return anyMatch ? anyMatch.id : null;
  } catch {
    return null;
  }
}

/** Queue one sentence. Uses the voice persona and voice prefs unless overridden. */
export function speak(text: string, opts: SpeakOptions = {}): boolean {
  const s = speech();
  if (!s) {
    ttsStore.setState({ lastError: TTS_MISSING });
    opts.onDone?.();
    return false;
  }
  const prefs = getVoicePrefs();
  let soulVoiceId: string | undefined;
  try {
    soulVoiceId = getActiveSoul()?.identity?.voicePersonaId;
  } catch {
    // safe fallback if store not yet ready or in isolated tests
  }
  const persona = getVoicePersona(opts.personaId ?? soulVoiceId ?? prefs.personaId);
  const gen = generation;
  let finished = false;
  const finish = (error?: string) => {
    if (finished || gen !== generation) return;
    finished = true;
    const pending = Math.max(0, ttsStore.getState().pending - 1);
    ttsStore.setState({ pending, speaking: pending > 0, ...(error ? { lastError: error } : {}) });
    opts.onDone?.();
  };
  const pending = ttsStore.getState().pending + 1;
  ttsStore.setState({ pending, speaking: true, lastError: null });

  const isKokoro = prefs.ttsEngine === 'kokoro';

  let targetVoice: string | undefined;
  let targetRate: number;
  let targetPitch: number;

  if (isKokoro) {
    const styleId = persona?.kokoroStyleId ?? prefs.kokoroStyleId ?? DEFAULT_KOKORO_STYLE_ID;
    const styleSpec = getKokoroStyle(styleId);

    // Acoustic modulation: style baseline takes priority when Kokoro is chosen; combined with persona
    const stylePitch = styleSpec?.pitch ?? 1.0;
    const styleRate = styleSpec?.speed ?? 1.0;
    const personaPitchFactor = persona && persona.pitch !== 1.0 ? persona.pitch : 1.0;
    const personaRateFactor = persona && persona.rate !== 1.0 ? persona.rate : 1.0;
    const basePitch = opts.pitch ?? (stylePitch * personaPitchFactor);
    const baseRate = opts.rate ?? (styleRate * personaRateFactor);
    const activeEmotion = opts.emotion ?? (persona ? persona.kokoroEmotion : prefs.kokoroEmotion);
    const activeIntensity = opts.emotionIntensity ?? (persona ? persona.kokoroEmotionIntensity : prefs.kokoroEmotionIntensity);
    const mod = computeAcousticModulation(basePitch, baseRate, activeEmotion, activeIntensity);

    targetPitch = mod.pitch;
    targetRate = mod.rate;

    // Check if real neural Kokoro engine is ready or downloaded
    if (isModelDownloaded() || isNeuralReady()) {
      synthesizeNeural(text, {
        styleId: styleSpec?.id,
        speed: targetRate,
        pitch: targetPitch,
        onDone: () => finish(),
      })
        .then((started) => {
          if (!started && gen === generation && !finished) {
            // Graceful fallback to native TTS only if neural engine failed and not cancelled
            try {
              const kokoroMatched = findMatchingKokoroVoice(styleSpec, voices);
              const fallbackVoice = opts.voice ?? kokoroMatched ?? prefs.ttsVoice ?? undefined;
              s.speak(text.slice(0, Math.max(1, s.maxSpeechInputLength - 1)), {
                voice: fallbackVoice,
                rate: targetRate,
                pitch: targetPitch,
                onDone: () => finish(),
                onStopped: () => finish(),
                onError: (e: Error) => finish(`Speech failed: ${e.message}`),
              });
            } catch (e) {
              finish(`Speech failed: ${e instanceof Error ? e.message : String(e)}`);
            }
          }
        })
        .catch(() => finish());
      return true;
    }

    // Resolve fallback voice: explicit opts.voice -> Kokoro matched voice -> persona voice pattern -> fallback
    if (opts.voice !== undefined && opts.voice !== null) {
      targetVoice = opts.voice;
    } else {
      const kokoroMatched = findMatchingKokoroVoice(styleSpec, voices);
      const personaMatched = persona ? findMatchingNativeVoice(persona.voicePattern) : null;
      targetVoice = kokoroMatched ?? personaMatched ?? prefs.ttsVoice ?? undefined;
    }
  } else {
    // Standard Android System TTS
    targetVoice = (opts.voice !== undefined && opts.voice !== null ? opts.voice : prefs.ttsVoice) ?? undefined;
    targetRate = opts.rate ?? prefs.ttsRate;
    targetPitch = opts.pitch ?? prefs.ttsPitch;
  }

  // If voices have not loaded yet, prime cache for subsequent speech
  if (!voices) {
    listVoices().catch(() => {});
  }

  try {
    s.speak(text.slice(0, Math.max(1, s.maxSpeechInputLength - 1)), {
      voice: targetVoice,
      rate: targetRate,
      pitch: targetPitch,
      onDone: () => finish(),
      onStopped: () => finish(),
      onError: (e: Error) => finish(`Speech failed: ${e.message}`),
    });
  } catch (e) {
    finish(`Speech failed: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
  return true;
}

/** Stop now and drop everything queued. */
export async function stopSpeaking(): Promise<void> {
  generation++;
  ttsStore.setState({ pending: 0, speaking: false });
  stopNeuralSynthesis();
  await speech()?.stop();
}

export const PREVIEW_TEXT = 'Hello. This is how I will sound when I answer you.';

/** Speak a sample with the given (unsaved) settings, replacing anything currently spoken. */
export async function previewVoice(opts: Omit<SpeakOptions, 'onDone'> = {}, text = PREVIEW_TEXT): Promise<boolean> {
  await stopSpeaking();
  if (!voices) {
    try {
      voices = await listVoices();
    } catch {
      // safe fallback
    }
  }
  const prefs = getVoicePrefs();
  if (prefs.ttsEngine === 'kokoro') {
    const styleSpec = getKokoroStyle(prefs.kokoroStyleId);
    const persona = getVoicePersona(prefs.personaId);
    const params = resolveKokoroSpeechParameters(
      styleSpec,
      persona,
      opts.emotion ?? prefs.kokoroEmotion,
      opts.emotionIntensity ?? prefs.kokoroEmotionIntensity,
      voices
    );
    return speak(text, {
      voice: opts.voice ?? params.voiceId,
      pitch: opts.pitch ?? params.pitch,
      rate: opts.rate ?? params.rate,
      personaId: persona?.id,
      emotion: params.emotion,
      emotionIntensity: params.emotionIntensity,
    });
  }
  return speak(text, opts);
}

/** Play a realistic preview of a Voice Persona using its Kokoro style, emotion profile, pitch, and rate. */
export async function previewPersonaVoice(persona: VoicePersona, emotion?: EmotionType, intensity?: number): Promise<boolean> {
  await stopSpeaking();
  const styleSpec = getKokoroStyle(persona.kokoroStyleId);
  const matched = findMatchingKokoroVoice(styleSpec, voices) ?? findMatchingNativeVoice(persona.voicePattern);
  const em = emotion ?? persona.kokoroEmotion;
  const inIntensity = intensity ?? persona.kokoroEmotionIntensity;
  const mod = computeAcousticModulation(persona.pitch, persona.rate, em, inIntensity);
  return speak(persona.sampleText, {
    voice: matched,
    rate: mod.rate,
    pitch: mod.pitch,
    personaId: persona.id,
    emotion: em,
    emotionIntensity: inIntensity,
  });
}

/** Play a preview of any Kokoro style directly with its authentic base pitch, speed, and emotion. */
export async function previewKokoroStyle(
  style: KokoroStyleSpec,
  emotion?: EmotionType,
  intensity?: number,
  sampleText = PREVIEW_TEXT
): Promise<boolean> {
  await stopSpeaking();
  const prefs = getVoicePrefs();
  const em = emotion ?? prefs.kokoroEmotion;
  const inIntensity = intensity ?? prefs.kokoroEmotionIntensity;
  const matched = findMatchingKokoroVoice(style, voices);
  const mod = computeAcousticModulation(style.pitch, style.speed, em, inIntensity);
  return speak(sampleText, {
    voice: matched,
    rate: mod.rate,
    pitch: mod.pitch,
    emotion: em,
    emotionIntensity: inIntensity,
  });
}
