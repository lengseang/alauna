import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Line, RadialGradient, Stop } from 'react-native-svg';
import { useTheme } from '../theme';
import { curves, useLoop } from './Motion';

/** Deterministic star positions (same every render, no Math.random in render). 42 points, 4 twinkle groups. */
const STARS = (() => {
  let seed = 11;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  return Array.from({ length: 42 }, (_, i) => ({ x: rnd() * 100, y: rnd() * 104 - 2, d: rnd() < 0.7 ? 1.5 : 2.5, o: 0.35 + rnd() * 0.6, group: i % 4, gold: i % 9 === 0 }));
})();
const GROUPS = [0, 1, 2, 3];
const TWINKLE_MS = [2600, 3400, 4200, 5000];

/** A gold four-point sparkle: two crossing hairlines (square ends), the only "big" stars. */
function Sparkle({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <View style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, width: 9, height: 9, marginLeft: -4, marginTop: -4 }}>
      <View style={{ position: 'absolute', left: 4, top: 0, width: 1, height: 9, backgroundColor: color }} />
      <View style={{ position: 'absolute', left: 0, top: 4, width: 9, height: 1, backgroundColor: color }} />
    </View>
  );
}

/** One meteor every ~14s: a hairline streak that crosses the upper sky and fades. 1 native animation. */
function Meteor() {
  const { colors, reduceMotion } = useTheme();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(13000),
        Animated.timing(v, { toValue: 1, duration: 900, easing: curves.exit, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, v]);
  if (reduceMotion) return null;
  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: '14%',
        left: '58%',
        width: 72,
        height: 1,
        backgroundColor: colors.glow,
        opacity: v.interpolate({ inputRange: [0, 0.1, 0.7, 1], outputRange: [0, 0.8, 0.5, 0] }),
        transform: [{ rotate: '-28deg' }, { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, -150] }) }],
      }}
    />
  );
}

/** Night: square points that twinkle in four offset groups, the whole sky drifting slowly (5 native loops, not 42). */
function StarField() {
  const { colors } = useTheme();
  const a = useLoop(true, TWINKLE_MS[0], 0);
  const b = useLoop(true, TWINKLE_MS[1], 700);
  const c = useLoop(true, TWINKLE_MS[2], 1500);
  const d = useLoop(true, TWINKLE_MS[3], 2300);
  const drift = useLoop(true, 30000);
  const vals = [a, b, c, d];
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -18] }) }] }]}>
      {GROUPS.map((g) => (
        <Animated.View key={g} style={[StyleSheet.absoluteFill, { opacity: vals[g].interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] }) }]}>
          {STARS.filter((s) => s.group === g).map((s, i) =>
            s.gold ? (
              <Sparkle key={i} x={s.x} y={s.y} color={colors.accent} />
            ) : (
              <View key={i} style={{ position: 'absolute', left: `${s.x}%`, top: `${s.y}%`, width: s.d, height: s.d, opacity: s.o, backgroundColor: colors.glow }} />
            ),
          )}
        </Animated.View>
      ))}
      <Meteor />
    </Animated.View>
  );
}

const RAYS = Array.from({ length: 16 }, (_, i) => ({ angle: (i * Math.PI * 2) / 16, from: i % 2 ? 175 : 150, to: i % 2 ? 225 : 255 }));
const SUN = 520;

/** Day: a soft radial sun that breathes, with sixteen square-ended rays turning once every two minutes. */
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
              strokeOpacity={0.4}
              strokeWidth={1.5}
              strokeLinecap="square"
            />
          ))}
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}

/**
 * Decorative backdrop for empty chat, boot and onboarding only (never behind dense content): stars in Nyx, sun in
 * Helios. Fills its parent, ignores touches, hidden from screen readers. Loops stop under reduced motion.
 */
export function Ambient() {
  const { isDark } = useTheme();
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {isDark ? <StarField /> : <SunGlow />}
    </View>
  );
}
