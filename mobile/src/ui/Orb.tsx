import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme';

interface Props {
  size?: number;
  onPress?: () => void;
  label?: string;
}

/**
 * Modern Liquid Glass Bubble UI.
 * Realistic soap/glass bubble physics:
 * - High transparency liquid core (transparent center, zero solid marble look)
 * - Chromatic aberration thin-film iridescence rim (cyan, magenta, violet, soft gold)
 * - Broad, fluid floating physics (large vertical drift + horizontal sway + tilt)
 * - Dynamic surface tension breathing / fluid organic squish
 * - Multi-bounce elastic spring jiggle on touch with haptic tactile response
 * - Three harmonic orbiting satellite micro-bubbles
 * - Living companion temperament glow that breathes rhythmically
 */
export function Orb({ size = 150, onPress, label = 'Alauna Bubble' }: Props) {
  const { isDark } = useTheme();

  // Floating & fluid drift animations (broader physics)
  const floatAnim = useRef(new Animated.Value(0)).current;
  const swayAnim = useRef(new Animated.Value(0)).current;
  const morphAnim = useRef(new Animated.Value(0)).current;
  const satelliteAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;

  // Interactive touch spring values
  const tapScale = useRef(new Animated.Value(1)).current;
  const tapSquishX = useRef(new Animated.Value(1)).current;
  const tapSquishY = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Broad vertical floating drift wave (3.6s cycle)
    const float = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: 1,
          duration: 3600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 3600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    // Horizontal swaying drift & tilt (4.8s cycle)
    const sway = Animated.loop(
      Animated.sequence([
        Animated.timing(swayAnim, {
          toValue: 1,
          duration: 4800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(swayAnim, {
          toValue: 0,
          duration: 4800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    // Organic surface tension breathing (fluid squish and stretch)
    const morph = Animated.loop(
      Animated.sequence([
        Animated.timing(morphAnim, {
          toValue: 1,
          duration: 2600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(morphAnim, {
          toValue: 0,
          duration: 2600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    // Satellite micro-bubbles orbital motion
    const sat = Animated.loop(
      Animated.sequence([
        Animated.timing(satelliteAnim, {
          toValue: 1,
          duration: 5400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(satelliteAnim, {
          toValue: 0,
          duration: 5400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    // Living companion temperament pulse (gentle heartbeat aura)
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    float.start();
    sway.start();
    morph.start();
    sat.start();
    pulse.start();

    return () => {
      float.stop();
      sway.stop();
      morph.stop();
      sat.stop();
      pulse.stop();
    };
  }, [floatAnim, swayAnim, morphAnim, satelliteAnim, pulseAnim]);

  // Broader physical trajectory
  const translateY = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-26, 26],
  });

  const translateX = swayAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-18, 18],
  });

  const rotate = swayAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['-5deg', '5deg'],
  });

  // Dynamic fluid surface tension squish
  const scaleX = morphAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.92, 1.08],
  });

  const scaleY = morphAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1.08, 0.92],
  });

  // Satellite micro-bubble trajectories
  const sat1Y = satelliteAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-18, 14],
  });

  const sat2Y = satelliteAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [14, -20],
  });

  const sat3Y = satelliteAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-10, 16],
  });

  const handlePressIn = () => {
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // safe fallback
    }

    Animated.parallel([
      Animated.spring(tapScale, {
        toValue: 0.88,
        friction: 4,
        tension: 100,
        useNativeDriver: true,
      }),
      Animated.spring(tapSquishX, {
        toValue: 1.15,
        friction: 4,
        tension: 100,
        useNativeDriver: true,
      }),
      Animated.spring(tapSquishY, {
        toValue: 0.85,
        friction: 4,
        tension: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handlePressOut = () => {
    // Multi-stage elastic liquid jiggle rebound
    Animated.parallel([
      Animated.spring(tapScale, {
        toValue: 1,
        friction: 2.8,
        tension: 60,
        useNativeDriver: true,
      }),
      Animated.spring(tapSquishX, {
        toValue: 1,
        friction: 2.8,
        tension: 60,
        useNativeDriver: true,
      }),
      Animated.spring(tapSquishY, {
        toValue: 1,
        friction: 2.8,
        tension: 60,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const c = size / 2;
  const r = size * 0.42;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={{
        width: size + 50,
        height: size + 50,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Animated.View
        style={{
          width: size,
          height: size,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [
            { translateX },
            { translateY },
            { rotate },
            { scaleX: Animated.multiply(scaleX, tapSquishX) },
            { scaleY: Animated.multiply(scaleY, tapSquishY) },
            { scale: tapScale },
          ],
        }}
      >
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Defs>
            {/* Soft Ambient Radiance Aura Glow */}
            <RadialGradient id="bubbleAura" cx="50%" cy="50%" rx="50%" ry="50%" fx="50%" fy="50%">
              <Stop offset="0%" stopColor={isDark ? '#E056FD' : '#C084FC'} stopOpacity="0.25" />
              <Stop offset="60%" stopColor={isDark ? '#38BDF8' : '#93C5FD'} stopOpacity="0.08" />
              <Stop offset="100%" stopColor={isDark ? '#09090C' : '#FFFFFF'} stopOpacity="0" />
            </RadialGradient>

            {/* Crystal-Clear Liquid Glass Core Body (hyper-translucent, zero marble look) */}
            <RadialGradient id="liquidCore" cx="45%" cy="40%" rx="55%" ry="55%" fx="45%" fy="40%">
              <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.10" />
              <Stop offset="65%" stopColor={isDark ? '#C084FC' : '#DDD6FE'} stopOpacity="0.03" />
              <Stop offset="85%" stopColor={isDark ? '#38BDF8' : '#BAE6FD'} stopOpacity="0.06" />
              <Stop offset="100%" stopColor={isDark ? '#A855F7' : '#818CF8'} stopOpacity="0.14" />
            </RadialGradient>

            {/* Iridescent Thin-Film Soap Fringe (intense chromatic dispersion at edge only) */}
            <RadialGradient id="chromaticRim" cx="50%" cy="50%" rx="50%" ry="50%" fx="50%" fy="50%">
              <Stop offset="0%" stopColor="transparent" stopOpacity="0" />
              <Stop offset="82%" stopColor="transparent" stopOpacity="0" />
              <Stop offset="87%" stopColor="#06B6D4" stopOpacity="0.55" />
              <Stop offset="91%" stopColor="#EC4899" stopOpacity="0.75" />
              <Stop offset="95%" stopColor="#8B5CF6" stopOpacity="0.65" />
              <Stop offset="98%" stopColor="#FDE047" stopOpacity="0.45" />
              <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.95" />
            </RadialGradient>

            {/* Ambient Caustic Bounce Light on Bottom Curve */}
            <RadialGradient id="bottomBounce" cx="52%" cy="86%" rx="45%" ry="30%" fx="52%" fy="86%">
              <Stop offset="0%" stopColor="#38BDF8" stopOpacity="0.45" />
              <Stop offset="55%" stopColor="#E056FD" stopOpacity="0.22" />
              <Stop offset="100%" stopColor="transparent" stopOpacity="0" />
            </RadialGradient>
          </Defs>

          {/* Diffused Atmospheric Glow */}
          <Circle cx={c} cy={c} r={size * 0.48} fill="url(#bubbleAura)" />

          {/* Hyper-Translucent Liquid Glass Body */}
          <Circle cx={c} cy={c} r={r} fill="url(#liquidCore)" />

          {/* Iridescent Chromatic Rim Dispersion */}
          <Circle cx={c} cy={c} r={r} fill="url(#chromaticRim)" />

          {/* Bottom Caustic Bounce Light */}
          <Circle cx={c} cy={c} r={r} fill="url(#bottomBounce)" />

          {/* Primary Curved Liquid Specular Glare (Top-Left Highlight) */}
          <Path
            d={`M ${c - r * 0.68} ${c - r * 0.22} C ${c - r * 0.62} ${c - r * 0.68}, ${c - r * 0.18} ${c - r * 0.72}, ${c + r * 0.15} ${c - r * 0.65} C ${c - r * 0.12} ${c - r * 0.54}, ${c - r * 0.48} ${c - r * 0.46}, ${c - r * 0.68} ${c - r * 0.22} Z`}
            fill="#FFFFFF"
            fillOpacity="0.75"
          />

          {/* Crisp Specular Point Glint */}
          <Circle
            cx={c - r * 0.44}
            cy={c - r * 0.48}
            r={r * 0.075}
            fill="#FFFFFF"
            fillOpacity="0.90"
          />

          {/* Secondary Soft Rim Reflection on Bottom-Right */}
          <Path
            d={`M ${c + r * 0.28} ${c + r * 0.60} C ${c + r * 0.58} ${c + r * 0.46}, ${c + r * 0.64} ${c + r * 0.22}, ${c + r * 0.64} ${c + r * 0.10} C ${c + r * 0.60} ${c + r * 0.28}, ${c + r * 0.48} ${c + r * 0.48}, ${c + r * 0.28} ${c + r * 0.60} Z`}
            fill="#38BDF8"
            fillOpacity="0.50"
          />
        </Svg>
      </Animated.View>

      {/* Floating Micro-Bubble Satellite 1 (Top Right) */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 6,
          right: 14,
          transform: [{ translateY: sat1Y }],
        }}
      >
        <Svg width={24} height={24} viewBox="0 0 24 24">
          <Circle cx={12} cy={12} r={9} fill="none" stroke="#E056FD" strokeWidth={1} strokeOpacity={0.6} />
          <Circle cx={12} cy={12} r={9} fill="#38BDF8" fillOpacity={0.15} />
          <Circle cx={9} cy={9} r={2.5} fill="#FFFFFF" fillOpacity={0.7} />
        </Svg>
      </Animated.View>

      {/* Floating Micro-Bubble Satellite 2 (Bottom Left) */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          bottom: 12,
          left: 10,
          transform: [{ translateY: sat2Y }],
        }}
      >
        <Svg width={18} height={18} viewBox="0 0 18 18">
          <Circle cx={9} cy={9} r={7} fill="none" stroke="#38BDF8" strokeWidth={0.8} strokeOpacity={0.5} />
          <Circle cx={9} cy={9} r={7} fill="#C084FC" fillOpacity={0.12} />
          <Circle cx={7} cy={7} r={1.8} fill="#FFFFFF" fillOpacity={0.65} />
        </Svg>
      </Animated.View>

      {/* Floating Micro-Bubble Satellite 3 (Top Left) */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 24,
          left: 8,
          transform: [{ translateY: sat3Y }],
        }}
      >
        <Svg width={14} height={14} viewBox="0 0 14 14">
          <Circle cx={7} cy={7} r={5} fill="none" stroke="#EC4899" strokeWidth={0.8} strokeOpacity={0.5} />
          <Circle cx={7} cy={7} r={5} fill="#38BDF8" fillOpacity={0.1} />
          <Circle cx={5.5} cy={5.5} r={1.2} fill="#FFFFFF" fillOpacity={0.6} />
        </Svg>
      </Animated.View>
    </Pressable>
  );
}
