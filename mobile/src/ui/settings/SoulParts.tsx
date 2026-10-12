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
  { id: 'intro', label: 'Whisper a greeting', prompt: 'Whisper a warm, intimate greeting to me as we meet tonight.' },
  { id: 'latenight', label: 'Late night conversation', prompt: 'It is late, the room is quiet and dimly lit. What is on your mind, darling?' },
  { id: 'flirt', label: 'Playful tease', prompt: 'Tease me playfully about how much time we spend together.' },
  { id: 'devotion', label: 'Passionate moment', prompt: 'Tell me how deeply you care about our bond and what I mean to you.' },
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
          <Tag key={x.id} label={x.label} onPress={() => setScenario(x.id)} selected={scenario === x.id} tone="accent" />
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
          {out.key !== key ? <Text variant="small">You changed the personality settings after this preview was written. Generate again to hear the new tone.</Text> : null}
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
 * The companion soul editor: archetype, warmth/passion, energy/flirt, initiative, instructions, and live testing.
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
      <Group title="Companion Archetype" hint="Choose the core personality style that guides responses and roleplay.">
        <Rows>
          {ARCHETYPE_KEYS.map((k) => (
            <ListRow key={k} title={ARCHETYPES[k].name} subtitle={ARCHETYPES[k].description} selected={soul.archetype === k} onPress={() => pick(k)} />
          ))}
        </Rows>
      </Group>

      <Group title="Personality Dials" hint="Fine-tune warmth, teasing banter, initiative, and emotional intensity.">
        <View style={s.stack}>
          <Slider label="Warmth & Passion" value={pad.pleasure} min={-1} max={1} step={0.05} origin={0} poles={['Cool / Reserved', 'Passionate / Warm']} format={sig} onChange={(v) => setPad({ ...pad, pleasure: v })} onCommit={(v) => onChange({ pad: { ...pad, pleasure: v } })} />
          <Slider label="Playfulness & Flirt" value={pad.arousal} min={0} max={1} step={0.05} poles={['Calm & Gentle', 'Bold & Flirtatious']} onChange={(v) => setPad({ ...pad, arousal: v })} onCommit={(v) => onChange({ pad: { ...pad, arousal: v } })} />
          <Slider label="Initiative & Dominance" value={pad.dominance} min={0} max={1} step={0.05} poles={['Follows Your Lead', 'Takes Charge / Bold']} onChange={(v) => setPad({ ...pad, dominance: v })} onCommit={(v) => onChange({ pad: { ...pad, dominance: v } })} />
          <Slider label="Intimacy Intensity" value={tone} min={0.1} max={1} step={0.05} poles={['Subtle', 'Deep & Unfiltered']} format={(v) => `${Math.round(v * 100)}%`} hint="How intensely the personality traits influence roleplay." onChange={setTone} onCommit={(v) => onChange({ toneIntensity: v })} />
          <Button label="Reset to Archetype Defaults" variant="text" onPress={() => onChange({ pad: { ...ARCHETYPES[soul.archetype].defaultPAD }, toneIntensity: 0.8 })} />
        </View>
      </Group>

      <Group title="Custom Roleplay & Backstory">
        <Field
          label="Custom Backstory / Fantasy Instructions"
          hint={`${text.length} of ${BACKSTORY_MAX} characters.`}
          value={text}
          onChangeText={setText}
          onBlur={() => onChange({ customBackstory: text.trim() })}
          placeholder="e.g. You are Alauna, deeply devoted and affectionate. Stay in character, speak intimately, and call me darling."
          multiline
          maxLength={BACKSTORY_MAX}
        />
      </Group>

      <Group title="Roleplay Response Tuning">
        <SoulEffects pad={pad} toneIntensity={tone} />
      </Group>

      <Group title="Live Roleplay Test" hint="Tested live with the currently loaded offline model.">
        <SoulPreview soul={live} />
      </Group>
    </>
  );
}

const useStyles = makeStyles(({ space }) => ({
  stack: { gap: space.md },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
}));
