import React from 'react';
import { ARCHETYPES } from '../../core/persona.ts';
import { clearThreadSoul, updateThreadSoul, useChatState } from '../../services/chat.ts';
import { useMemory } from '../../services/memory.ts';
import { useSettings } from '../../services/settings.ts';
import { globalSoul, setGlobalSoul } from '../../services/soul.ts';
import { Button } from '../Button';
import { goBack, push } from '../nav';
import { Notice } from '../Notice';
import { ListRow } from '../Row';
import { Screen } from '../Screen';
import { Segmented } from '../Segmented';
import { Text } from '../Text';
import { Group, Rows } from './parts';
import { SoulEditor, SoulEffects, SoulPreview } from './SoulParts';

/** Settings > Soul: the global persona every chat follows unless it has its own (see ThreadSoulSheet). */
export function SoulScreen() {
  const settings = useSettings();
  const { thread } = useChatState();
  const { facts } = useMemory();
  const soul = globalSoul(settings);
  return (
    <Screen title="Companion Soul" onBack={goBack} scroll>
      <Text tone="muted">Customize Alauna's intimacy, passion, and personality dynamics. Every chat reflects this soul unless customized individually.</Text>
      <Button
        label="Open Soul Library & Studio"
        variant="primary"
        icon="persona"
        onPress={() => push('soul/library')}
      />
      {thread.soulOverride ? (
        <Notice title="This chat has its own soul" action={<Button label="Follow the global soul" variant="quiet" onPress={clearThreadSoul} />}>
          Changes here do not reach it until it follows the global soul again.
        </Notice>
      ) : null}
      <SoulEditor soul={soul} onChange={setGlobalSoul} />
      <Group title="Companion Memory" hint="Personal facts and memories Alauna keeps in mind across chats.">
        <Rows>
          <ListRow title="Memory Vault" subtitle={`${facts.length} ${facts.length === 1 ? 'fact' : 'facts'} remembered`} onPress={() => push('settings/memory')} />
        </Rows>
      </Group>
    </Screen>
  );
}

/**
 * Route 'threadSoul' (opened from the chat menu): this chat follows the global soul, or has its own. Switching to
 * "Only this chat" starts from a copy of the global soul; switching back drops the override (the copy is kept out of sight).
 */
export function ThreadSoulSheet() {
  const settings = useSettings();
  const { thread } = useChatState();
  const global = globalSoul(settings);
  const custom = thread.soulOverride;
  return (
    <Screen title="Chat soul" onBack={goBack} scroll>
      <Text tone="muted">{`Applies only to "${thread.title}". Other chats and new chats are not changed.`}</Text>
      <Segmented
        label="Soul for this chat"
        options={[
          { value: 'global', label: 'Follow global' },
          { value: 'custom', label: 'Only this chat' },
        ]}
        value={custom ? 'custom' : 'global'}
        onChange={(m) => (m === 'custom' ? updateThreadSoul({ ...global, pad: { ...global.pad } }) : clearThreadSoul())}
      />
      {custom ? (
        <SoulEditor soul={thread.soul} onChange={(patch) => updateThreadSoul({ ...thread.soul, ...patch })} />
      ) : (
        <>
          <Group title={ARCHETYPES[global.archetype].name} hint={ARCHETYPES[global.archetype].description}>
            <SoulEffects pad={global.pad} toneIntensity={global.toneIntensity} />
          </Group>
          <Group title="Try it">
            <SoulPreview soul={global} />
          </Group>
          <Button label="Edit the global soul" variant="quiet" onPress={() => push('settings/soul')} />
        </>
      )}
    </Screen>
  );
}
