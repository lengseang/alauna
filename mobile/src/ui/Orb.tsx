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
 * Interactive Liquid Glass Bubble.
 * Features realistic soap/glass bubble physics:
 * - High transparency liquid core (no solid marble look)
 * - Chromatic aberration iridescence rim (cyan, magenta, violet, soft gold)
 * - Fluid undulating 2D floating physics (vertical drift + horizontal sway)
 * - Surface tension breathing / organic squish
 * - Tactile spring jiggle & elastic touch response with haptic feedback
 * - Orbiting satellite micro-bubbles
 */
export function Orb({ size = 150, onPress, label = 'Alauna Bubble' }: Props) {
  const { isDark } = useTheme();

  // Floating & fluid drift animations
  const floatAnim = useRef(new Animated.Value(0)).current;
  const swayAnim = useRef(new Animated.Value(0)).current;
  const morphAnim = useRef(new Animated.Value(0)).current;
  const satelliteAnim = useRef(new Animated.Value(0)).current;

  // Interactive touch spring values
  const tapScale = useRef(new Animated.Value(1)).current;
  const tapSquishX = useRef(new Animated.Value(1)).current;
  const tapSquishY = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Vertical floating wave (3.2s cycle)
    const float = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: 1,
          duration: 3200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 3200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    // Horizontal swaying drift (4.4s cycle, offset for natural figure-8 wander)
    const sway = Animated.loop(
      Animated.sequence([
        Animated.timing(swayAnim, {
          toValue: 1,
          duration: 4400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(swayAnim, {
          toValue: 0,
          duration: 4400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    // Organic surface tension breathing (subtle morphing)
    const morph = Animated.loop(
      Animated.sequence([
        Animated.timing(morphAnim, {
          toValue: 1,
          duration: 2800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(morphAnim, {
          toValue: 0,
          duration: 2800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    // Satellite micro-bubbles gentle orbital drift
    const sat = Animated.loop(
      Animated.sequence([
        Animated.timing(satelliteAnim, {
          toValue: 1,
          duration: 5000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(satelliteAnim, {
          toValue: 0,
          duration: 5000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    float.start();
    sway.start();
    morph.start();
    sat.start();

    return () => {
      float.stop();
      sway.stop();
      morph.stop();
      sat.stop();
    };
  }, [floatAnim, swayAnim, morphAnim, satelliteAnim]);

  // Interpolated physical motion
  const translateY = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-14, 14],
  });

  const translateX = swayAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-8, 8],
  });

  const scaleX = morphAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.97, 1.03],
  });

  const scaleY = morphAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1.03, 0.97],
  });

  const sat1Y = satelliteAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-10, 8],
  });

  const sat2Y = satelliteAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [6, -12],
  });

  const handlePressIn = () => {
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // safe fallback in environments without haptics
    }

    Animated.parallel([
      Animated.spring(tapScale, {
        toValue: 0.91,
        friction: 4,
        tension: 80,
        useNativeDriver: true,
      }),
      Animated.spring(tapSquishX, {
        toValue: 1.08,
        friction: 4,
        tension: 80,
        useNativeDriver: true,
      }),
      Animated.spring(tapSquishY, {
        toValue: 0.92,
        friction: 4,
        tension: 80,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handlePressOut = () => {
    Animated.parallel([
      Animated.spring(tapScale, {
        toValue: 1,
        friction: 3.2,
        tension: 50,
        useNativeDriver: true,
      }),
      Animated.spring(tapSquishX, {
        toValue: 1,
        friction: 3.2,
        tension: 50,
        useNativeDriver: true,
      }),
      Animated.spring(tapSquishY, {
        toValue: 1,
        friction: 3.2,
        tension: 50,
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
        width: size + 30,
        height: size + 30,
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
              <Stop offset="0%" stopColor={isDark ? '#E056FD' : '#C084FC'} stopOpacity="0.35" />
              <Stop offset="55%" stopColor={isDark ? '#38BDF8' : '#93C5FD'} stopOpacity="0.15" />
              <Stop offset="100%" stopColor={isDark ? '#09090C' : '#FFFFFF'} stopOpacity="0" />
            </RadialGradient>

            {/* Translucent Liquid Glass Core Body (delicate, transparent) */}
            <RadialGradient id="liquidCore" cx="42%" cy="38%" rx="58%" ry="58%" fx="42%" fy="38%">
              <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.22" />
              <Stop offset="45%" stopColor={isDark ? '#C084FC' : '#DDD6FE'} stopOpacity="0.08" />
              <Stop offset="75%" stopColor={isDark ? '#38BDF8' : '#BAE6FD'} stopOpacity="0.12" />
              <Stop offset="100%" stopColor={isDark ? '#A855F7' : '#818CF8'} stopOpacity="0.25" />
            </RadialGradient>

            {/* Iridescent Soap Bubble Chromatic Edge Fringe */}
            <RadialGradient id="chromaticRim" cx="50%" cy="50%" rx="50%" ry="50%" fx="50%" fy="50%">
              <Stop offset="0%" stopColor="transparent" stopOpacity="0" />
              <Stop offset="78%" stopColor="transparent" stopOpacity="0" />
              <Stop offset="84%" stopColor="#38BDF8" stopOpacity="0.45" />
              <Stop offset="90%" stopColor="#E056FD" stopOpacity="0.70" />
              <Stop offset="95%" stopColor="#F43F5E" stopOpacity="0.55" />
              <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.90" />
            </RadialGradient>

            {/* Ambient Caustic Bounce Light on Bottom Curve */}
            <RadialGradient id="bottomBounce" cx="55%" cy="85%" rx="45%" ry="35%" fx="55%" fy="85%">
              <Stop offset="0%" stopColor="#38BDF8" stopOpacity="0.40" />
              <Stop offset="60%" stopColor="#E056FD" stopOpacity="0.20" />
              <Stop offset="100%" stopColor="transparent" stopOpacity="0" />
            </RadialGradient>
          </Defs>

          {/* Diffused Atmospheric Glow */}
          <Circle cx={c} cy={c} r={size * 0.48} fill="url(#bubbleAura)" />

          {/* Translucent Liquid Glass Body */}
          <Circle cx={c} cy={c} r={r} fill="url(#liquidCore)" />

          {/* Chromatic Rim Refraction */}
          <Circle cx={c} cy={c} r={r} fill="url(#chromaticRim)" />

          {/* Bottom Caustic Bounce Light */}
          <Circle cx={c} cy={c} r={r} fill="url(#bottomBounce)" />

          {/* Curved Liquid Specular Glare (Top-Left Highlight) */}
          <Path
            d={`M ${c - r * 0.65} ${c - r * 0.25} C ${c - r * 0.6} ${c - r * 0.65}, ${c - r * 0.2} ${c - r * 0.68}, ${c + r * 0.1} ${c - r * 0.62} C ${c - r * 0.15} ${c - r * 0.52}, ${c - r * 0.48} ${c - r * 0.45}, ${c - r * 0.65} ${c - r * 0.25} Z`}
            fill="#FFFFFF"
            fillOpacity="0.65"
          />

          {/* Crisp Specular Point Glint */}
          <Circle
            cx={c - r * 0.45}
            cy={c - r * 0.48}
            r={r * 0.08}
            fill="#FFFFFF"
            fillOpacity="0.85"
          />

          {/* Secondary Soft Rim Reflection on Bottom-Right */}
          <Path
            d={`M ${c + r * 0.3} ${c + r * 0.58} C ${c + r * 0.55} ${c + r * 0.45}, ${c + r * 0.62} ${c + r * 0.2}, ${c + r * 0.62} ${c + r * 0.1} C ${c + r * 0.58} ${c + r * 0.28}, ${c + r * 0.48} ${c + r * 0.48}, ${c + r * 0.3} ${c + r * 0.58} Z`}
            fill="#38BDF8"
            fillOpacity="0.45"
          />
        </Svg>
      </Animated.View>

      {/* Floating Micro-Bubble Satellite 1 (Top Right) */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 10,
          right: 18,
          transform: [{ translateY: sat1Y }],
        }}
      >
        <Svg width={22} height={22} viewBox="0 0 22 22">
          <Circle cx={11} cy={11} r={8} fill="#E056FD" fillOpacity="0.25" stroke="#FFFFFF" strokeWidth="0.75" strokeOpacity="0.8" />
          <Circle cx={8.5} cy={8.5} r={2} fill="#FFFFFF" fillOpacity="0.85" />
        </Svg>
      </Animated.View>

      {/* Floating Micro-Bubble Satellite 2 (Bottom Left) */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          bottom: 14,
          left: 14,
          transform: [{ translateY: sat2Y }],
        }}
      >
        <Svg width={16} height={16} viewBox="0 0 16 16">
          <Circle cx={8} cy={8} r={5.5} fill="#38BDF8" fillOpacity="0.25" stroke="#FFFFFF" strokeWidth="0.6" strokeOpacity="0.75" />
          <Circle cx={6.5} cy={6.5} r={1.2} fill="#FFFFFF" fillOpacity="0.8" />
        </Svg>
      </Animated.View>
    </Pressable>
  );
}
