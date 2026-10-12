import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { getDeviceProfile } from '../services/device.ts';
import { recommendedModel } from '../services/engine.ts';
import { hit, makeStyles } from '../theme';
import { Ambient } from './Ambient';
import { Icon } from './Icon';
import { submitMessage } from './Composer';
import { Orb } from './Orb';
import { SetupCard } from './SetupCard';
import { Text } from './Text';
import { useSoulLibrary } from '../services/soulStore.ts';

const PROMPTS = [
  "Come closer... tell me what you've been thinking about today.",
  "Let's roleplay: an unexpected encounter late at night.",
  "Describe our private sanctuary and how you imagine us.",
  "Tell me a secret you haven't told anyone else...",
];

export function EmptyChat({ hasModel, loading, incognito }: { hasModel: boolean; loading: boolean; incognito: boolean }) {
  const s = useStyles();
  const recommended = recommendedModel();
  const { activeSoul } = useSoulLibrary();
  const characterName = activeSoul?.identity?.name ?? 'Alauna';

  return (
    <View style={s.root}>
      <Ambient />
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={s.col}>
          {/* Floating 3D Iridescent Holographic Orb */}
          <Orb size={140} label={`${characterName} presence`} />

          <View style={s.headerBox}>
            <Text variant="display" style={s.center}>
              {`How may I help you today, ${characterName === 'Alauna' ? 'darling' : characterName}?`}
            </Text>
            {incognito ? (
              <View style={s.incognito}>
                <Icon name="incognito" size={16} />
                <Text variant="small" tone="muted">
                  Incognito chat: 100% private, not stored in history.
                </Text>
              </View>
            ) : null}
          </View>

          {hasModel ? (
            <View style={s.prompts}>
              {PROMPTS.map((p) => (
                <Pressable
                  key={p}
                  accessibilityRole="button"
                  accessibilityLabel={p}
                  onPress={() => void submitMessage(p)}
                  style={({ pressed }) => [s.prompt, pressed && s.pressed]}
                >
                  <Text variant="body" style={s.promptText}>{p}</Text>
                  <Icon name="chevron" size={16} color={s.chevronColor.color} />
                </Pressable>
              ))}
            </View>
          ) : recommended ? (
            <View style={s.card}>
              <SetupCard spec={recommended} deviceName={getDeviceProfile().name} tone="welcome" />
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles(({ colors, space, line, radius }) => ({
  root: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: space.lg },
  col: { gap: space.xl, alignItems: 'center' },
  headerBox: { gap: space.xs, alignItems: 'center', maxWidth: 320 },
  center: { textAlign: 'center', fontWeight: '600' },
  incognito: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.xs },
  prompts: { alignSelf: 'stretch', gap: space.sm },
  prompt: {
    minHeight: hit,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: line,
    borderColor: colors.border,
    shadowColor: colors.accent,
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  promptText: { flex: 1, marginRight: space.sm },
  chevronColor: { color: colors.muted },
  pressed: { backgroundColor: colors.surfaceAlt, transform: [{ scale: 0.99 }] },
  card: { alignSelf: 'stretch' },
}));
