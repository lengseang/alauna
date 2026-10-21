import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useTheme } from '../../theme';

interface FloatingBubbleConfig {
  id: number;
  size: number;
  xPercent: number; // initial horizontal position %
  yPercent: number; // initial vertical position %
  driftY: number;   // vertical float amplitude (px)
  driftX: number;   // horizontal float amplitude (px)
  duration: number; // cycle duration ms
  delay: number;
  colorMain: string;
  colorGlow: string;
  opacity: number;
}

const BUBBLE_PRESETS: FloatingBubbleConfig[] = [
  { id: 1, size: 48, xPercent: 12, yPercent: 22, driftY: -35, driftX: 18, duration: 4800, delay: 0, colorMain: '#00F0FF', colorGlow: '#38BDF8', opacity: 0.55 },
  { id: 2, size: 22, xPercent: 78, yPercent: 18, driftY: -28, driftX: -14, duration: 4200, delay: 400, colorMain: '#F59E0B', colorGlow: '#FDE047', opacity: 0.6 },
  { id: 3, size: 64, xPercent: 82, yPercent: 62, driftY: -45, driftX: -22, duration: 6200, delay: 800, colorMain: '#8B5CF6', colorGlow: '#C084FC', opacity: 0.45 },
  { id: 4, size: 16, xPercent: 24, yPercent: 68, driftY: -25, driftX: 12, duration: 3800, delay: 200, colorMain: '#10B981', colorGlow: '#34D399', opacity: 0.65 },
  { id: 5, size: 36, xPercent: 68, yPercent: 38, driftY: -32, driftX: 16, duration: 5100, delay: 1100, colorMain: '#EC4899', colorGlow: '#F472B6', opacity: 0.5 },
  { id: 6, size: 28, xPercent: 18, yPercent: 44, driftY: -30, driftX: -15, duration: 4600, delay: 600, colorMain: '#38BDF8', colorGlow: '#93C5FD', opacity: 0.55 },
  { id: 7, size: 54, xPercent: 42, yPercent: 76, driftY: -40, driftX: 20, duration: 5800, delay: 1400, colorMain: '#FBBF24', colorGlow: '#FDE68A', opacity: 0.45 },
  { id: 8, size: 14, xPercent: 88, yPercent: 48, driftY: -22, driftX: -10, duration: 3500, delay: 300, colorMain: '#06B6D4', colorGlow: '#67E8F9', opacity: 0.7 },
  { id: 9, size: 32, xPercent: 32, yPercent: 14, driftY: -34, driftX: -18, duration: 4900, delay: 900, colorMain: '#A855F7', colorGlow: '#D8B4FE', opacity: 0.5 },
  { id: 10, size: 20, xPercent: 54, yPercent: 28, driftY: -26, driftX: 14, duration: 4100, delay: 700, colorMain: '#14B8A6', colorGlow: '#5EEAD4', opacity: 0.6 },
  { id: 11, size: 42, xPercent: 6, yPercent: 82, driftY: -36, driftX: 18, duration: 5400, delay: 1200, colorMain: '#F43F5E', colorGlow: '#FB7185', opacity: 0.48 },
  { id: 12, size: 18, xPercent: 62, yPercent: 84, driftY: -24, driftX: -12, duration: 3900, delay: 500, colorMain: '#6366F1', colorGlow: '#A5B4FC', opacity: 0.65 },
];

function FloatingBubbleItem({ config }: { config: FloatingBubbleConfig }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(config.delay),
        Animated.timing(anim, {
          toValue: 1,
          duration: config.duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: config.duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim, config]);

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, config.driftY],
  });

  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, config.driftX],
  });

  const scale = anim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.08, 0.96],
  });

  const r = config.size / 2;
  const gradId = `bGrad_${config.id}`;

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: `${config.xPercent}%`,
        top: `${config.yPercent}%`,
        width: config.size,
        height: config.size,
        marginLeft: -r,
        marginTop: -r,
        opacity: config.opacity,
        transform: [{ translateY }, { translateX }, { scale }],
      }}
    >
      <Svg width={config.size} height={config.size}>
        <Defs>
          <RadialGradient id={gradId} cx="35%" cy="32%" rx="65%" ry="65%">
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.8" />
            <Stop offset="30%" stopColor={config.colorGlow} stopOpacity="0.55" />
            <Stop offset="75%" stopColor={config.colorMain} stopOpacity="0.25" />
            <Stop offset="100%" stopColor={config.colorMain} stopOpacity="0.05" />
          </RadialGradient>
        </Defs>

        {/* Translucent bubble sphere body */}
        <Circle cx={r} cy={r} r={r - 1} fill={`url(#${gradId})`} />

        {/* Delicate luminous rim ring */}
        <Circle
          cx={r}
          cy={r}
          r={r - 1.2}
          fill="none"
          stroke={config.colorGlow}
          strokeWidth={1.2}
          strokeOpacity={0.7}
        />

        {/* Upper specular reflection highlight */}
        <Circle
          cx={r * 0.62}
          cy={r * 0.58}
          r={Math.max(1.5, r * 0.22)}
          fill="#FFFFFF"
          fillOpacity={0.8}
        />
      </Svg>
    </Animated.View>
  );
}

/**
 * Animated Neon Ambient Canvas with Multi-Sized Floating Bubbles.
 * Replaces static backdrop with fluid living neon waves and organic floating bubbles.
 */
export function NeonBubbleBackground() {
  const { isDark } = useTheme();
  const auraPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(auraPulse, {
          toValue: 1,
          duration: 6500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(auraPulse, {
          toValue: 0,
          duration: 6500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [auraPulse]);

  const auraScale = auraPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.95, 1.15],
  });

  const auraOpacity = auraPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.55, 0.85],
  });

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* Dynamic Pulsing Neon Aurora Radial Glow */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ scale: auraScale }],
            opacity: auraOpacity,
          },
        ]}
      >
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id="auroraGlowA" cx="50%" cy="38%" rx="55%" ry="45%">
              <Stop offset="0%" stopColor={isDark ? '#0284C7' : '#F59E0B'} stopOpacity={isDark ? '0.35' : '0.28'} />
              <Stop offset="45%" stopColor={isDark ? '#7C3AED' : '#F43F5E'} stopOpacity={isDark ? '0.20' : '0.14'} />
              <Stop offset="80%" stopColor={isDark ? '#0F172A' : '#FEF3C7'} stopOpacity={isDark ? '0.08' : '0.04'} />
              <Stop offset="100%" stopColor="transparent" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx="50%" cy="40%" r="55%" fill="url(#auroraGlowA)" />
        </Svg>
      </Animated.View>

      {/* Floating Multi-Sized Colorful Neon Bubbles */}
      {BUBBLE_PRESETS.map((cfg) => (
        <FloatingBubbleItem key={cfg.id} config={cfg} />
      ))}
    </View>
  );
}
