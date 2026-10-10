import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import type { VoicePhase } from '../../core/voiceLoop.ts';
import { useTheme } from '../../theme';

export interface VoiceOrbProps {
  phase: VoicePhase;
  size?: number;
  onPress?: () => void;
  label?: string;
}

/**
 * Animated voice orb for AI voice mode.
 *
 * Implements fluid, multi-harmonic state-driven animation:
 * - Listening: Gentle rhythmic organic breathing + receptive aura
 * - Thinking/Transcribing: Dual orbital ring counter-rotation & phasing
 * - Speaking: Energetic expanding sound waves & fluid dynamic pulsation
 * - Idle: Calm, steady celestial core
 * - Error: Broken ring indicator
 */
export function VoiceOrb({ phase, size = 160, onPress, label }: VoiceOrbProps) {
  const { colors, isDark } = useTheme();

  // Core pulse loop (for breathing & speaking)
  const breathAnim = useRef(new Animated.Value(0)).current;
  // Fast wave loop (for speaking ripples)
  const waveAnim = useRef(new Animated.Value(0)).current;
  // Rotation loop (for thinking)
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Breathing loop
    const breath = Animated.loop(
      Animated.sequence([
        Animated.timing(breathAnim, {
          toValue: 1,
          duration: phase === 'speaking' ? 450 : phase === 'listening' ? 1200 : 1800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(breathAnim, {
          toValue: 0,
          duration: phase === 'speaking' ? 450 : phase === 'listening' ? 1200 : 1800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    breath.start();

    // Secondary ripple wave for speaking
    const wave = Animated.loop(
      Animated.timing(waveAnim, {
        toValue: 1,
        duration: 900,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      })
    );
    if (phase === 'speaking') {
      wave.start();
    } else {
      waveAnim.setValue(0);
    }

    // Spin animation for thinking / transcribing
    const spin = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 2400,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    if (phase === 'thinking' || phase === 'transcribing') {
      spin.start();
    } else {
      spinAnim.setValue(0);
    }

    return () => {
      breath.stop();
      wave.stop();
      spin.stop();
    };
  }, [phase, breathAnim, waveAnim, spinAnim]);

  const c = size / 2;
  const coreRadius = size * 0.28;
  const outerRadius = size * 0.42;

  // Dynamic interpolations based on phase
  const coreScale = breathAnim.interpolate({
    inputRange: [0, 1],
    outputRange: phase === 'speaking' ? [0.94, 1.15] : phase === 'listening' ? [0.96, 1.05] : [0.98, 1.02],
  });

  const auraScale = breathAnim.interpolate({
    inputRange: [0, 1],
    outputRange: phase === 'speaking' ? [1.05, 1.28] : phase === 'listening' ? [1.02, 1.12] : [1.0, 1.04],
  });

  const auraOpacity = breathAnim.interpolate({
    inputRange: [0, 1],
    outputRange: phase === 'speaking' ? [0.35, 0.75] : phase === 'listening' ? [0.2, 0.5] : [0.1, 0.25],
  });

  const rippleScale = waveAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1.0, 1.45],
  });

  const rippleOpacity = waveAnim.interpolate({
    inputRange: [0, 0.6, 1],
    outputRange: [0.6, 0.25, 0],
  });

  const spinDeg = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const accentColor = phase === 'error' ? colors.danger : colors.accent;

  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label ?? `AI Voice state: ${phase}`}
      accessibilityRole="button"
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      {/* Outer ripple wave when speaking */}
      {phase === 'speaking' ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: size,
            height: size,
            transform: [{ scale: rippleScale }],
            opacity: rippleOpacity,
          }}
        >
          <Svg width={size} height={size}>
            <Circle cx={c} cy={c} r={outerRadius} fill="none" stroke={accentColor} strokeWidth={2} />
          </Svg>
        </Animated.View>
      ) : null}

      {/* Middle pulsing harmonic aura */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: size,
          height: size,
          transform: [{ scale: auraScale }],
          opacity: auraOpacity,
        }}
      >
        <Svg width={size} height={size}>
          <Circle
            cx={c}
            cy={c}
            r={outerRadius}
            fill="none"
            stroke={accentColor}
            strokeWidth={phase === 'speaking' ? 3 : 1.5}
            strokeDasharray={phase === 'thinking' ? '6 6' : undefined}
          />
        </Svg>
      </Animated.View>

      {/* Thinking / Transcribing revolving orbital ring */}
      {phase === 'thinking' || phase === 'transcribing' ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: size,
            height: size,
            transform: [{ rotate: spinDeg }],
          }}
        >
          <Svg width={size} height={size}>
            <Circle
              cx={c}
              cy={c}
              r={size * 0.46}
              fill="none"
              stroke={accentColor}
              strokeWidth={2}
              strokeDasharray="16 12 4 12"
            />
          </Svg>
        </Animated.View>
      ) : null}

      {/* Glowing Core Celestial Disc */}
      <Animated.View
        style={{
          width: size,
          height: size,
          transform: [{ scale: coreScale }],
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Svg width={size} height={size}>
          {/* Inner ambient fill disc */}
          <Circle
            cx={c}
            cy={c}
            r={coreRadius}
            fill={accentColor}
            fillOpacity={phase === 'speaking' ? 0.9 : phase === 'listening' ? 0.75 : 0.6}
          />

          {/* Core crisp boundary ring */}
          <Circle
            cx={c}
            cy={c}
            r={coreRadius}
            fill="none"
            stroke={isDark ? '#ffffff' : '#000000'}
            strokeOpacity={0.25}
            strokeWidth={1.5}
          />

          {/* Error slash if phase === 'error' */}
          {phase === 'error' ? (
            <Line
              x1={c - coreRadius * 0.6}
              y1={c + coreRadius * 0.6}
              x2={c + coreRadius * 0.6}
              y2={c - coreRadius * 0.6}
              stroke="#ffffff"
              strokeWidth={3}
            />
          ) : null}
        </Svg>
      </Animated.View>
    </Pressable>
  );
}
