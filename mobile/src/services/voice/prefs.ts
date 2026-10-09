/**
 * Persisted voice preferences (Audio & Voice settings). Single source of truth: Settings v2 `voice`
 * (services/settings.ts). Legacy `chiwiwi_voice.json` is imported once by initSettings.
 */
import { useSyncExternalStore } from 'react';
import { createStore } from '../../core/store.ts';
import { DEFAULT_VOICE_PREFS, type VoicePrefs } from '../../core/voiceModels.ts';
import { initSettings, settingsStore, updateSection } from '../settings.ts';

export type { VoicePrefs } from '../../core/voiceModels.ts';

export const voicePrefsStore = createStore<VoicePrefs & { loaded: boolean }>({ ...DEFAULT_VOICE_PREFS, loaded: false });

settingsStore.subscribe(() => {
  const { voice, loaded } = settingsStore.getState();
  voicePrefsStore.setState({ ...voice, loaded });
});

let loading: Promise<void> | null = null;
export function initVoicePrefs(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      await initSettings();
      const { voice, loaded } = settingsStore.getState();
      voicePrefsStore.setState({ ...voice, loaded });
    })();
  }
  return loading;
}

export function getVoicePrefs(): VoicePrefs {
  return settingsStore.getState().voice;
}

/** Validates the patch (handled by settingsModel), applies it to settings and saves. */
export function updateVoicePrefs(patch: Partial<VoicePrefs>): VoicePrefs {
  updateSection('voice', patch);
  return settingsStore.getState().voice;
}

export function useVoicePrefs(): VoicePrefs & { loaded: boolean } {
  return useSyncExternalStore(settingsStore.subscribe, () => ({
    ...settingsStore.getState().voice,
    loaded: settingsStore.getState().loaded,
  }));
}
