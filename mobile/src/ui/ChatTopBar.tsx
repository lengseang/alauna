import React from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getModel } from '../core/catalog.ts';
import { useEngineStatus } from '../services/engine.ts';
import { useSettings } from '../services/settings.ts';
import { hit, makeStyles } from '../theme';
import { eclipseFor } from './chatLogic';
import { Eclipse } from './Eclipse';
import { describeEngine } from './engineStatus';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { Text } from './Text';
import { useIsInstalled } from './useInstalled';

interface Props {
  onMenu: () => void;
  onModel: () => void;
  onSoul: () => void;
  onSettings: () => void;
  onNewChat: () => void;
  /** This chat has its own soul (Soul button shows selected). */
  soulOverride: boolean;
  /** This chat is not saved: the bar says so. */
  incognito: boolean;
}

/**
 * Menu (left), model name + Eclipse + live status (centre, opens the model sheet), this chat's Soul, Settings and
 * New chat (right). The status line and the Eclipse are the proof of life, straight from the engine store.
 */
export const ChatTopBar = React.memo(function ChatTopBar({ onMenu, onModel, onSoul, onSettings, onNewChat, soulOverride, incognito }: Props) {
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
        accessibilityLabel={`${name}. ${line.text}${incognito ? '. Incognito chat, not saved' : ''}`}
        accessibilityHint="Switch, load or unload the model"
        onPress={onModel}
        style={({ pressed }) => [s.model, pressed && s.pressed]}
      >
        <View style={s.nameRow}>
          <Eclipse state={eclipseFor(line.kind)} progress={eng.progress} size={18} />
          {incognito ? <Icon name="incognito" size={18} /> : null}
          <Text variant="strong" numberOfLines={1} style={s.shrink}>
            {name}
          </Text>
        </View>
        <Text variant="small" tone={line.tone} numberOfLines={1}>
          {incognito ? `Incognito · ${line.text}` : line.text}
        </Text>
      </Pressable>
      <IconButton icon="persona" label={soulOverride ? 'This chat’s soul (custom)' : 'This chat’s soul'} selected={soulOverride} onPress={onSoul} />
      <IconButton icon="settings" label="Settings" onPress={onSettings} />
      <IconButton icon="compose" label="New chat" onPress={onNewChat} />
    </View>
  );
});

const useStyles = makeStyles(({ colors, space, line }) => ({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.xs, backgroundColor: colors.bg, borderBottomWidth: line, borderBottomColor: colors.border },
  model: { flex: 1, minHeight: hit, justifyContent: 'center', paddingHorizontal: space.sm, paddingVertical: space.xs },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  shrink: { flexShrink: 1 },
  pressed: { backgroundColor: colors.accentSoft },
}));
