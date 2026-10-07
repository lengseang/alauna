import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useGuardedAction } from '../hooks/useGuardedAction';
import { showToast } from '../services/toast.ts';
import { colors, font, radius } from './theme';

export type BtnVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';

export interface BtnProps {
  label: string;
  /** May be async. While it runs the button shows a spinner and ignores further taps. */
  onPress: () => void | Promise<unknown>;
  variant?: BtnVariant;
  icon?: React.ReactNode;
  disabled?: boolean;
  small?: boolean;
  /** Shown instead of the label while onPress is running. */
  busyLabel?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  /** Minimum gap between accepted taps (ms). */
  debounceMs?: number;
  haptics?: boolean;
}

const BG: Record<BtnVariant, string> = {
  primary: colors.white,
  secondary: colors.surface3,
  danger: colors.badSoft,
  ghost: 'transparent',
  success: colors.goodSoft,
};
const FG: Record<BtnVariant, string> = {
  primary: colors.black,
  secondary: colors.text,
  danger: colors.bad,
  ghost: colors.muted,
  success: colors.good,
};

/**
 * The button for every action with side effects (plain Pressable is only for toggles/navigation whose repeat is harmless,
 * see docs/AUDIT.md). Enforces the "no spam button" rule
 * (docs/REQUIREMENTS.md UX-1): a tap while busy or inside the debounce window is dropped,
 * the label/spinner reflects the busy state, and a failing action can never crash the app.
 */
export function Btn({ label, onPress, variant = 'secondary', icon, disabled, small, busyLabel, style, accessibilityLabel, debounceMs = 350, haptics = true }: BtnProps) {
  const { isBusy, execute } = useGuardedAction(
    async () => {
      await onPress();
    },
    {
      debounceMs,
      enableHaptics: haptics,
      // A failing action must never be silent (UX-2).
      onError: (e) => showToast(`Something went wrong: ${e instanceof Error ? e.message : String(e)}`.slice(0, 160)),
    },
  );
  const off = !!disabled || isBusy;
  const fg = FG[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: off, busy: isBusy }}
      disabled={off}
      onPress={() => void execute()}
      style={({ pressed }) => [
        styles.base,
        small && styles.small,
        { backgroundColor: BG[variant] },
        variant === 'secondary' && styles.border,
        pressed && { opacity: 0.75 },
        off && { opacity: 0.45 },
        style,
      ]}
    >
      <View style={styles.row}>
        {isBusy ? <ActivityIndicator size="small" color={fg} /> : icon}
        <Text style={[styles.label, small && styles.labelSmall, { color: fg }]} numberOfLines={1}>
          {isBusy && busyLabel ? busyLabel : label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 44, borderRadius: radius.md, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  small: { minHeight: 34, paddingHorizontal: 12, borderRadius: radius.sm },
  border: { borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: font.md, fontWeight: '600' },
  labelSmall: { fontSize: font.sm },
});
