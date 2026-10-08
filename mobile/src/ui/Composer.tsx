import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Image, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Attachment } from '../core/chatTypes.ts';
import { createStore } from '../core/store.ts';
import { discardAttachment, toChatAttachment, type PickedAttachment } from '../services/attachments.ts';
import { chatStore, sendMessage, showNotice, stopGeneration } from '../services/chat.ts';
import { makeStyles, useTheme } from '../theme';
import { AttachSheet } from './AttachSheet';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { push } from './nav';
import { Text } from './Text';
import { useKeyboardVisible } from './useKeyboard';

const MAX_ATTACHMENTS = 3;
const selectSending = () => chatStore.getState().sending;
const selectLoading = () => {
  const s = chatStore.getState();
  const last = s.thread.messages[s.thread.messages.length - 1];
  return s.sending && last?.phase === 'loading';
};

/** One attachment waiting in the composer. `picked` = fresh from the picker (its copied image is ours to delete). */
interface Item {
  att: Attachment;
  picked?: PickedAttachment;
}
const fromPicked = (p: PickedAttachment): Item => ({ att: toChatAttachment(p), picked: p });
const imageUri = (a: Attachment) => (a.path ? `file://${a.path}` : undefined);

// Edit & resend puts a message back into the composer from outside (ChatScreen's message actions).
const draftStore = createStore<{ seq: number; text: string; atts: Attachment[] }>({ seq: 0, text: '', atts: [] });
export function setComposerDraft(text: string, atts: Attachment[] = []): void {
  draftStore.setState((s) => ({ seq: s.seq + 1, text, atts }));
}

/**
 * Send through the chat service and handle every refusal in plain words. Returns true when the message was accepted
 * (the caller clears its field), false when nothing was sent (the caller puts the words back).
 */
export async function submitMessage(text: string, atts: Attachment[] = []): Promise<boolean> {
  let r: Awaited<ReturnType<typeof sendMessage>>;
  try {
    r = await sendMessage(text, atts);
  } catch (e) {
    showNotice(`Could not send: ${e instanceof Error ? e.message : 'unknown error'}`);
    return false;
  }
  if (r.ok) return true;
  if (r.reason !== 'empty') showNotice(r.message);
  if (r.reason === 'no_model' || r.reason === 'not_installed' || r.reason === 'no_storage') push('models');
  return false;
}

/**
 * The flat bar at the bottom: attach (camera / photos / files), multiline field (grows to 6 lines), and one action key
 * that is Voice when empty, Send when there is something to send, Stop while answering.
 * Owns its own text state, so typing never re-renders the message list.
 */
export const Composer = React.memo(function Composer({ placeholder, onVoice }: { placeholder: string; onVoice: () => void }) {
  const { colors, type } = useTheme();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardVisible();
  const s = useStyles();
  const sending = useSyncExternalStore(chatStore.subscribe, selectSending);
  const loadingModel = useSyncExternalStore(chatStore.subscribe, selectLoading);
  const draft = useSyncExternalStore(draftStore.subscribe, draftStore.getState);
  const [input, setInput] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [focused, setFocused] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const inputRef = useRef<TextInput>(null);
  // Two quick taps on Send read the same `input` before React re-renders; a ref lock swallows the second one.
  const lock = useRef(false);

  useEffect(() => {
    if (!draft.seq) return;
    setInput(draft.text);
    setItems(draft.atts.map((att) => ({ att })));
    inputRef.current?.focus();
  }, [draft]);

  const send = async () => {
    if (lock.current) return;
    lock.current = true;
    try {
      const text = input;
      const pending = items;
      if (!text.trim() && pending.length === 0) return;
      setInput('');
      setItems([]);
      if (!(await submitMessage(text, pending.map((i) => i.att)))) {
        setInput(text); // nothing was sent: keep the user's words and files
        setItems(pending);
      }
    } finally {
      lock.current = false;
    }
  };

  const remove = (item: Item) => {
    if (item.picked) discardAttachment(item.picked);
    setItems((all) => all.filter((x) => x !== item));
  };

  const canSend = input.trim().length > 0 || items.length > 0;
  return (
    <View style={[s.wrap, { paddingBottom: keyboard ? 8 : Math.max(insets.bottom, 8) }]}>
      {items.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tiles} keyboardShouldPersistTaps="handled">
          {items.map((item, i) => {
            const uri = item.att.kind === 'image' ? (item.picked?.kind === 'image' ? item.picked.uri : imageUri(item.att)) : undefined;
            return (
              <Pressable
                key={`${item.att.name}#${i}`}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${item.att.name}`}
                onPress={() => remove(item)}
                style={({ pressed }) => [uri ? s.imageTile : s.fileTile, pressed && s.pressed]}
              >
                {uri ? (
                  <Image source={{ uri }} style={s.thumb} />
                ) : (
                  <View style={s.fileBody}>
                    <Icon name="file" size={20} />
                    <Text variant="small" tone="text" numberOfLines={2} style={s.fileName}>
                      {item.att.name}
                      {item.att.truncated ? ' (shortened)' : ''}
                    </Text>
                  </View>
                )}
                <View style={s.badge}>
                  <Icon name="close" size={14} />
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      <View style={[s.bar, focused && s.barFocus]}>
        <IconButton icon="plus" label="Attach a photo or file" onPress={() => setAttachOpen(true)} />
        <TextInput
          ref={inputRef}
          value={input}
          onChangeText={setInput}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          selectionColor={colors.accent}
          multiline
          maxFontSizeMultiplier={1.6}
          accessibilityLabel="Message"
          style={[s.input, type.body, { color: colors.text }]}
        />
        {sending ? (
          <IconButton icon="stop" label="Stop generating" tone="filled" disabled={loadingModel} onPress={() => stopGeneration()} />
        ) : canSend ? (
          <IconButton icon="send" label="Send" tone="filled" onPress={send} />
        ) : (
          <IconButton icon="mic" label="Voice mode" onPress={onVoice} />
        )}
      </View>
      <AttachSheet visible={attachOpen} onClose={() => setAttachOpen(false)} room={MAX_ATTACHMENTS - items.length} onPicked={(picked) => setItems((all) => [...all, ...picked.map(fromPicked)].slice(0, MAX_ATTACHMENTS))} />
    </View>
  );
});

const TILE = 64;
const useStyles = makeStyles(({ colors, space, line }) => ({
  wrap: { paddingHorizontal: space.md, paddingTop: space.sm, gap: space.sm, backgroundColor: colors.bg },
  bar: { flexDirection: 'row', alignItems: 'flex-end', gap: space.xs, backgroundColor: colors.surface, borderWidth: line, borderColor: colors.borderStrong, padding: space.xs },
  barFocus: { borderColor: colors.accent },
  input: { flex: 1, maxHeight: 144, minHeight: 48, paddingTop: 12, paddingBottom: 12, paddingHorizontal: space.xs, textAlignVertical: 'top' },
  tiles: { gap: space.sm, paddingRight: space.lg },
  imageTile: { width: TILE, height: TILE, borderWidth: line, borderColor: colors.border },
  fileTile: { height: TILE, width: 168, borderWidth: line, borderColor: colors.border, backgroundColor: colors.surface },
  thumb: { width: '100%', height: '100%' },
  fileBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingLeft: space.sm, paddingRight: space.xl },
  fileName: { flex: 1 },
  badge: { position: 'absolute', top: 0, right: 0, width: 20, height: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  pressed: { opacity: 0.7 },
}));
