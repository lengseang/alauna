import React, { useState } from 'react';
import { Share, View } from 'react-native';
import type { SelfTestResult } from '../../core/selfTest.ts';
import { formatBytes } from '../../core/format.ts';
import { getDeviceProfile } from '../../services/device.ts';
import { runSelfTest, useBackendDevices, useEngineStatus } from '../../services/engine.ts';
import { useMemory, useMemoryBudget } from '../../services/memory.ts';
import { useNetworkGate } from '../../services/networkGate.ts';
import { useIntegrity } from '../../services/privacy.ts';
import { useSecurity } from '../../services/security.ts';
import { useSettings } from '../../services/settings.ts';
import { useStorageSlots } from '../../services/storage.ts';
import { showToast } from '../../services/toast.ts';
import { useVoicePrefs } from '../../services/voice/prefs.ts';
import { useStt } from '../../services/voice/stt.ts';
import { makeStyles } from '../../theme';
import { Button } from '../Button';
import { goBack } from '../nav';
import { Notice } from '../Notice';
import { ListRow } from '../Row';
import { Screen } from '../Screen';
import { Stat } from '../Stat';
import { Text } from '../Text';
import { buildDiagnostics, oneDecimal, wholeMs, type DiagSection } from './logic';
import { APP_VERSION, Group, Rows, StatRow } from './parts';

function SelfTestResultView({ r }: { r: SelfTestResult }) {
  const s = useStyles();
  return (
    <View style={s.stack}>
      <Notice tone={r.ok ? 'info' : 'danger'} title={r.ok ? 'The model works' : 'The model failed the test'}>
        {r.ok ? `It answered: ${r.text || '(no text)'}` : r.reasons.join(' ') || 'No reason was reported.'}
      </Notice>
      <StatRow>
        <Stat label="Speed" value={oneDecimal(r.tokPerSec)} unit="tok/s" />
        <Stat label="First token" value={wholeMs(r.ttftMs)} unit="ms" />
        <Stat label="Load time" value={wholeMs(r.loadMs)} unit="ms" hint={r.loadMs === null ? 'already loaded' : undefined} />
        <Stat label="Total" value={wholeMs(r.totalMs)} unit="ms" />
      </StatRow>
      {r.warnings.map((w) => (
        <Notice key={w} tone="quiet">
          {w}
        </Notice>
      ))}
      {r.fix ? <Text variant="small">{r.fix}</Text> : null}
    </View>
  );
}

/** Settings > About and diagnostics: versions, this phone, the self-test, a shareable report, privacy in plain words. */
export function AboutScreen() {
  const d = getDeviceProfile();
  const eng = useEngineStatus();
  const settings = useSettings();
  const slots = useStorageSlots();
  const devices = useBackendDevices();
  const voice = useVoicePrefs();
  const stt = useStt();
  const sec = useSecurity();
  const gate = useNetworkGate();
  const integrity = useIntegrity();
  const { facts } = useMemory();
  const budget = useMemoryBudget();
  const [test, setTest] = useState<SelfTestResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);

  const facts1: Array<[string, string]> = [
    ['App version', APP_VERSION],
    ['Phone', d.name],
    ['System', `${d.osName} ${d.osVersion ?? ''}${d.apiLevel ? ` (API ${d.apiLevel})` : ''}`.trim()],
    ['Memory', d.totalRamBytes ? formatBytes(d.totalRamBytes) : 'unknown'],
    ['CPU', d.cpuArchitectures.length ? d.cpuArchitectures.join(', ') : 'unknown'],
    ['Engine', eng.backend ? `${eng.backend} · ${eng.nCtx} tokens of context` : 'No model loaded'],
  ];

  // Counts and settings only: no chat text, no memory text, no instructions you typed, no folder paths.
  const sections = (): DiagSection[] => [
    { title: 'App', rows: [['Version', APP_VERSION], ['Phone', d.name], ['System', `${d.osName} ${d.osVersion ?? ''}`], ['API level', d.apiLevel], ['Memory', d.totalRamBytes ? formatBytes(d.totalRamBytes) : null], ['CPU', d.cpuArchitectures.join(', ')]] },
    {
      title: 'Engine',
      rows: [
        ['State', eng.state],
        ['Model', eng.modelName],
        ['Backend', eng.backend],
        ['Devices', devices.devices.map((x) => `${x.deviceName} (${x.type})`).join('; ')],
        ['Context', eng.nCtx || null],
        ['Last speed (tok/s)', oneDecimal(eng.lastTokPerSec)],
        ['Last first token (ms)', wholeMs(eng.ttftMs)],
        ['Load (ms)', wholeMs(eng.loadMs)],
        ['Vision', eng.vision],
        ['Fallbacks', eng.fallbacks.join('; ')],
        ['KV cache', `${eng.kvCache.status}${eng.kvCache.reason ? `: ${eng.kvCache.reason}` : ''}`],
        ['Speculative', `${eng.speculative.requested}, active ${eng.speculative.active}${eng.speculative.reason ? `: ${eng.speculative.reason}` : ''}`],
        ['Error', eng.error],
      ],
    },
    { title: 'Compute settings', rows: [...Object.entries(settings.compute), ...Object.entries(settings.sampling)] as DiagSection['rows'] },
    {
      title: 'Data',
      rows: [
        ['Storage locations', slots.map((x) => `${x.kind}${x.isPrimary ? ' (main)' : ''}, ${x.modelFiles} models, ${x.usedBytes !== null ? formatBytes(x.usedBytes) : '?'} used`).join('; ')],
        ['Memory facts', facts.length],
        ['Memory characters', budget.usedChars],
        ['Last integrity check', integrity.report?.summary],
      ],
    },
    {
      title: 'Privacy and voice',
      rows: [
        ['Offline strict', settings.offlineStrict],
        ['Blocked requests', gate.blockedCount],
        ['Incognito by default', settings.incognitoDefault],
        ['Auto-delete days', settings.autoPurgeDays],
        ['App lock', sec.appLock],
        ['Lock method', sec.method],
        ['Speech engine', stt.engine],
        ['Live microphone', stt.micCapture],
        ['Speech model', voice.sttModelId],
        ['Read aloud', voice.ttsEnabled],
      ],
    },
  ];

  const share = async () => {
    try {
      await Share.share({ title: 'CHIWIWI diagnostics', message: buildDiagnostics(sections(), new Date()) });
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Screen title="About" onBack={goBack} scroll>
      <Group index={1} title="This app and this phone">
        <Rows>
          {facts1.map(([k, v]) => (
            <ListRow key={k} title={v} subtitle={k} />
          ))}
        </Rows>
      </Group>

      <Group index={2} title="Self-test" hint="Loads the model if needed, asks it one fixed question and reports what really happened.">
        <Button
          label="Test the model"
          icon="play"
          busyLabel="Testing..."
          onPress={async () => {
            setTestError(null);
            try {
              setTest(await runSelfTest());
            } catch (e) {
              setTest(null);
              setTestError(e instanceof Error ? e.message : String(e));
            }
          }}
        />
        {testError ? <Notice tone="danger">{testError}</Notice> : null}
        {test ? <SelfTestResultView r={test} /> : null}
      </Group>

      <Group index={3} title="Diagnostics" hint="A text report for support. It holds settings, counts and engine numbers, never your chats, memory or typed instructions.">
        <Button label={showReport ? 'Hide the report' : 'Show the report'} variant="quiet" onPress={() => setShowReport((v) => !v)} />
        {showReport ? (
          <Text variant="small" selectable>
            {buildDiagnostics(sections(), new Date())}
          </Text>
        ) : null}
        <Button label="Share the report" icon="file" variant="quiet" onPress={share} />
      </Group>

      <Group index={4} title="Privacy, plainly">
        <Text tone="muted">Chats are answered by a model running on this phone and use no internet. The internet is used only to download models (and speech models) from huggingface.co, and only when you start a download.</Text>
        <Text tone="muted">The microphone is used only while voice mode is listening, and the camera only when you take a photo to attach. Speech to text and spoken replies run on the phone.</Text>
        <Text tone="muted">Your chats, memory and models live in the storage locations you chose. They are not encrypted, so anyone who can open that folder can read them. Incognito chats are never written to disk.</Text>
        <Text tone="muted">There are no accounts, no analytics and no tracking.</Text>
      </Group>

      <Group index={5} title="Credits">
        <Text tone="muted">Runs on llama.cpp through llama.rn, and Whisper through whisper.rn. Models belong to their authors; check each model's license on its Hugging Face page.</Text>
      </Group>
    </Screen>
  );
}

const useStyles = makeStyles(({ space }) => ({
  stack: { gap: space.md },
}));
