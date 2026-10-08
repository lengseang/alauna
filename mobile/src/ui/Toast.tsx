import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from '../services/toast.ts';
import { hit, makeStyles, useTheme } from '../theme';
import { curves } from './Motion';
import { Text } from './Text';
import { dismissUndo, useUndo } from './undo';

/**
 * Render once at the app root. Shows `showToast()` messages (3s) and `showUndo()` messages (5s, with an Undo button).
 * A square slab with an accent edge. Slides down from the top, never takes focus, and is announced to screen readers politely.
 */
export function ToastHost() {
  const { text, id } = useToast();
  const undo = useUndo();
  const { reduceMotion, motion } = useTheme();
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const shown = undo ? { key: `u${undo.id}`, text: undo.text } : text ? { key: `t${id}`, text } : null;
  const [last, setLast] = useState<{ key: string; text: string } | null>(null);
  const a = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (shown) {
      setLast(shown);
      a.setValue(0);
      Animated.timing(a, { toValue: 1, duration: reduceMotion ? 0 : motion.base, easing: curves.enter, useNativeDriver: true }).start();
      AccessibilityInfo.announceForAccessibility(shown.text);
    } else {
      Animated.timing(a, { toValue: 0, duration: reduceMotion ? 0 : motion.fast, easing: curves.exit, useNativeDriver: true }).start(({ finished }) => finished && setLast(null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown?.key]);

  if (!last) return null;
  return (
    <Animated.View pointerEvents="box-none" style={[s.wrap, { top: insets.top + 8, opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }] }]}>
      <View style={s.toast} accessibilityLiveRegion="polite">
        <Text variant="small" tone="text" style={s.text}>
          {last.text}
        </Text>
        {undo ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Undo"
            hitSlop={8}
            onPress={() => {
              const fn = undo.onUndo;
              dismissUndo();
              void fn();
            }}
            style={s.undo}
          >
            <Text variant="label" tone="accent">
              Undo
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

const useStyles = makeStyles(({ colors, space, line }) => ({
  wrap: { position: 'absolute', left: space.lg, right: space.lg, alignItems: 'center', zIndex: 100, elevation: 100 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '100%',
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.borderStrong,
    borderWidth: line,
    borderLeftWidth: 2,
    borderLeftColor: colors.accent,
    paddingVertical: space.sm,
    paddingLeft: space.lg,
    paddingRight: space.lg,
    gap: space.md,
  },
  text: { flexShrink: 1 },
  undo: { minHeight: hit, minWidth: hit, alignItems: 'center', justifyContent: 'center', marginRight: -space.sm },
}));
