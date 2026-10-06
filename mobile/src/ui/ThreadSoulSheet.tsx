import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ThreadSoul } from '../core/chatTypes.ts';
import { CrossIcon } from '../components/Icons';
import { Btn } from './Btn';
import { SoulEditor } from './SoulEditor';
import { colors, font, radius } from './theme';

interface Props {
  visible: boolean;
  soul: ThreadSoul;
  onClose: () => void;
  onSave: (soul: ThreadSoul) => void;
}

/** Per-chat personality override (the global default lives in Settings > Soul). */
export function ThreadSoulSheet({ visible, soul, onClose, onSave }: Props) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<ThreadSoul>(soul);
  useEffect(() => {
    if (visible) setDraft(soul);
  }, [visible, soul]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.head}>
            <Text style={styles.title}>Personality for this chat</Text>
            <Pressable accessibilityLabel="Close" hitSlop={10} onPress={onClose}>
              <CrossIcon size={16} />
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ gap: 12, paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
            <SoulEditor value={draft} onChange={(v) => setDraft({ ...draft, ...v, toneIntensity: v.toneIntensity ?? draft.toneIntensity } as ThreadSoul)} />
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn variant="ghost" label="Cancel" onPress={onClose} style={{ flex: 1 }} />
            <Btn
              variant="primary"
              label="Apply to this chat"
              onPress={() => {
                onSave({ ...draft, customBackstory: draft.customBackstory?.trim() || undefined });
                onClose();
              }}
              style={{ flex: 2 }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, gap: 12, borderWidth: 1, borderColor: colors.border },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: colors.text, fontSize: font.lg, fontWeight: '700' },
});
void radius;
