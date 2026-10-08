import React from 'react';
import { View } from 'react-native';
import { makeStyles } from '../theme';

/** Determinate progress: a square 4dp channel with an accent fill. `fraction` is 0..1; garbage values are clamped. */
export function ProgressBar({ fraction, label, tone = 'accent' }: { fraction: number; label?: string; tone?: 'accent' | 'danger' | 'muted' }) {
  const s = useStyles();
  const pct = Math.round(Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0)) * 100);
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: pct }} style={s.track}>
      <View style={[s.fill, s[tone], { width: `${pct}%` }]} />
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  track: { height: 4, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: 4 },
  accent: { backgroundColor: colors.accent },
  danger: { backgroundColor: colors.danger },
  muted: { backgroundColor: colors.borderStrong },
}));
