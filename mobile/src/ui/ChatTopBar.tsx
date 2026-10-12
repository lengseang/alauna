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
  const name = spec?.name ?? 'Select Model';
  const characterName = activeSoul?.identity?.name ?? 'Alauna';

  return (
    <View style={[s.bar, { paddingTop: insets.top }]}>
      {/* Unboxed Minimalist Menu Trigger */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open menu"
        onPress={onMenu}
        style={({ pressed }) => [s.iconTouch, pressed && s.iconPressed]}
      >
        <Icon name="menu" size={22} color={s.iconColor.color} />
      </Pressable>

      {/* Floating Liquid Glass Model & Companion Pill */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${characterName}. Model: ${name}. ${line.text}${incognito ? '. Incognito chat' : ''}`}
        accessibilityHint="Switch character or model"
        onPress={onModel}
        style={({ pressed }) => [s.glassPill, pressed && s.glassPillPressed]}
      >
        <SoulAvatarView avatar={activeSoul?.identity?.avatar} name={characterName} size={28} />
        <View style={s.pillCenter}>
          <View style={s.pillTitleRow}>
            <Text variant="strong" numberOfLines={1} style={s.characterName}>
              {characterName}
            </Text>
            <View style={[s.statusDot, line.kind === 'ready' ? s.dotReady : line.kind === 'loading' ? s.dotLoading : s.dotIdle]} />
            {incognito ? <Icon name="incognito" size={13} color={s.iconColor.color} /> : null}
          </View>
          <Text variant="small" tone="muted" numberOfLines={1} style={s.modelSubtitle}>
            {name}
          </Text>
        </View>
        <Icon name="chevron" size={14} color={s.iconColor.color} />
      </Pressable>

      {/* Right Controls: Voice Call & New Chat */}
      <View style={s.rightActions}>
        {onVoice ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Live voice call"
            onPress={onVoice}
            style={({ pressed }) => [s.voiceIconTouch, pressed && s.iconPressed]}
          >
            <Icon name="mic" size={20} color={s.accentColor.color} />
          </Pressable>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New chat"
          onPress={onNewChat}
          style={({ pressed }) => [s.iconTouch, pressed && s.iconPressed]}
        >
          <Icon name="compose" size={20} color={s.iconColor.color} />
        </Pressable>
      </View>
    </View>
  );
});

const useStyles = makeStyles(({ colors, space, line, radius, isDark }) => ({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    backgroundColor: colors.bg,
    borderBottomWidth: line,
    borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(99, 102, 241, 0.08)',
    gap: space.sm,
    minHeight: 52,
  },
  iconTouch: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  voiceIconTouch: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: isDark ? 'rgba(244, 114, 182, 0.12)' : 'rgba(91, 33, 182, 0.08)',
  },
  iconPressed: {
    opacity: 0.6,
    transform: [{ scale: 0.94 }],
  },
  glassPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.sm + 2,
    paddingVertical: 5,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: line,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(99, 102, 241, 0.12)',
    shadowColor: colors.accent,
    shadowOpacity: isDark ? 0.2 : 0.05,
    shadowRadius: 8,
    elevation: 2,
    gap: space.xs + 2,
  },
  glassPillPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  pillCenter: {
    flex: 1,
    minWidth: 0,
  },
  pillTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  characterName: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
  },
  dotReady: {
    backgroundColor: '#10B981',
  },
  dotLoading: {
    backgroundColor: '#F59E0B',
  },
  dotIdle: {
    backgroundColor: colors.muted,
  },
  modelSubtitle: {
    fontSize: 11,
    lineHeight: 14,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  iconColor: {
    color: colors.text,
  },
  accentColor: {
    color: colors.accent,
  },
}));
