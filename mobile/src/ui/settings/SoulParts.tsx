import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { ThreadSoul } from '../../core/chatTypes.ts';
import { ARCHETYPES, ARCHETYPE_KEYS, type PADVector, type SoulArchetypeKey } from '../../core/persona.ts';
import { previewSoul, soulEffects, type SoulPreviewResult } from '../../services/soul.ts';
import { showToast } from '../../services/toast.ts';
import { PREVIEW_TEXT, previewVoice, stopSpeaking, TTS_MISSING, ttsStore, useTts } from '../../services/voice/tts.ts';
import { makeStyles } from '../../theme';
import { Button } from '../Button';
import { Card } from '../Card';
import { Field } from '../Field';
import { push } from '../nav';
import { Notice } from '../Notice';
import { ListRow } from '../Row';
import { Slider } from '../Slider';
import { Stat } from '../Stat';
import { Tag } from '../Tag';
import { Text } from '../Text';
import { wholeMs } from './logic';
import { Group, Rows, StatRow } from './parts';

export const BACKSTORY_MAX = 600;

/** What a soul does to the model: the three prompt descriptors and the four sampling values a chat will really use. */
export function SoulEffects({ pad, toneIntensity }: { pad: PADVector; toneIntensity: number }) {
  const s = useStyles();
  const { descriptors, sampling } = soulEffects({ pad, toneIntensity });
  return (
    <View style={s.stack}>
      {descriptors.map((d) => (
        <Text key={d}>{d}</Text>
      ))}
      <StatRow>
        <Stat label="Temperature" value={sampling.temperature.toFixed(2)} />
        <Stat label="Top-p" value={sampling.topP.toFixed(2)} />
        <Stat label="Top-k" value={sampling.topK} />
        <Stat label="Repeat penalty" value={sampling.repeatPenalty.toFixed(2)} />
      </StatRow>
      <Text variant="small">Warmth only changes the wording. Energy and directness also nudge the sampling above, from your base values in Advanced compute.</Text>
    </View>
  );
}

const SCENARIOS: Array<{ id: string; label: string; prompt?: string }> = [
  { id: 'intro', label: 'Introduce yourself' },
  { id: 'architecture', label: 'Systems and architecture', prompt: 'How should we decouple our session storage from the mobile UI thread?' },
  { id: 'crisis', label: 'Outage and crisis triage', prompt: 'The production deploy failed and customer demo begins in 15 minutes. What do we do?' },
  { id: 'creative', label: 'Creative strategy', prompt: 'Give me a distinctive brand concept and tagline for our sovereign on-device AI assistant.' },
];

/**
 * Live preview: the loaded model really writes a short reply with this soul's system prompt and sampling.
 * With no model loaded it says so and offers the way out; the voice button speaks the reply with the chosen voice.
 */
export function SoulPreview({ soul }: { soul: ThreadSoul }) {
  const s = useStyles();
  const tts = useTts();
  const [scenario, setScenario] = useState('intro');
  const [out, setOut] = useState<{ result: SoulPreviewResult; key: string } | null>(null);
  const key = JSON.stringify([soul.archetype, soul.pad, soul.toneIntensity, soul.customBackstory ?? '']);
  const write = async () => {
    const prompt = SCENARIOS.find((x) => x.id === scenario)?.prompt;
    const result = await previewSoul(soul, prompt);
    setOut({ result, key });
  };
  const text = out?.result.ok ? out.result.text : null;
  return (
    <View style={s.stack}>
      <View style={s.tags}>
        {SCENARIOS.map((x) => (
          <Tag key={x.id} label={x.label} onPress={() => setScenario(x.id)} selected={scenario === x.id} />
        ))}
      </View>
      <Button label="Write a preview" icon="play" busyLabel="Writing..." onPress={write} variant="quiet" />
      {out && !out.result.ok ? (
        <Notice tone="quiet" title={out.result.reason === 'no_model' ? 'No model loaded' : 'No preview'} action={out.result.reason === 'no_model' ? <Button label="Open Model Vault" variant="quiet" onPress={() => push('models')} /> : undefined}>
          {out.result.message}
        </Notice>
      ) : null}
      {out && out.result.ok ? (
        <Card>
          <Text selectable>{out.result.text}</Text>
          <Text variant="small">
            {[
              `${out.result.tokens} tokens`,
              out.result.tokPerSec !== null ? `${out.result.tokPerSec} tok/s` : null,
              wholeMs(out.result.ttftMs) !== null ? `first token ${wholeMs(out.result.ttftMs)} ms` : null,
              `temperature ${out.result.sampling.temperature.toFixed(2)}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {out.key !== key ? <Text variant="small">You changed the soul after this preview was written. Write it again to hear the new one.</Text> : null}
        </Card>
      ) : null}
      <Button
        label={tts.speaking ? 'Stop' : text ? 'Hear this reply' : 'Hear the voice'}
        icon={tts.speaking ? 'stop' : 'speaker'}
        variant="quiet"
        onPress={async () => {
          if (tts.speaking) return stopSpeaking();
          const ok = await previewVoice({}, text ?? PREVIEW_TEXT);
          if (!ok) showToast(ttsStore.getState().lastError ?? TTS_MISSING);
        }}
      />
    </View>
  );
}

/**
 * The whole soul editor: archetype, the three PAD feelings (bipolar sliders), intensity, your own instructions, what it
 * does to the model, and the live preview. Used for the global soul and for a chat's own soul.
 * Sliders are live locally and saved on release, so dragging never writes a file per pixel.
 */
export function SoulEditor({ soul, onChange }: { soul: ThreadSoul; onChange: (patch: Partial<ThreadSoul>) => void }) {
  const s = useStyles();
  const [pad, setPad] = useState(soul.pad);
  const [tone, setTone] = useState(soul.toneIntensity);
  const [text, setText] = useState(soul.customBackstory ?? '');
  const padKey = `${soul.pad.pleasure}|${soul.pad.arousal}|${soul.pad.dominance}`;
  useEffect(() => setPad(soul.pad), [padKey]);
  useEffect(() => setTone(soul.toneIntensity), [soul.toneIntensity]);
  useEffect(() => setText(soul.customBackstory ?? ''), [soul.customBackstory]);
  const live: ThreadSoul = { ...soul, pad, toneIntensity: tone, customBackstory: text.trim() || undefined };
  const pick = (k: SoulArchetypeKey) => onChange({ archetype: k, pad: { ...ARCHETYPES[k].defaultPAD } });
  const sig = (v: number) => (v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2));

  return (
    <>
      <Group index={1} title="Archetype" hint="Who answers. Picking one also sets the three feelings below to its own values.">
        <Rows>
          {ARCHETYPE_KEYS.map((k) => (
            <ListRow key={k} title={ARCHETYPES[k].name} subtitle={ARCHETYPES[k].description} selected={soul.archetype === k} onPress={() => pick(k)} />
          ))}
        </Rows>
      </Group>

      <Group index={2} title="Feelings" hint="Pleasure, arousal, dominance: the three dials that shape tone, pace and candour.">
        <View style={s.stack}>
          <Slider label="Warmth" value={pad.pleasure} min={-1} max={1} step={0.05} origin={0} poles={['Blunt', 'Warm']} format={sig} onChange={(v) => setPad({ ...pad, pleasure: v })} onCommit={(v) => onChange({ pad: { ...pad, pleasure: v } })} />
          <Slider label="Energy" value={pad.arousal} min={0} max={1} step={0.05} poles={['Calm', 'Lively']} onChange={(v) => setPad({ ...pad, arousal: v })} onCommit={(v) => onChange({ pad: { ...pad, arousal: v } })} />
          <Slider label="Directness" value={pad.dominance} min={0} max={1} step={0.05} poles={['Gentle', 'Direct']} onChange={(v) => setPad({ ...pad, dominance: v })} onCommit={(v) => onChange({ pad: { ...pad, dominance: v } })} />
          <Slider label="Intensity" value={tone} min={0.1} max={1} step={0.05} poles={['Subtle', 'Strong']} format={(v) => `${Math.round(v * 100)}%`} hint="How strongly the feelings reach the sampling." onChange={setTone} onCommit={(v) => onChange({ toneIntensity: v })} />
          <Button label="Reset to the archetype" variant="text" onPress={() => onChange({ pad: { ...ARCHETYPES[soul.archetype].defaultPAD }, toneIntensity: 0.8 })} />
        </View>
      </Group>

      <Group index={3} title="Your instructions">
        <Field
          label="Extra instructions (optional)"
          hint={`${text.length} of ${BACKSTORY_MAX} characters reach the model.`}
          value={text}
          onChangeText={setText}
          onBlur={() => onChange({ customBackstory: text.trim() })}
          placeholder="e.g. Always answer in Khmer. Keep replies short."
          multiline
          maxLength={BACKSTORY_MAX}
        />
      </Group>

      <Group index={4} title="What it changes">
        <SoulEffects pad={pad} toneIntensity={tone} />
      </Group>

      <Group index={5} title="Try it" hint="Written live by the model that is loaded now, with exactly this prompt and sampling.">
        <SoulPreview soul={live} />
      </Group>
    </>
  );
}

const useStyles = makeStyles(({ space }) => ({
  stack: { gap: space.md },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
}));
