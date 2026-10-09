import React from 'react';
import { Pressable, View } from 'react-native';
import { hit, makeStyles } from '../theme';
import { Text } from './Text';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedProps<T extends string> {
  /** 2-4 options. More than that: use radio ListRows. */
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Spoken group name, e.g. "Theme", "Match". */
  label: string;
  disabled?: boolean;
}

/**
 * One choice out of 2-4: square cells in a hairline frame. The chosen cell is raised (surfaceAlt), bold, and carries a
 * 2dp accent lintel along its top edge (shape + weight + color, never color alone). 44dp visual, 48dp hit.
 */
export function Segmented<T extends string>({ options, value, onChange, label, disabled }: SegmentedProps<T>) {
  const s = useStyles();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[s.frame, disabled && s.disabled]}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ checked: on, disabled: !!disabled }}
            disabled={disabled}
            hitSlop={{ top: 2, bottom: 2 }}
            onPress={() => !on && onChange(o.value)}
            style={({ pressed }) => [s.cell, i > 0 && s.sep, on && s.on, pressed && !on && s.pressed]}
          >
            {on ? <View style={s.lintel} /> : null}
            <Text variant={on ? 'label' : 'small'} tone={on ? 'text' : 'muted'} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles(({ colors, space, line }) => ({
  frame: { flexDirection: 'row', borderWidth: line, borderColor: colors.borderStrong },
  cell: { flex: 1, minHeight: hit, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.sm },
  sep: { borderLeftWidth: line, borderLeftColor: colors.border },
  on: { backgroundColor: colors.surfaceAlt },
  pressed: { backgroundColor: colors.accentSoft },
  lintel: { position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: colors.accent },
  disabled: { opacity: 0.45 },
}));
