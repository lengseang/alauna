import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Line, RadialGradient, Stop } from 'react-native-svg';
import { useTheme } from '../theme';
import { useLoop } from './Motion';

/** Deterministic star positions (same every render, no Math.random in render). 38 dots, 4 twinkle groups. */
const STARS = (() => {
  let seed = 11;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  return Array.from({ length: 38 }, (_, i) => ({ x: rnd() * 100, y: rnd() * 100, d: 1.5 + rnd() * 1.6, o: 0.35 + rnd() * 0.6, group: i % 4, gold: i % 7 === 0 }));
})();
const GROUPS = [0, 1, 2, 3];
const TWINKLE_MS = [2600, 3400, 4200, 5000];

/** Night: stars that breathe in four slow, offset groups (4 native animations total, not 38). */
function StarField() {
  const { colors } = useTheme();
  const a = useLoop(true, TWINKLE_MS[0], 0);
  const b = useLoop(true, TWINKLE_MS[1], 700);
  const c = useLoop(true, TWINKLE_MS[2], 1500);
  const d = useLoop(true, TWINKLE_MS[3], 2300);
  const vals = [a, b, c, d];
  return (
    <>
      {GROUPS.map((g) => (
        <Animated.View key={g} style={[StyleSheet.absoluteFill, { opacity: vals[g].interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] }) }]}>
          {STARS.filter((s) => s.group === g).map((s, i) => (
            <View
              key={i}
              style={{ position: 'absolute', left: `${s.x}%`, top: `${s.y}%`, width: s.d, height: s.d, borderRadius: s.d / 2, opacity: s.o, backgroundColor: s.gold ? colors.accent : colors.glow }}
            />
          ))}
        </Animated.View>
      ))}
    </>
  );
}

const RAYS = Array.from({ length: 16 }, (_, i) => ({ angle: (i * Math.PI * 2) / 16, from: i % 2 ? 175 : 150, to: i % 2 ? 225 : 255 }));
const SUN = 520;

/** Day: a soft radial sun that breathes, with thin rays turning once every two minutes. */
function SunGlow() {
  const { colors, reduceMotion } = useTheme();
  const breathe = useLoop(true, 4500);
  const turn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(Animated.timing(turn, { toValue: 1, duration: 120000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, turn]);
  const half = SUN / 2;
  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: -150,
        left: '50%',
        marginLeft: -half,
        width: SUN,
        height: SUN,
        opacity: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }),
        transform: [{ scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }) }],
      }}
    >
      <Svg width={SUN} height={SUN}>
        <Defs>
          <RadialGradient id="sun" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={colors.glow} stopOpacity="0.6" />
            <Stop offset="0.45" stopColor={colors.glow} stopOpacity="0.2" />
            <Stop offset="1" stopColor={colors.glow} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle cx={half} cy={half} r={half} fill="url(#sun)" />
      </Svg>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]}>
        <Svg width={SUN} height={SUN}>
          {RAYS.map((r, i) => (
            <Line
              key={i}
              x1={half + Math.cos(r.angle) * r.from}
              y1={half + Math.sin(r.angle) * r.from}
              x2={half + Math.cos(r.angle) * r.to}
              y2={half + Math.sin(r.angle) * r.to}
              stroke={colors.glow}
              strokeOpacity={0.35}
              strokeWidth={2}
              strokeLinecap="round"
            />
          ))}
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}

/**
 * Decorative backdrop for empty/onboarding states only (never behind dense content): stars in Nyx, sun in Helios.
 * Fills its parent, ignores touches, hidden from screen readers.
 */
export function Ambient() {
  const { isDark } = useTheme();
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {isDark ? <StarField /> : <SunGlow />}
    </View>
  );
}
