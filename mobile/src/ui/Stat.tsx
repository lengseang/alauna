import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { makeStyles } from '../theme';
import { Text } from './Text';

export interface StatProps {
  label: string;
  /** A REAL measured value (engine, file system, device). null/undefined renders an honest dash: "not measured yet". */
  value: string | number | null | undefined;
  /** Unit after the value, e.g. "tok/s", "GB", "ms". */
  unit?: string;
  /** One muted line under the value (source or caveat). */
  hint?: string;
  style?: StyleProp<ViewStyle>;
}

/** Label over a tabular value. Lay several in a row with flex: 1 each, divided by hairlines, for telemetry and storage. */
export function Stat({ label, value, unit, hint, style }: StatProps) {
  const s = useStyles();
  const has = value !== null && value !== undefined && value !== '';
  const shown = has ? String(value) : '—';
  return (
    <View style={[s.root, style]} accessible accessibilityLabel={has ? `${label}: ${shown}${unit ? ` ${unit}` : ''}` : `${label}: not measured yet`}>
      <Text variant="small" numberOfLines={1}>
        {label}
      </Text>
      <View style={s.valueRow}>
        <Text variant="numeric" tone={has ? 'text' : 'muted'} numberOfLines={1}>
          {shown}
        </Text>
        {has && unit ? <Text variant="small">{unit}</Text> : null}
      </View>
      {hint ? (
        <Text variant="small" numberOfLines={2}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(({ space }) => ({
  root: { gap: 2, paddingVertical: space.sm },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.xs },
}));
