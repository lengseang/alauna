import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { File } from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getModel } from '../core/catalog.ts';
import { makeAttachment, type Attachment, type ChatMessage } from '../core/chatTypes.ts';
import { AlertIcon, AttachmentIcon, CrossIcon, DocumentIcon, IncognitoIcon, MenuIcon, PlusIcon, SendIcon, SlidersIcon, SoulIcon, StopIcon, ThinkIcon } from '../components/Icons';
import { newChat, openThread, regenerate, removeThread, sendMessage, showNotice, stopGeneration, updateThreadSoul, useChatState } from '../services/chat.ts';
import { useDownloadItems } from '../services/downloads.ts';
import { engine, useEngineState } from '../services/engine.ts';
import { updateSettings, useSettings } from '../services/settings.ts';
import { Btn } from './Btn';
import { Banner, Card } from './kit';
import { MessageView } from './MessageView';
import { push } from './nav';
import { confirm } from './confirm';
import { ThreadDrawer } from './ThreadDrawer';
import { ThreadSoulSheet } from './ThreadSoulSheet';
import { colors, font, radius } from './theme';

const SUGGESTIONS = ['Explain how a rainbow forms, simply.', 'Write a short poem about monsoon rain.', 'Give me a 3-day plan for visiting Siem Reap.', 'What are 5 tips for learning to code faster?'];
const MAX_ATTACHMENTS = 3;

export function ChatScreen() {
  const insets = useSafeAreaInsets();
  const chat = useChatState();
  const eng = useEngineState();
  const settings = useSettings();
  const dlItems = useDownloadItems();
  const spec = getModel(settings.activeModelId);

  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [drawer, setDrawer] = useState(false);
  const [soulOpen, setSoulOpen] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const stick = useRef(true);

  const thread = chat.thread;
  const messages = thread.messages;
  const specInstalled = !!spec && dlItems[spec.id]?.status === 'completed';
  const anyInstalled = Object.values(dlItems).some((d) => d.status === 'completed');
  const lastMsg = messages[messages.length - 1];
  const loadingModel = chat.sending && lastMsg?.phase === 'loading';

  // ---- model chip -------------------------------------------------------------------------
  const chip = useMemo(() => {
    if (eng.status === 'mounting' && eng.modelId) return { color: colors.warn, text: `Loading ${getModel(eng.modelId)?.name ?? 'model'}...` };
    if ((eng.status === 'ready' || eng.status === 'generating') && eng.modelId && eng.modelId === spec?.id) return { color: colors.good, text: spec.name };
    if (spec && specInstalled) return { color: colors.faint, text: `${spec.name} · loads on first message` };
    if (spec) return { color: colors.bad, text: `${spec.name} · not downloaded` };
    return { color: colors.bad, text: 'No model yet' };
  }, [eng.status, eng.modelId, spec, specInstalled]);

  // ---- actions ----------------------------------------------------------------------------
  const onSend = async () => {
    const text = input;
    const atts = attachments;
    if (!text.trim() && atts.length === 0) return;
    stick.current = true;
    setInput('');
    setAttachments([]);
    let r: Awaited<ReturnType<typeof sendMessage>>;
    try {
      r = await sendMessage(text, atts);
    } catch (e) {
      setInput(text);
      setAttachments(atts);
      showNotice(`Could not send: ${e instanceof Error ? e.message : 'unknown error'}`);
      return;
    }
    if (r.ok) return;
    if (r.reason === 'busy' || r.reason === 'empty') {
      setInput(text);
      setAttachments(atts);
      return;
    }
    if (r.reason === 'no_model' || r.reason === 'not_installed' || r.reason === 'no_storage') {
      setInput(text); // nothing was sent: keep the user's words
      setAttachments(atts);
      Alert.alert('Set up a model first', r.message, [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open Model Hub', onPress: () => push('models') },
      ]);
    }
  };

  const onPickFile = async () => {
    if (attachments.length >= MAX_ATTACHMENTS) {
      showNotice(`You can attach up to ${MAX_ATTACHMENTS} files.`);
      return;
    }
    try {
      const picked = await File.pickFileAsync({ multipleFiles: false });
      if (picked.canceled || !picked.result) return;
      const file = picked.result;
      if ((file.size ?? 0) > 1_000_000) {
        showNotice('That file is too large (limit 1 MB of text).');
        return;
      }
      const text = await file.text();
      if (text.includes('\u0000')) {
        showNotice('Only text files can be attached (not images, PDFs or other binary files).');
        return;
      }
      setAttachments((a) => [...a, makeAttachment(file.name, text)]);
    } catch {
      showNotice('Could not read that file.');
    }
  };

  const retry = useCallback(() => regenerate(), []);
  const openModels = useCallback(() => push('models'), []);
  const onCopied = useCallback((t: string) => showNotice(t), []);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    stick.current = contentSize.height - (contentOffset.y + layoutMeasurement.height) < 120;
  };

  const askDelete = async (id: string, title: string) => {
    const ok = await confirm('Delete this chat?', `"${title}" will be removed from your storage folder.`, 'Delete', true);
    if (ok) await removeThread(id);
  };

  const thinkingChip =
    spec?.thinking === 'toggle' ? (
      <Pressable accessibilityRole="switch" accessibilityState={{ checked: settings.thinkingEnabled }} onPress={() => updateSettings({ thinkingEnabled: !settings.thinkingEnabled })} style={[styles.pill, settings.thinkingEnabled && { backgroundColor: colors.accentSoft, borderColor: colors.accent }]}>
        <ThinkIcon size={13} color={settings.thinkingEnabled ? colors.accent : colors.muted} />
        <Text style={[styles.pillText, settings.thinkingEnabled && { color: colors.accent }]}>Thinking {settings.thinkingEnabled ? 'on' : 'off'}</Text>
      </Pressable>
    ) : spec?.thinking === 'always' ? (
      <View style={styles.pill}>
        <ThinkIcon size={13} color={colors.muted} />
        <Text style={styles.pillText}>This model always thinks first</Text>
      </View>
    ) : null;

  // ---- empty states -----------------------------------------------------------------------
  const emptyState = !specInstalled ? (
    <Card style={{ marginTop: 24 }}>
      <Text style={styles.emptyTitle}>{anyInstalled ? 'Choose a model' : 'Get your first model'}</Text>
      <Text style={styles.emptyBody}>CHIWIWI answers using an AI model that lives on your phone. Download one once, then everything works offline.</Text>
      <View style={{ gap: 6 }}>
        <Text style={styles.step}>✓  Storage location set</Text>
        <Text style={[styles.step, { color: colors.warn }]}>2  {anyInstalled ? 'Load a downloaded model' : 'Download a model'}</Text>
        <Text style={[styles.step, { color: colors.faint }]}>3  Start chatting</Text>
      </View>
      <Btn variant="primary" label="Open Model Hub" onPress={() => push('models')} />
    </Card>
  ) : (
    <View style={{ marginTop: 28, gap: 10 }}>
      <Text style={styles.emptyTitle}>How can I help?</Text>
      <Text style={styles.emptyBody}>Everything stays on this phone. Tip: type /remember followed by a fact and I will keep it in mind.</Text>
      {SUGGESTIONS.map((s) => (
        <Pressable key={s} accessibilityRole="button" onPress={() => setInput(s)} style={styles.suggestion}>
          <Text style={styles.suggestionText}>{s}</Text>
        </Pressable>
      ))}
    </View>
  );

  const canSend = (input.trim().length > 0 || attachments.length > 0) && !chat.sending;

  return (
    <KeyboardAvoidingView style={[styles.root, { paddingTop: insets.top }]} behavior="padding">
      {/* top bar */}
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Open menu" hitSlop={8} onPress={() => setDrawer(true)} style={styles.iconBtn}>
          <MenuIcon size={19} color={colors.text} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Open Model Hub" onPress={() => push('models')} style={styles.chip}>
          <View style={[styles.dot, { backgroundColor: chip.color }]} />
          <Text style={styles.chipText} numberOfLines={1}>{chip.text}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="New chat" hitSlop={8} onPress={() => newChat(false)} style={styles.iconBtn}>
          <PlusIcon size={18} color={colors.text} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Personality for this chat" hitSlop={8} onPress={() => setSoulOpen(true)} style={styles.iconBtn}>
          <SoulIcon size={18} color={colors.muted} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Settings" hitSlop={8} onPress={() => push('settings')} style={styles.iconBtn}>
          <SlidersIcon size={18} color={colors.muted} />
        </Pressable>
      </View>

      {thread.incognito ? (
        <View style={styles.incognito}>
          <IncognitoIcon size={13} />
          <Text style={styles.incognitoText}>Incognito chat - this conversation is not saved.</Text>
        </View>
      ) : null}

      {eng.crashedModelId ? (
        <View style={{ padding: 12, paddingBottom: 0 }}>
          <Banner
            tone="bad"
            action={
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Btn small variant="secondary" label="Open Model Hub" onPress={() => push('models')} />
                <Btn small variant="ghost" label="Dismiss" onPress={() => engine.dismissCrashNotice()} />
              </View>
            }
          >
            CHIWIWI closed while loading {getModel(eng.crashedModelId)?.name ?? 'a model'} last time, most likely because the phone ran out of memory. Try a smaller model.
          </Banner>
        </View>
      ) : null}

      {chat.saveError ? (
        <View style={{ padding: 12, paddingBottom: 0 }}>
          <Banner tone="warn">{chat.saveError}</Banner>
        </View>
      ) : null}

      {/* conversation */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={({ item, index }) => (
          <MessageView message={item} isLast={index === messages.length - 1} loadProgress={eng.loadProgress} busy={chat.sending} onRetry={retry} onOpenModels={openModels} onCopied={onCopied} />
        )}
        ListEmptyComponent={emptyState}
        contentContainerStyle={styles.list}
        onScroll={onScroll}
        scrollEventThrottle={64}
        onContentSizeChange={() => {
          if (stick.current) listRef.current?.scrollToEnd({ animated: false });
        }}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews={false}
      />

      {/* composer */}
      <View style={[styles.composerWrap, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        {thinkingChip ? <View style={styles.pillRow}>{thinkingChip}</View> : null}
        {attachments.length > 0 ? (
          <View style={styles.attachRow}>
            {attachments.map((a) => (
              <View key={a.name} style={styles.attachChip}>
                <DocumentIcon size={13} color={colors.accent} />
                <Text style={styles.attachName} numberOfLines={1}>{a.name}{a.truncated ? ' (shortened)' : ''}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${a.name}`} hitSlop={8} onPress={() => setAttachments((all) => all.filter((x) => x !== a))}>
                  <CrossIcon size={12} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
        <View style={styles.composer}>
          <Pressable accessibilityRole="button" accessibilityLabel="Attach a text file" hitSlop={8} onPress={onPickFile} style={styles.iconBtn}>
            <AttachmentIcon size={19} color={colors.muted} />
          </Pressable>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={spec ? 'Message CHIWIWI...' : 'Download a model to start chatting'}
            placeholderTextColor={colors.faint}
            multiline
            style={styles.input}
            editable={!chat.sending}
            accessibilityLabel="Message"
          />
          {chat.sending ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Stop" disabled={loadingModel} onPress={() => void stopGeneration()} style={[styles.send, { backgroundColor: colors.white }, loadingModel && { opacity: 0.4 }]}>
              <StopIcon size={15} color={colors.black} />
            </Pressable>
          ) : (
            <Pressable accessibilityRole="button" accessibilityLabel="Send" disabled={!canSend} onPress={() => void onSend()} style={[styles.send, { backgroundColor: canSend ? colors.white : colors.surface3 }]}>
              <SendIcon size={18} color={canSend ? colors.black : colors.faint} />
            </Pressable>
          )}
        </View>
        {loadingModel ? (
          <View style={styles.hint}>
            <AlertIcon size={12} color={colors.faint} />
            <Text style={styles.hintText}>Loading the model takes a few seconds the first time.</Text>
          </View>
        ) : null}
      </View>

      <ThreadDrawer
        visible={drawer}
        threads={chat.threads}
        currentId={thread.id}
        onClose={() => setDrawer(false)}
        onOpen={async (id) => {
          if (await openThread(id)) setDrawer(false);
        }}
        onDelete={askDelete}
        onNew={(incognito) => {
          if (newChat(incognito)) setDrawer(false);
        }}
        onModels={() => {
          setDrawer(false);
          push('models');
        }}
        onSettings={() => {
          setDrawer(false);
          push('settings');
        }}
      />
      <ThreadSoulSheet visible={soulOpen} soul={thread.soul} onClose={() => setSoulOpen(false)} onSave={updateThreadSoul} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, minHeight: 54, borderBottomWidth: 1, borderBottomColor: colors.border },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  chip: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingVertical: 8, paddingHorizontal: 12, marginHorizontal: 4 },
  chipText: { color: colors.text, fontSize: font.sm, fontWeight: '600', flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  incognito: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 16, backgroundColor: colors.surface },
  incognitoText: { color: colors.muted, fontSize: font.xs },
  list: { paddingHorizontal: 16, paddingBottom: 12, flexGrow: 1 },
  emptyTitle: { color: colors.text, fontSize: font.xl, fontWeight: '700' },
  emptyBody: { color: colors.muted, fontSize: font.md, lineHeight: 21 },
  step: { color: colors.text, fontSize: font.md },
  suggestion: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: 12, paddingHorizontal: 14 },
  suggestionText: { color: colors.text, fontSize: font.md },
  composerWrap: { paddingHorizontal: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg, gap: 8 },
  pillRow: { flexDirection: 'row' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, paddingVertical: 5, paddingHorizontal: 10 },
  pillText: { color: colors.muted, fontSize: font.xs, fontWeight: '600' },
  attachRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  attachChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accentSoft, borderRadius: radius.sm, paddingVertical: 4, paddingHorizontal: 8, maxWidth: '100%' },
  attachName: { color: colors.accent, fontSize: font.sm, maxWidth: 200 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: colors.border, paddingLeft: 4, paddingRight: 6, paddingVertical: 4 },
  input: { flex: 1, color: colors.text, fontSize: 15, maxHeight: 140, minHeight: 40, paddingTop: 10, paddingBottom: 10, paddingHorizontal: 6 },
  send: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginBottom: 1 },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 6 },
  hintText: { color: colors.faint, fontSize: font.xs },
});
