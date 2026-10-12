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

const THEME_NAME = { system: 'Follows phone', dark: 'Nocturne Velvet', light: 'Crystal Aurora' } as const;

/** Clean minimalist settings hub organized into clear companion and app categories. */
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
      <Group title="Companion & Persona" hint="Personality, emotional memory, and intimacy settings.">
        <Rows>
          <ListRow icon="persona" title="Companion Profile" value={ARCHETYPES[settings.archetype]?.name ?? 'Alauna'} subtitle="Customize name, persona, tone and backstory." onPress={() => push('settings/soul')} />
          <ListRow icon="shield" title="Model Freedom" subtitle="Uncensored roleplay, emotional reactivity, and unfiltered expression." onPress={() => push('soul/freedom')} />
          <ListRow icon="memory" title="Intimate Memory" value={`${facts.length} facts`} subtitle={`${budget.included.length} active facts recalled during chat`} onPress={() => push('settings/memory')} />
        </Rows>
      </Group>

      <Group title="Models & Voice" hint={eng.headline}>
        <Rows>
          <ListRow icon="models" title="Model Vault" subtitle="Curated uncensored roleplay and mobile AI models." onPress={() => push('models')} />
          <ListRow icon="speaker" title="Live Voice & Speech" value={voice.ttsEnabled ? 'Active' : 'Muted'} subtitle={`Voice recognition: ${getSpeechModel(voice.sttModelId)?.name ?? voice.sttModelId}`} onPress={() => push('settings/audio')} />
          <ListRow icon="download" title="Downloads Manager" subtitle="Download progress and model files." onPress={() => push('downloads')} />
        </Rows>
      </Group>

      <Group title="Data & Privacy" hint="100% offline and secure on this device.">
        <Rows>
          <ListRow icon="storage" title="Storage Location" subtitle={storage.config ? describeLocation(storage.config) : 'Internal app storage'} onPress={() => push('settings/storage')} />
          <ListRow icon="shield" title="Strict Offline Mode" subtitle="Blocks all network requests except explicit model downloads." switchValue={settings.offlineStrict} onSwitch={(v) => updateSettings({ offlineStrict: v })} />
          <ListRow icon="incognito" title="Incognito Chats" subtitle="New conversations are never written to disk." switchValue={settings.incognitoDefault} onSwitch={(v) => updateSettings({ incognitoDefault: v })} />
          <ListRow icon="lock" title="Biometric App Lock" subtitle="Protect intimate chats with fingerprint or face ID." value={sec.appLock ? 'Enabled' : 'Disabled'} onPress={() => push('settings/security')} />
        </Rows>
      </Group>

      <Group title="Appearance & Diagnostics">
        <Rows>
          <ListRow icon="sun" title="Theme & Display" subtitle="Crystal Aurora & Nocturne Velvet, text size, motion." value={THEME_NAME[pref]} onPress={() => push('settings/appearance')} />
          <ListRow
            icon="chip"
            title="Engine & Compute"
            value={c.backend === 'gpu' ? 'GPU' : 'CPU'}
            subtitle={`${c.threads === null ? 'Auto' : c.threads} threads · ${c.nCtx === null ? 'Auto' : c.nCtx} context`}
            onPress={() => push('settings/advanced')}
          />
          <ListRow icon="settings" title="About ALAUNA" subtitle="Device hardware profile, diagnostics, and build info." value={`v${APP_VERSION}`} onPress={() => push('settings/about')} />
        </Rows>
      </Group>

      <Text variant="small" tone="muted" style={{ textAlign: 'center', marginVertical: 12 }}>
        {`ALAUNA v${APP_VERSION} · 100% offline on-device AI`}
      </Text>
    </Screen>
  );
}
