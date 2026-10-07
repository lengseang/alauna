/**
 * Persisted app settings. Stored in app-private storage (NOT in the vault) because
 * the vault location itself is a setting. Every field is read by real code; the
 * placebo toggles from the old version were removed.
 */
import { useSyncExternalStore } from 'react';
import { Paths } from 'expo-file-system';
import { readWithFallback, writeAtomic } from '../core/atomicFile.ts';
import { directoryIO } from './atomicIo.ts';
import { createStore } from '../core/store.ts';
import { DEFAULT_SETTINGS, sanitizeSettings, type Settings } from '../core/settingsModel.ts';

export type { Settings, VerifiedInfo } from '../core/settingsModel.ts';

export interface SettingsState extends Settings {
  loaded: boolean;
}

const FILE_NAME = 'chiwiwi_settings.json';
export const settingsStore = createStore<SettingsState>({ ...DEFAULT_SETTINGS, loaded: false });

const io = () => directoryIO(() => Paths.document);

let loadPromise: Promise<void> | null = null;
export function initSettings(): Promise<void> {
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const parsed = await readWithFallback(io(), FILE_NAME, (text) => sanitizeSettings(JSON.parse(text)));
        if (parsed) {
          settingsStore.setState({ ...parsed, loaded: true });
          return;
        }
      } catch {
        // Corrupt file: fall back to defaults rather than blocking the app.
      }
      settingsStore.setState({ loaded: true });
    })();
  }
  return loadPromise;
}

let writeTimer: ReturnType<typeof setTimeout> | null = null;
function persistSoon(): void {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => void flushSettings(), 250);
}

export async function flushSettings(): Promise<void> {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  const state = settingsStore.getState();
  const settings: Settings = {
    archetype: state.archetype,
    pad: state.pad,
    activeModelId: state.activeModelId,
    verified: state.verified,
    contextOverride: state.contextOverride,
    threads: state.threads,
    useGpu: state.useGpu,
    thinkingEnabled: state.thinkingEnabled,
    pendingMountModelId: state.pendingMountModelId,
  };
  try {
    writeAtomic(io(), FILE_NAME, JSON.stringify(settings));
  } catch {
    // Settings are a convenience; a failed write must never crash the app.
  }
}

export function updateSettings(patch: Partial<Settings>): void {
  settingsStore.setState(patch);
  persistSoon();
}

/** Write immediately (use before risky native work such as loading a model). */
export async function updateSettingsNow(patch: Partial<Settings>): Promise<void> {
  settingsStore.setState(patch);
  await flushSettings();
}

export function useSettings(): SettingsState {
  return useSyncExternalStore(settingsStore.subscribe, settingsStore.getState);
}
