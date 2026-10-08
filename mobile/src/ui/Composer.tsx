import React, { useRef, useState, useSyncExternalStore } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { File } from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { makeAttachment, type Attachment } from '../core/chatTypes.ts';
import { chatStore, sendMessage, showNotice, stopGeneration } from '../services/chat.ts';
import { makeStyles, useTheme } from '../theme';
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
  if (r.reason === 'no_model' || r.reason === 'not_installed' || r.reason === 'no_storage') {
    showNotice(r.message);
    push('models');
  }
  return false;
}

/**
 * The one pill at the bottom: attach, multiline field (grows to 6 lines), Send that becomes Stop.
 * Owns its own text state, so typing never re-renders the message list.
 */
export const Composer = React.memo(function Composer({ placeholder }: { placeholder: string }) {
  const { colors, type } = useTheme();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardVisible();
  const s = useStyles();
  const sending = useSyncExternalStore(chatStore.subscribe, selectSending);
  const loadingModel = useSyncExternalStore(chatStore.subscribe, selectLoading);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [focused, setFocused] = useState(false);
  // Two quick taps on Send read the same `input` before React re-renders; a ref lock swallows the second one.
  const lock = useRef(false);

  const send = async () => {
    if (lock.current) return;
    lock.current = true;
    try {
      const text = input;
      const atts = attachments;
      if (!text.trim() && atts.length === 0) return;
      setInput('');
      setAttachments([]);
      if (!(await submitMessage(text, atts))) {
        setInput(text); // nothing was sent: keep the user's words
        setAttachments(atts);
      }
    } finally {
      lock.current = false;
    }
  };

  const attach = async () => {
    if (attachments.length >= MAX_ATTACHMENTS) return showNotice(`You can attach up to ${MAX_ATTACHMENTS} files.`);
    try {
      const picked = await File.pickFileAsync({ multipleFiles: false });
      if (picked.canceled || !picked.result) return;
      const file = picked.result;
      if ((file.size ?? 0) > 1_000_000) return showNotice('That file is too large (limit 1 MB of text).');
      const text = await file.text();
      if (text.includes('\u0000')) return showNotice('Only text files can be attached (not images, PDFs or other binary files).');
      setAttachments((a) => [...a, makeAttachment(file.name, text)]);
    } catch {
      showNotice('Could not read that file.');
    }
  };

  const canSend = input.trim().length > 0 || attachments.length > 0;
  return (
    <View style={[s.wrap, { paddingBottom: keyboard ? 8 : Math.max(insets.bottom, 8) }]}>
      {attachments.map((a) => (
        <Pressable key={a.name} accessibilityRole="button" accessibilityLabel={`Remove ${a.name}`} onPress={() => setAttachments((all) => all.filter((x) => x !== a))} style={s.chip}>
          <Text variant="small" numberOfLines={1} style={s.chipName} tone="text">
            {a.name}
            {a.truncated ? ' (shortened)' : ''}
          </Text>
          <Text variant="label" tone="accent">
            Remove
          </Text>
        </Pressable>
      ))}
      <View style={[s.pill, focused && s.pillFocus]}>
        <IconButton icon="plus" label="Attach a text file" onPress={attach} />
        <TextInput
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
        ) : (
          <IconButton icon="send" label="Send" tone="filled" disabled={!canSend} onPress={send} />
        )}
      </View>
    </View>
  );
});

const useStyles = makeStyles(({ colors, space, radius }) => ({
  wrap: { paddingHorizontal: space.md, paddingTop: space.sm, gap: space.xs, backgroundColor: colors.bg },
  pill: { flexDirection: 'row', alignItems: 'flex-end', gap: space.xs, backgroundColor: colors.surface, borderRadius: 28, borderWidth: 1, borderColor: colors.borderStrong, padding: space.xs },
  pillFocus: { borderColor: colors.accent },
  input: { flex: 1, maxHeight: 144, minHeight: 48, paddingTop: 12, paddingBottom: 12, paddingHorizontal: space.xs, textAlignVertical: 'top' },
  chip: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
  },
  chipName: { flex: 1 },
}));
