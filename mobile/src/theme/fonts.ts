import { useEffect, useMemo, useState } from 'react';
import { useFonts } from 'expo-font';
import { Cinzel_600SemiBold } from '@expo-google-fonts/cinzel/600SemiBold';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import type { FontFamilies } from './tokens';

const GIVE_UP_MS = 350;

/**
 * Inter (UI, 400 + 600) and Cinzel (wordmark only). Deep imports keep the other 100+ font files out of the bundle.
 * `done` flips true when fonts loaded, failed, or 3s passed: the app then renders with system fonts (graceful fallback)
 * and swaps to Inter by itself if the files arrive late.
 */
export function useAppFonts(): { families: FontFamilies; done: boolean } {
  const [loaded, error] = useFonts({ Inter_400Regular, Inter_600SemiBold, Cinzel_600SemiBold });
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setGaveUp(true), GIVE_UP_MS);
    return () => clearTimeout(id);
  }, []);
  const ok = loaded && !error;
  const families = useMemo<FontFamilies>(() => (ok ? { regular: 'Inter_400Regular', semibold: 'Inter_600SemiBold', wordmark: 'Inter_600SemiBold' } : {}), [ok]);
  return { families, done: loaded || !!error || gaveUp };
}
