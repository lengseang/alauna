import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Image, Pressable, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { getModel } from '../core/catalog.ts';
import type { ChatMessage } from '../core/chatTypes.ts';
import { formatDuration, formatPercent } from '../core/format.ts';
import { createStore } from '../core/store.ts';
import { nextSentences } from '../core/voiceChunker.ts';
import { engine } from '../services/engine.ts';
import { showToast } from '../services/toast.ts';
import { speak, stopSpeaking, TTS_MISSING, ttsStore } from '../services/voice/tts.ts';
import { makeStyles } from '../theme';
import { Button } from './Button';
import { statsParts } from './chatLogic';
import { Icon } from './Icon';
import { Markdown } from './Markdown';
import { FadeIn, PulseDot } from './Motion';
import { push } from './nav';
import { Notice } from './Notice';
import { Text } from './Text';

interface Props {
  message: ChatMessage;
  /** Newest message: only it offers Retry. */
  isLast: boolean;
  /** A reply is being generated (disables Retry). */
  busy: boolean;
  onRetry: () => void | Promise<unknown>;
  /** Long-press: copy / regenerate / edit & resend / speak / delete. */
  onActions: (message: ChatMessage) => void;
}

// ------------------------------------------------------------------ read aloud (expo-speech, offline voices)

const speechStore = createStore<{ id: string | null }>({ id: null });
/** Only the row being read (and the one that stops) re-renders. */
const useIsSpoken = (id: string) => useSyncExternalStore(speechStore.subscribe, () => speechStore.getState().id === id);

/** Read a reply aloud, sentence by sentence (code blocks skipped, Markdown stripped). Replaces anything being read. */
export async function speakMessage(m: ChatMessage): Promise<void> {
  await stopSpeaking();
  const { sentences } = nextSentences(m.text, 0, true);
  if (!sentences.length) return showToast('Nothing to read aloud.');
  speechStore.setState({ id: m.id });
  const ok = sentences.every((t, i) => speak(t, i === sentences.length - 1 ? { onDone: () => speechStore.setState({ id: null }) } : {}));
  if (!ok) {
    speechStore.setState({ id: null });
    showToast(ttsStore.getState().lastError ?? TTS_MISSING);
  }
}

export async function stopMessageSpeech(): Promise<void> {
  speechStore.setState({ id: null });
  await stopSpeaking();
}

export const isSpeakingMessage = (id: string): boolean => speechStore.getState().id === id;

// ------------------------------------------------------------------ parts

function needsModelAction(error: string): boolean {
  return /download|not downloaded|no model|storage folder|model hub|damaged|incomplete|could not read|too heavy|not available in this build|memory|vision/i.test(error);
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
  const thinking = live && m.phase === 'thinking';
  const elapsed = useElapsed(thinking, m.createdAt);
  const [toggle, setToggle] = useState<boolean | null>(null);
  const open = toggle ?? thinking;
  const title = thinking
    ? `Thinking ${Math.round(elapsed)}s`
    : m.thinkSeconds !== undefined
      ? `Thought for ${m.thinkSeconds < 1 ? 'under a second' : formatDuration(m.thinkSeconds)}`
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
        {thinking ? <PulseDot /> : null}
        <Text variant="small" tone={live ? 'accent' : 'muted'}>
          {title}
        </Text>
        <Icon name="chevron" size={16} rotate={open ? 90 : 0} />
      </Pressable>
      {open ? (
        <Text variant="small" style={s.reasonBody}>
          {m.reasoning}
        </Text>
      ) : null}
    </View>
  );
}

function Attachments({ message: m }: { message: ChatMessage }) {
  const s = useStyles();
  if (!m.attachments?.length) return null;
  return (
    <View style={s.attachments}>
      {m.attachments.map((a, i) =>
        a.kind === 'image' && a.path ? (
          <Image key={`${a.name}#${i}`} source={{ uri: `file://${a.path}` }} style={s.thumb} accessibilityLabel={`Image ${a.name}`} />
        ) : (
          <View key={`${a.name}#${i}`} style={s.fileChip}>
            <Icon name="file" size={16} />
            <Text variant="small" tone="text" numberOfLines={1} style={s.shrink}>
              {a.name}
              {a.truncated ? ' (shortened)' : ''}
            </Text>
          </View>
        ),
      )}
    </View>
  );
}

// ------------------------------------------------------------------ row

export const MessageRow = React.memo(function MessageRow({ message: m, isLast, busy, onRetry, onActions }: Props) {
  const s = useStyles();
  const speaking = useIsSpoken(m.id);
  // Only a message that appeared just now fades in; rows that scroll back into view do not replay it.
  const fresh = Date.now() - m.createdAt < 1500;
  const actions = () => onActions(m);

  if (m.role === 'user') {
    return (
      <FadeIn enabled={fresh} style={s.userRow}>
        <Pressable onLongPress={actions} delayLongPress={350} accessibilityHint="Hold for copy, edit and resend, delete" style={s.userBlock}>
          <Attachments message={m} />
          {m.text ? <Text>{m.text}</Text> : null}
        </Pressable>
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
  const stats = done && m.stats ? statsParts(m.stats) : null;

  return (
    <FadeIn enabled={fresh} style={s.ai}>
      <Pressable onLongPress={actions} delayLongPress={350} accessibilityHint="Hold for copy, regenerate, read aloud, delete" style={s.aiBody}>
        {live && m.phase === 'loading' ? <LoadingLine modelName={modelName} /> : null}
        {live && m.phase === 'reading' ? <LiveLine text={m.notice ?? `Reading your message${m.promptTokensEst ? ` (~${m.promptTokensEst} tokens)` : ''}`} /> : null}
        {hasReasoning || (live && m.phase === 'thinking') ? <Reasoning message={m} live={live} /> : null}
        {m.text ? <Markdown text={m.text} /> : null}
        {live && m.phase === 'answering' ? <PulseDot size={10} /> : null}

        {m.status === 'stopped' ? <Text variant="small">Stopped{m.text ? '' : ' before any answer'}.</Text> : null}
        {m.notice ? <Text variant="small">{m.notice}</Text> : null}
        {stats ? (
          <Text variant="small" accessibilityLabel={stats.join(', ')}>
            {stats.join(' · ')}
          </Text>
        ) : null}
      </Pressable>

      {m.status === 'error' && m.error ? (
        <Notice
          tone="danger"
          action={
            <View style={s.actionsPlain}>
              {isLast ? <Button label="Try again" variant="quiet" onPress={onRetry} disabled={busy} /> : null}
              {needsModelAction(m.error) ? <Button label="Open Model Vault" variant="quiet" onPress={() => push('models')} /> : null}
            </View>
          }
        >
          {m.error}
        </Notice>
      ) : null}

      {done && m.text && (isLast || speaking) ? (
        <View style={s.actions}>
          <Button label="Copy" variant="text" onPress={copy} />
          {isLast ? <Button label="Retry" variant="text" onPress={onRetry} disabled={busy} /> : null}
          <Button label={speaking ? 'Stop reading' : 'Read aloud'} variant="text" onPress={() => (speaking ? stopMessageSpeech() : speakMessage(m))} />
        </View>
      ) : null}
    </FadeIn>
  );
});

const useStyles = makeStyles(({ colors, space }) => ({
  userRow: { alignItems: 'flex-end', marginTop: space.lg },
  userBlock: { maxWidth: '86%', backgroundColor: colors.surfaceAlt, borderRightWidth: 2, borderRightColor: colors.accent, paddingVertical: space.md, paddingHorizontal: space.lg, gap: space.sm },
  ai: { marginTop: space.lg, gap: space.sm },
  aiBody: { gap: space.sm },
  live: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 24 },
  reasoning: { gap: space.xs },
  reasonHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48 },
  reasonBody: { borderLeftWidth: 2, borderLeftColor: colors.border, paddingLeft: space.md },
  attachments: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  thumb: { width: 120, height: 120, backgroundColor: colors.surface },
  fileChip: { flexDirection: 'row', alignItems: 'center', gap: space.xs, maxWidth: 240 },
  shrink: { flexShrink: 1 },
  actions: { flexDirection: 'row', gap: space.xs, flexWrap: 'wrap', marginLeft: -space.md },
  actionsPlain: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
}));
