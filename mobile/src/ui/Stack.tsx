import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Animated, Keyboard, PanResponder, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useTheme } from '../theme';
import { ChatScreen } from './ChatScreen';
import { curves } from './Motion';
import { EntryContext, pop, useEntries, type Entry } from './nav';
import { SCREENS } from './routes';

interface Layer {
  entry: Entry;
  leaving: boolean;
  /** 0 = off-screen right, 1 = in place. Native-driven; the edge swipe sets it directly. */
  v: Animated.Value;
}

const EDGE = 24; // dp from the left edge where a swipe-back may start
const PARALLAX = 0.28; // the screen underneath shifts left by this much of the width and dims

interface LayerViewProps {
  layer: Layer | null; // null = the chat root
  coverBy: Animated.Value | null; // `v` of the layer above (drives this layer's parallax + dim)
  active: number; // non-leaving layers above this one
  width: number;
  onGone: (key: string) => void;
  children: React.ReactNode;
}

/**
 * One screen of the stack. Enters from the right (320ms, decelerating), leaves faster (240ms). The screen underneath
 * slides 28% left and dims, like the native stacks in Claude/ChatGPT. Layers buried two deep are made invisible
 * (opacity 0: no overdraw, but scroll positions and state survive), and covered layers are hidden from screen readers.
 */
function LayerView({ layer, coverBy, active, width, onGone, children }: LayerViewProps) {
  const { colors, reduceMotion, motion } = useTheme();
  const isTop = !!layer && !layer.leaving && active === 0;

  useEffect(() => {
    if (!layer) return;
    const { v } = layer;
    v.stopAnimation((from) => {
      const to = layer.leaving ? 0 : 1;
      const span = Math.abs(to - from);
      Animated.timing(v, {
        toValue: to,
        duration: reduceMotion ? 0 : Math.round((layer.leaving ? motion.pop : motion.push) * Math.max(0.35, span)),
        easing: layer.leaving ? curves.exit : curves.enter,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && layer.leaving) onGone(layer.entry.key);
      });
    });
  }, [layer, reduceMotion, motion.pop, motion.push, onGone]);

  // Interactive swipe-back from the left edge (captures only clearly horizontal drags, so taps and scrolls pass).
  const pan = useMemo(() => {
    if (!layer || !isTop) return null;
    const { v } = layer;
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) => g.x0 < EDGE && g.dx > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderGrant: () => v.stopAnimation(),
      onPanResponderMove: (_, g) => v.setValue(Math.max(0, Math.min(1, 1 - g.dx / width))),
      onPanResponderRelease: (_, g) => {
        if (g.dx > width * 0.33 || g.vx > 0.6) pop();
        else Animated.timing(v, { toValue: 1, duration: reduceMotion ? 0 : motion.fast, easing: curves.enter, useNativeDriver: true }).start();
      },
      onPanResponderTerminate: () => Animated.timing(v, { toValue: 1, duration: 0, useNativeDriver: true }).start(),
    });
  }, [layer, isTop, width, reduceMotion, motion.fast]);

  const shift = coverBy ? coverBy.interpolate({ inputRange: [0, 1], outputRange: [0, -width * PARALLAX] }) : null;
  const enter = layer ? layer.v.interpolate({ inputRange: [0, 1], outputRange: [width, 0] }) : null;
  const translateX = enter && shift ? Animated.add(enter, shift) : (enter ?? shift ?? 0);
  const covered = active > 0;

  return (
    <View
      style={[StyleSheet.absoluteFill, { opacity: active >= 2 ? 0 : 1 }]}
      pointerEvents={layer?.leaving || covered ? 'none' : 'auto'}
      importantForAccessibility={covered || layer?.leaving ? 'no-hide-descendants' : 'auto'}
      accessibilityElementsHidden={covered || !!layer?.leaving}
    >
      <Animated.View
        {...(pan?.panHandlers ?? {})}
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg, borderLeftWidth: layer ? 1 : 0, borderLeftColor: colors.border, transform: [{ translateX }] }]}
      >
        {children}
        {coverBy ? <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim, opacity: coverBy.interpolate({ inputRange: [0, 1], outputRange: [0, 0.45] }) }]} /> : null}
      </Animated.View>
    </View>
  );
}

/**
 * The app shell: Chat at the root (typed text, scroll position and a streaming reply survive any detour), every other
 * registered screen pushed on top. Back (button, edge swipe, Android Back via App.tsx -> pop()) peels the top layer.
 */
export function RouteStack() {
  const entries = useEntries();
  const { width } = useWindowDimensions();
  const [layers, setLayers] = useState<Layer[]>([]);
  const pushed = entries.slice(1);
  const sig = pushed.map((e) => e.key).join('|');

  useEffect(() => {
    setLayers((prev) => {
      const next = prev.map((l) => {
        const leaving = !pushed.some((e) => e.key === l.entry.key);
        return leaving === l.leaving ? l : { ...l, leaving };
      });
      let grew = false;
      for (const e of pushed) {
        if (!next.some((l) => l.entry.key === e.key)) {
          next.push({ entry: e, leaving: false, v: new Animated.Value(0) });
          grew = true;
        }
      }
      if (grew) Keyboard.dismiss();
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const gone = useCallback((key: string) => setLayers((prev) => prev.filter((l) => l.entry.key !== key || !l.leaving)), []);
  const activeAbove = (i: number) => layers.slice(i).filter((l) => !l.leaving).length; // layers at index >= i

  return (
    <View style={styles.fill}>
      <LayerView layer={null} coverBy={layers[0]?.v ?? null} active={activeAbove(0)} width={width} onGone={gone}>
        <ChatScreen />
      </LayerView>
      {layers.map((l, i) => {
        const Screen = SCREENS[l.entry.route as keyof typeof SCREENS];
        return (
          <LayerView key={l.entry.key} layer={l} coverBy={layers[i + 1]?.v ?? null} active={activeAbove(i + 1)} width={width} onGone={gone}>
            <EntryContext.Provider value={l.entry}>{Screen ? <Screen /> : null}</EntryContext.Provider>
          </LayerView>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
