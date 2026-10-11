import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { newChat, openThread, refreshThreadList, removeThread, renameThread, searchChats, setThreadPinned, useChatState } from '../services/chat.ts';
import { loadThread, saveThread, type ThreadMeta } from '../services/chatStore.ts';
import { hit, makeStyles } from '../theme';
import { Button } from './Button';
import { Divider } from './Divider';
import { Field, SearchField } from './Field';
import { Icon } from './Icon';
import { push, type Route } from './nav';
import { Row } from './Row';
import { Sheet } from './Sheet';
import { Text } from './Text';
import { showUndo } from './undo';
import { Wordmark } from './Wordmark';

// S2 registers the Downloads Hub under this name.
const DOWNLOADS = 'downloads' as Route;

/**
 * Drawer: New chat, New incognito chat, search (titles and message text), saved chats with pinned first, and the
 * Vault / Downloads / Settings destinations. Hold a chat for rename, pin, delete (Undo brings a deleted chat back).
 */
export function ThreadDrawer({ onClose }: { onClose: () => void }) {
  const chat = useChatState();
  const s = useStyles();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ThreadMeta[] | null>(null);
  const [menu, setMenu] = useState<ThreadMeta | null>(null);
  const [name, setName] = useState('');
  const threads = chat.threads;
  const searching = query.trim().length > 0;
  const shown = searching ? hits ?? [] : threads;

  // Searches titles AND message text; stale answers are dropped.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setHits(null);
      return;
    }
    let live = true;
    const t = setTimeout(() => void searchChats(q).then((r) => live && setHits(r)), 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query, threads]);

  const go = (route: Route) => () => {
    onClose();
    push(route);
  };

  const openMenu = (t: ThreadMeta) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setName(t.title);
    setMenu(t);
  };

  const remove = async (t: ThreadMeta) => {
    setMenu(null);
    const backup = await loadThread(t.id);
    await removeThread(t.id);
    if (backup && !(await loadThread(t.id))) {
      showUndo(`Deleted "${t.title}"`, async () => {
        await saveThread(backup);
        await refreshThreadList();
      });
    }
  };

  return (
    <View style={s.root}>
      <View style={s.head}>
        <Wordmark />
        <Button
          label="New chat"
          icon="compose"
          onPress={() => {
            if (newChat(false)) onClose();
          }}
        />
        <Button
          label="New incognito chat"
          variant="text"
          icon="incognito"
          onPress={() => {
            if (newChat(true)) onClose();
          }}
        />
        <SearchField label="Search chats" placeholder="Search chats and messages" value={query} onChangeText={setQuery} />
      </View>

      <FlatList
        data={shown}
        keyExtractor={(t) => t.id}
        style={s.list}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <Text variant="small" style={s.empty}>
            {searching ? 'No chats match.' : 'Your chats will appear here.'}
          </Text>
        }
        ListFooterComponent={
          threads.length ? (
            <Text variant="small" style={s.empty}>
              Hold a chat to rename, pin or delete it.
            </Text>
          ) : null
        }
        renderItem={({ item }) => {
          const current = item.id === chat.thread.id;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.title}${item.pinned ? ', pinned' : ''}${current ? ', current chat' : ''}`}
              accessibilityHint="Hold for rename, pin and delete"
              accessibilityState={{ selected: current }}
              onPress={async () => {
                if (current || (await openThread(item.id))) onClose();
              }}
              onLongPress={() => openMenu(item)}
              delayLongPress={450}
              style={({ pressed }) => [s.thread, (current || pressed) && s.threadOn]}
            >
              <View style={s.titleRow}>
                {item.pinned ? <Icon name="pin" size={16} /> : null}
                <Text variant={current ? 'strong' : 'body'} numberOfLines={1} style={s.grow}>
                  {item.title}
                </Text>
              </View>
              {item.snippet ? (
                <Text variant="small" numberOfLines={1}>
                  {item.snippet}
                </Text>
              ) : null}
            </Pressable>
          );
        }}
      />

      <Divider />
      <View style={s.nav}>
        <Row icon="persona" title="Companions & Souls" onPress={go('soul/library')} />
        <Row icon="models" title="Model Vault" onPress={go('models')} />
        <Row icon="download" title="Downloads" onPress={go(DOWNLOADS)} />
        <Row icon="settings" title="Settings" onPress={go('settings')} />
      </View>

      <Sheet visible={!!menu} onClose={() => setMenu(null)} title={menu?.title ?? 'Chat'}>
        <Field label="Name" value={name} onChangeText={setName} maxLength={80} returnKeyType="done" />
        <Button
          label="Rename"
          variant="quiet"
          disabled={!name.trim() || name.trim() === menu?.title}
          onPress={async () => {
            if (menu) await renameThread(menu.id, name);
            setMenu(null);
          }}
        />
        <Row
          icon="pin"
          title={menu?.pinned ? 'Unpin' : 'Pin to top'}
          onPress={async () => {
            if (menu) await setThreadPinned(menu.id, !menu.pinned);
            setMenu(null);
          }}
        />
        <Row icon="trash" title="Delete chat" destructive onPress={() => menu && void remove(menu)} />
      </Sheet>
    </View>
  );
}

const useStyles = makeStyles(({ colors, space }) => ({
  root: { flex: 1 },
  head: { padding: space.lg, gap: space.sm },
  list: { flex: 1, paddingHorizontal: space.sm },
  thread: { minHeight: hit, justifyContent: 'center', paddingHorizontal: space.md },
  threadOn: { backgroundColor: colors.accentSoft },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  grow: { flexShrink: 1 },
  empty: { paddingHorizontal: space.md, paddingVertical: space.md },
  nav: { padding: space.sm },
}));
