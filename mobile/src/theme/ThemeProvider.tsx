import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Appearance, StatusBar, StyleSheet, useColorScheme } from 'react-native';
import * as SystemUI from 'expo-system-ui';
import { useAppFonts } from './fonts';
import { defaultPrefs, loadAppearance, saveAppearance, type AppearancePrefs, type MotionPref, type ThemePref } from './prefs';
import { buildTheme, type Theme } from './theme';
import type { Scheme } from './palette';
import type { TextScale } from './tokens';

const ThemeCtx = createContext<Theme | null>(null);

export interface ThemePrefApi extends AppearancePrefs {
  setPref: (p: ThemePref) => void;
  setTextScale: (s: TextScale) => void;
  setMotion: (m: MotionPref) => void;
  setHaptics: (on: boolean) => void;
  /** What the OS currently asks for (shown next to "Follow my phone"). */
  systemReduceMotion: boolean;
}

const noop = () => {};
const PrefCtx = createContext<ThemePrefApi>({ ...defaultPrefs, setPref: noop, setTextScale: noop, setMotion: noop, setHaptics: noop, systemReduceMotion: false });

function useSystemReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduce(v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

/**
 * Owns light/dark (user choice 'system' | 'light' | 'dark'), text size, motion and haptics (persisted), fonts and the
 * OS reduced-motion flag. Renders nothing until the saved prefs and the fonts are resolved (worst case 3s, then system
 * fonts), so the native splash covers the wait and the first painted frame is already in the right theme.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [prefs, setPrefs] = useState<AppearancePrefs>(defaultPrefs);
  const [loaded, setLoaded] = useState(false);
  const { families, done } = useAppFonts();
  const systemReduceMotion = useSystemReduceMotion();

  useEffect(() => {
    loadAppearance().then((p) => {
      setPrefs(p);
      setLoaded(true);
    });
  }, []);

  // Make native dialogs (Alert) follow the in-app choice too.
  useEffect(() => {
    try {
      Appearance.setColorScheme(prefs.pref === 'system' ? 'unspecified' : prefs.pref);
    } catch {
      // Older runtimes: only the JS theme follows the choice.
    }
  }, [prefs.pref]);

  const scheme: Scheme = prefs.pref === 'system' ? (system === 'light' ? 'light' : 'dark') : prefs.pref;
  const reduceMotion = systemReduceMotion || prefs.motion === 'reduce';
  const theme = useMemo(() => buildTheme(scheme, families, reduceMotion, prefs.textScale, prefs.haptics), [scheme, families, reduceMotion, prefs.textScale, prefs.haptics]);
  const bg = theme.colors.bg;

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(bg).catch(() => {});
  }, [bg]);

  const update = useCallback((patch: Partial<AppearancePrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      saveAppearance(next);
      return next;
    });
  }, []);
  const api = useMemo<ThemePrefApi>(
    () => ({
      ...prefs,
      systemReduceMotion,
      setPref: (pref) => update({ pref }),
      setTextScale: (textScale) => update({ textScale }),
      setMotion: (motion) => update({ motion }),
      setHaptics: (haptics) => update({ haptics }),
    }),
    [prefs, systemReduceMotion, update],
  );

  if (!loaded || !done) return null;
  return (
    <ThemeCtx.Provider value={theme}>
      <PrefCtx.Provider value={api}>
        <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />
        {children}
      </PrefCtx.Provider>
    </ThemeCtx.Provider>
  );
}

export function useTheme(): Theme {
  const t = useContext(ThemeCtx);
  if (!t) throw new Error('useTheme() needs <ThemeProvider> above it');
  return t;
}

/** Appearance choices and their setters (persisted): `{ pref, setPref, textScale, setTextScale, motion, setMotion, haptics, setHaptics }`. */
export function useThemePref(): ThemePrefApi {
  return useContext(PrefCtx);
}

/**
 * Theme-aware StyleSheet. Define once at module level, call the returned hook in the component:
 *   const useStyles = makeStyles(({ colors, space }) => ({ box: { backgroundColor: colors.surface, padding: space.lg } }));
 *   const s = useStyles();
 * Styles are rebuilt only when the theme actually changes.
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(factory: (theme: Theme) => T): () => T {
  return function useStyles() {
    const theme = useTheme();
    return useMemo(() => StyleSheet.create(factory(theme)), [theme]);
  };
}
