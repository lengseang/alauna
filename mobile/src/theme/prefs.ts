/**
 * Persisted theme preference. The shared settings model has no slot for it (and lives outside src/ui),
 * so it gets its own tiny file next to it in app-private storage. Same File API as services/settings.ts.
 */
import { File, Paths } from 'expo-file-system';

export type ThemePref = 'system' | 'light' | 'dark';

const FILE_NAME = 'chiwiwi_theme.json';
const file = () => new File(Paths.document, FILE_NAME);

export async function loadThemePref(): Promise<ThemePref> {
  try {
    const f = file();
    if (f.exists) {
      const pref = (JSON.parse(await f.text()) as { pref?: unknown }).pref;
      if (pref === 'light' || pref === 'dark' || pref === 'system') return pref;
    }
  } catch {
    // Corrupt or unreadable: fall back to following the system.
  }
  return 'system';
}

export function saveThemePref(pref: ThemePref): void {
  try {
    const f = file();
    if (!f.exists) f.create({ intermediates: true });
    f.write(JSON.stringify({ pref }));
  } catch {
    // A preference is a convenience; never crash for it.
  }
}
