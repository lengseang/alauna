import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  Image,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  TextInput,
  TextInputChangeEventData,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Attachment } from '../core/chatTypes.ts';
import { createStore } from '../core/store.ts';
import { discardAttachment, toChatAttachment, type PickedAttachment } from '../services/attachments.ts';
import { chatStore, sendMessage, showNotice, stopGeneration } from '../services/chat.ts';
import { updateSection, useSettings } from '../services/settings.ts';
import { showToast } from '../services/toast.ts';
import { makeStyles, useTheme } from '../theme';
import { AttachSheet } from './AttachSheet';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { push } from './nav';
import { Text } from './Text';
import { useKeyboardVisible } from './useKeyboard';

const MAX_ATTACHMENTS = 3;
const selectSending = () => chatStore.getState().sending;

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
 * Sovereign Greek Liquid Glass Composer:
 * Translucent frosted glass bar, zero heavy frame, fluid attachments,
 * live 'Think' (speculative reasoning) toggle, voice launcher, and synchronous text
 * capture to eliminate fast-typing cut-off race conditions.
 */
export const Composer = React.memo(function Composer({ placeholder, onVoice }: { placeholder: string; onVoice: () => void }) {
  const { colors, type, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardVisible();
  const s = useStyles();
  const settings = useSettings();
  const sending = useSyncExternalStore(chatStore.subscribe, selectSending);
  const draft = useSyncExternalStore(draftStore.subscribe, draftStore.getState);

  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const textRef = useRef('');
  const [items, setItems] = useState<Item[]>([]);
  const [focused, setFocused] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const lock = useRef(false);

  const speculativeEnabled = settings.speculative.enabled;

  useEffect(() => {
    if (!draft.seq) return;
    textRef.current = draft.text;
    setInput(draft.text);
    setItems(draft.atts.map((att) => ({ att })));
    inputRef.current?.focus();
  }, [draft]);

  const handleTextChange = useCallback((text: string) => {
    textRef.current = text;
    setInput(text);
  }, []);

  const handleNativeChange = useCallback((e: NativeSyntheticEvent<TextInputChangeEventData>) => {
    textRef.current = e.nativeEvent.text;
  }, []);

  const toggleThink = useCallback(() => {
    const next = !speculativeEnabled;
    updateSection('speculative', { enabled: next });
    showToast(next ? 'Deep Think: Enabled (Speculative Draft)' : 'Deep Think: Disabled');
  }, [speculativeEnabled]);

  const send = useCallback(() => {
    if (lock.current || submitting) return;
    const text = (textRef.current || input).trim();
    const pending = items;
    if (!text && pending.length === 0) return;

    lock.current = true;
    setSubmitting(true);

    textRef.current = '';
    inputRef.current?.clear();
    setInput('');
    setItems([]);

    // Run in background so send() returns immediately, freeing useGuardedAction
    // and allowing the Stop button to be tapped anytime without blocking!
    void submitMessage(text, pending.map((i) => i.att))
      .then((ok) => {
        if (!ok) {
          textRef.current = text;
          setInput(text);
          setItems(pending);
        }
      })
      .finally(() => {
        lock.current = false;
        setSubmitting(false);
      });
  }, [input, items, submitting]);

  const remove = (item: Item) => {
    if (item.picked) discardAttachment(item.picked);
    setItems((all) => all.filter((x) => x !== item));
  };

  const canSend = input.trim().length > 0 || items.length > 0;

  return (
    <View style={[s.wrap, { paddingBottom: keyboard ? 6 : Math.max(insets.bottom, 8) }]}>
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

      {/* Greek Liquid Glass Bar Container */}
      <View style={[s.bar, focused && s.barFocus]}>
        <IconButton
          icon="plus"
          label="Attach a photo or file"
          color={colors.muted}
          onPress={() => setAttachOpen(true)}
          style={s.attachBtn}
        />
        <TextInput
          ref={inputRef}
          value={input}
          onChangeText={handleTextChange}
          onChange={handleNativeChange}
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
        <View style={s.actionsRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Deep Think mode ${speculativeEnabled ? 'active' : 'inactive'}`}
            onPress={toggleThink}
            unstable_pressDelay={0}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            style={({ pressed }) => [
              s.thinkPill,
              speculativeEnabled && s.thinkPillActive,
              pressed && s.pressed,
            ]}
          >
            <Icon
              name="brain"
              size={15}
              color={speculativeEnabled ? colors.accent : colors.muted}
            />
            <Text
              variant="small"
              style={[
                s.thinkLabel,
                { color: speculativeEnabled ? colors.accent : colors.muted },
              ]}
            >
              Think
            </Text>
          </Pressable>

          {sending || submitting ? (
            <IconButton
              icon="stop"
              label="Stop generating"
              color={colors.danger ?? colors.accent}
              onPress={() => stopGeneration()}
            />
          ) : canSend ? (
            <IconButton
              icon="send"
              label="Send"
              color={colors.accent}
              onPress={send}
            />
          ) : (
            <IconButton
              icon="mic"
              label="Voice mode"
              onPress={onVoice}
              color={colors.accent}
            />
          )}
        </View>
      </View>
      <AttachSheet visible={attachOpen} onClose={() => setAttachOpen(false)} room={MAX_ATTACHMENTS - items.length} onPicked={(picked) => setItems((all) => [...all, ...picked.map(fromPicked)].slice(0, MAX_ATTACHMENTS))} />
    </View>
  );
});

const TILE = 64;
const useStyles = makeStyles(({ colors, space, line, radius, isDark }) => ({
  wrap: {
    paddingHorizontal: space.md,
    paddingTop: space.xs,
    paddingBottom: space.xs,
    gap: space.xs,
    backgroundColor: 'transparent',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: isDark ? '#14112E' : '#FFFFFF',
    borderWidth: line,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingLeft: 6,
    paddingRight: 6,
    paddingVertical: 4,
    minHeight: 52,
    shadowColor: colors.accent,
    shadowOpacity: isDark ? 0.25 : 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  barFocus: {
    borderColor: colors.borderStrong,
    shadowOpacity: isDark ? 0.35 : 0.15,
  },
  attachBtn: {
    marginBottom: 2,
    borderRadius: radius.pill,
  },
  input: {
    flex: 1,
    maxHeight: 140,
    minHeight: 44,
    paddingTop: 10,
    paddingBottom: 10,
    paddingHorizontal: space.xs,
    textAlignVertical: 'center',
    fontSize: 15,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-end',
    marginBottom: 2,
  },
  thinkPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: line,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
    minHeight: 32,
    marginRight: 2,
  },
  thinkPillActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  thinkLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  tiles: { gap: space.sm, paddingRight: space.lg },
  imageTile: { width: TILE, height: TILE, borderWidth: line, borderColor: colors.border, borderRadius: radius.md },
  fileTile: { height: TILE, width: 168, borderWidth: line, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.md },
  thumb: { width: '100%', height: '100%', borderRadius: radius.md },
  fileBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingLeft: space.sm, paddingRight: space.xl },
  fileName: { flex: 1 },
  badge: { position: 'absolute', top: 0, right: 0, width: 20, height: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt, borderRadius: radius.pill },
  pressed: { opacity: 0.7 },
}));
