import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { newChat, openThread, refreshThreadList, removeThread, useChatState } from '../services/chat.ts';
import { loadThread, saveThread, type ThreadMeta } from '../services/chatStore.ts';
import { hit, makeStyles } from '../theme';
import { Button } from './Button';
import { Divider } from './Divider';
import { Field } from './Field';
import { push, type Route } from './nav';
import { Row } from './Row';
import { Text } from './Text';
import { showUndo } from './undo';
import { Wordmark } from './Wordmark';

const SEARCH_FROM = 7;

/**
 * What lives inside the drawer: New chat, the saved chats (hold one to delete it, Undo brings it back),
 * and three plain destinations. Nothing else.
 */
export function ThreadDrawer({ onClose }: { onClose: () => void }) {
  const chat = useChatState();
  const s = useStyles();
  const [query, setQuery] = useState('');
  const threads = chat.threads;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? threads.filter((t) => t.title.toLowerCase().includes(q)) : threads;
  }, [threads, query]);

  const go = (route: Route) => () => {
    onClose();
    push(route);
  };

  const remove = async (t: ThreadMeta) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
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
          label="Incognito chat (not saved)"
          variant="text"
          onPress={() => {
            if (newChat(true)) onClose();
          }}
        />
        {threads.length >= SEARCH_FROM ? <Field label="Search chats" value={query} onChangeText={setQuery} autoCorrect={false} returnKeyType="search" /> : null}
      </View>

      <FlatList
        data={shown}
        keyExtractor={(t) => t.id}
        style={s.list}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <Text variant="small" style={s.empty}>
            {threads.length ? 'No chats match.' : 'Your chats will appear here.'}
          </Text>
        }
        ListFooterComponent={
          threads.length ? (
            <Text variant="small" style={s.empty}>
              Hold a chat to delete it.
            </Text>
          ) : null
        }
        renderItem={({ item }) => {
          const current = item.id === chat.thread.id;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.title}${current ? ', current chat' : ''}`}
              accessibilityHint="Hold to delete"
              accessibilityState={{ selected: current }}
              onPress={async () => {
                if (current || (await openThread(item.id))) onClose();
              }}
              onLongPress={() => void remove(item)}
              delayLongPress={450}
              style={({ pressed }) => [s.thread, (current || pressed) && s.threadOn]}
            >
              <Text variant={current ? 'strong' : 'body'} numberOfLines={1}>
                {item.title}
              </Text>
            </Pressable>
          );
        }}
      />

      <Divider />
      <View style={s.nav}>
        <Row icon="models" title="Models" onPress={go('models')} />
        <Row icon="persona" title="Persona" onPress={go('persona')} />
        <Row icon="settings" title="Settings" onPress={go('settings')} />
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors, space, radius }) => ({
  root: { flex: 1 },
  head: { padding: space.lg, gap: space.sm },
  list: { flex: 1, paddingHorizontal: space.sm },
  thread: { minHeight: hit, justifyContent: 'center', paddingHorizontal: space.md, borderRadius: radius.md },
  threadOn: { backgroundColor: colors.accentSoft },
  empty: { paddingHorizontal: space.md, paddingVertical: space.md },
  nav: { padding: space.sm },
}));
