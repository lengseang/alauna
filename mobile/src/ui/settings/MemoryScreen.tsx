import React, { useState } from 'react';
import { View } from 'react-native';
import { MAX_FACT_CHARS, MAX_FACTS, type MemoryFact } from '../../core/memory.ts';
import { addMemory, clearMemory, deleteMemory, editMemory, setMemoryPaused, useMemory, useMemoryBudget } from '../../services/memory.ts';
import { showToast } from '../../services/toast.ts';
import { makeStyles } from '../../theme';
import { Button } from '../Button';
import { confirm } from '../confirm';
import { Field } from '../Field';
import { goBack } from '../nav';
import { Notice } from '../Notice';
import { ProgressBar } from '../ProgressBar';
import { ListRow } from '../Row';
import { Screen } from '../Screen';
import { Sheet } from '../Sheet';
import { Stat } from '../Stat';
import { Text } from '../Text';
import { showUndo } from '../undo';
import { Group, Rows, StatRow } from './parts';

/** One fact in a sheet: edit the words, pause it (kept but not sent), or forget it (with Undo). */
function FactSheet({ fact, onClose }: { fact: MemoryFact | null; onClose: () => void }) {
  const [text, setText] = useState(fact?.text ?? '');
  const [shownId, setShownId] = useState(fact?.id);
  if (fact && fact.id !== shownId) {
    setShownId(fact.id);
    setText(fact.text);
  }
  const save = () => {
    if (!fact) return;
    const r = editMemory(fact.id, text);
    if (r.ok) onClose();
    else showToast(r.reason);
  };
  return (
    <Sheet visible={!!fact} onClose={onClose} title="Memory fact" footer={<Button label="Save" onPress={save} disabled={!fact || !text.trim() || text.trim() === fact.text} />}>
      {fact ? (
        <>
          <Field label="What to remember" value={text} onChangeText={setText} maxLength={MAX_FACT_CHARS} multiline hint={`${text.length} of ${MAX_FACT_CHARS} characters`} />
          <ListRow
            title="Pause this fact"
            subtitle="Keep it, but do not send it to the model."
            switchValue={!!fact.paused}
            onSwitch={(v) => setMemoryPaused(fact.id, v)}
          />
          <Button
            label="Forget this fact"
            variant="danger"
            onPress={() => {
              const { text: old, paused } = fact;
              deleteMemory(fact.id);
              onClose();
              showUndo('Fact forgotten', () => {
                const r = addMemory(old);
                if (r.ok && paused) setMemoryPaused(r.fact.id, true);
              });
            }}
          />
        </>
      ) : null}
    </Sheet>
  );
}

/** Settings > Memory: the facts that reach the system prompt, how much of the budget they use, add/edit/pause/forget. */
export function MemoryScreen() {
  const s = useStyles();
  const { facts } = useMemory();
  const budget = useMemoryBudget();
  const [text, setText] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const current = facts.find((f) => f.id === open) ?? null;
  const add = () => {
    const r = addMemory(text);
    if (r.ok) setText('');
    else showToast(r.reason);
  };
  const state = (f: MemoryFact): string => (f.paused ? 'Paused: not sent to the model' : budget.overBudget.some((x) => x.id === f.id) ? 'Does not fit the budget: not sent' : 'Sent to the model');
  return (
    <Screen title="Memory" onBack={goBack} scroll>
      <Text tone="muted">Short facts the model keeps in mind in every chat. They never leave this phone. In any chat you can also type /remember and a fact.</Text>

      <Group index={1} title="Budget" hint="Only so much fits in the prompt; the rest waits in the vault.">
        <StatRow>
          <Stat label="Sent" value={`${budget.included.length} of ${facts.length - budget.paused.length}`} unit="facts" />
          <Stat label="Characters" value={`${budget.usedChars} / ${budget.maxChars}`} />
          <Stat label="Prompt cost" value={budget.estimatedTokens} unit="tokens" hint="estimate" />
        </StatRow>
        <ProgressBar fraction={budget.maxChars > 0 ? budget.usedChars / budget.maxChars : 0} label="Memory budget used" tone={budget.overBudget.length > 0 ? 'danger' : 'accent'} />
        {budget.overBudget.length > 0 ? (
          <Notice tone="danger">{`${budget.overBudget.length} ${budget.overBudget.length === 1 ? 'fact does' : 'facts do'} not fit and ${budget.overBudget.length === 1 ? 'is' : 'are'} not sent. Shorten, pause or forget some.`}</Notice>
        ) : null}
      </Group>

      <Group index={2} title="Add">
        <View style={s.add}>
          <Field label="Remember something" value={text} onChangeText={setText} placeholder="e.g. I live in Phnom Penh" maxLength={MAX_FACT_CHARS} onSubmitEditing={add} returnKeyType="done" hint={`Up to ${MAX_FACTS} facts of ${MAX_FACT_CHARS} characters.`} />
          <Button label="Remember" onPress={add} disabled={!text.trim()} />
        </View>
      </Group>

      <Group index={3} title="Remembered" hint={facts.length === 0 ? 'Nothing yet.' : 'Tap a fact to edit, pause or forget it.'}>
        <Rows>
          {facts.map((f) => (
            <ListRow key={f.id} title={f.text} subtitle={state(f)} onPress={() => setOpen(f.id)} accessibilityHint="Opens edit, pause and forget" />
          ))}
        </Rows>
        {facts.length > 0 ? (
          <Button
            label="Forget everything"
            variant="danger"
            onPress={async () => {
              if (await confirm('Forget everything?', 'All remembered facts will be deleted. This cannot be undone.', 'Forget', true)) clearMemory();
            }}
          />
        ) : null}
      </Group>
      <FactSheet fact={current} onClose={() => setOpen(null)} />
    </Screen>
  );
}

const useStyles = makeStyles(({ space }) => ({
  add: { gap: space.md },
}));
