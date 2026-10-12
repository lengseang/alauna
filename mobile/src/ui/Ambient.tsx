import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useTheme } from '../theme';
import { useLoop } from './Motion';

const SIZE = 480;

/**
 * Modern Liquid Glass Ambient Backdrop Glow.
 * Replaces old sun rays and moon animations with a pure, luminous liquid glass ambient radiance.
 */
function LiquidGlow() {
  const { colors, reduceMotion } = useTheme();
  const pulse = useLoop(true, 4200);
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 8000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 8000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, drift]);

  const half = SIZE / 2;

  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: -120,
        left: '50%',
        marginLeft: -half,
        width: SIZE,
        height: SIZE,
        opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0.85] }),
        transform: [
          { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.06] }) },
          { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [-15, 15] }) },
        ],
      }}
    >
      <Svg width={SIZE} height={SIZE}>
        <Defs>
          <RadialGradient id="liquidAmbient" cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0%" stopColor={colors.glow} stopOpacity="0.4" />
            <Stop offset="50%" stopColor={colors.accent} stopOpacity="0.15" />
            <Stop offset="100%" stopColor={colors.bg} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle cx={half} cy={half} r={half} fill="url(#liquidAmbient)" />
      </Svg>
    </Animated.View>
  );
}

/**
 * Decorative backdrop for empty chat, boot and onboarding:
 * Fills its parent, ignores touches, hidden from screen readers. Loops stop under reduced motion.
 */
export function Ambient() {
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <LiquidGlow />
    </View>
  );
}
