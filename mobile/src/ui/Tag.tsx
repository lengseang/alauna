import React from 'react';
import { Pressable, View } from 'react-native';
import { makeStyles, useTheme } from '../theme';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export interface TagProps {
  label: string;
  /** Makes it a filter chip (toggle). Without it the tag is a static capability/grade/policy label. */
  onPress?: () => void;
  /** Filter chips: on/off (check glyph + accent edge, announced as checked). */
  selected?: boolean;
  /** accent = grade/recommended emphasis; danger = a warning label ("Too big for this phone"). Static tags only. */
  tone?: 'default' | 'accent' | 'danger';
  /** Optional 16dp glyph before the label (static tags: e.g. `image` for vision). */
  icon?: IconName;
  /** Optional result count shown after the label, e.g. "Vision 7". */
  count?: number;
  accessibilityHint?: string;
}

/**
 * Square chips. Static: 28dp tall, hairline edge, quiet. Filter: 36dp visual with a 48dp hit area, check glyph when on.
 * Wrap a group in <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>.
 */
export function Tag({ label, onPress, selected, tone = 'default', icon, count, accessibilityHint }: TagProps) {
  const { colors } = useTheme();
  const s = useStyles();
  const fg = onPress ? colors.text : tone === 'accent' ? colors.accent : tone === 'danger' ? colors.danger : colors.muted;
  const glyph = onPress && selected ? 'check' : icon;
  const body = (
    <>
      {glyph ? <Icon name={glyph} size={16} color={onPress && selected ? colors.accent : fg} /> : null}
      <Text variant={onPress ? 'label' : 'small'} style={{ color: fg }} numberOfLines={1}>
        {label}
      </Text>
      {count !== undefined ? (
        <Text variant="small" style={s.count}>
          {count}
        </Text>
      ) : null}
    </>
  );
  if (!onPress) return <View style={[s.base, s.static, tone === 'accent' && s.accentEdge, tone === 'danger' && s.dangerEdge]}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={count !== undefined ? `${label}, ${count}` : label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ checked: !!selected }}
      hitSlop={{ top: 6, bottom: 6 }}
      onPress={onPress}
      style={({ pressed }) => [s.base, s.chip, selected && s.on, pressed && s.pressed]}
    >
      {body}
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors, space, line }) => ({
  base: { flexDirection: 'row', alignItems: 'center', gap: space.xs, borderWidth: line, alignSelf: 'flex-start' },
  static: { minHeight: 28, paddingHorizontal: space.sm, borderColor: colors.border },
  accentEdge: { borderColor: colors.accent },
  dangerEdge: { borderColor: colors.danger },
  chip: { minHeight: 36, minWidth: 48, justifyContent: 'center', paddingHorizontal: space.md, borderColor: colors.borderStrong },
  on: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  pressed: { backgroundColor: colors.surfaceAlt },
  count: { fontVariant: ['tabular-nums'] },
}));
