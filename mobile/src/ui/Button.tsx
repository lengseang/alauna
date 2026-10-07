import React from 'react';
import { ActivityIndicator, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { useGuardedAction } from '../hooks/useGuardedAction';
import { showToast } from '../services/toast.ts';
import { hit, makeStyles, useTheme } from '../theme';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'quiet' | 'danger' | 'text';

export interface ButtonProps {
  /** Always visible. Buttons never rely on an icon alone (use IconButton for that). */
  label: string;
  /** May be async. While it runs the button shows a spinner and ignores further taps. */
  onPress: () => void | Promise<unknown>;
  /** primary = the one main action on a screen; quiet = outlined, secondary; danger = destructive; text = inline link-style action. */
  variant?: ButtonVariant;
  icon?: IconName;
  disabled?: boolean;
  /** Externally controlled busy state (e.g. a download in flight). */
  loading?: boolean;
  /** Shown instead of the label while busy. */
  busyLabel?: string;
  accessibilityHint?: string;
  /** Override the spoken label when the visible label is a symbol (e.g. "+"). Default: label. */
  accessibilityLabel?: string;
  /** Minimum gap between accepted taps (ms). */
  debounceMs?: number;
  haptics?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * The button for every action with side effects. A tap while busy or inside the debounce window is dropped,
 * a failing action becomes a toast (never a crash), and the target is always >= 48dp.
 */
export function Button({ label, onPress, variant = 'primary', icon, disabled, loading, busyLabel, accessibilityHint, accessibilityLabel, debounceMs = 350, haptics = true, style }: ButtonProps) {
  const { colors } = useTheme();
  const s = useStyles();
  const { isBusy, execute } = useGuardedAction(
    async () => {
      await onPress();
    },
    { debounceMs, enableHaptics: haptics, onError: (e) => showToast(`Something went wrong: ${e instanceof Error ? e.message : String(e)}`.slice(0, 160)) },
  );
  const busy = isBusy || !!loading;
  const off = !!disabled || busy;
  const fg = variant === 'primary' ? colors.onAccent : variant === 'danger' ? colors.danger : variant === 'text' ? colors.accent : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: off, busy }}
      disabled={off}
      onPress={() => void execute()}
      style={({ pressed }) => [s.base, s[variant], pressed && (variant === 'primary' ? s.pressedPrimary : s.pressedQuiet), disabled && !busy && s.disabled, style]}
    >
      {busy ? <ActivityIndicator size="small" color={fg} /> : icon ? <Icon name={icon} color={fg} /> : null}
      <Text variant="strong" style={{ color: fg, flexShrink: 1, textAlign: 'center' }}>
        {busy && busyLabel ? busyLabel : label}
      </Text>
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors, space, radius }) => ({
  base: {
    minHeight: hit,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  primary: { backgroundColor: colors.accent },
  quiet: { backgroundColor: 'transparent', borderColor: colors.borderStrong },
  danger: { backgroundColor: 'transparent', borderColor: colors.danger },
  text: { backgroundColor: 'transparent', paddingHorizontal: space.md },
  pressedPrimary: { opacity: 0.85 },
  pressedQuiet: { backgroundColor: colors.accentSoft },
  disabled: { opacity: 0.45 },
}));
