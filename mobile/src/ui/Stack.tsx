import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Keyboard, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme';
import { ChatScreen } from './ChatScreen';
import { ModelsScreen } from './ModelsScreen';
import { useStack, type Route } from './nav';
import { MemoryScreen, PersonaScreen } from './PersonaScreen';
import { AboutSettings, AdvancedSettings, SettingsHome, StorageSettings } from './SettingsScreens';

function screenFor(route: Route): React.ReactElement | null {
  switch (route) {
    case 'models':
      return <ModelsScreen />;
    case 'persona':
      return <PersonaScreen />;
    case 'persona/memory':
      return <MemoryScreen />;
    case 'settings':
      return <SettingsHome />;
    case 'settings/storage':
      return <StorageSettings />;
    case 'settings/advanced':
      return <AdvancedSettings />;
    case 'settings/about':
      return <AboutSettings />;
    default:
      return null;
  }
}

interface Layer {
  key: string;
  route: Route;
  leaving: boolean;
}

/** One pushed screen: slides in from the right (250ms), slides out faster (180ms), then reports it is gone. */
function LayerView({ layer, onGone }: { layer: Layer; onGone: (key: string) => void }) {
  const { colors, reduceMotion, motion } = useTheme();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const to = layer.leaving ? 0 : 1;
    Animated.timing(v, {
      toValue: to,
      duration: reduceMotion ? 0 : layer.leaving ? 180 : motion.base,
      easing: layer.leaving ? Easing.in(Easing.cubic) : Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && layer.leaving) onGone(layer.key);
    });
  }, [layer.leaving, layer.key, onGone, reduceMotion, motion.base, v]);
  return (
    <Animated.View
      pointerEvents={layer.leaving ? 'none' : 'auto'}
      style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg, opacity: v, transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [32, 0] }) }] }]}
    >
      {screenFor(layer.route)}
    </Animated.View>
  );
}

/**
 * Chat stays mounted underneath (typed text, scroll position and the streaming reply survive any detour).
 * Every other screen is a layer pushed on top of it; Back peels the top layer off.
 */
export function RouteStack() {
  const stack = useStack();
  const [layers, setLayers] = useState<Layer[]>([]);
  const target = stack.slice(1).map((route, i) => ({ key: `${i}:${route}`, route }));
  const targetKeys = target.map((t) => t.key).join('|');

  useEffect(() => {
    if (target.length > layers.filter((l) => !l.leaving).length) Keyboard.dismiss();
    setLayers((prev) => {
      const next: Layer[] = prev.map((l) => ({ ...l, leaving: !target.some((t) => t.key === l.key) }));
      for (const t of target) if (!next.some((l) => l.key === t.key)) next.push({ ...t, leaving: false });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKeys]);

  const gone = React.useCallback((key: string) => setLayers((prev) => prev.filter((l) => l.key !== key || !l.leaving)), []);
  const covered = layers.some((l) => !l.leaving);
  return (
    <View style={styles.fill}>
      <View style={styles.fill} importantForAccessibility={covered ? 'no-hide-descendants' : 'auto'} accessibilityElementsHidden={covered}>
        <ChatScreen />
      </View>
      {layers.map((l) => (
        <LayerView key={l.key} layer={l} onGone={gone} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
