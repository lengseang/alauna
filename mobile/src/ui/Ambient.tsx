import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { useTheme } from '../theme';
import { AMBIENT_BUBBLES, SIRI_NEON, type FloatingBubbleConfig } from './ambientColors';

const WHITE = 'white';

/**
 * Siri-style swirling neon aurora backdrop.
 * Animated multi-chromatic fluid radiance (Electric Cyan, Hot Magenta, Royal Violet, Warm Amber/Gold)
 * that breathes, rotates, and pulses organically like Apple Intelligence / Siri.
 */
function SiriNeonBackdrop() {
  const { isDark, reduceMotion } = useTheme();
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const driftAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) return;

    // Slow, hypnotic 22s rotation
    const rotate = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 22000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    // Fluid 5.6s breathing pulse
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 5600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 5600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );

    // Gentle 8.4s fluid drift
    const drift = Animated.loop(
      Animated.sequence([
        Animated.timing(driftAnim, {
          toValue: 1,
          duration: 8400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(driftAnim, {
          toValue: 0,
          duration: 8400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );

    rotate.start();
    pulse.start();
    drift.start();

    return () => {
      rotate.stop();
      pulse.stop();
      drift.stop();
    };
  }, [reduceMotion, rotateAnim, pulseAnim, driftAnim]);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const scale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.92, 1.14],
  });

  const opacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: isDark ? [0.45, 0.75] : [0.35, 0.6],
  });

  const translateY = driftAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-24, 24],
  });

  const translateX = driftAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-18, 18],
  });

  const size = 520;
  const half = size / 2;

  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: -100,
        left: '50%',
        marginLeft: -half,
        width: size,
        height: size,
        opacity,
        transform: [{ translateY }, { translateX }, { scale }, { rotate: spin }],
      }}
    >
      <Svg width={size} height={size}>
        <Defs>
          {/* Siri Flare 1: Electric Cyan & Sky */}
          <RadialGradient id="siriCyan" cx="35%" cy="35%" rx="45%" ry="45%">
            <Stop offset="0%" stopColor={SIRI_NEON.cyan} stopOpacity={isDark ? '0.42' : '0.28'} />
            <Stop offset="55%" stopColor={SIRI_NEON.sky} stopOpacity={isDark ? '0.2' : '0.12'} />
            <Stop offset="100%" stopColor={SIRI_NEON.cyan} stopOpacity="0" />
          </RadialGradient>

          {/* Siri Flare 2: Neon Magenta / Pink */}
          <RadialGradient id="siriMagenta" cx="68%" cy="32%" rx="48%" ry="48%">
            <Stop offset="0%" stopColor={SIRI_NEON.magenta} stopOpacity={isDark ? '0.45' : '0.3'} />
            <Stop offset="55%" stopColor={SIRI_NEON.pink} stopOpacity={isDark ? '0.18' : '0.12'} />
            <Stop offset="100%" stopColor={SIRI_NEON.magenta} stopOpacity="0" />
          </RadialGradient>

          {/* Siri Flare 3: Royal Violet / Purple Core */}
          <RadialGradient id="siriViolet" cx="50%" cy="62%" rx="50%" ry="50%">
            <Stop offset="0%" stopColor={SIRI_NEON.violet} stopOpacity={isDark ? '0.5' : '0.32'} />
            <Stop offset="60%" stopColor={SIRI_NEON.purple} stopOpacity={isDark ? '0.22' : '0.12'} />
            <Stop offset="100%" stopColor={SIRI_NEON.violet} stopOpacity="0" />
          </RadialGradient>

          {/* Siri Flare 4: Warm Amber / Gold Radiance */}
          <RadialGradient id="siriGold" cx="50%" cy="48%" rx="35%" ry="35%">
            <Stop offset="0%" stopColor={SIRI_NEON.gold} stopOpacity={isDark ? '0.35' : '0.22'} />
            <Stop offset="70%" stopColor={SIRI_NEON.amber} stopOpacity={isDark ? '0.12' : '0.06'} />
            <Stop offset="100%" stopColor={SIRI_NEON.gold} stopOpacity="0" />
          </RadialGradient>
        </Defs>

        <Circle cx={half * 0.7} cy={half * 0.7} r={half * 0.75} fill="url(#siriCyan)" />
        <Circle cx={half * 1.35} cy={half * 0.65} r={half * 0.8} fill="url(#siriMagenta)" />
        <Circle cx={half} cy={half * 1.25} r={half * 0.85} fill="url(#siriViolet)" />
        <Circle cx={half} cy={half} r={half * 0.6} fill="url(#siriGold)" />
      </Svg>
    </Animated.View>
  );
}

/**
 * Individual physical liquid soap bubble drifting in the ambient field.
 * Semi-transparent fluid body, colorful iridescence rim, curved specular highlight arc.
 */
function FloatingBubbleItem({ cfg }: { cfg: FloatingBubbleConfig }) {
  const { isDark, reduceMotion } = useTheme();
  const floatAnim = useRef(new Animated.Value(0)).current;
  const swayAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) return;

    const float = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: 1,
          duration: cfg.duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: cfg.duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );

    const sway = Animated.loop(
      Animated.sequence([
        Animated.timing(swayAnim, {
          toValue: 1,
          duration: cfg.swayDuration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(swayAnim, {
          toValue: 0,
          duration: cfg.swayDuration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );

    float.start();
    sway.start();

    return () => {
      float.stop();
      sway.stop();
    };
  }, [reduceMotion, floatAnim, swayAnim, cfg]);

  const translateY = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-cfg.dy, cfg.dy],
  });

  const translateX = swayAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-cfg.dx, cfg.dx],
  });

  const scale = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1.04],
  });

  const s = cfg.size;
  const c = s / 2;
  const r = s * 0.44;

  const gradId = `ambientGrad_${cfg.id}`;
  const auraId = `ambientAura_${cfg.id}`;

  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: cfg.top,
        bottom: cfg.bottom,
        left: cfg.left,
        right: cfg.right,
        width: s,
        height: s,
        transform: [{ translateY }, { translateX }, { scale }],
        opacity: isDark ? 0.72 : 0.55,
      }}
    >
      <Svg width={s} height={s}>
        <Defs>
          {/* Subtle Outer Neon Aura */}
          <RadialGradient id={auraId} cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0%" stopColor={cfg.glowColor} stopOpacity={isDark ? '0.35' : '0.22'} />
            <Stop offset="70%" stopColor={cfg.colorA} stopOpacity={isDark ? '0.12' : '0.06'} />
            <Stop offset="100%" stopColor={cfg.colorB} stopOpacity="0" />
          </RadialGradient>

          {/* Liquid Glass Body: High Transparency Core with Vibrant Iridescent Rim */}
          <RadialGradient id={gradId} cx="36%" cy="32%" rx="64%" ry="64%">
            <Stop offset="0%" stopColor={WHITE} stopOpacity={isDark ? '0.22' : '0.35'} />
            <Stop offset="42%" stopColor={cfg.colorA} stopOpacity={isDark ? '0.06' : '0.04'} />
            <Stop offset="78%" stopColor={cfg.colorB} stopOpacity={isDark ? '0.28' : '0.18'} />
            <Stop offset="96%" stopColor={cfg.glowColor} stopOpacity={isDark ? '0.55' : '0.35'} />
            <Stop offset="100%" stopColor={WHITE} stopOpacity={isDark ? '0.35' : '0.2'} />
          </RadialGradient>
        </Defs>

        {/* Outer Soft Glow Halo */}
        <Circle cx={c} cy={c} r={c * 0.98} fill={`url(#${auraId})`} />

        {/* Liquid Glass Soap Bubble Shell */}
        <Circle
          cx={c}
          cy={c}
          r={r}
          fill={`url(#${gradId})`}
          stroke={cfg.glowColor}
          strokeWidth={1}
          strokeOpacity={isDark ? 0.45 : 0.28}
        />

        {/* Upper-Left Curved Specular Reflection Arc */}
        <Path
          d={`M ${c - r * 0.65} ${c - r * 0.2} A ${r * 0.7} ${r * 0.7} 0 0 1 ${c + r * 0.2} ${c - r * 0.65}`}
          stroke={WHITE}
          strokeWidth={Math.max(1, s * 0.04)}
          strokeOpacity={isDark ? 0.55 : 0.4}
          strokeLinecap="round"
          fill="none"
        />

        {/* Subtle Caustic Bottom Light */}
        <Path
          d={`M ${c - r * 0.4} ${c + r * 0.6} A ${r * 0.75} ${r * 0.75} 0 0 0 ${c + r * 0.5} ${c + r * 0.45}`}
          stroke={cfg.colorA}
          strokeWidth={Math.max(0.8, s * 0.025)}
          strokeOpacity={isDark ? 0.35 : 0.2}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
    </Animated.View>
  );
}

/**
 * Decorative backdrop for chat, boot, empty state, and onboarding:
 * - Animated Siri-like swirling neon aurora background
 * - Many multi-sized floating liquid glass bubbles drifting across the canvas
 * - Non-interactive, non-intrusive, zero performance cost on JS thread
 */
export function Ambient() {
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* Siri Neon Animated Radiance */}
      <SiriNeonBackdrop />

      {/* Floating Multi-Sized Colored Soap Bubbles */}
      {AMBIENT_BUBBLES.map((cfg) => (
        <FloatingBubbleItem key={cfg.id} cfg={cfg} />
      ))}
    </View>
  );
}
