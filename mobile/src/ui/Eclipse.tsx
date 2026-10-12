import React from 'react';
import { Animated, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { useTheme } from '../theme';
import { useLoop } from './Motion';

export type EclipseState = 'idle' | 'loading' | 'ready' | 'busy' | 'error';

export interface EclipseProps {
  /** idle = nothing loaded (empty ring); loading = disc waxes with `progress`; ready = full bubble; busy = pulsing aura; error = broken ring. */
  state: EclipseState;
  /** 0..1, used while loading (real engine/download progress only). */
  progress?: number;
  /** dp. 24 in the top bar, 64-96 on boot / empty chat. */
  size?: number;
  /** Spoken status, e.g. "Qwen3.5 4B loading, 42 percent". Omit when a visible text label sits next to it. */
  label?: string;
}

/**
 * Proof of life liquid glass bubble status indicator.
 * Displays real engine loading progress and generative pulsing aura.
 */
export function Eclipse({ state, progress = 0, size = 24, label }: EclipseProps) {
  const { colors, isDark, line } = useTheme();
  const pulse = useLoop(state === 'busy', 900);
  const c = size / 2;
  const ring = size * 0.4;
  const disc = size * 0.3;
  const stroke = Math.max(line, size / 24);
  const lit = state === 'ready' || state === 'busy' ? 1 : state === 'loading' ? progress : 0;
  const circ = 2 * Math.PI * ring;
  const ringColor = state === 'error' ? colors.danger : state === 'idle' ? colors.borderStrong : colors.accent;
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100);

  const a11y = label
    ? {
        accessible: true,
        accessibilityLabel: label,
        ...(state === 'loading' ? { accessibilityRole: 'progressbar' as const, accessibilityValue: { min: 0, max: 100, now: pct } } : { accessibilityRole: 'image' as const }),
      }
    : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };

  return (
    <View style={{ width: size, height: size }} {...a11y}>
      {state === 'busy' ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: size,
            height: size,
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.6] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.08] }) }],
          }}
        >
          <Svg width={size} height={size}>
            <Circle cx={c} cy={c} r={size * 0.46} fill="none" stroke={colors.accent} strokeWidth={stroke} />
          </Svg>
        </Animated.View>
      ) : null}
      <Svg width={size} height={size}>
        {/* The ring: hairline always; the loading arc runs clockwise from the top. */}
        <Circle cx={c} cy={c} r={ring} fill="none" stroke={state === 'loading' ? colors.border : ringColor} strokeWidth={stroke} strokeDasharray={state === 'error' ? `${circ / 10} ${circ / 20}` : undefined} />
        {state === 'loading' ? (
          <Circle cx={c} cy={c} r={ring} fill="none" stroke={colors.accent} strokeWidth={stroke} strokeDasharray={`${circ} ${circ}`} strokeDashoffset={circ * (1 - lit)} transform={`rotate(-90 ${c} ${c})`} />
        ) : null}
        {/* Liquid Glass Bubble Core */}
        {lit > 0 ? (
          <Circle
            cx={c}
            cy={c}
            r={disc * lit}
            fill={colors.accent}
            fillOpacity={state === 'busy' ? 0.9 : 0.75}
          />
        ) : null}
        {lit > 0 ? (
          <Circle
            cx={c - disc * 0.3}
            cy={c - disc * 0.3}
            r={disc * 0.25 * lit}
            fill={colors.text}
            fillOpacity={0.7}
          />
        ) : null}
        {state === 'error' ? <Line x1={c - disc} y1={c + disc} x2={c + disc} y2={c - disc} stroke={colors.danger} strokeWidth={stroke} /> : null}
      </Svg>
    </View>
  );
}
