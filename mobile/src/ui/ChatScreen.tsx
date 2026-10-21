import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { getModel } from '../core/catalog.ts';
import type { ChatMessage } from '../core/chatTypes.ts';
import * as Clipboard from 'expo-clipboard';
import { chatStore, continueGeneration, deleteMessage, newChat, regenerate, restoreMessages, showNotice, truncateFrom, useChatState } from '../services/chat.ts';
import { downloads } from '../services/downloads.ts';
import { engine } from '../services/engine.ts';
import { useSettings } from '../services/settings.ts';
import { makeStyles } from '../theme';
import { ChatTopBar } from './ChatTopBar';
import { Composer, setComposerDraft } from './Composer';
import { DrawerLayout } from './Drawer';
import { EmptyChat } from './EmptyChat';
import { isSpeakingMessage, MessageRow, speakMessage, stopMessageSpeech } from './MessageRow';
import { ModelSheet } from './ModelSheet';
import { Notice } from './Notice';
import { Button } from './Button';
import { push } from './nav';
import { ListRow } from './Row';
import { Sheet } from './Sheet';
import { showUndo } from './undo';
import { VoiceOverlay } from './VoiceOverlay';
import { Text } from './Text';
import { ThreadDrawer } from './ThreadDrawer';

const FAR_FROM_BOTTOM = 320;
const completed = (id: string | null | undefined) => !!id && downloads.store.getState().items[id]?.status === 'completed';
const anyCompleted = () => Object.values(downloads.store.getState().items).some((d) => d.status === 'completed');
let autoLoadTried = false;

/**
 * Chat is home. Newest message sits at the bottom of an inverted, virtualised list; rows are memoised and only the
 * streaming row re-renders per token (the chat service coalesces updates to ~15/s). Auto-follow while you are
 * near the bottom, hold your place when you scroll up, "Latest" jumps back.
 */
export function ChatScreen() {
  const s = useStyles();
  const chat = useChatState();
  const settings = useSettings();
  const spec = getModel(settings.activeModelId);
  const specInstalled = useSyncExternalStore(downloads.store.subscribe, () => completed(spec?.id));
  const anyInstalled = useSyncExternalStore(downloads.store.subscribe, anyCompleted);
  const engineState = useSyncExternalStore(engine.store.subscribe, () => engine.store.getState().status);
  const crashedId = useSyncExternalStore(engine.store.subscribe, () => engine.store.getState().crashedModelId);
  const [drawer, setDrawer] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [far, setFar] = useState(false);
  const [voice, setVoice] = useState(false);
  const [acts, setActs] = useState<ChatMessage | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const farRef = useRef(false);

  // Proof of life: load the chosen model as soon as it is known to be installed, once per launch,
  // unless the previous run died while loading it (then the crash notice below asks first).
  useEffect(() => {
    if (autoLoadTried || !spec || !specInstalled || engineState !== 'unmounted' || crashedId) return;
    autoLoadTried = true;
    void engine.mount(spec);
  }, [spec, specInstalled, engineState, crashedId]);

  const messages = chat.thread.messages;
  const data = useMemo(() => [...messages].reverse(), [messages]);
  const retry = useCallback(() => regenerate(), []);
  const doContinue = useCallback(() => continueGeneration(), []);
  const sending = chat.sending;
  const renderItem = useCallback(
    ({ item, index }: { item: ChatMessage; index: number }) => (
      <MessageRow message={item} isLast={index === 0} busy={index === 0 && sending} onRetry={retry} onContinue={doContinue} onActions={setActs} />
    ),
    [sending, retry, doContinue],
  );

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const isFar = e.nativeEvent.contentOffset.y > FAR_FROM_BOTTOM;
    if (isFar !== farRef.current) {
      farRef.current = isFar;
      setFar(isFar);
    }
  };

  const openDrawer = useCallback(() => setDrawer(true), []);
  const closeDrawer = useCallback(() => setDrawer(false), []);
  const openSheet = useCallback(() => setSheet(true), []);
  const closeSheet = useCallback(() => setSheet(false), []);
  const onNew = useCallback(() => void newChat(false), []);
  const onSoul = useCallback(() => push('threadSoul'), []);
  const onSettings = useCallback(() => push('settings'), []);
  const openVoice = useCallback(() => setVoice(true), []);
  const closeVoice = useCallback(() => setVoice(false), []);

  const doAction = async (kind: 'copy' | 'regen' | 'edit' | 'speak' | 'delete' | 'continue') => {
    const m = acts;
    setActs(null);
    if (!m) return;
    const th = chatStore.getState().thread;
    const all = th.messages;
    if (kind === 'copy') {
      await Clipboard.setStringAsync(m.text);
      showNotice('Copied');
      return;
    }
    if (kind === 'speak') {
      if (isSpeakingMessage(m.id)) await stopMessageSpeech();
      else await speakMessage(m);
      return;
    }
    if (chatStore.getState().sending) {
      showNotice('Wait for the reply to finish (or press Stop) first.');
      return;
    }
    if (kind === 'continue') {
      void doContinue();
    } else if (kind === 'regen') {
      void regenerate();
    } else if (kind === 'edit') {
      const removed = await truncateFrom(th.id, m.id);
      setComposerDraft(m.text, m.attachments ?? []);
      if (removed.length > 1) showUndo('Removed this and later messages', () => void restoreMessages(th.id, all));
    } else {
      await deleteMessage(th.id, m.id);
      showUndo('Message deleted', () => void restoreMessages(th.id, all));
    }
  };

  const crashNotice = crashedId ? (
    <View style={s.banner}>
      <Notice
        tone="danger"
        action={
          <View style={s.bannerActions}>
            <Button label="Choose a smaller model" variant="quiet" onPress={() => push('models')} />
            <Button label="Dismiss" variant="text" onPress={() => engine.dismissCrashNotice()} />
          </View>
        }
      >
        {`CHIWIWI closed while loading ${getModel(crashedId)?.name ?? 'a model'} last time, most likely because the phone ran out of memory.`}
      </Notice>
    </View>
  ) : null;

  return (
    <DrawerLayout open={drawer} onOpenChange={setDrawer} drawer={<ThreadDrawer onClose={closeDrawer} />}>
      <View style={s.root}>
        <ChatTopBar onMenu={openDrawer} onModel={openSheet} onNewChat={onNew} onSoul={onSoul} onVoice={openVoice} onSettings={onSettings} soulOverride={chat.thread.soulOverride} incognito={chat.thread.incognito} />
        {crashNotice}
        {chat.saveError ? (
          <View style={s.banner}>
            <Notice tone="danger">{chat.saveError}</Notice>
          </View>
        ) : null}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={s.fill}
        >
          {messages.length === 0 ? (
            <EmptyChat hasModel={anyInstalled} loading={engineState === 'mounting'} incognito={chat.thread.incognito} />
          ) : (
            <View style={s.fill}>
              <FlatList
                ref={listRef}
                data={data}
                inverted
                keyExtractor={(m) => m.id}
                renderItem={renderItem}
                contentContainerStyle={s.list}
                onScroll={onScroll}
                scrollEventThrottle={100}
                maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 80 }}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                initialNumToRender={8}
                windowSize={9}
                maxToRenderPerBatch={6}
                removeClippedSubviews={false}
              />
              {far ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Jump to latest message" onPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })} style={s.latest}>
                  <Text variant="label" tone="accent">
                    Latest
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )}
          <Composer placeholder={anyInstalled ? 'Message Alauna' : 'Get a model to start chatting'} onVoice={openVoice} />
        </KeyboardAvoidingView>
        <ModelSheet visible={sheet} onClose={closeSheet} />
        <VoiceOverlay visible={voice} onClose={closeVoice} />
        <Sheet visible={!!acts} onClose={() => setActs(null)} title="Message">
          <ListRow icon="file" title="Copy" onPress={() => void doAction('copy')} />
          {acts?.role === 'assistant' && acts.text ? <ListRow icon="speaker" title={isSpeakingMessage(acts.id) ? 'Stop reading' : 'Read aloud'} onPress={() => void doAction('speak')} /> : null}
          {acts?.role === 'assistant' && acts.id === messages[messages.length - 1]?.id && acts.canContinue ? (
            <ListRow icon="play" title="Continue generation" onPress={() => void doAction('continue')} />
          ) : null}
          {acts?.role === 'assistant' && acts.id === messages[messages.length - 1]?.id ? <ListRow icon="bolt" title="Regenerate" onPress={() => void doAction('regen')} /> : null}
          {acts?.role === 'user' ? <ListRow icon="edit" title="Edit and resend" onPress={() => void doAction('edit')} /> : null}
          <ListRow icon="trash" title="Delete message" destructive onPress={() => void doAction('delete')} />
        </Sheet>
      </View>
    </DrawerLayout>
  );
}

const useStyles = makeStyles(({ colors, space }) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  fill: { flex: 1 },
  list: { paddingHorizontal: space.lg, paddingVertical: space.md },
  banner: { paddingHorizontal: space.lg, paddingBottom: space.sm },
  bannerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  latest: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: space.md,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
}));
