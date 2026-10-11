import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { getDeviceProfile } from '../services/device.ts';
import { recommendedModel } from '../services/engine.ts';
import { hit, makeStyles } from '../theme';
import { Ambient } from './Ambient';
import { Icon } from './Icon';
import { submitMessage } from './Composer';
import { SetupCard } from './SetupCard';
import { Text } from './Text';
import { Wordmark } from './Wordmark';

const PROMPTS = [
  "Come closer... tell me what you've been thinking about today.",
  "Let's roleplay: an unexpected encounter late at night.",
  "Describe our private sanctuary and how you imagine us.",
  "Tell me a secret you haven't told anyone else...",
];

/**
 * First thing you see in a new chat: wordmark, one greeting line, then either four tappable prompts
 * or, when no model is installed yet, a single "Get a model" card. Stars (Nyx) or sun (Helios) behind.
 */
export function EmptyChat({ hasModel, loading, incognito }: { hasModel: boolean; loading: boolean; incognito: boolean }) {
  const s = useStyles();
  const recommended = recommendedModel();
  return (
    <View style={s.root}>
      <Ambient />
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={s.col}>
          <Wordmark breathing={loading} />
          {incognito ? (
            <View style={s.incognito}>
              <Icon name="incognito" size={20} />
              <Text variant="small" tone="text">
                Incognito chat: not saved, not in your history.
              </Text>
            </View>
          ) : null}
          {hasModel ? (
            <>
              <Text variant="title" style={s.center}>
                I'm all yours.
              </Text>
              <View style={s.prompts}>
                {PROMPTS.map((p) => (
                  <Pressable key={p} accessibilityRole="button" accessibilityLabel={p} onPress={() => void submitMessage(p)} style={({ pressed }) => [s.prompt, pressed && s.pressed]}>
                    <Text>{p}</Text>
                  </Pressable>
                ))}
              </View>
            </>
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

const useStyles = makeStyles(({ colors, space, line }) => ({
  root: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: space.lg },
  col: { gap: space.lg, alignItems: 'center' },
  center: { textAlign: 'center' },
  incognito: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  prompts: { alignSelf: 'stretch', borderTopWidth: line, borderTopColor: colors.border },
  prompt: { minHeight: hit, justifyContent: 'center', paddingHorizontal: space.sm, paddingVertical: space.md, borderBottomWidth: line, borderBottomColor: colors.border },
  pressed: { backgroundColor: colors.surfaceAlt },
  card: { alignSelf: 'stretch' },
}));
