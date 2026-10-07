import React from 'react';
import { View } from 'react-native';
import { makeStyles } from '../theme';

/** Determinate progress, 6dp tall. `fraction` is 0..1; garbage values are clamped. */
export function ProgressBar({ fraction, label }: { fraction: number; label?: string }) {
  const s = useStyles();
  const pct = Math.round(Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0)) * 100);
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: pct }} style={s.track}>
      <View style={[s.fill, { width: `${pct}%` }]} />
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  track: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.accent },
}));
