import React, { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import appJson from '../../app.json';
import { MODEL_CATALOG, getModel } from '../core/catalog.ts';
import { defaultContext, estimateRamBytes, fitFor, FIT_LABEL } from '../core/fit.ts';
import { formatBytes } from '../core/format.ts';
import { buildSystemPrompt } from '../core/persona.ts';
import { ChevronRightIcon, CpuIcon, FolderIcon, InfoIcon, SlidersIcon, SoulIcon, StorageIcon, ThinkIcon, TrashIcon } from '../components/Icons';
import { getDeviceProfile } from '../services/device.ts';
import { engine, useEngineState } from '../services/engine.ts';
import { onStorageChanged } from '../services/lifecycle.ts';
import { addMemory, clearMemory, deleteMemory, memoryStore } from '../services/memory.ts';
import { installedBytes } from '../services/modelLibrary.ts';
import { updateSettings, useSettings } from '../services/settings.ts';
import { describeLocation, freeSpaceBytes, useStorage } from '../services/storage.ts';
import { showToast } from '../services/toast.ts';
import { useSyncExternalStore } from 'react';
import { Btn } from './Btn';
import { Badge, Banner, Card, SectionTitle } from './kit';
import { confirm } from './confirm';
import { goBack, push, type Route } from './nav';
import { Screen } from './Screen';
import { SoulEditor } from './SoulEditor';
import { StoragePicker } from './StoragePicker';
import { colors, font, radius } from './theme';

function Row({ icon, title, sub, onPress }: { icon: React.ReactNode; title: string; sub?: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
      <View style={styles.rowIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        {sub ? <Text style={styles.rowSub} numberOfLines={2}>{sub}</Text> : null}
      </View>
      <ChevronRightIcon />
    </Pressable>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 6 }} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

// ------------------------------------------------------------------------------------ home
export function SettingsHome() {
  const storage = useStorage();
  const settings = useSettings();
  const facts = useSyncExternalStore(memoryStore.subscribe, memoryStore.getState).facts;
  const go = (r: Route) => () => push(r);
  return (
    <Screen title="Settings" onBack={goBack}>
      <Body>
        <SectionTitle>Chat</SectionTitle>
        <Row icon={<SoulIcon size={20} color={colors.text} />} title="Soul & personality" sub="Default tone for new chats" onPress={go('settings/soul')} />
        <Row icon={<ThinkIcon size={20} color={colors.text} />} title="Memory" sub={`${facts.length} thing${facts.length === 1 ? '' : 's'} I remember about you`} onPress={go('settings/memory')} />
        <SectionTitle>Models & storage</SectionTitle>
        <Row icon={<CpuIcon size={20} color={colors.text} />} title="Model Hub" sub={settings.activeModelId ? `Active: ${getModel(settings.activeModelId)?.name ?? settings.activeModelId}` : 'Download and load a model'} onPress={go('models')} />
        <Row icon={<StorageIcon size={20} color={colors.text} />} title="Storage" sub={storage.config ? describeLocation(storage.config) : 'Not set'} onPress={go('settings/storage')} />
        <SectionTitle>System</SectionTitle>
        <Row icon={<SlidersIcon size={20} color={colors.text} />} title="Advanced" sub="Context length, CPU threads, GPU" onPress={go('settings/advanced')} />
        <Row icon={<InfoIcon size={20} color={colors.text} />} title="About & privacy" sub="Your phone, the engine, what is stored" onPress={go('settings/about')} />
      </Body>
    </Screen>
  );
}

// ------------------------------------------------------------------------------------ soul
export function SoulSettings() {
  const s = useSettings();
  const preview = useMemo(() => buildSystemPrompt({ archetype: s.archetype, pad: s.pad }), [s.archetype, s.pad]);
  return (
    <Screen title="Soul & personality" subtitle="Applies to NEW chats" onBack={goBack}>
      <Body>
        <Banner tone="accent">Change the personality of the chat you are in with the personality button at the top of Chat. This sets the default for chats you start from now on.</Banner>
        <View style={{ height: 8 }} />
        <SoulEditor showBackstory={false} value={{ archetype: s.archetype, pad: s.pad }} onChange={(v) => updateSettings({ archetype: v.archetype, pad: v.pad })} />
        <SectionTitle>What the AI is told</SectionTitle>
        <Card>
          <Text selectable style={styles.mono}>{preview}</Text>
        </Card>
      </Body>
    </Screen>
  );
}

// ------------------------------------------------------------------------------------ storage
export function StorageSettings() {
  const storage = useStorage();
  const [changing, setChanging] = useState(false);
  const used = installedBytes(MODEL_CATALOG);
  const free = freeSpaceBytes();
  const cfg = storage.config;
  return (
    <Screen title="Storage" subtitle="Where models and chats live" onBack={goBack}>
      <Body>
        {cfg ? (
          <Card>
            <View style={styles.line}>
              <FolderIcon size={18} color={colors.accent} />
              <Text style={styles.rowTitle}>{cfg.mode === 'internal' ? 'App storage' : 'Your folder'}</Text>
              <Badge label={storage.status === 'ready' ? 'READY' : 'PROBLEM'} tone={storage.status === 'ready' ? 'good' : 'bad'} />
            </View>
            <Text selectable style={styles.mono}>{cfg.rootPath}</Text>
            <Text style={styles.rowSub}>
              Models on disk: {formatBytes(used)}
              {free ? ` · Free space: ${formatBytes(free)}` : ''}
            </Text>
            {storage.status !== 'ready' && storage.reason ? <Text style={{ color: colors.bad, fontSize: font.sm }}>{storage.reason}</Text> : null}
          </Card>
        ) : null}

        {!changing ? (
          <Btn variant="primary" label="Change storage location" onPress={() => setChanging(true)} style={{ marginTop: 12 }} />
        ) : (
          <View style={{ gap: 12, marginTop: 12 }}>
            <Banner tone="warn">Changing the location does not move your files. Models and chats stay in the old place (copy the CHIWIWI folder yourself if you want them). The model that is loaded now will be unloaded.</Banner>
            <StoragePicker
              onDone={async () => {
                await onStorageChanged();
                setChanging(false);
                showToast('Storage location updated');
              }}
            />
            <Btn variant="ghost" label="Keep the current location" onPress={() => setChanging(false)} />
          </View>
        )}
      </Body>
    </Screen>
  );
}

// ------------------------------------------------------------------------------------ memory
export function MemorySettings() {
  const { facts } = useSyncExternalStore(memoryStore.subscribe, memoryStore.getState);
  const [text, setText] = useState('');
  const add = () => {
    const r = addMemory(text);
    if (r.ok) setText('');
    else showToast(r.reason);
  };
  return (
    <Screen title="Memory" subtitle="Facts I keep in mind in every chat" onBack={goBack}>
      <Body>
        <Banner tone="accent">These facts are added to the instructions the AI gets, so keep them short. You can also type /remember followed by a fact in any chat. They never leave this phone.</Banner>
        <View style={styles.addRow}>
          <TextInput value={text} onChangeText={setText} placeholder="e.g. I live in Phnom Penh" placeholderTextColor={colors.faint} style={styles.input} maxLength={200} onSubmitEditing={add} returnKeyType="done" accessibilityLabel="New memory" />
          <Btn label="Add" variant="primary" onPress={add} disabled={!text.trim()} />
        </View>
        <SectionTitle>Remembered</SectionTitle>
        {facts.length === 0 ? <Text style={styles.rowSub}>Nothing yet.</Text> : null}
        {facts.map((f) => (
          <View key={f.id} style={styles.factRow}>
            <Text style={[styles.rowTitle, { flex: 1, fontWeight: '500' }]}>{f.text}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`Forget ${f.text}`} hitSlop={10} onPress={() => deleteMemory(f.id)}>
              <TrashIcon size={16} color={colors.faint} />
            </Pressable>
          </View>
        ))}
        {facts.length > 0 ? (
          <Btn
            variant="danger"
            label="Forget everything"
            style={{ marginTop: 12 }}
            onPress={async () => {
              if (await confirm('Forget everything?', 'All remembered facts will be deleted.', 'Forget', true)) clearMemory();
            }}
          />
        ) : null}
      </Body>
    </Screen>
  );
}

// ------------------------------------------------------------------------------------ advanced
const CTX_OPTIONS = [null, 1024, 2048, 3072, 4096, 6144, 8192] as const;
const THREAD_OPTIONS = [null, 2, 4, 6, 8] as const;

function Choice<T extends number | null>({ options, value, onChange, label }: { options: readonly T[]; value: T; onChange: (v: T) => void; label: (v: T) => string }) {
  return (
    <View style={styles.choices}>
      {options.map((o) => (
        <Pressable key={String(o)} accessibilityRole="button" accessibilityState={{ selected: o === value }} onPress={() => onChange(o)} style={[styles.choice, o === value && { backgroundColor: colors.white, borderColor: colors.white }]}>
          <Text style={[styles.choiceText, o === value && { color: colors.black, fontWeight: '700' }]}>{label(o)}</Text>
        </Pressable>
      ))}
    </View>
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

  return (
    <Screen title="Advanced" onBack={goBack}>
      <Body>
        <Banner tone="neutral">These apply the next time a model is loaded. Defaults are chosen for your phone ({device.totalRamBytes ? formatBytes(device.totalRamBytes) : 'unknown'} RAM), so most people never need to change them.</Banner>

        <SectionTitle>Context length (the AI&apos;s short-term memory)</SectionTitle>
        <Choice options={CTX_OPTIONS} value={s.contextOverride} onChange={(v) => updateSettings({ contextOverride: v })} label={(v) => (v === null ? `Auto (${auto})` : String(v))} />
        {active && fit ? (
          <Text style={styles.rowSub}>
            With {active.name} at {nCtx} tokens: about {formatBytes(estimateRamBytes(active, nCtx))} of RAM · {FIT_LABEL[fit]}. Longer context remembers more of the chat but uses more memory.
          </Text>
        ) : null}

        <SectionTitle>CPU threads</SectionTitle>
        <Choice options={THREAD_OPTIONS} value={s.threads} onChange={(v) => updateSettings({ threads: v })} label={(v) => (v === null ? 'Auto' : String(v))} />
        <Text style={styles.rowSub}>Auto uses your phone&apos;s fastest cores. More threads is not always faster.</Text>

        {Platform.OS === 'android' ? (
          <>
            <SectionTitle>Graphics chip</SectionTitle>
            <Card>
              <View style={styles.line}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Use GPU (experimental)</Text>
                  <Text style={styles.rowSub}>Can be faster on some phones and slower or unstable on others. If a model fails to load, turn this off.</Text>
                </View>
                <Switch value={s.useGpu} onValueChange={(v) => updateSettings({ useGpu: v })} thumbColor={s.useGpu ? colors.white : colors.faint} trackColor={{ false: colors.surface3, true: colors.accent }} accessibilityLabel="Use GPU" />
              </View>
            </Card>
          </>
        ) : null}

        <SectionTitle>Thinking</SectionTitle>
        <Card>
          <View style={styles.line}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Let reasoning models think</Text>
              <Text style={styles.rowSub}>For models that can switch it (Qwen3, SmolLM3...). Thinking gives better answers to hard questions but is slower. You can also toggle it in Chat.</Text>
            </View>
            <Switch value={s.thinkingEnabled} onValueChange={(v) => updateSettings({ thinkingEnabled: v })} thumbColor={s.thinkingEnabled ? colors.white : colors.faint} trackColor={{ false: colors.surface3, true: colors.accent }} accessibilityLabel="Thinking" />
          </View>
        </Card>

        {loaded && active ? (
          <Btn
            variant="secondary"
            label={`Reload ${active.name} with these settings`}
            busyLabel="Reloading..."
            style={{ marginTop: 16 }}
            onPress={async () => {
              await engine.unmount();
              const r = await engine.mount(active);
              showToast(r.ok ? 'Model reloaded' : r.message);
            }}
          />
        ) : null}
      </Body>
    </Screen>
  );
}

// ------------------------------------------------------------------------------------ about
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
    ['Engine', eng.info ? `${eng.info.backend} · context ${eng.info.nCtx}` : 'No model loaded'],
  ];
  return (
    <Screen title="About & privacy" onBack={goBack}>
      <Body>
        <Card>
          {facts.map(([k, val]) => (
            <View key={k} style={styles.line}>
              <Text style={[styles.rowSub, { width: 96 }]}>{k}</Text>
              <Text style={[styles.rowTitle, { flex: 1, fontWeight: '500' }]}>{val}</Text>
            </View>
          ))}
        </Card>
        <SectionTitle>Privacy, plainly</SectionTitle>
        <Card>
          <Text style={styles.para}>• Chats are answered by a model running on this phone. Chatting uses no internet.</Text>
          <Text style={styles.para}>• The internet is used only by the Model Hub, to download models from huggingface.co.</Text>
          <Text style={styles.para}>• Your chats, memory and models are stored in the storage folder you chose. They are not encrypted, so anyone who can open that folder can read them.</Text>
          <Text style={styles.para}>• Incognito chats are never written to disk.</Text>
          <Text style={styles.para}>• There are no accounts, no analytics and no tracking.</Text>
        </Card>
        <SectionTitle>Credits</SectionTitle>
        <Card>
          <Text style={styles.para}>Runs on llama.cpp through llama.rn. Models belong to their authors; check each model&apos;s license on its Hugging Face page.</Text>
        </Card>
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 8 },
  rowIcon: { width: 28, alignItems: 'center' },
  rowTitle: { color: colors.text, fontSize: font.md, fontWeight: '600' },
  rowSub: { color: colors.faint, fontSize: font.sm, lineHeight: 18 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mono: { color: colors.muted, fontFamily: 'monospace', fontSize: 12, lineHeight: 18 },
  para: { color: colors.muted, fontSize: font.md, lineHeight: 21 },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 12 },
  input: { flex: 1, backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, color: colors.text, fontSize: font.md, paddingHorizontal: 12, minHeight: 44 },
  factRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 6 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, paddingVertical: 8, paddingHorizontal: 14 },
  choiceText: { color: colors.muted, fontSize: font.sm },
});
