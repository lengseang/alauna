import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop, Line } from 'react-native-svg';
import type { VoicePhase } from '../../core/voiceLoop.ts';
import { useAudioMeter } from '../../services/voice/stt.ts';
import { useTheme } from '../../theme';

export interface VoiceOrbProps {
  phase: VoicePhase;
  size?: number;
  onPress?: () => void;
  label?: string;
  volumeOverride?: number;
  pitchOverride?: number;
}

/**
 * Animated Reactive Voice Orb for Sovereign Voice Mode.
 *
 * Implements:
 * 1. Helios (Light Mode): Radiant Solar Sunshine Neon Aura — warm golden solar corona with multi-harmonic sun rings.
 * 2. Nyx (Dark Mode): Ethereal Moonlight Neon Aura — cool celestial lunar starlight halo with luminous moonlight rings.
 * 3. Physical Voice Bouncing: Real-time audio reactivity that scales, pulses, and bounces dynamically with live mic volume & vocal pitch.
 * 4. Distinct Phase States: Listening (fluid breathing & audio reactivity), Speaking (rhythmic voice waves), Thinking (revolving orbital ring).
 */
export function VoiceOrb({
  phase,
  size = 170,
  onPress,
  label,
  volumeOverride,
  pitchOverride,
}: VoiceOrbProps) {
  const { colors, isDark } = useTheme();
  const meter = useAudioMeter();

  // Active volume (0..1) and pitch (0..1)
  const currentVolume = volumeOverride !== undefined ? volumeOverride : meter.volume;
  const currentPitch = pitchOverride !== undefined ? pitchOverride : meter.pitch;

  // Animation values
  const breathAnim = useRef(new Animated.Value(0)).current;
  const waveAnim = useRef(new Animated.Value(0)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;
  const bounceAnim = useRef(new Animated.Value(0)).current;

  // Smooth bounce animation responding to mic amplitude
  useEffect(() => {
    // When listening, scale with microphone volume
    // When speaking, simulate organic speech oscillation if mic volume is 0
    let targetLevel = currentVolume;
    if (phase === 'speaking' && targetLevel < 0.1) {
      targetLevel = 0.45;
    }

    Animated.spring(bounceAnim, {
      toValue: targetLevel,
      useNativeDriver: true,
      friction: 4,
      tension: 60,
    }).start();
  }, [currentVolume, phase, bounceAnim]);

  // Phase loop animations
  useEffect(() => {
    // Core breathing loop
    const breath = Animated.loop(
      Animated.sequence([
        Animated.timing(breathAnim, {
          toValue: 1,
          duration: phase === 'speaking' ? 380 : phase === 'listening' ? 950 : 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(breathAnim, {
          toValue: 0,
          duration: phase === 'speaking' ? 380 : phase === 'listening' ? 950 : 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    breath.start();

    // Outward ripples
    const wave = Animated.loop(
      Animated.timing(waveAnim, {
        toValue: 1,
        duration: phase === 'speaking' ? 700 : 1100,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      })
    );
    if (phase === 'speaking' || (phase === 'listening' && currentVolume > 0.05)) {
      wave.start();
    } else {
      waveAnim.setValue(0);
    }

    // Revolving ring for thinking / transcribing
    const spin = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 2200,
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
  }, [phase, currentVolume, breathAnim, waveAnim, spinAnim]);

  const c = size / 2;
  const coreRadius = size * 0.28;
  const auraRadius = size * 0.40;
  const outerRadius = size * 0.46;

  // Neon theme palettes:
  // - Helios (Light): Sun shine golden amber neon (#F59E0B, #FBBF24, #D97706, #FFFBEB)
  // - Nyx (Dark): Moon light celestial cyan starlight neon (#38BDF8, #67E8F9, #818CF8, #F0F9FF)
  const neonMain = isDark ? '#38BDF8' : '#F59E0B';
  const neonGlow = isDark ? '#67E8F9' : '#FBBF24';
  const neonHighlight = isDark ? '#E0F2FE' : '#FEF3C7';
  const errorColor = colors.danger;
  const activeColor = phase === 'error' ? errorColor : neonMain;

  // Physical voice bounce interpolation
  const voiceScale = bounceAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1.0, 1.38],
  });

  const voiceRippleScale = bounceAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1.0, 1.55],
  });

  // Base harmonic pulse
  const baseScale = breathAnim.interpolate({
    inputRange: [0, 1],
    outputRange: phase === 'speaking' ? [0.96, 1.12] : phase === 'listening' ? [0.97, 1.04] : [0.98, 1.02],
  });

  const auraOpacity = breathAnim.interpolate({
    inputRange: [0, 1],
    outputRange: phase === 'speaking' ? [0.45, 0.9] : phase === 'listening' ? [0.3, 0.7] : [0.15, 0.35],
  });

  const rippleScale = waveAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1.0, 1.48],
  });

  const rippleOpacity = waveAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.75, 0.35, 0],
  });

  const spinDeg = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label ?? `AI Voice state: ${phase}`}
      accessibilityRole="button"
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      {/* Layer 1: Ambient Neon Corona Flare (Background Aura) */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: size,
          height: size,
          transform: [{ scale: voiceRippleScale }],
          opacity: auraOpacity,
        }}
      >
        <Svg width={size} height={size}>
          <Defs>
            <RadialGradient id="neonRadial" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0%" stopColor={activeColor} stopOpacity={isDark ? '0.5' : '0.4'} />
              <Stop offset="60%" stopColor={neonGlow} stopOpacity={isDark ? '0.2' : '0.15'} />
              <Stop offset="100%" stopColor={activeColor} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx={c} cy={c} r={outerRadius} fill="url(#neonRadial)" />
        </Svg>
      </Animated.View>

      {/* Layer 2: Expanding Voice Soundwave Ripples (Bouncing with voice pitch & volume) */}
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
          <Circle
            cx={c}
            cy={c}
            r={outerRadius}
            fill="none"
            stroke={neonGlow}
            strokeWidth={phase === 'speaking' || currentVolume > 0.1 ? 3 : 1.5}
            strokeDasharray={isDark ? '12 8' : '16 6'}
          />
        </Svg>
      </Animated.View>

      {/* Layer 3: Concentric Neon Orbital Ring (Solar / Moonlight Harmonics) */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: size,
          height: size,
          transform: [{ scale: baseScale }],
        }}
      >
        <Svg width={size} height={size}>
          <Circle
            cx={c}
            cy={c}
            r={auraRadius}
            fill="none"
            stroke={activeColor}
            strokeWidth={2}
            strokeOpacity={0.8}
            strokeDasharray={phase === 'thinking' ? '6 6' : undefined}
          />
        </Svg>
      </Animated.View>

      {/* Layer 4: Revolving Thinking Orbit Ring */}
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
              r={outerRadius}
              fill="none"
              stroke={neonHighlight}
              strokeWidth={2.5}
              strokeDasharray="20 16 6 16"
            />
          </Svg>
        </Animated.View>
      ) : null}

      {/* Layer 5: Luminous Core Celestial Disc (Bounces dynamically with voice) */}
      <Animated.View
        style={{
          width: size,
          height: size,
          transform: [{ scale: voiceScale }],
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Svg width={size} height={size}>
          {/* Inner luminous disc */}
          <Circle
            cx={c}
            cy={c}
            r={coreRadius}
            fill={activeColor}
            fillOpacity={isDark ? 0.95 : 0.9}
          />

          {/* Crisp neon edge boundary */}
          <Circle
            cx={c}
            cy={c}
            r={coreRadius}
            fill="none"
            stroke={neonHighlight}
            strokeWidth={2}
            strokeOpacity={0.9}
          />

          {/* Inner celestial solar/moonlight center core dot */}
          <Circle
            cx={c}
            cy={c}
            r={coreRadius * 0.35}
            fill={neonHighlight}
            fillOpacity={0.95}
          />

          {/* Error cancel slash indicator if phase === 'error' */}
          {phase === 'error' ? (
            <Line
              x1={c - coreRadius * 0.55}
              y1={c + coreRadius * 0.55}
              x2={c + coreRadius * 0.55}
              y2={c - coreRadius * 0.55}
              stroke="#ffffff"
              strokeWidth={3}
            />
          ) : null}
        </Svg>
      </Animated.View>
    </Pressable>
  );
}
