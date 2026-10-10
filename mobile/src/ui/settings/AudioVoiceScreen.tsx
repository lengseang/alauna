import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { getSpeechModel, STT_MODELS, VAD_MODEL, VAD_SENSITIVITY_PRESETS, type SpeechModelSpec } from '../../core/voiceModels.ts';
import { showToast } from '../../services/toast.ts';
import { updateVoicePrefs, useVoicePrefs } from '../../services/voice/prefs.ts';
import { cancelSpeechModelDownload, deleteSpeechModel, downloadSpeechModel, pauseSpeechModelDownload, useSpeechModels } from '../../services/voice/speechModels.ts';
import { MIC_MODULE_MISSING, openAppSettings, useStt } from '../../services/voice/stt.ts';
import { listVoices, previewVoice, stopSpeaking, TTS_MISSING, ttsStore, useTts, type TtsVoice } from '../../services/voice/tts.ts';
import { makeStyles } from '../../theme';
import { Button } from '../Button';
import { confirm } from '../confirm';
import { goBack } from '../nav';
import { Notice } from '../Notice';
import { ProgressBar } from '../ProgressBar';
import { ListRow } from '../Row';
import { Screen } from '../Screen';
import { Sheet } from '../Sheet';
import { Slider } from '../Slider';
import { Tag } from '../Tag';
import { Text } from '../Text';
import { LANGUAGE_CHOICES, languageName, speechFraction, speechLine, vadPresetFor } from './logic';
import { ChoiceRow, Group, Rows } from './parts';

import { getVoicePersona, listVoicePersonas, type VoicePersona } from '../../core/voicePersonas.ts';
import { previewPersonaVoice } from '../../services/voice/tts.ts';

/** One speech model: pick it (radio), see its real state, download / pause / resume / cancel / delete. */
function SpeechModelRow({ spec, selected, onSelect }: { spec: SpeechModelSpec; selected: boolean; onSelect?: () => void }) {
  const s = useStyles();
  const st = useSpeechModels()[spec.id];
  const frac = speechFraction(st);
  const run = async (p: Promise<{ ok: boolean; message?: string }>) => {
    const r = await p;
    if (!r.ok && r.message) showToast(r.message);
  };
  return (
    <View style={s.model}>
      <ListRow title={spec.name} subtitle={`${spec.note}\n${speechLine(st)}`} selected={onSelect ? selected : undefined} onPress={onSelect} />
      {frac !== null ? <ProgressBar fraction={frac} label={`${spec.name} progress`} /> : null}
      {st.status === 'error' && st.error ? <Notice tone="danger">{st.error}</Notice> : null}
      <View style={s.actions}>
        {st.status === 'absent' || st.status === 'error' ? <Button label={st.status === 'error' ? 'Try again' : 'Download'} variant="text" icon="download" busyLabel="Starting..." onPress={() => run(downloadSpeechModel(spec.id))} /> : null}
        {st.status === 'downloading' ? <Button label="Pause" variant="text" icon="pause" onPress={() => pauseSpeechModelDownload(spec.id)} /> : null}
        {st.status === 'paused' ? <Button label="Resume" variant="text" icon="play" onPress={() => run(downloadSpeechModel(spec.id))} /> : null}
        {st.status === 'downloading' || st.status === 'paused' ? <Button label="Cancel" variant="text" onPress={() => cancelSpeechModelDownload(spec.id)} /> : null}
        {st.status === 'installed' ? (
          <Button
            label="Delete from phone"
            variant="text"
            icon="trash"
            onPress={async () => {
              if (await confirm(`Delete ${spec.name}?`, 'You can download it again later.', 'Delete', true)) deleteSpeechModel(spec.id);
            }}
          />
        ) : null}
      </View>
    </View>
  );
}

// Voice Model Card component
function VoicePersonaCard({
  persona,
  selected,
  isPlaying,
  onSelect,
  onPreview,
}: {
  persona: VoicePersona;
  selected: boolean;
  isPlaying: boolean;
  onSelect: () => void;
  onPreview: () => void;
}) {
  const s = useStyles();
  return (
    <View style={[s.personaCard, selected && s.personaCardSelected]}>
      <View style={s.personaHeader}>
        <View style={s.personaTitleRow}>
          <Text variant="heading" style={s.personaName}>{persona.name}</Text>
          {selected ? <Tag label="Selected" tone="accent" /> : null}
          {persona.isNsfw ? <Tag label="18+" tone="danger" /> : null}
        </View>
        <Text tone="muted" style={s.personaSubtitle}>{persona.subtitle}</Text>
      </View>
      <Text style={s.personaDescription}>{persona.description}</Text>
      <View style={s.personaTags}>
        {persona.tags.map((t) => (
          <Tag key={t} label={t} tone="default" />
        ))}
      </View>
      <View style={s.personaActions}>
        <Button
          label={isPlaying ? 'Stop' : 'Preview'}
          icon={isPlaying ? 'stop' : 'play'}
          variant="text"
          onPress={onPreview}
        />
        {!selected ? (
          <Button label="Select" variant="quiet" onPress={onSelect} />
        ) : null}
      </View>
    </View>
  );
}

/** Settings > Audio and voice: listening (Whisper models, language, VAD, barge-in) and speaking (system voices, rate, pitch). */
export function AudioVoiceScreen() {
  const s = useStyles();
  const prefs = useVoicePrefs();
  const stt = useStt();
  const tts = useTts();
  const models = useSpeechModels();
  const [voices, setVoices] = useState<TtsVoice[] | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceSheet, setVoiceSheet] = useState(false);
  const [rate, setRate] = useState(prefs.ttsRate);
  const [pitch, setPitch] = useState(prefs.ttsPitch);
  const [vad, setVad] = useState(prefs.vadThreshold);
  const [endMs, setEndMs] = useState(prefs.endOfSpeechMs);
  const [personaCategory, setPersonaCategory] = useState<'normal' | 'companion' | 'nsfw_adult'>('normal');
  const [previewingPersonaId, setPreviewingPersonaId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listVoices()
      .then((v) => alive && setVoices(v))
      .catch((e) => alive && setVoiceError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, []);

  const picked = getSpeechModel(prefs.sttModelId);
  const pickedInstalled = models[prefs.sttModelId]?.status === 'installed';
  const voice = voices?.find((v) => v.id === prefs.ttsVoice);
  const voiceLabel = prefs.ttsVoice ? (voice ? `${voice.name} (${voice.language})` : 'Chosen voice') : 'Phone default';
  const saveVad = (v: number) => {
    setVad(v);
    updateVoicePrefs({ vadThreshold: v });
  };

  return (
    <Screen title="Audio and voice" onBack={goBack} scroll>
      <Group index={1} title="Listening" hint="Speech to text runs on this phone with Whisper. Nothing is uploaded.">
        {!stt.engine ? (
          <Notice tone="quiet" title="Speech recognition is off in this build">
            You can download models now. Voice input starts working after the next app update.
          </Notice>
        ) : !stt.micCapture ? (
          <Notice tone="quiet" title="No live microphone yet">
            {MIC_MODULE_MISSING}
          </Notice>
        ) : null}
        {stt.mic === 'blocked' || stt.mic === 'denied' ? (
          <Notice tone="danger" title="Microphone permission is off" action={stt.mic === 'blocked' ? <Button label="Open Android settings" variant="quiet" onPress={openAppSettings} /> : undefined}>
            {stt.mic === 'blocked' ? 'Allow the microphone for CHIWIWI in Android settings to talk to it.' : 'CHIWIWI asks for the microphone when you start voice mode.'}
          </Notice>
        ) : null}
        <Rows>
          {STT_MODELS.map((m) => (
            <SpeechModelRow key={m.id} spec={m} selected={prefs.sttModelId === m.id} onSelect={() => updateVoicePrefs({ sttModelId: m.id })} />
          ))}
        </Rows>
        {picked && !pickedInstalled ? <Notice tone="info">{`Voice input needs ${picked.name} on the phone. Download it above.`}</Notice> : null}
        <SpeechModelRow spec={VAD_MODEL} selected={false} />
        <Text variant="small">The voice activity model is downloaded together with any speech model.</Text>
        <ChoiceRow
          title="Language"
          subtitle={picked?.englishOnly ? 'English-only models always listen in English.' : 'What you speak to the microphone.'}
          options={LANGUAGE_CHOICES.map((l) => l.code)}
          value={picked?.englishOnly ? 'en' : prefs.language}
          onChange={(code) => updateVoicePrefs({ language: code })}
          label={languageName}
          disabled={!!picked?.englishOnly}
        />
      </Group>

      <Group index={2} title="Voice detection" hint="Decides when you start and stop talking.">
        <Text variant="label">Sensitivity</Text>
        <View style={s.tags}>
          {VAD_SENSITIVITY_PRESETS.map((p) => (
            <Tag key={p.label} label={`${p.label} (${p.threshold})`} selected={vadPresetFor(vad) === p.label} onPress={() => saveVad(p.threshold)} />
          ))}
        </View>
        <Slider label="Threshold" value={vad} min={0.05} max={0.95} step={0.05} poles={['Picks up more', 'Needs louder speech']} hint="Lower picks up quieter speech and more background noise." onChange={setVad} onCommit={saveVad} />
        <Slider label="Silence that ends your turn" value={endMs} min={200} max={3000} step={100} format={(v) => `${v} ms`} onChange={setEndMs} onCommit={(v) => updateVoicePrefs({ endOfSpeechMs: v })} />
        <Rows>
          <ListRow title="Interrupt by speaking" subtitle="Talking over a reply stops it and starts listening. Turn off if the speaker triggers it." switchValue={prefs.bargeIn} onSwitch={(v) => updateVoicePrefs({ bargeIn: v })} />
          <ListRow title="Keep listening after each reply" subtitle="A continuous conversation instead of one question at a time." switchValue={prefs.continuous} onSwitch={(v) => updateVoicePrefs({ continuous: v })} />
        </Rows>
      </Group>

      <Group index={3} title="Voice models & styles" hint="Curated voice personalities with tailored pitch, cadence, and expression. Includes girlfriend/boyfriend styles and 18+ adult intimacy.">
        <View style={s.personaTabs}>
          <Button
            label="Normal"
            variant={personaCategory === 'normal' ? 'primary' : 'quiet'}
            onPress={() => setPersonaCategory('normal')}
          />
          <Button
            label="Girlfriend & Boyfriend"
            variant={personaCategory === 'companion' ? 'primary' : 'quiet'}
            onPress={() => setPersonaCategory('companion')}
          />
          <Button
            label="18+ Adult (NSFW)"
            variant={personaCategory === 'nsfw_adult' ? 'primary' : 'quiet'}
            onPress={() => setPersonaCategory('nsfw_adult')}
          />
        </View>

        {personaCategory === 'nsfw_adult' ? (
          <Notice tone="danger" title="Uncensored 18+ Voice Profiles">
            Intimate adult styles with breathy cadence and unfiltered tone for romantic and adult immersion.
          </Notice>
        ) : null}

        <View style={s.personaList}>
          {listVoicePersonas(personaCategory).map((p) => {
            const isSel = prefs.personaId === p.id;
            const isPlaying = previewingPersonaId === p.id;
            return (
              <VoicePersonaCard
                key={p.id}
                persona={p}
                selected={isSel}
                isPlaying={isPlaying}
                onSelect={() => {
                  setRate(p.rate);
                  setPitch(p.pitch);
                  updateVoicePrefs({
                    personaId: p.id,
                    ttsPitch: p.pitch,
                    ttsRate: p.rate,
                  });
                }}
                onPreview={async () => {
                  if (isPlaying) {
                    await stopSpeaking();
                    setPreviewingPersonaId(null);
                  } else {
                    setPreviewingPersonaId(p.id);
                    await previewPersonaVoice(p);
                    setPreviewingPersonaId(null);
                  }
                }}
              />
            );
          })}
        </View>
      </Group>

      <Group index={4} title="Speaking & system audio" hint="Replies are read aloud by the voices installed on your phone (Android text to speech).">
        {voiceError ? (
          <Notice tone="quiet" title="No speech voices">
            {voiceError === TTS_MISSING ? TTS_MISSING : `${voiceError} Install a text to speech voice in Android settings.`}
          </Notice>
        ) : null}
        <Rows>
          <ListRow title="Read replies aloud" subtitle="In voice mode. Typed chats stay silent." switchValue={prefs.ttsEnabled} onSwitch={(v) => updateVoicePrefs({ ttsEnabled: v })} />
          <ListRow title="Voice" subtitle={voices ? `${voices.length} installed` : voiceError ? undefined : 'Looking for voices...'} value={voiceLabel} onPress={() => setVoiceSheet(true)} disabled={!voices || voices.length === 0} />
        </Rows>
        <Slider label="Speed" value={rate} min={0.25} max={2} step={0.05} format={(v) => `${v.toFixed(2)}x`} poles={['Slower', 'Faster']} onChange={setRate} onCommit={(v) => updateVoicePrefs({ ttsRate: v })} />
        <Slider label="Pitch" value={pitch} min={0.5} max={2} step={0.05} format={(v) => `${v.toFixed(2)}x`} poles={['Lower', 'Higher']} onChange={setPitch} onCommit={(v) => updateVoicePrefs({ ttsPitch: v })} />
        <Button
          label={tts.speaking ? 'Stop' : 'Preview current voice'}
          icon={tts.speaking ? 'stop' : 'speaker'}
          variant="quiet"
          onPress={async () => {
            if (tts.speaking) return stopSpeaking();
            const ok = await previewVoice({ voice: prefs.ttsVoice, rate, pitch });
            if (!ok) showToast(ttsStore.getState().lastError ?? TTS_MISSING);
          }}
        />
        <Button
          label="Reset speed and pitch"
          variant="text"
          onPress={() => {
            const p = getVoicePersona(prefs.personaId);
            const r = p ? p.rate : 1;
            const pi = p ? p.pitch : 1;
            setRate(r);
            setPitch(pi);
            updateVoicePrefs({ ttsRate: r, ttsPitch: pi });
          }}
        />
      </Group>

      <Sheet visible={voiceSheet} onClose={() => setVoiceSheet(false)} title="Voice">
        <ListRow
          title="Phone default"
          subtitle="Whatever Android uses for text to speech."
          selected={prefs.ttsVoice === null}
          onPress={() => {
            updateVoicePrefs({ ttsVoice: null });
            setVoiceSheet(false);
          }}
        />
        {(voices ?? []).map((v) => (
          <ListRow
            key={v.id}
            title={v.name}
            subtitle={[v.language, v.enhanced ? 'enhanced' : null, v.needsNetwork === true ? 'needs the internet' : v.needsNetwork === false ? 'on this phone' : null].filter(Boolean).join(' · ')}
            selected={prefs.ttsVoice === v.id}
            onPress={() => {
              updateVoicePrefs({ ttsVoice: v.id });
              setVoiceSheet(false);
            }}
          />
        ))}
      </Sheet>
    </Screen>
  );
}

const useStyles = makeStyles(({ colors, space, line }) => ({
  model: { gap: space.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  personaTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginBottom: space.xs },
  personaList: { gap: space.md },
  personaCard: {
    padding: space.md,
    backgroundColor: colors.surface,
    borderWidth: line,
    borderColor: colors.border,
    gap: space.xs,
  },
  personaCardSelected: {
    borderColor: colors.accent,
  },
  personaHeader: { gap: 2 },
  personaTitleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  personaName: { flex: 1 },
  personaSubtitle: { fontSize: 13 },
  personaDescription: { fontSize: 14, lineHeight: 20 },
  personaTags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  personaActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.xs },
}));
