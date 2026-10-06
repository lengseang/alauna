import React from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IncognitoIcon, PlusIcon, SlidersIcon, TrashIcon, CpuIcon } from '../components/Icons';
import type { ThreadMeta } from '../services/chatStore.ts';
import { Btn } from './Btn';
import { colors, font, radius } from './theme';

interface Props {
  visible: boolean;
  threads: ThreadMeta[];
  currentId: string;
  onClose: () => void;
  onOpen: (id: string) => void | Promise<unknown>;
  onDelete: (id: string, title: string) => void | Promise<unknown>;
  onNew: (incognito: boolean) => void;
  onModels: () => void;
  onSettings: () => void;
}

function ago(ts: number): string {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export function ThreadDrawer({ visible, threads, currentId, onClose, onOpen, onDelete, onNew, onModels, onSettings }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <View style={[styles.panel, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
          <View style={{ gap: 8 }}>
            <Btn variant="primary" label="New chat" icon={<PlusIcon size={15} color={colors.black} />} onPress={() => onNew(false)} />
            <Btn small variant="secondary" label="New incognito chat (not saved)" icon={<IncognitoIcon size={14} color={colors.text} />} onPress={() => onNew(true)} />
          </View>
          <Text style={styles.section}>History</Text>
          <FlatList
            data={threads}
            keyExtractor={(t) => t.id}
            ListEmptyComponent={<Text style={styles.empty}>No saved chats yet.</Text>}
            renderItem={({ item }) => (
              <View style={[styles.row, item.id === currentId && styles.rowActive]}>
                <Pressable accessibilityRole="button" accessibilityLabel={`Open chat ${item.title}`} onPress={() => onOpen(item.id)} style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.rowMeta}>{item.messageCount} messages · {ago(item.updatedAt)}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={`Delete chat ${item.title}`} hitSlop={10} onPress={() => onDelete(item.id, item.title)} style={styles.del}>
                  <TrashIcon size={15} color={colors.faint} />
                </Pressable>
              </View>
            )}
            style={{ flex: 1 }}
          />
          <View style={{ gap: 6 }}>
            <Btn small variant="ghost" label="Model Hub" icon={<CpuIcon size={15} color={colors.muted} />} onPress={onModels} />
            <Btn small variant="ghost" label="Settings" icon={<SlidersIcon size={15} color={colors.muted} />} onPress={onSettings} />
          </View>
        </View>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close menu" />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.6)' },
  panel: { width: '82%', maxWidth: 340, backgroundColor: colors.surface, paddingHorizontal: 14, gap: 10, borderRightWidth: 1, borderRightColor: colors.border },
  section: { color: colors.faint, fontSize: font.xs, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 8 },
  empty: { color: colors.faint, fontSize: font.sm, paddingVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 10, borderRadius: radius.md },
  rowActive: { backgroundColor: colors.surface3 },
  rowTitle: { color: colors.text, fontSize: font.md, fontWeight: '600' },
  rowMeta: { color: colors.faint, fontSize: font.xs, marginTop: 2 },
  del: { padding: 6 },
});
