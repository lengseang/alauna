import React, { useEffect, useRef } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';
import { makeStyles, useTheme } from '../theme';

/**
 * Shared curves. `enter` decelerates hard (things arrive and settle, like a door swung shut), `exit` accelerates out.
 * Use these, never linear, for UI transitions (linear is only for the slow ambient rotation).
 */
export const curves = {
  enter: Easing.bezier(0.22, 1, 0.36, 1),
  exit: Easing.bezier(0.4, 0, 1, 1),
  breathe: Easing.inOut(Easing.sin),
} as const;

/**
 * Looping 0 -> 1 -> 0 value on the native driver (sine easing). Static (0) when inactive or when the user asked
 * for reduced motion. `delay` offsets the first cycle so several loops do not beat in sync.
 */
export function useLoop(active: boolean, duration: number, delay = 0): Animated.Value {
  const { reduceMotion } = useTheme();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active || reduceMotion) {
      v.setValue(0);
      return;
    }
    const loop = Animated.sequence([
      Animated.delay(delay),
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration, easing: curves.breathe, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration, easing: curves.breathe, useNativeDriver: true }),
        ]),
      ),
    ]);
    loop.start();
    return () => loop.stop();
  }, [active, reduceMotion, duration, delay, v]);
  return v;
}

/** Slow "breathing" (opacity + 4% scale) while `active`, e.g. the wordmark while the app boots. */
export function Breathe({ active, children }: { active: boolean; children: React.ReactNode }) {
  const v = useLoop(active, 1400);
  return (
    <Animated.View style={{ opacity: v.interpolate({ inputRange: [0, 1], outputRange: [1, 0.55] }), transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) }] }}>
      {children}
    </Animated.View>
  );
}

/** The streaming cursor / "working" mark: a small accent lozenge (a square on its point) that pulses. Static under reduced motion. */
export function PulseDot({ active = true, size = 8 }: { active?: boolean; size?: number }) {
  const s = useStyles();
  const v = useLoop(active, 650);
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        s.dot,
        {
          width: size,
          height: size,
          margin: size * 0.2,
          opacity: v.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] }),
          transform: [{ rotate: '45deg' }, { scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 0.75] }) }],
        },
      ]}
    />
  );
}

/**
 * Fade + 8dp rise on mount (250ms). `enabled` is read once at mount, so list rows that merely scroll back into view
 * do not replay it. `delay` staggers groups (30-50ms per item). Skipped entirely under reduced motion.
 */
export function FadeIn({ children, enabled = true, delay = 0, style }: { children: React.ReactNode; enabled?: boolean; delay?: number; style?: StyleProp<ViewStyle> }) {
  const { reduceMotion, motion } = useTheme();
  const run = useRef(enabled && !reduceMotion).current;
  const v = useRef(new Animated.Value(run ? 0 : 1)).current;
  useEffect(() => {
    if (run) Animated.timing(v, { toValue: 1, duration: motion.base, delay, easing: curves.enter, useNativeDriver: true }).start();
  }, [run, v, delay, motion.base]);
  return <Animated.View style={[{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }, style]}>{children}</Animated.View>;
}

const useStyles = makeStyles(({ colors }) => ({
  dot: { backgroundColor: colors.accent },
}));
