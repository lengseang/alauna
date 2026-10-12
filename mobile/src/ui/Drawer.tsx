import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, PanResponder, Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { makeStyles, useTheme } from '../theme';
import { useBackHandler } from './nav';

export interface DrawerLayoutProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Panel content (thread list, nav rows). */
  drawer: React.ReactNode;
  /** The page. Swiping right on it opens the drawer. */
  children: React.ReactNode;
}

const clamp = (n: number) => Math.max(0, Math.min(1, n));

/**
 * Left slide-in drawer. Opens with a right-swipe anywhere on the page (mostly-horizontal drags only, so scrolling and
 * code blocks keep working) or from the menu button; closes with a left-swipe, a scrim tap, or Android Back.
 * The panel follows the finger; release settles with a native-driver animation (200-250ms).
 */
export function DrawerLayout({ open, onOpenChange, drawer, children }: DrawerLayoutProps) {
  const { reduceMotion, motion } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const s = useStyles();
  const W = Math.min(340, Math.round(screenW * 0.84));
  const p = useRef(new Animated.Value(open ? 1 : 0)).current; // 0 closed .. 1 open
  const openRef = useRef(open);
  openRef.current = open;
  const changeRef = useRef(onOpenChange);
  changeRef.current = onOpenChange;
  const startP = useRef(0);

  const animateTo = useCallback(
    (to: boolean) => {
      Animated.timing(p, { toValue: to ? 1 : 0, duration: reduceMotion ? 0 : to ? motion.base : 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    },
    [p, reduceMotion, motion.base],
  );
  useEffect(() => animateTo(open), [open, animateTo]);

  const settle = useCallback(
    (to: boolean) => {
      animateTo(to);
      if (to !== openRef.current) changeRef.current(to);
    },
    [animateTo],
  );

  const makePan = useCallback(
    (opening: boolean) =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => (opening ? !openRef.current && g.dx > 14 : openRef.current && g.dx < -10) && Math.abs(g.dx) > Math.abs(g.dy) * 1.8,
        onPanResponderGrant: () => {
          p.stopAnimation((v) => (startP.current = v));
        },
        onPanResponderMove: (_, g) => p.setValue(clamp(startP.current + g.dx / W)),
        // A flick decides first; a slow drag decides by how far the panel got.
        onPanResponderRelease: (_, g) => settle(g.vx > 0.5 ? true : g.vx < -0.5 ? false : clamp(startP.current + g.dx / W) > 0.5),
        onPanResponderTerminate: () => settle(openRef.current),
      }),
    [p, W, settle],
  );
  const openPan = useMemo(() => makePan(true), [makePan]);
  const closePan = useMemo(() => makePan(false), [makePan]);

  const close = useCallback(() => {
    onOpenChange(false);
    return true;
  }, [onOpenChange]);
  useBackHandler(open, close);

  return (
    <View style={s.root}>
      {/* Sliding Door Chat View: pushes to the right as the drawer opens */}
      <Animated.View
        style={[
          s.fill,
          {
            borderRadius: p.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 16],
            }),
            overflow: 'hidden',
            transform: [
              {
                translateX: p.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, W],
                }),
              },
              {
                scale: p.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 0.96],
                }),
              },
            ],
          },
        ]}
        {...openPan.panHandlers}
        importantForAccessibility={open ? 'no-hide-descendants' : 'auto'}
        accessibilityElementsHidden={open}
      >
        {children}
        {/* Translucent glass scrim over the pushed chat; tapping closes the door */}
        <Animated.View
          pointerEvents={open ? 'auto' : 'none'}
          style={[
            s.scrim,
            {
              opacity: p.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 0.45],
              }),
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close menu"
            style={s.fill}
            onPress={() => onOpenChange(false)}
          />
        </Animated.View>
      </Animated.View>

      {/* Sliding Drawer Panel: slides from -W to 0 synchronously */}
      <Animated.View
        {...closePan.panHandlers}
        importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
        accessibilityElementsHidden={!open}
        style={[
          s.panel,
          {
            width: W,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
            transform: [
              {
                translateX: p.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-W, 0],
                }),
              },
            ],
          },
        ]}
      >
        {drawer}
      </Animated.View>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  fill: { flex: 1 },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.scrim },
  panel: { position: 'absolute', top: 0, left: 0, bottom: 0, backgroundColor: colors.surface, borderRightWidth: 1, borderRightColor: colors.border },
}));
