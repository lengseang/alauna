import React from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getModel } from '../core/catalog.ts';
import { useEngineStatus } from '../services/engine.ts';
import { useSettings } from '../services/settings.ts';
import { hit, makeStyles } from '../theme';
import { describeEngine } from './engineStatus';
import { IconButton } from './IconButton';
import { PulseDot } from './Motion';
import { Text } from './Text';
import { useIsInstalled } from './useInstalled';

interface Props {
  onMenu: () => void;
  onModel: () => void;
  onNewChat: () => void;
}

/**
 * Exactly three controls: menu (left), model name + live status (centre, opens the model sheet), new chat (right).
 * The status line is the proof of life: Loading 42% -> Ready . CPU, straight from the engine store.
 */
export const ChatTopBar = React.memo(function ChatTopBar({ onMenu, onModel, onNewChat }: Props) {
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const eng = useEngineStatus();
  const settings = useSettings();
  const spec = getModel(settings.activeModelId);
  const installed = useIsInstalled(spec?.id);
  const line = describeEngine(eng, spec, installed);
  const name = spec?.name ?? 'Choose a model';
  return (
    <View style={[s.bar, { paddingTop: insets.top }]}>
      <IconButton icon="menu" label="Open menu" onPress={onMenu} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${name}. ${line.text}`}
        accessibilityHint="Opens the model list"
        onPress={onModel}
        style={({ pressed }) => [s.model, pressed && s.pressed]}
      >
        <Text variant="strong" numberOfLines={1}>
          {name}
        </Text>
        <View style={s.status}>
          {line.busy ? <PulseDot size={6} /> : null}
          <Text variant="small" tone={line.tone} numberOfLines={1}>
            {line.text}
          </Text>
        </View>
      </Pressable>
      <IconButton icon="compose" label="New chat" onPress={onNewChat} />
    </View>
  );
});

const useStyles = makeStyles(({ colors, space, radius }) => ({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.sm, gap: space.xs, backgroundColor: colors.bg },
  model: { flex: 1, minHeight: hit, alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg, paddingHorizontal: space.md, paddingVertical: space.xs },
  pressed: { backgroundColor: colors.accentSoft },
  status: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
}));
