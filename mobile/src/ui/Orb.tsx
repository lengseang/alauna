import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useTheme } from '../theme';

interface Props {
  size?: number;
  onPress?: () => void;
  label?: string;
}

/**
 * 3D Holographic Iridescent Orb (inspired by modern lively AI chat apps).
 * Features soft pastel pearlescent radial gradients (lavender, cyan, blush rose)
 * and fluid floating breathing physics.
 */
export function Orb({ size = 150, onPress, label = 'AI Companion' }: Props) {
  const { isDark } = useTheme();
  const floatAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const tapScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Gentle floating bob
    const float = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: 1,
          duration: 2600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 2600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    // Subtle breathing pulse
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 3400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 3400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    float.start();
    pulse.start();

    return () => {
      float.stop();
      pulse.stop();
    };
  }, [floatAnim, pulseAnim]);

  const translateY = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-6, 6],
  });

  const scale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.97, 1.03],
  });

  const handlePressIn = () => {
    Animated.spring(tapScale, { toValue: 0.94, useNativeDriver: true }).start();
  };

  const handlePressOut = () => {
    Animated.spring(tapScale, { toValue: 1, friction: 3, tension: 40, useNativeDriver: true }).start();
  };

  const c = size / 2;
  const r = size * 0.44;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      <Animated.View
        style={{
          width: size,
          height: size,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ translateY }, { scale: Animated.multiply(scale, tapScale) }],
        }}
      >
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Defs>
            {/* Ambient background aura glow */}
            <RadialGradient id="auraGlow" cx="50%" cy="50%" rx="50%" ry="50%" fx="50%" fy="50%">
              <Stop offset="0%" stopColor={isDark ? '#D946EF' : '#C084FC'} stopOpacity="0.45" />
              <Stop offset="50%" stopColor={isDark ? '#818CF8' : '#93C5FD'} stopOpacity="0.20" />
              <Stop offset="100%" stopColor={isDark ? '#0A0818' : '#F5F3FF'} stopOpacity="0" />
            </RadialGradient>

            {/* 3D Iridescent Holographic Sphere base */}
            <RadialGradient id="orbGradient" cx="35%" cy="32%" rx="65%" ry="65%" fx="35%" fy="32%">
              <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
              <Stop offset="25%" stopColor={isDark ? '#FBCFE8' : '#EDE9FE'} stopOpacity="0.90" />
              <Stop offset="55%" stopColor={isDark ? '#C084FC' : '#BAE6FD'} stopOpacity="0.85" />
              <Stop offset="80%" stopColor={isDark ? '#818CF8' : '#DDD6FE'} stopOpacity="0.90" />
              <Stop offset="100%" stopColor={isDark ? '#4F46E5' : '#818CF8'} stopOpacity="1" />
            </RadialGradient>

            {/* Pearlescent cyan/rose specular sheen */}
            <RadialGradient id="sheen" cx="65%" cy="68%" rx="50%" ry="50%" fx="65%" fy="68%">
              <Stop offset="0%" stopColor={isDark ? '#F472B6' : '#F43F5E'} stopOpacity="0.40" />
              <Stop offset="60%" stopColor={isDark ? '#38BDF8' : '#38BDF8'} stopOpacity="0.20" />
              <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
            </RadialGradient>
          </Defs>

          {/* Diffused outer aura ring */}
          <Circle cx={c} cy={c} r={size * 0.49} fill="url(#auraGlow)" />

          {/* Main 3D Holographic Sphere */}
          <Circle cx={c} cy={c} r={r} fill="url(#orbGradient)" />

          {/* Ambient sheen layer */}
          <Circle cx={c} cy={c} r={r} fill="url(#sheen)" />

          {/* Glass specular highlight on top curve */}
          <Circle cx={c - r * 0.3} cy={c - r * 0.35} r={r * 0.22} fill="#FFFFFF" fillOpacity="0.55" />
        </Svg>
      </Animated.View>
    </Pressable>
  );
}
