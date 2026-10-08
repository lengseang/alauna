import React, { useEffect, useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, Modal, PanResponder, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hit, makeStyles, useTheme } from '../theme';
import { curves } from './Motion';
import { Text } from './Text';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Pinned under the scrolling body (e.g. the one primary Button). */
  footer?: React.ReactNode;
}

/**
 * Bottom sheet: a square slab with a hairline top edge. Slides up (250ms), exits faster (180ms), closes on: Close,
 * backdrop tap, swipe down on the grip, Android Back. Content scrolls past 85% of the screen. Never stack two sheets.
 */
export function Sheet({ visible, onClose, title, children, footer }: SheetProps) {
  const { reduceMotion, motion } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const s = useStyles();
  const [mounted, setMounted] = useState(visible);
  const y = useRef(new Animated.Value(height)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (visible) setMounted(true);
    const duration = reduceMotion ? 0 : visible ? motion.base : 180;
    const easing = visible ? curves.enter : curves.exit;
    Animated.parallel([
      Animated.timing(y, { toValue: visible ? 0 : height, duration, easing, useNativeDriver: true }),
      Animated.timing(fade, { toValue: visible ? 1 : 0, duration, easing, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
  }, [visible, height, reduceMotion, motion.base, y, fade]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) y.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 90 || g.vy > 0.7) closeRef.current();
        else Animated.spring(y, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
      },
    }),
  ).current;

  if (!mounted) return null;
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={s.root}>
        <Animated.View style={[s.scrim, { opacity: fade }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" style={s.fill} onPress={onClose} />
        </Animated.View>
        <Animated.View accessibilityViewIsModal style={[s.sheet, { paddingBottom: insets.bottom + 16, transform: [{ translateY: y }] }]}>
          <View {...pan.panHandlers} style={s.gripArea} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <View style={s.grip} />
          </View>
          <View style={s.head}>
            <Text variant="title" style={s.title} numberOfLines={1}>
              {title}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={s.close}>
              <Text variant="label" tone="accent">
                Close
              </Text>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.body} style={{ maxHeight: height * 0.85 - (footer ? 184 : 120) }}>
            {children}
          </ScrollView>
          {footer ? <View style={s.footer}>{footer}</View> : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles(({ colors, space, line }) => ({
  root: { flex: 1, justifyContent: 'flex-end' },
  fill: { flex: 1 },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.scrim },
  sheet: { backgroundColor: colors.surface, borderTopWidth: line, borderColor: colors.borderStrong, paddingHorizontal: space.lg },
  gripArea: { height: space.xl, alignItems: 'center', justifyContent: 'center' },
  grip: { width: 32, height: 2, backgroundColor: colors.borderStrong },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  title: { flex: 1 },
  close: { minHeight: hit, minWidth: hit, alignItems: 'center', justifyContent: 'center' },
  body: { gap: space.md, paddingTop: space.sm, paddingBottom: space.sm },
  footer: { paddingTop: space.md, borderTopWidth: line, borderTopColor: colors.border },
}));
