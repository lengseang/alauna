import React from 'react';
import { ARCHETYPES, describePad } from '../../core/persona.ts';
import { getSpeechModel } from '../../core/voiceModels.ts';
import { useEngineStatus } from '../../services/engine.ts';
import { useMemory, useMemoryBudget } from '../../services/memory.ts';
import { updateSettings, useSettings } from '../../services/settings.ts';
import { describeLocation, useStorage, useStorageSlots } from '../../services/storage.ts';
import { useSecurity } from '../../services/security.ts';
import { useVoicePrefs } from '../../services/voice/prefs.ts';
import { useThemePref } from '../../theme';
import { goBack, push } from '../nav';
import { ListRow } from '../Row';
import { Screen } from '../Screen';
import { Text } from '../Text';
import { onOff } from './logic';
import { APP_VERSION, Group, Rows } from './parts';

const THEME_NAME = { system: 'Follows phone', dark: 'Nyx', light: 'Helios' } as const;

/** The Settings hub: eight roman-numeral sections, each a few rows, every row one tap from its screen. */
export function SettingsHome() {
  const settings = useSettings();
  const eng = useEngineStatus();
  const { facts } = useMemory();
  const budget = useMemoryBudget();
  const storage = useStorage();
  const slots = useStorageSlots();
  const voice = useVoicePrefs();
  const sec = useSecurity();
  const { pref } = useThemePref();
  const c = settings.compute;

  return (
    <Screen title="Settings" onBack={goBack} scroll>
      <Group index={1} title="Soul and memory" hint="Who answers, and what it remembers about you.">
        <Rows>
          <ListRow icon="persona" title="Soul" value={ARCHETYPES[settings.archetype].name} subtitle={describePad(settings.pad).join(' ')} onPress={() => push('settings/soul')} />
          <ListRow icon="persona" title="Soul Library & Studio" subtitle="10 archetypes, custom personalities, and 9-chapter studio." onPress={() => push('soul/library')} />
          <ListRow icon="shield" title="Model Freedom" subtitle="Unfiltered expression, anti-sycophancy, and anti-disclaimer." onPress={() => push('soul/freedom')} />
          <ListRow icon="chip" title="Knowledge Brain" subtitle="On-device semantic knowledge graph ('Graphify')." onPress={() => push('soul/graph')} />
          <ListRow icon="memory" title="Memory" value={`${facts.length}`} subtitle={`${budget.included.length} of ${facts.length} facts reach the model`} onPress={() => push('settings/memory')} />
        </Rows>
      </Group>

      <Group index={2} title="Models" hint={eng.headline}>
        <Rows>
          <ListRow icon="models" title="Model Vault" subtitle="Every model, with filters, fit for this phone and downloads." onPress={() => push('models')} />
          <ListRow icon="download" title="Downloads" subtitle="Queue, speed, pause and resume." onPress={() => push('downloads')} />
          <ListRow icon="bolt" title="Speculative decoding" subtitle="A draft that makes a big model answer faster." onPress={() => push('speculative')} />
        </Rows>
      </Group>

      <Group index={3} title="Data and storage" hint="Where chats and models live.">
        <Rows>
          <ListRow
            icon="storage"
            title="Storage locations"
            subtitle={storage.config ? describeLocation(storage.config) : 'Not set'}
            value={slots.length > 0 ? `${slots.length} ${slots.length === 1 ? 'location' : 'locations'}` : undefined}
            onPress={() => push('settings/storage')}
          />
        </Rows>
      </Group>

      <Group index={4} title="Audio and voice" hint="Talk to it and hear it.">
        <Rows>
          <ListRow icon="speaker" title="Listening and speaking" value={voice.ttsEnabled ? 'Reads aloud' : 'Silent'} subtitle={`Listening with ${getSpeechModel(voice.sttModelId)?.name ?? voice.sttModelId}`} onPress={() => push('settings/audio')} />
        </Rows>
      </Group>

      <Group index={5} title="Security and privacy">
        <Rows>
          <ListRow icon="shield" title="Offline only (strict)" subtitle="Blocks every network request except downloads you start." switchValue={settings.offlineStrict} onSwitch={(v) => updateSettings({ offlineStrict: v })} />
          <ListRow icon="incognito" title="Incognito by default" subtitle="New chats are never written to disk." switchValue={settings.incognitoDefault} onSwitch={(v) => updateSettings({ incognitoDefault: v })} />
          <ListRow icon="lock" title="App lock and data checks" subtitle="App lock, auto-delete, integrity check, erase." value={`Lock ${onOff(sec.appLock)}`} onPress={() => push('settings/security')} />
        </Rows>
      </Group>

      <Group index={6} title="Advanced compute" hint="Backend, threads, context, KV cache and live telemetry.">
        <Rows>
          <ListRow
            icon="chip"
            title="Backend and engine"
            value={c.backend === 'gpu' ? 'GPU (experimental)' : 'CPU'}
            subtitle={`${c.threads === null ? 'Auto' : c.threads} threads · ${c.nCtx === null ? 'auto' : c.nCtx} context · flash attention ${c.flashAttn}`}
            onPress={() => push('settings/advanced')}
          />
        </Rows>
      </Group>

      <Group index={7} title="Appearance">
        <Rows>
          <ListRow icon="sun" title="Look and feel" subtitle="Theme, text size, haptics, motion." value={THEME_NAME[pref]} onPress={() => push('settings/appearance')} />
        </Rows>
      </Group>

      <Group index={8} title="About and diagnostics">
        <Rows>
          <ListRow icon="settings" title="About this app" subtitle="Your phone, the self-test, the diagnostics report, privacy in plain words." value={APP_VERSION} onPress={() => push('settings/about')} />
        </Rows>
      </Group>

      <Text variant="small" tone="muted">{`CHIWIWI ${APP_VERSION} · answers are written on this phone`}</Text>
    </Screen>
  );
}
