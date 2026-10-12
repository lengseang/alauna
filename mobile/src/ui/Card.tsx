import React from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { makeStyles } from '../theme';

export interface CardProps {
  children: React.ReactNode;
  /** Makes the whole card one tap target. Then give it an accessibilityLabel. */
  onPress?: () => void;
  /** Accent edge + wash: "this is the current choice". */
  selected?: boolean;
  /** Double hairline (an inscription panel): the ONE hero item on a screen, e.g. the recommended model. */
  framed?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * A grouped surface: one idea set apart from the page (a download offer, a stat block). Square, 1dp hairline,
 * children spaced by 12. Not for every list row (use ListRow + Divider) and never for chat messages.
 */
export function Card({ children, onPress, selected, framed, accessibilityLabel, accessibilityHint, style }: CardProps) {
  const s = useStyles();
  const box = (pressed: boolean) => [s.card, framed && s.framedInner, selected && s.selected, pressed && s.pressed];
  // The outermost element always takes `style`, so margins/flex from callers behave the same with or without a frame.
  const outer = (pressed: boolean) => (framed ? [s.frame, style] : [...box(pressed), style]);
  const inner = (pressed: boolean) => (framed ? <View style={box(pressed)}>{children}</View> : children);
  if (!onPress) return <View style={outer(false)}>{inner(false)}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => outer(pressed)}
    >
      {({ pressed }) => inner(pressed)}
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors, space, line, radius, isDark }) => ({
  card: {
    backgroundColor: colors.surface,
    borderWidth: line,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(99, 102, 241, 0.12)',
    borderRadius: radius.xl,
    padding: space.lg,
    gap: space.md,
    shadowColor: colors.accent,
    shadowOpacity: isDark ? 0.12 : 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  frame: {
    borderWidth: line,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(99, 102, 241, 0.18)',
    borderRadius: radius.xl + 4,
    padding: 3,
  },
  framedInner: {
    borderColor: colors.borderStrong,
    borderRadius: radius.xl,
  },
  selected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  pressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
}));
