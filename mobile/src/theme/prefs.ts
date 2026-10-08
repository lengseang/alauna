/**
 * Appearance preferences (theme, text size, motion, haptics). Single source of truth: Settings v2 `appearance`
 * (services/settings.ts). The old `chiwiwi_theme.json` is imported once by initSettings. Mapping: light = Helios,
 * dark = Nyx; motion 'reduce' = reducedMotion.
 */
import { initSettings, settingsStore, updateSection } from '../services/settings.ts';
import { defaultPrefs, parsePrefs, type AppearancePrefs } from './theme';

export type { AppearancePrefs, MotionPref, ThemePref } from './theme';
export { defaultPrefs } from './theme';

export async function loadAppearance(): Promise<AppearancePrefs> {
  try {
    await initSettings();
    const a = settingsStore.getState().appearance;
    return parsePrefs({
      pref: a.theme === 'helios' ? 'light' : a.theme === 'nyx' ? 'dark' : 'system',
      textScale: a.textScale,
      motion: a.reducedMotion ? 'reduce' : 'system',
      haptics: a.haptics,
    });
  } catch {
    return defaultPrefs;
  }
}

export function saveAppearance(p: AppearancePrefs): void {
  updateSection('appearance', {
    theme: p.pref === 'light' ? 'helios' : p.pref === 'dark' ? 'nyx' : 'system',
    textScale: p.textScale,
    reducedMotion: p.motion === 'reduce',
    haptics: p.haptics,
  });
}
