import React, { useRef } from 'react';
import { Pressable, View } from 'react-native';
import { hit, makeStyles, useTheme } from '../theme';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export interface RowProps {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  /** Leading icon (use sparingly: drawer navigation only). */
  icon?: IconName;
  /** Pass true/false to make this a radio-style choice (check mark on the chosen one). */
  selected?: boolean;
  /** Replaces the default trailing arrow/check. */
  right?: React.ReactNode;
  /** Danger-colored title (e.g. "Forget everything"). */
  destructive?: boolean;
  accessibilityLabel?: string;
}

/**
 * List row on the page background (no box). >= 56dp tall. A tappable row shows a forward arrow; a choice shows a check.
 * Rows are separated by <Divider />, not by cards.
 */
export function Row({ title, subtitle, onPress, icon, selected, right, destructive, accessibilityLabel }: RowProps) {
  const { colors } = useTheme();
  const s = useStyles();
  const last = useRef(0);
  const choice = selected !== undefined;
  const body = (
    <>
      {icon ? <Icon name={icon} color={colors.muted} /> : null}
      <View style={s.text}>
        <Text variant="strong" tone={destructive ? 'danger' : 'text'} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="small" numberOfLines={3}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ?? (selected ? <Icon name="check" color={colors.accent} /> : !choice && onPress ? <Icon name="back" color={colors.muted} rotate={180} /> : null)}
    </>
  );
  if (!onPress) return <View style={s.row}>{body}</View>;
  return (
    <Pressable
      accessibilityRole={choice ? 'radio' : 'button'}
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={choice ? { checked: selected } : undefined}
      onPress={() => {
        const now = Date.now();
        if (now - last.current < 300) return; // double-tap guard
        last.current = now;
        onPress();
      }}
      style={({ pressed }) => [s.row, pressed && s.pressed]}
    >
      {body}
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors, space, radius }) => ({
  row: { minHeight: hit + space.sm, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, paddingHorizontal: space.sm, borderRadius: radius.md },
  text: { flex: 1, gap: 2 },
  pressed: { backgroundColor: colors.accentSoft },
}));
