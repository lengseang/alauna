import React from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { makeStyles } from '../theme';

export interface CardProps {
  children: React.ReactNode;
  /** Makes the whole card one tap target. Then give it an accessibilityLabel. */
  onPress?: () => void;
  /** Accent outline + wash: "this is the current choice". */
  selected?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * A grouped surface: use it to separate one idea from the page (a download offer, a settings group),
 * never for every list row and never for chat messages. Children are spaced by 12.
 */
export function Card({ children, onPress, selected, accessibilityLabel, style }: CardProps) {
  const s = useStyles();
  if (!onPress) return <View style={[s.card, selected && s.selected, style]}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => [s.card, selected && s.selected, pressed && s.pressed, style]}
    >
      {children}
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors, space, radius }) => ({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: space.md },
  selected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  pressed: { backgroundColor: colors.surfaceAlt },
}));
