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

/** "II  STORAGE" in Cinzel over a fillet: four gold/bronze Greek keys running into a hairline. The numeral is decorative; screen readers hear the title. */
export function SectionHeader({ title, index, hint, right, meander = true }: SectionHeaderProps) {
  const s = useStyles();
  const numeral = index ? toRoman(index) : '';
  return (
    <View style={s.root}>
      <View style={s.row} accessible accessibilityRole="header" accessibilityLabel={title}>
        {numeral ? (
          <Text variant="section" tone="accent" style={s.numeral}>
            {numeral}
          </Text>
        ) : null}
        <Text variant="section" style={s.title} numberOfLines={2}>
          {title.toUpperCase()}
        </Text>
        {right}
      </View>
      {meander ? <Meander height={10} units={4} /> : null}
      {hint ? <Text variant="small">{hint}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles(({ space }) => ({
  root: { gap: space.sm, paddingTop: space.xl, paddingBottom: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 28 },
  numeral: { minWidth: 32 },
  title: { flex: 1 },
}));
