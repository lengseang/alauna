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

import { SoulAvatarView } from './soul/SoulAvatarView';
import { useSoulLibrary } from '../services/soulStore.ts';

interface Props {
  onMenu: () => void;
  onModel: () => void;
  onSoul: () => void;
  onVoice?: () => void;
  onSettings: () => void;
  onNewChat: () => void;
  /** This chat has its own soul (Soul button shows selected). */
  soulOverride: boolean;
  /** This chat is not saved: the bar says so. */
  incognito: boolean;
}

/**
 * Menu (left), character avatar + model name + live status (centre), Live Voice call,
 * Soul/Persona, Settings and New chat (right).
 */
export const ChatTopBar = React.memo(function ChatTopBar({ onMenu, onModel, onSoul, onVoice, onSettings, onNewChat, soulOverride, incognito }: Props) {
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const eng = useEngineStatus();
  const settings = useSettings();
  const { activeSoul } = useSoulLibrary();
  const spec = getModel(settings.activeModelId);
  const installed = useIsInstalled(spec?.id);
  const line = describeEngine(eng, spec, installed);
  const name = spec?.name ?? 'Choose a model';
  const characterName = activeSoul?.identity?.name ?? 'Alauna';

  return (
    <View style={[s.bar, { paddingTop: insets.top }]}>
      <IconButton icon="menu" label="Open menu" onPress={onMenu} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${characterName}. Model: ${name}. ${line.text}${incognito ? '. Incognito chat, not saved' : ''}`}
        accessibilityHint="Switch character or model"
        onPress={onModel}
        style={({ pressed }) => [s.model, pressed && s.pressed]}
      >
        <View style={s.nameRow}>
          <SoulAvatarView avatar={activeSoul?.identity?.avatar} name={characterName} size={28} />
          <View style={s.textCol}>
            <View style={s.titleLine}>
              <Text variant="strong" numberOfLines={1} style={s.shrink}>
                {characterName}
              </Text>
              <Eclipse state={eclipseFor(line.kind)} progress={eng.progress} size={14} />
              {incognito ? <Icon name="incognito" size={14} /> : null}
            </View>
            <Text variant="small" tone={line.tone} numberOfLines={1}>
              {incognito ? `Incognito · ${name}` : `${name} · ${line.text}`}
            </Text>
          </View>
        </View>
      </Pressable>
      {onVoice ? <IconButton icon="mic" label="Live voice call" onPress={onVoice} /> : null}
      <IconButton icon="persona" label={soulOverride ? 'Character profile (custom)' : 'Character profile'} selected={soulOverride} onPress={onSoul} />
      <IconButton icon="compose" label="New chat" onPress={onNewChat} />
    </View>
  );
});

const useStyles = makeStyles(({ colors, space, line, radius }) => ({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    backgroundColor: colors.bg,
    borderBottomWidth: line,
    borderBottomColor: colors.border,
    gap: space.xs,
  },
  model: {
    flex: 1,
    minHeight: hit,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: line,
    borderColor: colors.border,
    shadowColor: colors.accent,
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  textCol: { flex: 1, minWidth: 0 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  shrink: { flexShrink: 1 },
  pressed: { backgroundColor: colors.surfaceAlt },
}));
