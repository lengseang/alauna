/**
 * Persisted voice preferences (Audio & Voice settings). Single source of truth: Settings v2 `voice`
 * (services/settings.ts). Legacy `chiwiwi_voice.json` is imported once by initSettings.
 */
import { useSyncExternalStore } from 'react';
import { createStore } from '../../core/store.ts';
import { DEFAULT_VOICE_PREFS, type VoicePrefs } from '../../core/voiceModels.ts';
import { initSettings, settingsStore, updateSection } from '../settings.ts';

export type { VoicePrefs } from '../../core/voiceModels.ts';

function voiceStateFromSettings(): VoicePrefs & { loaded: boolean } {
  const { voice, loaded } = settingsStore.getState();
  return { ...voice, loaded };
}

export const voicePrefsStore = createStore<VoicePrefs & { loaded: boolean }>(voiceStateFromSettings());

function shallowEqual<T extends object>(a: T, b: T): boolean {
  if (a === b) return true;
  const ka = Object.keys(a) as (keyof T)[];
  const kb = Object.keys(b) as (keyof T)[];
  if (ka.length !== kb.length) return false;
  return ka.every((k) => a[k] === b[k]);
}

settingsStore.subscribe(() => {
  const next = voiceStateFromSettings();
  const current = voicePrefsStore.getState();
  if (!shallowEqual(current, next)) {
    voicePrefsStore.setState(next);
  }
});

let loading: Promise<void> | null = null;
export function initVoicePrefs(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      await initSettings();
      voicePrefsStore.setState(voiceStateFromSettings());
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
  return useSyncExternalStore(voicePrefsStore.subscribe, voicePrefsStore.getState);
}
