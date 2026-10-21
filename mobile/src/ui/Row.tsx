import React, { useRef } from 'react';
import { Pressable, View } from 'react-native';
import { hit, makeStyles, useTheme } from '../theme';
import { Icon, type IconName } from './Icon';
import { Switch } from './Switch';
import { Text } from './Text';

export interface ListRowProps {
  title: string;
  /** One or two lines of muted detail under the title. */
  subtitle?: string;
  /** Trailing current value, e.g. "Nyx", "4 threads", "2.7 GB". Read with the title. */
  value?: string;
  /** Nav row: shows a chevron. (With `selected` it becomes a radio row; with `onSwitch` a switch row.) */
  onPress?: () => void;
  /** Switch row: the WHOLE row toggles (one 56dp target), the square Switch is its visual. */
  switchValue?: boolean;
  onSwitch?: (next: boolean) => void;
  /** Radio row: pass true/false; the chosen one shows a check. */
  selected?: boolean;
  /** Leading icon (sparingly: settings hub and drawer only). */
  icon?: IconName;
  /** Replaces the default trailing chevron/check/switch. */
  right?: React.ReactNode;
  /** Danger-colored title (e.g. "Forget everything"). */
  destructive?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

/**
 * The list row: label / value / chevron / switch / check, on the page (no box), >= 56dp. Rows are separated by
 * <Divider />, grouped under a <SectionHeader />. Dense settings stay calm because every row has the same rhythm.
 */
export function ListRow({ title, subtitle, value, onPress, switchValue, onSwitch, selected, icon, right, destructive, disabled, accessibilityLabel, accessibilityHint }: ListRowProps) {
  const { colors } = useTheme();
  const s = useStyles();
  const last = useRef(0);
  const isSwitch = onSwitch !== undefined;
  const isChoice = selected !== undefined;
  const press = isSwitch ? () => onSwitch(!switchValue) : onPress;

  const trailing =
    right ??
    (isSwitch ? (
      <Switch value={!!switchValue} />
    ) : selected ? (
      <Icon name="check" color={colors.accent} />
    ) : !isChoice && onPress ? (
      <Icon name="chevron" color={colors.muted} />
    ) : null);

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
      {value ? (
        <Text variant="small" numberOfLines={1} style={s.value}>
          {value}
        </Text>
      ) : null}
      {trailing}
    </>
  );
  if (!press) return <View style={[s.row, disabled && s.disabled]}>{body}</View>;
  const spoken = accessibilityLabel ?? (value && !isSwitch ? `${title}, ${value}` : title);
  return (
    <Pressable
      accessibilityRole={isSwitch ? 'switch' : isChoice ? 'radio' : 'button'}
      accessibilityLabel={spoken}
      accessibilityHint={accessibilityHint ?? (isSwitch || isChoice ? undefined : subtitle)}
      accessibilityState={isSwitch ? { checked: !!switchValue, disabled: !!disabled } : isChoice ? { checked: selected, disabled: !!disabled } : { disabled: !!disabled }}
      disabled={disabled}
      unstable_pressDelay={0}
      onPress={() => {
        const now = Date.now();
        if (now - last.current < 80) return; // double-tap guard
        last.current = now;
        press();
      }}
      style={({ pressed }) => [s.row, pressed && s.pressed, disabled && s.disabled]}
    >
      {body}
    </Pressable>
  );
}

/** v1 name; same component. */
export const Row = ListRow;
export type RowProps = ListRowProps;

const useStyles = makeStyles(({ colors, space }) => ({
  row: { minHeight: hit + space.sm, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, paddingHorizontal: space.sm },
  text: { flex: 1, gap: 2 },
  value: { maxWidth: '45%', textAlign: 'right' },
  pressed: { backgroundColor: colors.accentSoft },
  disabled: { opacity: 0.45 },
}));
