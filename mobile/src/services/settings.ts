/**
 * Persisted app settings (schema v2, core/settingsModel.ts). Stored in app-private storage (NOT in the vault) because
 * the vault location itself is a setting. Every field is read by real code (docs/api/engine.md).
 *
 * Migration: a v1 file is read through `sanitizeSettings` (threads/useGpu/contextOverride -> compute) and written back
 * as v2 on the next save. Appearance prefs that the v1 theme code kept in `chiwiwi_theme.json` are imported once.
 */
import { useSyncExternalStore } from 'react';
import { File, Paths } from 'expo-file-system';
import { readWithFallback, writeAtomic } from '../core/atomicFile.ts';
import { directoryIO } from './atomicIo.ts';
import { createStore } from '../core/store.ts';
import { applySettingsPatch, DEFAULT_SETTINGS, importLegacyDownloads, sanitizeSettings, type AppearanceSettings, type Settings } from '../core/settingsModel.ts';

export type {
  AppearanceSettings,
  ComputeSettings,
  DownloadSettings,
  SamplingSettings,
  SecurityPrefs,
  Settings,
  SpeculativeSettings,
  SttSettings,
  TtsSettings,
  VerifiedInfo,
  VerifyMode,
  VoicePrefs,
} from '../core/settingsModel.ts';
export { importLegacyDownloads } from '../core/settingsModel.ts';

export interface SettingsState extends Settings {
  loaded: boolean;
}

export const SETTINGS_FILE = 'chiwiwi_settings.json';
/** Written by the v1 theme code (src/theme/prefs.ts); imported once into `appearance`. */
const LEGACY_THEME_FILE = 'chiwiwi_theme.json';
/** Written by downloadPrefs.ts; imported once into `downloads`. */
const LEGACY_DOWNLOADS_FILE = 'chiwiwi_downloads.json';
/** Written by services/voice/prefs.ts; imported once into `voice`. */
const LEGACY_VOICE_FILE = 'chiwiwi_voice.json';
/** Written by services/security.ts; imported once into `security`. */
const LEGACY_SECURITY_FILE = 'chiwiwi_security.json';

export const settingsStore = createStore<SettingsState>({ ...sanitizeSettings(DEFAULT_SETTINGS), loaded: false });

const io = () => directoryIO(() => Paths.document);

/** v1 theme prefs ({ pref: system|light|dark, textScale, motion, haptics }) -> v2 appearance. */
export function importLegacyAppearance(raw: unknown): AppearanceSettings | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const theme = r.pref === 'light' ? 'helios' : r.pref === 'dark' ? 'nyx' : 'system';
  return sanitizeSettings({ appearance: { theme, textScale: r.textScale, haptics: r.haptics, reducedMotion: r.motion === 'reduce' } }).appearance;
}

let loadPromise: Promise<void> | null = null;
export function initSettings(): Promise<void> {
  if (!loadPromise) {
    loadPromise = (async () => {
      let next: Settings | null = null;
      let hadAppearance = false;
      let hadDownloads = false;
      let hadVoice = false;
      let hadSecurity = false;
      try {
        next = await readWithFallback(io(), SETTINGS_FILE, (text) => {
          const raw = JSON.parse(text) as Record<string, unknown>;
          hadAppearance = !!raw && typeof raw === 'object' && 'appearance' in raw;
          hadDownloads = !!raw && typeof raw === 'object' && 'downloads' in raw;
          hadVoice = !!raw && typeof raw === 'object' && ('voice' in raw || 'stt' in raw || 'tts' in raw);
          hadSecurity = !!raw && typeof raw === 'object' && ('security' in raw || 'biometricLock' in raw);
          return sanitizeSettings(raw);
        });
      } catch {
        // Corrupt file: fall back to defaults rather than blocking the app.
      }
      next ??= sanitizeSettings(null);
      if (!hadAppearance) {
        try {
          const f = new File(Paths.document, LEGACY_THEME_FILE);
          const imported = f.exists ? importLegacyAppearance(JSON.parse(await f.text())) : null;
          if (imported) next = { ...next, appearance: imported };
        } catch {
          // nothing to import
        }
      }
      if (!hadDownloads) {
        try {
          const f = new File(Paths.document, LEGACY_DOWNLOADS_FILE);
          const imported = f.exists ? importLegacyDownloads(JSON.parse(await f.text())) : null;
          if (imported) next = { ...next, downloads: imported };
        } catch {
          // nothing to import
        }
      }
      if (!hadVoice) {
        try {
          const f = new File(Paths.document, LEGACY_VOICE_FILE);
          if (f.exists) {
            next = sanitizeSettings({ ...next, voice: JSON.parse(await f.text()) });
          }
        } catch {
          // nothing to import
        }
      }
      if (!hadSecurity) {
        try {
          const f = new File(Paths.document, LEGACY_SECURITY_FILE);
          if (f.exists) {
            next = sanitizeSettings({ ...next, security: JSON.parse(await f.text()) });
          }
        } catch {
          // nothing to import
        }
      }
      settingsStore.setState({ ...next, loaded: true });
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
  try {
    // sanitize = drops `loaded`, guarantees a valid v2 file
    writeAtomic(io(), SETTINGS_FILE, JSON.stringify(sanitizeSettings(settingsStore.getState())));
  } catch {
    // Settings are a convenience; a failed write must never crash the app.
  }
}

function apply(patch: Partial<Settings>): void {
  const { loaded } = settingsStore.getState();
  settingsStore.setState({ ...applySettingsPatch(settingsStore.getState(), patch), loaded });
}

/** Validated + clamped update (out-of-range values are clamped, unknown values ignored), saved shortly after. */
export function updateSettings(patch: Partial<Settings>): void {
  apply(patch);
  persistSoon();
}

/** Write immediately (use before risky native work such as loading a model). */
export async function updateSettingsNow(patch: Partial<Settings>): Promise<void> {
  apply(patch);
  await flushSettings();
}

type Section = 'compute' | 'sampling' | 'speculative' | 'stt' | 'tts' | 'appearance' | 'storage' | 'downloads' | 'voice' | 'security' | 'freedom';
/** Patch one nested section: `updateSection('compute', { threads: 6 })`. */
export function updateSection<K extends Section>(key: K, partial: Partial<Settings[K]>): void {
  updateSettings({ [key]: { ...settingsStore.getState()[key], ...partial } } as Partial<Settings>);
}

/** Restore one section (or everything except models/verification state) to defaults. */
export function resetSettings(section?: Section): void {
  if (section) {
    updateSettings({ [section]: sanitizeSettings(null)[section] } as Partial<Settings>);
    return;
  }
  const s = settingsStore.getState();
  updateSettings({ ...sanitizeSettings(null), activeModelId: s.activeModelId, verified: s.verified });
}

export function useSettings(): SettingsState {
  return useSyncExternalStore(settingsStore.subscribe, settingsStore.getState);
}
