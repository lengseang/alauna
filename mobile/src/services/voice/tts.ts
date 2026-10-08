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

export interface SpeakOptions {
  voice?: string | null;
  rate?: number;
  pitch?: number;
  /** Called once when this sentence finished, was stopped by the system, or failed. Not called after stopSpeaking(). */
  onDone?: () => void;
}

// Bumped by stopSpeaking(): callbacks of utterances flushed by a stop are ignored (Android drops queued ones silently).
let generation = 0;

/** Queue one sentence. Uses the voice prefs unless overridden. */
export function speak(text: string, opts: SpeakOptions = {}): boolean {
  const s = speech();
  if (!s) {
    ttsStore.setState({ lastError: TTS_MISSING });
    opts.onDone?.();
    return false;
  }
  const prefs = getVoicePrefs();
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
  try {
    s.speak(text.slice(0, Math.max(1, s.maxSpeechInputLength - 1)), {
      voice: (opts.voice === undefined ? prefs.ttsVoice : opts.voice) ?? undefined,
      rate: opts.rate ?? prefs.ttsRate,
      pitch: opts.pitch ?? prefs.ttsPitch,
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
  await speech()?.stop();
}

export const PREVIEW_TEXT = 'Hello. This is how I will sound when I answer you.';

/** Speak a sample with the given (unsaved) settings, replacing anything currently spoken. */
export async function previewVoice(opts: Omit<SpeakOptions, 'onDone'> = {}, text = PREVIEW_TEXT): Promise<boolean> {
  await stopSpeaking();
  return speak(text, opts);
}
