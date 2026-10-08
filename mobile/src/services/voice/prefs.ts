/**
 * Persisted voice preferences (Audio & Voice settings). App-private file next to W2's settings, same crash-safe
 * write protocol. Every field is read by real code in stt.ts / tts.ts / voiceMode.ts.
 */
import { useSyncExternalStore } from 'react';
import { Paths } from 'expo-file-system';
import { readWithFallback, writeAtomic } from '../../core/atomicFile.ts';
import { createStore } from '../../core/store.ts';
import { DEFAULT_VOICE_PREFS, sanitizeVoicePrefs, type VoicePrefs } from '../../core/voiceModels.ts';
import { directoryIO } from '../atomicIo.ts';

export type { VoicePrefs } from '../../core/voiceModels.ts';

const FILE_NAME = 'chiwiwi_voice.json';
const io = () => directoryIO(() => Paths.document);

export const voicePrefsStore = createStore<VoicePrefs & { loaded: boolean }>({ ...DEFAULT_VOICE_PREFS, loaded: false });

let loading: Promise<void> | null = null;
export function initVoicePrefs(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      try {
        const parsed = await readWithFallback(io(), FILE_NAME, (t) => sanitizeVoicePrefs(JSON.parse(t)));
        voicePrefsStore.setState({ ...(parsed ?? {}), loaded: true });
      } catch {
        voicePrefsStore.setState({ loaded: true });
      }
    })();
  }
  return loading;
}

export function getVoicePrefs(): VoicePrefs {
  const { loaded: _loaded, ...prefs } = voicePrefsStore.getState();
  void _loaded;
  return prefs;
}

/** Validates the patch (same rules as loading), applies it and saves. */
export function updateVoicePrefs(patch: Partial<VoicePrefs>): VoicePrefs {
  const next = sanitizeVoicePrefs({ ...getVoicePrefs(), ...patch });
  voicePrefsStore.setState(next);
  try {
    writeAtomic(io(), FILE_NAME, JSON.stringify(next));
  } catch {
    // A failed write must never crash the app; the value still applies for this session.
  }
  return next;
}

export function useVoicePrefs(): VoicePrefs & { loaded: boolean } {
  return useSyncExternalStore(voicePrefsStore.subscribe, voicePrefsStore.getState);
}
