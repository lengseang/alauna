import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { ARCHETYPES, ARCHETYPE_KEYS, clampPad, describePad, type PADVector } from '../core/persona.ts';
import { updateThreadSoul, useChatState } from '../services/chat.ts';
import { addMemory, clearMemory, deleteMemory, memoryStore } from '../services/memory.ts';
import { updateSettings, useSettings } from '../services/settings.ts';
import { showToast } from '../services/toast.ts';
import { makeStyles } from '../theme';
import { Button } from './Button';
import { confirm } from './confirm';
import { Divider } from './Divider';
import { Field } from './Field';
import { goBack, push } from './nav';
import { Row } from './Row';
import { Screen } from './Screen';
import { Text } from './Text';

const round1 = (n: number) => Math.round(n * 10) / 10;

function Stepper({ label, hint, value, min, max, onChange }: { label: string; hint: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  const s = useStyles();
  return (
    <View style={s.stepRow}>
      <View style={s.grow}>
        <Text variant="strong">{label}</Text>
        <Text variant="small">{hint}</Text>
      </View>
      <Button
        label={'−'}
        accessibilityLabel={`Less ${label}`}
        variant="quiet"
        disabled={value <= min}
        debounceMs={120}
        haptics={false}
        onPress={() => onChange(Math.max(min, round1(value - 0.1)))}
        style={s.stepBtn}
      />
      <Text variant="strong" style={s.stepValue}>
        {value.toFixed(1)}
      </Text>
      <Button
        label="+"
        accessibilityLabel={`More ${label}`}
        variant="quiet"
        disabled={value >= max}
        debounceMs={120}
        haptics={false}
        onPress={() => onChange(Math.min(max, round1(value + 0.1)))}
        style={s.stepBtn}
      />
    </View>
  );
}

/**
 * Who the AI is. One list, one tap: the choice is saved for this chat and for new chats. Fine-tuning and extra
 * instructions are folded away. Phase 2 owns the final design of this screen.
 */
export function PersonaScreen() {
  const s = useStyles();
  const settings = useSettings();
  const { thread } = useChatState();
  const facts = useSyncExternalStore(memoryStore.subscribe, memoryStore.getState).facts;
  const [fine, setFine] = useState(false);
  const [backstory, setBackstory] = useState(thread.soul.customBackstory ?? '');
  useEffect(() => setBackstory(thread.soul.customBackstory ?? ''), [thread.id, thread.soul.customBackstory]);

  const apply = (archetype: typeof settings.archetype, pad: PADVector) => {
    updateSettings({ archetype, pad });
    updateThreadSoul({ ...thread.soul, archetype, pad });
  };
  const setPad = (patch: Partial<PADVector>) => apply(settings.archetype, clampPad({ ...settings.pad, ...patch }));

  return (
    <Screen title="Persona" onBack={goBack} scroll>
      <Text tone="muted">Pick how CHIWIWI talks. It applies to this chat and to new chats.</Text>
      <View>
        {ARCHETYPE_KEYS.map((k, i) => (
          <React.Fragment key={k}>
            {i > 0 ? <Divider /> : null}
            <Row title={ARCHETYPES[k].name} subtitle={ARCHETYPES[k].description} selected={settings.archetype === k} onPress={() => apply(k, { ...ARCHETYPES[k].defaultPAD })} />
          </React.Fragment>
        ))}
      </View>

      <Divider />
      <Row
        title="Fine-tune"
        subtitle={fine ? undefined : describePad(settings.pad).join(' ')}
        right={
          <Text variant="label" tone="accent">
            {fine ? 'Hide' : 'Show'}
          </Text>
        }
        onPress={() => setFine(!fine)}
      />
      {fine ? (
        <View style={s.fine}>
          <Stepper label="Warmth" hint="Blunt  to  friendly" value={settings.pad.pleasure} min={-1} max={1} onChange={(v) => setPad({ pleasure: v })} />
          <Stepper label="Energy" hint="Calm  to  lively" value={settings.pad.arousal} min={0} max={1} onChange={(v) => setPad({ arousal: v })} />
          <Stepper label="Directness" hint="Gentle  to  direct" value={settings.pad.dominance} min={0} max={1} onChange={(v) => setPad({ dominance: v })} />
          <Field
            label="Extra instructions for this chat (optional)"
            value={backstory}
            onChangeText={setBackstory}
            onBlur={() => updateThreadSoul({ ...thread.soul, customBackstory: backstory.trim() || undefined })}
            placeholder="e.g. Always answer in Khmer. Keep replies short."
            multiline
            maxLength={600}
          />
        </View>
      ) : null}

      <Divider />
      <Row title="Memory" subtitle={`${facts.length} ${facts.length === 1 ? 'thing' : 'things'} I remember about you`} onPress={() => push('persona/memory')} />
    </Screen>
  );
}

/** Facts the AI keeps in mind in every chat. Add, forget one, forget all (confirmed). */
export function MemoryScreen() {
  const s = useStyles();
  const { facts } = useSyncExternalStore(memoryStore.subscribe, memoryStore.getState);
  const [text, setText] = useState('');
  const add = () => {
    const r = addMemory(text);
    if (r.ok) setText('');
    else showToast(r.reason);
  };
  return (
    <Screen title="Memory" onBack={goBack} scroll>
      <Text tone="muted">Short facts the AI keeps in mind in every chat. They never leave this phone. You can also type /remember and a fact in any chat.</Text>
      <Field label="Remember something" value={text} onChangeText={setText} placeholder="e.g. I live in Phnom Penh" maxLength={200} onSubmitEditing={add} returnKeyType="done" />
      <Button label="Remember" variant="primary" onPress={add} disabled={!text.trim()} />
      {facts.length === 0 ? <Text variant="small">Nothing yet.</Text> : null}
      <View>
        {facts.map((f, i) => (
          <React.Fragment key={f.id}>
            {i > 0 ? <Divider /> : null}
            <View style={s.fact}>
              <Text style={s.grow}>{f.text}</Text>
              <Button label="Forget" accessibilityLabel={`Forget ${f.text}`} variant="text" onPress={() => deleteMemory(f.id)} />
            </View>
          </React.Fragment>
        ))}
      </View>
      {facts.length > 0 ? (
        <Button
          label="Forget everything"
          variant="danger"
          onPress={async () => {
            if (await confirm('Forget everything?', 'All remembered facts will be deleted.', 'Forget', true)) clearMemory();
          }}
        />
      ) : null}
    </Screen>
  );
}

const useStyles = makeStyles(({ space }) => ({
  grow: { flex: 1 },
  fine: { gap: space.lg, paddingHorizontal: space.sm },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stepBtn: { width: 48, paddingHorizontal: 0 },
  stepValue: { width: 40, textAlign: 'center' },
  fact: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs, paddingLeft: space.sm },
}));
