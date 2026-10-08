import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Appearance, StatusBar, StyleSheet, useColorScheme } from 'react-native';
import * as SystemUI from 'expo-system-ui';
import { useAppFonts } from './fonts';
import { loadThemePref, saveThemePref, type ThemePref } from './prefs';
import { buildTheme, type Theme } from './theme';
import type { Scheme } from './palette';

const ThemeCtx = createContext<Theme | null>(null);
const PrefCtx = createContext<{ pref: ThemePref; setPref: (p: ThemePref) => void }>({ pref: 'system', setPref: () => {} });

function useReduceMotion(): boolean {
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
 * Owns light/dark (user choice 'system' | 'light' | 'dark', persisted), fonts and reduced-motion.
 * Renders nothing until the saved choice and the fonts are resolved (worst case 3s, then system fonts),
 * so the native splash covers the wait and the first painted frame is already in the right theme.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [pref, setPrefState] = useState<ThemePref>('system');
  const [prefLoaded, setPrefLoaded] = useState(false);
  const { families, done } = useAppFonts();
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    loadThemePref().then((p) => {
      setPrefState(p);
      setPrefLoaded(true);
    });
  }, []);

  // Make native dialogs (Alert) follow the in-app choice too.
  useEffect(() => {
    try {
      Appearance.setColorScheme(pref === 'system' ? 'unspecified' : pref);
    } catch {
      // Older runtimes: only the JS theme follows the choice.
    }
  }, [pref]);

  const scheme: Scheme = pref === 'system' ? (system === 'light' ? 'light' : 'dark') : pref;
  const theme = useMemo(() => buildTheme(scheme, families, reduceMotion), [scheme, families, reduceMotion]);
  const bg = theme.colors.bg;

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(bg).catch(() => {});
  }, [bg]);

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p);
    saveThemePref(p);
  }, []);
  const prefValue = useMemo(() => ({ pref, setPref }), [pref, setPref]);

  if (!prefLoaded || !done) return null;
  return (
    <ThemeCtx.Provider value={theme}>
      <PrefCtx.Provider value={prefValue}>
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

/** The user's light/dark choice and its setter (persisted). */
export function useThemePref() {
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
