import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { getDeviceProfile } from '../services/device.ts';
import { recommendedModel } from '../services/engine.ts';
import { hit, makeStyles } from '../theme';
import { Ambient } from './Ambient';
import { submitMessage } from './Composer';
import { SetupCard } from './SetupCard';
import { Text } from './Text';
import { Wordmark } from './Wordmark';

const PROMPTS = ['Explain how a rainbow forms, simply.', 'Write a short poem about monsoon rain.', 'Plan a 3-day trip to Siem Reap.', 'Give me 5 tips for learning to code faster.'];

/**
 * First thing you see in a new chat: wordmark, one greeting line, then either four tappable prompts
 * or, when no model is installed yet, a single "Get a model" card. Stars (Nyx) or sun (Helios) behind.
 */
export function EmptyChat({ hasModel, loading }: { hasModel: boolean; loading: boolean }) {
  const s = useStyles();
  const recommended = recommendedModel();
  return (
    <View style={s.root}>
      <Ambient />
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={s.col}>
          <Wordmark breathing={loading} />
          {hasModel ? (
            <>
              <Text variant="title" style={s.center}>
                What shall we explore?
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

const useStyles = makeStyles(({ colors, space, radius }) => ({
  root: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: space.lg },
  col: { gap: space.lg, alignItems: 'center' },
  center: { textAlign: 'center' },
  prompts: { alignSelf: 'stretch', gap: space.sm },
  prompt: {
    minHeight: hit,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pressed: { backgroundColor: colors.surfaceAlt },
  card: { alignSelf: 'stretch' },
}));
