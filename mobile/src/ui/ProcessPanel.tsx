import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ChatMessage } from '../core/chatTypes.ts';
import { formatDuration, formatPercent } from '../core/format.ts';
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, ThinkIcon } from '../components/Icons';
import { colors, font, radius } from './theme';

/** Seconds since `startMs`, ticking while `active` (so the panel visibly moves; the numbers are real). */
function useElapsed(active: boolean, startMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [active]);
  return Math.max(0, (now - startMs) / 1000);
}

interface Props {
  message: ChatMessage;
  modelName: string;
  /** 0..1 while the engine is loading the model into RAM. */
  loadProgress: number;
}

type StepState = 'done' | 'active' | 'todo';

function Step({ state, title, detail }: { state: StepState; title: string; detail?: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepIcon}>
        {state === 'done' ? <CheckIcon size={13} color={colors.good} /> : state === 'active' ? <ActivityIndicator size="small" color={colors.accent} style={{ transform: [{ scale: 0.7 }] }} /> : <View style={styles.dot} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.stepTitle, state === 'todo' && { color: colors.faint }]}>{title}</Text>
        {detail ? <Text style={styles.stepDetail}>{detail}</Text> : null}
      </View>
    </View>
  );
}

/**
 * "What is the AI doing?" (CH-2). Everything shown is real: phases come from actual
 * tokens, counts/speeds from the engine's own timings, reasoning from the model.
 */
export function ProcessPanel({ message: m, modelName, loadProgress }: Props) {
  const live = m.status === 'streaming';
  const phase = m.phase ?? 'done';
  const elapsed = useElapsed(live, m.createdAt);
  const [userToggle, setUserToggle] = useState<boolean | null>(null);

  const hasReasoning = !!m.reasoning?.trim();
  // Auto-open while loading/thinking so the user can watch; collapse when finished.
  const autoOpen = live && (phase === 'loading' || phase === 'thinking');
  const open = userToggle ?? autoOpen;

  let title: string;
  if (live) {
    title =
      phase === 'loading'
        ? `Loading ${modelName} into memory… ${formatPercent(loadProgress)}`
        : phase === 'reading'
          ? `Reading your message${m.promptTokensEst ? ` (~${m.promptTokensEst} tokens)` : ''}…`
          : phase === 'thinking'
            ? `Thinking… ${Math.round(elapsed)}s`
            : 'Writing the answer…';
  } else if (m.thinkSeconds !== undefined && hasReasoning) {
    title = `Thought for ${m.thinkSeconds < 1 ? 'a moment' : formatDuration(m.thinkSeconds)}`;
  } else if (m.stats) {
    title = `${m.stats.generatedTokens} tokens · ${m.stats.tokensPerSecond.toFixed(1)} tok/s`;
  } else {
    return null;
  }

  const s = m.stats;
  const reading: StepState = phase === 'loading' ? 'todo' : phase === 'reading' && live ? 'active' : 'done';
  const thinking: StepState = phase === 'thinking' && live ? 'active' : hasReasoning || (phase === 'answering' && !!m.thinkSeconds) || (!live && !!m.thinkSeconds) ? 'done' : 'todo';
  const answering: StepState = live ? (phase === 'answering' ? 'active' : 'todo') : m.text ? 'done' : 'todo';

  return (
    <View style={styles.box}>
      <Pressable accessibilityRole="button" accessibilityLabel={open ? 'Hide process' : 'Show process'} onPress={() => setUserToggle(!open)} style={styles.header}>
        <View style={styles.headerLeft}>
          {live ? <ActivityIndicator size="small" color={colors.accent} /> : <ThinkIcon size={14} color={colors.muted} />}
          <Text style={[styles.title, live && { color: colors.accent }]} numberOfLines={1}>
            {title}
          </Text>
        </View>
        {open ? <ChevronUpIcon /> : <ChevronDownIcon />}
      </Pressable>

      {open ? (
        <View style={styles.body}>
          {phase === 'loading' ? <Step state="active" title="Loading the model into memory" detail={`${modelName} · ${formatPercent(loadProgress)}`} /> : null}
          <Step
            state={reading}
            title="Read your message"
            detail={s ? `${s.promptTokens} tokens in ${(s.promptMs / 1000).toFixed(1)}s` : m.promptTokensEst ? `~${m.promptTokensEst} tokens` : undefined}
          />
          {hasReasoning || thinking !== 'todo' ? (
            <Step state={thinking} title="Thinking it through" detail={m.thinkSeconds !== undefined && !live ? formatDuration(m.thinkSeconds) : undefined} />
          ) : null}
          {hasReasoning ? (
            <ScrollView style={styles.reasoningBox} nestedScrollEnabled showsVerticalScrollIndicator>
              <Text selectable style={styles.reasoning}>{m.reasoning}</Text>
            </ScrollView>
          ) : null}
          <Step state={answering} title="Write the answer" detail={s ? `${s.generatedTokens} tokens at ${s.tokensPerSecond.toFixed(1)} tok/s · ${formatDuration(s.totalMs / 1000)} total` : undefined} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: 10, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 12, gap: 8 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  title: { color: colors.muted, fontSize: font.sm, fontWeight: '600', flexShrink: 1 },
  body: { paddingHorizontal: 12, paddingBottom: 12, gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
  step: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  stepIcon: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.faint },
  stepTitle: { color: colors.text, fontSize: font.sm, fontWeight: '600' },
  stepDetail: { color: colors.faint, fontSize: font.xs, marginTop: 1 },
  reasoningBox: { maxHeight: 170, backgroundColor: colors.surface2, borderRadius: radius.sm, padding: 10, marginLeft: 26 },
  reasoning: { color: colors.muted, fontSize: 12.5, lineHeight: 18 },
});
