import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import { hit, makeStyles, useTheme } from '../theme';

export interface SwitchProps {
  value: boolean;
  /** Omit to render a display-only switch (ListRow does this: the whole row is the control). */
  onValueChange?: (next: boolean) => void;
  /** Spoken name when standalone (required then). */
  label?: string;
  disabled?: boolean;
}

const TRACK_W = 44;
const TRACK_H = 24;
const THUMB = 16;
const TRAVEL = TRACK_W - THUMB - 8;

/**
 * Square switch: hairline track, square thumb that slides (150ms, native driver). On = accent track, onAccent thumb.
 * State is also carried by thumb position, never by color alone. 48dp target.
 */
export function Switch({ value, onValueChange, label, disabled }: SwitchProps) {
  const { reduceMotion, motion } = useTheme();
  const s = useStyles();
  const v = useRef(new Animated.Value(value ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: value ? 1 : 0, duration: reduceMotion ? 0 : motion.fast, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [value, reduceMotion, motion.fast, v]);

  const visual = (
    <View style={[s.track, disabled && s.disabled]}>
      <Animated.View style={[s.fill, { opacity: v }]} />
      <Animated.View style={[s.thumbBox, { transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, TRAVEL] }) }] }]}>
        <View style={s.thumbOff} />
        <Animated.View style={[s.thumbOn, { opacity: v }]} />
      </Animated.View>
    </View>
  );
  if (!onValueChange) {
    return (
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {visual}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      style={s.hit}
    >
      {visual}
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors, line }) => ({
  hit: { minWidth: hit, minHeight: hit, alignItems: 'center', justifyContent: 'center' },
  track: { width: TRACK_W, height: TRACK_H, borderWidth: line, borderColor: colors.borderStrong, justifyContent: 'center' },
  fill: { position: 'absolute', top: -line, left: -line, right: -line, bottom: -line, backgroundColor: colors.accent },
  thumbBox: { position: 'absolute', left: 3, top: (TRACK_H - 2 * line - THUMB) / 2, width: THUMB, height: THUMB },
  thumbOff: { position: 'absolute', top: 0, left: 0, width: THUMB, height: THUMB, backgroundColor: colors.muted },
  thumbOn: { position: 'absolute', top: 0, left: 0, width: THUMB, height: THUMB, backgroundColor: colors.onAccent },
  disabled: { opacity: 0.45 },
}));
