import React from 'react';
import { View } from 'react-native';
import { makeStyles } from '../theme';
import { toRoman } from './logic';
import { Meander } from './Meander';
import { Text } from './Text';

export interface SectionHeaderProps {
  title: string;
  /** 1-based section number, shown as a roman numeral (I, II, III...). Settings hub and long settings pages. */
  index?: number;
  /** One muted line under the rule explaining the section. */
  hint?: string;
  /** At most one small trailing control (e.g. a text Button "Reset"). */
  right?: React.ReactNode;
  /** The Greek-key rule under the title (default true). Turn off for minor sub-sections. */
  meander?: boolean;
}

export function SectionHeader({ title, hint, right }: SectionHeaderProps) {
  const s = useStyles();
  return (
    <View style={s.root}>
      <View style={s.row} accessible accessibilityRole="header" accessibilityLabel={title}>
        <View style={s.accentDot} />
        <Text variant="strong" style={s.title} numberOfLines={1}>
          {title}
        </Text>
        {right}
      </View>
      {hint ? <Text variant="small" tone="muted">{hint}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors, space, radius }) => ({
  root: { gap: space.xs, paddingTop: space.md, paddingBottom: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 24 },
  accentDot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  title: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
}));
