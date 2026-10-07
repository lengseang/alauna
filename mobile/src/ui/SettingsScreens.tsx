import React, { useState } from 'react';
import { Platform, View } from 'react-native';
import appJson from '../../app.json';
import { MODEL_CATALOG, getModel } from '../core/catalog.ts';
import { defaultContext, estimateRamBytes, fitFor, FIT_LABEL } from '../core/fit.ts';
import { formatBytes } from '../core/format.ts';
import { getDeviceProfile } from '../services/device.ts';
import { engine, useEngineState } from '../services/engine.ts';
import { onStorageChanged } from '../services/lifecycle.ts';
import { installedBytes } from '../services/modelLibrary.ts';
import { updateSettings, useSettings } from '../services/settings.ts';
import { describeLocation, freeSpaceBytes, useStorage } from '../services/storage.ts';
import { showToast } from '../services/toast.ts';
import { useThemePref, type ThemePref } from '../theme';
import { Button } from './Button';
import { Card } from './Card';
import { Divider } from './Divider';
import { goBack, push } from './nav';
import { Notice } from './Notice';
import { Row } from './Row';
import { Screen } from './Screen';
import { Sheet } from './Sheet';
import { StoragePicker } from './StoragePicker';
import { Text } from './Text';

const THEMES: Array<{ pref: ThemePref; title: string; subtitle: string }> = [
  { pref: 'system', title: 'Follow my phone', subtitle: 'Nyx at night, Helios by day' },
  { pref: 'dark', title: 'Nyx', subtitle: 'Starry night' },
  { pref: 'light', title: 'Helios', subtitle: 'Sunlit day' },
];

/** Flat list, six rows: Appearance (3 choices), Storage, Advanced, About. Nothing is nested deeper than one page. */
export function SettingsHome() {
  const storage = useStorage();
  const { pref, setPref } = useThemePref();
  return (
    <Screen title="Settings" onBack={goBack} scroll>
      <Text variant="label">Appearance</Text>
      <View>
        {THEMES.map((t, i) => (
          <React.Fragment key={t.pref}>
            {i > 0 ? <Divider /> : null}
            <Row title={t.title} subtitle={t.subtitle} selected={pref === t.pref} onPress={() => setPref(t.pref)} />
          </React.Fragment>
        ))}
      </View>
      <Divider />
      <View>
        <Row title="Storage" subtitle={storage.config ? describeLocation(storage.config) : 'Not set'} onPress={() => push('settings/storage')} />
        <Divider />
        <Row title="Advanced" subtitle="Memory length, CPU threads, GPU, thinking" onPress={() => push('settings/advanced')} />
        <Divider />
        <Row title="About and privacy" subtitle="Your phone, the engine, what is stored" onPress={() => push('settings/about')} />
      </View>
    </Screen>
  );
}

export function StorageSettings() {
  const storage = useStorage();
  const [changing, setChanging] = useState(false);
  const used = installedBytes(MODEL_CATALOG);
  const free = freeSpaceBytes();
  const cfg = storage.config;
  return (
    <Screen title="Storage" onBack={goBack} scroll>
      {cfg ? (
        <Card>
          <Text variant="strong">{cfg.mode === 'internal' ? 'App storage' : 'Your folder'}</Text>
          <Text variant="small" selectable>
            {cfg.rootPath}
          </Text>
          <Text variant="small">{`Models on disk: ${formatBytes(used)}${free ? ` · Free space: ${formatBytes(free)}` : ''}`}</Text>
          <Text variant="label" tone={storage.status === 'ready' ? 'accent' : 'danger'}>
            {storage.status === 'ready' ? 'Ready' : 'Problem'}
          </Text>
          {storage.status !== 'ready' && storage.reason ? <Notice tone="danger">{storage.reason}</Notice> : null}
        </Card>
      ) : null}

      {!changing ? (
        <Button label="Change storage location" variant="quiet" onPress={() => setChanging(true)} />
      ) : (
        <>
          <Notice>
            Changing the location does not move your files. Models and chats stay in the old place (copy the CHIWIWI folder yourself if you want them). The model that is loaded now will be unloaded.
          </Notice>
          <StoragePicker
            onDone={async () => {
              await onStorageChanged();
              setChanging(false);
              showToast('Storage location updated');
            }}
          />
          <Button label="Keep the current location" variant="text" onPress={() => setChanging(false)} />
        </>
      )}
    </Screen>
  );
}

const CTX_OPTIONS = [null, 1024, 2048, 3072, 4096, 6144, 8192] as const;
const THREAD_OPTIONS = [null, 2, 4, 6, 8] as const;

/** A row showing the current value; tapping opens a sheet with radio rows (no hidden cycling). */
function ChoiceRow<T extends number | null>({ title, options, value, onChange, label }: { title: string; options: readonly T[]; value: T; onChange: (v: T) => void; label: (v: T) => string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Row
        title={title}
        right={
          <Text variant="label" tone="accent">
            {label(value)}
          </Text>
        }
        onPress={() => setOpen(true)}
        accessibilityLabel={`${title}, ${label(value)}`}
      />
      <Sheet visible={open} onClose={() => setOpen(false)} title={title}>
        {options.map((o) => (
          <Row
            key={String(o)}
            title={label(o)}
            selected={o === value}
            onPress={() => {
              onChange(o);
              setOpen(false);
            }}
          />
        ))}
      </Sheet>
    </>
  );
}

export function AdvancedSettings() {
  const s = useSettings();
  const eng = useEngineState();
  const device = getDeviceProfile();
  const auto = defaultContext(device.totalRamBytes);
  const nCtx = s.contextOverride ?? auto;
  const active = getModel(s.activeModelId);
  const fit = active ? fitFor(active, device.totalRamBytes, nCtx) : null;
  const loaded = eng.status === 'ready' || eng.status === 'generating';
  const onOff = (v: boolean) => (v ? 'On' : 'Off');

  return (
    <Screen title="Advanced" onBack={goBack} scroll>
      <Notice>{`These apply the next time a model is loaded. Defaults suit your phone (${device.totalRamBytes ? formatBytes(device.totalRamBytes) : 'unknown'} memory), so most people never change them.`}</Notice>
      <View>
        <ChoiceRow
          title="Memory length"
          options={CTX_OPTIONS}
          value={s.contextOverride}
          onChange={(v) => updateSettings({ contextOverride: v })}
          label={(v) => (v === null ? `Auto (${auto})` : `${v} tokens`)}
        />
        <Divider />
        <ChoiceRow title="CPU threads" options={THREAD_OPTIONS} value={s.threads} onChange={(v) => updateSettings({ threads: v })} label={(v) => (v === null ? 'Auto' : String(v))} />
        {Platform.OS === 'android' ? (
          <>
            <Divider />
            <Row
              title="Use GPU (experimental)"
              subtitle="Can be faster on some phones, slower or unstable on others. If a model fails to load, turn this off."
              right={
                <Text variant="label" tone="accent">
                  {onOff(s.useGpu)}
                </Text>
              }
              onPress={() => updateSettings({ useGpu: !s.useGpu })}
              accessibilityLabel={`Use GPU, ${onOff(s.useGpu)}`}
            />
          </>
        ) : null}
        <Divider />
        <Row
          title="Let reasoning models think"
          subtitle="Better answers to hard questions, but slower. Also in the model sheet in Chat."
          right={
            <Text variant="label" tone="accent">
              {onOff(s.thinkingEnabled)}
            </Text>
          }
          onPress={() => updateSettings({ thinkingEnabled: !s.thinkingEnabled })}
          accessibilityLabel={`Let reasoning models think, ${onOff(s.thinkingEnabled)}`}
        />
      </View>
      {active && fit ? <Text variant="small">{`${active.name} at ${nCtx} tokens needs about ${formatBytes(estimateRamBytes(active, nCtx))} of memory · ${FIT_LABEL[fit]}.`}</Text> : null}
      {loaded && active ? (
        <Button
          label={`Reload ${active.name}`}
          variant="quiet"
          busyLabel="Reloading..."
          onPress={async () => {
            await engine.unmount();
            const r = await engine.mount(active);
            showToast(r.ok ? 'Model reloaded' : r.message);
          }}
        />
      ) : null}
    </Screen>
  );
}

export function AboutSettings() {
  const d = getDeviceProfile();
  const eng = useEngineState();
  const v = (appJson as { expo: { version: string } }).expo.version;
  const facts: Array<[string, string]> = [
    ['App version', v],
    ['Phone', d.name],
    ['System', `${d.osName} ${d.osVersion ?? ''}${d.apiLevel ? ` (API ${d.apiLevel})` : ''}`],
    ['Memory', d.totalRamBytes ? formatBytes(d.totalRamBytes) : 'unknown'],
    ['CPU', d.cpuArchitectures.length ? d.cpuArchitectures.join(', ') : 'unknown'],
    ['Engine', eng.info ? `${eng.info.backend} · memory ${eng.info.nCtx} tokens` : 'No model loaded'],
  ];
  return (
    <Screen title="About and privacy" onBack={goBack} scroll>
      <View>
        {facts.map(([k, val], i) => (
          <React.Fragment key={k}>
            {i > 0 ? <Divider /> : null}
            <Row title={val} subtitle={k} />
          </React.Fragment>
        ))}
      </View>
      <Text variant="label">Privacy, plainly</Text>
      <Text tone="muted">Chats are answered by a model running on this phone and use no internet. The internet is used only to download models from huggingface.co.</Text>
      <Text tone="muted">
        Your chats, memory and models live in the storage folder you chose. They are not encrypted, so anyone who can open that folder can read them. Incognito chats are never written to disk.
      </Text>
      <Text tone="muted">There are no accounts, no analytics and no tracking.</Text>
      <Text variant="label">Credits</Text>
      <Text tone="muted">Runs on llama.cpp through llama.rn. Models belong to their authors; check each model's license on its Hugging Face page.</Text>
    </Screen>
  );
}
