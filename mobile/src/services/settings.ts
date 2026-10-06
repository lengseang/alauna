/**
 * Persisted app settings. Stored in app-private storage (NOT in the vault) because
 * the vault location itself is a setting. Every field is read by real code; the
 * placebo toggles from the old version were removed.
 */
import { useSyncExternalStore } from 'react';
import { File, Paths } from 'expo-file-system';
import { createStore } from '../core/store.ts';
import { DEFAULT_SETTINGS, sanitizeSettings, type Settings } from '../core/settingsModel.ts';

export type { Settings, VerifiedInfo } from '../core/settingsModel.ts';

export interface SettingsState extends Settings {
  loaded: boolean;
}

const FILE_NAME = 'chiwiwi_settings.json';
export const settingsStore = createStore<SettingsState>({ ...DEFAULT_SETTINGS, loaded: false });

function file(): File {
  return new File(Paths.document, FILE_NAME);
}

let loadPromise: Promise<void> | null = null;
export function initSettings(): Promise<void> {
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const f = file();
        if (f.exists) {
          const parsed = sanitizeSettings(JSON.parse(await f.text()));
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
    const f = file();
    if (!f.exists) f.create({ intermediates: true });
    f.write(JSON.stringify(settings));
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
