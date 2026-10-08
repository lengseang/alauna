import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Pressable, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { getModel } from '../core/catalog.ts';
import type { ChatMessage } from '../core/chatTypes.ts';
import { formatDuration, formatPercent } from '../core/format.ts';
import { engine } from '../services/engine.ts';
import { showToast } from '../services/toast.ts';
import { makeStyles } from '../theme';
import { Button } from './Button';
import { Markdown } from './Markdown';
import { FadeIn, PulseDot } from './Motion';
import { push } from './nav';
import { Notice } from './Notice';
import { Text } from './Text';

interface Props {
  message: ChatMessage;
  /** Newest message: only it offers Retry and Copy. */
  isLast: boolean;
  /** A reply is being generated (disables Retry). */
  busy: boolean;
  onRetry: () => void | Promise<unknown>;
}

function needsModelAction(error: string): boolean {
  return /download|not downloaded|no model|storage folder|model hub|damaged|incomplete|could not read|too heavy|not available in this build|memory/i.test(error);
}

/** Seconds since `startMs`, ticking twice a second only while `active` (this tiny component re-renders, nothing else). */
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

/** "Loading <model> 42%": subscribes to the engine itself so the message list does not re-render for it. */
function LoadingLine({ modelName }: { modelName: string }) {
  const p = useSyncExternalStore(engine.store.subscribe, () => engine.store.getState().loadProgress);
  return <LiveLine text={`Loading ${modelName} ${formatPercent(p)}`} />;
}

function LiveLine({ text }: { text: string }) {
  const s = useStyles();
  return (
    <View style={s.live} accessibilityLiveRegion="polite">
      <PulseDot />
      <Text variant="small" tone="accent">
        {text}
      </Text>
    </View>
  );
}

function Reasoning({ message: m, live }: { message: ChatMessage; live: boolean }) {
  const s = useStyles();
  const elapsed = useElapsed(live && m.phase === 'thinking', m.createdAt);
  const [toggle, setToggle] = useState<boolean | null>(null);
  const open = toggle ?? (live && m.phase === 'thinking');
  const title =
    live && m.phase === 'thinking'
      ? `Thinking ${Math.round(elapsed)}s`
      : m.thinkSeconds !== undefined
        ? `Thought for ${m.thinkSeconds < 1 ? 'a moment' : formatDuration(m.thinkSeconds)}`
        : 'Thought process';
  return (
    <View style={s.reasoning}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${open ? 'Hide' : 'Show'} reasoning`}
        accessibilityState={{ expanded: open }}
        onPress={() => setToggle(!open)}
        style={s.reasonHead}
      >
        {live && m.phase === 'thinking' ? <PulseDot /> : null}
        <Text variant="small" tone={live ? 'accent' : 'muted'}>
          {title}
        </Text>
        <Text variant="label" tone="accent">
          {open ? 'Hide' : 'Show'}
        </Text>
      </Pressable>
      {open ? (
        <Text variant="small" selectable style={s.reasonBody}>
          {m.reasoning}
        </Text>
      ) : null}
    </View>
  );
}

export const MessageRow = React.memo(function MessageRow({ message: m, isLast, busy, onRetry }: Props) {
  const s = useStyles();
  // Only a message that appeared just now fades in; rows that scroll back into view do not replay it.
  const fresh = Date.now() - m.createdAt < 1500;

  if (m.role === 'user') {
    return (
      <FadeIn enabled={fresh} style={s.userRow}>
        <View style={s.bubble}>
          {m.attachments?.map((a) => (
            <Text key={a.name} variant="small" numberOfLines={1}>
              {a.name}
              {a.truncated ? ' (shortened)' : ''}
            </Text>
          ))}
          {m.text ? <Text selectable>{m.text}</Text> : null}
        </View>
      </FadeIn>
    );
  }

  const live = m.status === 'streaming';
  const modelName = getModel(m.stats?.modelId ?? engine.state.modelId)?.name ?? 'the model';
  const hasReasoning = !!m.reasoning?.trim();
  const done = !live && m.status !== 'error';
  const copy = async () => {
    await Clipboard.setStringAsync(m.text);
    showToast('Copied');
  };

  return (
    <FadeIn enabled={fresh} style={s.ai}>
      {live && m.phase === 'loading' ? <LoadingLine modelName={modelName} /> : null}
      {live && m.phase === 'reading' ? <LiveLine text={`Reading your message${m.promptTokensEst ? ` (~${m.promptTokensEst} tokens)` : ''}`} /> : null}
      {hasReasoning || (live && m.phase === 'thinking') ? <Reasoning message={m} live={live} /> : null}
      {m.text ? <Markdown text={m.text} /> : null}
      {live && m.phase === 'answering' ? <PulseDot size={10} /> : null}

      {m.status === 'stopped' ? <Text variant="small">Stopped{m.text ? '' : ' before any answer'}.</Text> : null}
      {m.notice ? <Text variant="small">{m.notice}</Text> : null}
      {m.status === 'error' && m.error ? (
        <Notice
          tone="danger"
          action={
            <View style={s.actionsPlain}>
              {isLast ? <Button label="Try again" variant="quiet" onPress={onRetry} disabled={busy} /> : null}
              {needsModelAction(m.error) ? <Button label="Open models" variant="quiet" onPress={() => push('models')} /> : null}
            </View>
          }
        >
          {m.error}
        </Notice>
      ) : null}

      {done && m.stats ? (
        <Text variant="small" accessibilityLabel={`${m.stats.tokensPerSecond.toFixed(1)} tokens per second, ${m.stats.generatedTokens} tokens`}>
          {m.stats.tokensPerSecond.toFixed(1)} tok/s {'·'} {m.stats.generatedTokens} tokens
        </Text>
      ) : null}
      {done && isLast && m.text ? (
        <View style={s.actions}>
          <Button label="Copy" variant="text" onPress={copy} />
          <Button label="Retry" variant="text" onPress={onRetry} disabled={busy} />
        </View>
      ) : null}
    </FadeIn>
  );
});

const useStyles = makeStyles(({ colors, space, radius }) => ({
  userRow: { alignItems: 'flex-end', marginTop: space.lg },
  bubble: { maxWidth: '86%', backgroundColor: colors.surfaceAlt, borderRadius: radius.lg, borderBottomRightRadius: radius.sm, paddingVertical: space.md, paddingHorizontal: space.lg, gap: space.xs },
  ai: { marginTop: space.lg, gap: space.sm },
  live: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 24 },
  reasoning: { gap: space.xs },
  reasonHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48 },
  reasonBody: { borderLeftWidth: 2, borderLeftColor: colors.border, paddingLeft: space.md },
  actions: { flexDirection: 'row', gap: space.xs, flexWrap: 'wrap', marginLeft: -space.md },
  actionsPlain: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
}));
