import React from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { useGuardedAction } from '../hooks/useGuardedAction';
import { hit, makeStyles, useTheme } from '../theme';
import { Icon, type IconName } from './Icon';

export interface IconButtonProps {
  icon: IconName;
  /** Required: this is what a screen reader says. Do not include the word "button". */
  label: string;
  onPress: () => void | Promise<unknown>;
  /** default = bare glyph; filled = accent square (the one primary icon, e.g. Send/Stop); outline = hairline square. */
  tone?: 'default' | 'filled' | 'outline';
  /** Toggle icons (e.g. Think on/off): accent glyph + wash, announced as selected. */
  selected?: boolean;
  disabled?: boolean;
  /** Glyph color override (default text; muted for secondary chrome). */
  color?: string;
  accessibilityHint?: string;
  haptics?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** 48x48 square icon target with a mandatory accessibility label. Taps are debounced (250ms). */
export function IconButton({ icon, label, onPress, tone = 'default', selected, disabled, color, accessibilityHint, haptics = true, style }: IconButtonProps) {
  const { colors, haptics: themeHaptics } = useTheme();
  const s = useStyles();
  const { execute } = useGuardedAction(async () => void (await onPress()), { debounceMs: 250, enableHaptics: haptics && themeHaptics });
  const filled = tone === 'filled';
  const fg = filled ? (disabled ? colors.muted : colors.onAccent) : selected ? colors.accent : (color ?? colors.text);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, selected }}
      disabled={disabled}
      onPress={() => void execute()}
      style={({ pressed }) => [
        s.base,
        tone === 'outline' && s.outline,
        filled && (disabled ? s.filledOff : s.filled),
        selected && !filled && s.selected,
        pressed && (filled ? s.pressedFilled : s.pressed),
        !filled && disabled && s.disabled,
        style,
      ]}
    >
      <Icon name={icon} color={fg} />
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors, line, radius }) => ({
  base: { width: hit, height: hit, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  outline: { borderWidth: line, borderColor: colors.borderStrong, borderRadius: radius.pill },
  filled: { backgroundColor: colors.accent, borderRadius: radius.pill },
  filledOff: { backgroundColor: colors.surfaceAlt, borderRadius: radius.pill },
  selected: { backgroundColor: colors.accentSoft, borderRadius: radius.pill },
  pressed: { backgroundColor: colors.accentSoft, borderRadius: radius.pill },
  pressedFilled: { opacity: 0.82 },
  disabled: { opacity: 0.45 },
}));
