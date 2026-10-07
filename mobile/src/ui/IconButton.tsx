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
  /** default = plain icon; filled = accent disc (the one primary icon, e.g. Send/Stop). */
  tone?: 'default' | 'filled';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** 48x48 icon target with a mandatory accessibility label. Taps are debounced (250ms). */
export function IconButton({ icon, label, onPress, tone = 'default', disabled, style }: IconButtonProps) {
  const { colors } = useTheme();
  const s = useStyles();
  const { execute } = useGuardedAction(async () => void (await onPress()), { debounceMs: 250, enableHaptics: false });
  const filled = tone === 'filled';
  const fg = filled ? (disabled ? colors.muted : colors.onAccent) : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={() => void execute()}
      style={({ pressed }) => [s.base, filled && (disabled ? s.filledOff : s.filled), pressed && !filled && s.pressed, pressed && filled && { opacity: 0.85 }, style]}
    >
      <Icon name={icon} color={fg} />
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors, radius }) => ({
  base: { width: hit, height: hit, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  filled: { backgroundColor: colors.accent },
  filledOff: { backgroundColor: colors.surfaceAlt },
  pressed: { backgroundColor: colors.accentSoft },
}));
