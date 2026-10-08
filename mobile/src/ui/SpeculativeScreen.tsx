import React from 'react';
import { View } from 'react-native';
import { MODEL_CATALOG, draftOptions, getModel, type ModelSpec } from '../core/catalog.ts';
import { formatBytes, formatPercent } from '../core/format.ts';
import { downloads, useDownloadItems } from '../services/downloads.ts';
import { engine, useEngineStatus } from '../services/engine.ts';
import { updateSection, updateSettings, useSettings } from '../services/settings.ts';
import { showToast } from '../services/toast.ts';
import { makeStyles } from '../theme';
import { Button } from './Button';
import { Card } from './Card';
import { Divider } from './Divider';
import { Notice } from './Notice';
import { Row } from './Row';
import { Screen } from './Screen';
import { SectionHeader } from './SectionHeader';
import { Slider } from './Slider';
import { Stat } from './Stat';
import { Tag } from './Tag';
import { Text } from './Text';
import { addAddon, startDownload } from './modelActions';
import { goBack, push } from './nav';
import { CLASSIC_REASON, SPEC_PRESETS, mtpTargets, presetSupport, speedupLabel, wantedMode } from './vaultLogic';

/** Load `spec` again so the speculative setting is read (the engine reads it only while loading). */
async function reload(spec: ModelSpec): Promise<void> {
  if (engine.state.modelId === spec.id && engine.state.status !== 'unmounted') await engine.unmount();
  const r = await engine.mount(spec);
  if (!r.ok) showToast(`${r.message} ${r.fix ?? ''}`.trim(), 6000);
}

/** The only pair this engine can run: a model with its own MTP head. Downloads what is missing first. */
async function runMtpPair(spec: ModelSpec): Promise<void> {
  const dl = downloads.store.getState().items[spec.id];
  if (!dl || dl.status !== 'completed') {
    await startDownload(spec, { draft: true });
    showToast(`Downloading ${spec.name} with its speed-up head. Come back here when it is done.`, 5000);
    return;
  }
  if (dl.missing?.includes('draft')) {
    await addAddon(spec, 'draft');
    showToast('Downloading the speed-up head. Come back here when it is done.', 5000);
    return;
  }
  updateSection('speculative', { enabled: true, draftModelId: null });
  updateSettings({ activeModelId: spec.id });
  await reload(spec);
}

/**
 * Speculative decoding: switch, draft source, tuning, the old presets with an honest verdict, and live numbers from the
 * engine (acceptance rate, measured speed-up). Nothing is simulated: with it off or unsupported the numbers stay dashes.
 */
export function SpeculativeScreen() {
  const s = useStyles();
  const settings = useSettings();
  const st = useEngineStatus();
  const items = useDownloadItems();
  const sp = settings.speculative;
  const target = getModel(settings.activeModelId);
  const live = st.speculative;
  const loadedTarget = !!target && st.modelId === target.id && (st.state === 'ready' || st.state === 'generating');
  const wanted = wantedMode(sp);
  const needsReload = loadedTarget && (live.requested !== wanted || (wanted === 'draft' && live.draftModelId !== sp.draftModelId));
  const builtIn = !sp.draftModelId || sp.draftModelId === 'mtp';
  const headOnPhone = (m: ModelSpec) => items[m.id]?.status === 'completed' && !items[m.id]?.missing?.includes('draft');
  const classic = target ? draftOptions(target).filter((o) => o.kind === 'model') : [];

  const v = target ? settings.verified[target.id] : undefined;
  const withTps = live.specTokPerSec ?? v?.specTokPerSec ?? null;
  const baseTps = live.baselineTokPerSec ?? v?.chatTokPerSec ?? null;
  const speedup = live.speedup ?? (withTps && baseTps ? withTps / baseTps : null);
  const rate = live.acceptanceRate;

  const state =
    !sp.enabled ? 'Off.' : !target ? 'On. Load a model to use it.' : needsReload ? `On. Applies when ${target.name} loads again.` : live.active && loadedTarget ? `Active on ${target.name}.` : loadedTarget ? `On, but not active on ${target.name}.` : `On. Applies the next time ${target.name} loads.`;

  return (
    <Screen title="Speculative" onBack={goBack} scroll>
      <Text variant="small">A small draft guesses the next few words and the big model checks them all at once. The answers stay the same; it is faster when the guesses are right.</Text>

      <View>
        <Divider />
        <Row title="Speculative decoding" subtitle={state} switchValue={sp.enabled} onSwitch={(enabled) => updateSection('speculative', { enabled })} />
        <Divider />
      </View>
      {needsReload && target ? <Button label={`Apply now (reload ${target.name})`} variant="primary" busyLabel="Reloading" onPress={() => reload(target)} /> : null}
      {sp.enabled && live.reason ? <Notice tone="danger" title="Not active">{live.reason}</Notice> : null}
      {st.fallbacks.length > 0 ? <Notice tone="quiet" title="Turned off while loading">{st.fallbacks.join(' ')}</Notice> : null}

      <SectionHeader title="Live" hint="Counted by llama.cpp while you chat. Dashes mean nothing was measured yet." />
      <View style={s.stats}>
        <Stat label="Accepted" value={rate === null ? null : formatPercent(rate)} hint={live.draftTokens > 0 ? `${live.acceptedTokens} of ${live.draftTokens} drafted` : 'drafted tokens kept'} style={s.stat} />
        <Stat label="Speed-up" value={speedupLabel(speedup)} hint={speedup === null ? 'chat with it off, then on' : 'with vs without, measured'} style={s.stat} />
        <Stat label="Speed" value={withTps ? withTps.toFixed(1) : null} unit={withTps ? 'tok/s' : undefined} hint={baseTps ? `${baseTps.toFixed(1)} without` : 'with it on'} style={s.stat} />
      </View>

      <SectionHeader title="Draft" hint={target ? `For ${target.name}, the model you chat with.` : 'Pick a model in the Vault first: the draft belongs to it.'} />
      {target ? (
        <>
          <View>
            <Divider />
            <Row
              title="Built-in (MTP)"
              subtitle={
                target.draft
                  ? `${target.name}'s own speed-up head (${formatBytes(target.draft.sizeBytes)}). ${headOnPhone(target) ? 'On the phone.' : 'Not downloaded yet.'}`
                  : "The model's own MTP layers, if its file has them. Most files do not; then it loads without drafting and says why."
              }
              selected={builtIn}
              onPress={() => updateSection('speculative', { draftModelId: null })}
            />
            <Divider />
          </View>
          {target.draft && !headOnPhone(target) ? <Button label={`Download the speed-up head · ${formatBytes(target.draft.sizeBytes)}`} variant="quiet" onPress={() => runMtpPair(target)} /> : null}
          {classic.length > 0 ? (
            <>
              <Notice tone="quiet" title="Separate draft models">{CLASSIC_REASON}</Notice>
              <View>
                {classic.map((o) =>
                  o.kind === 'model' ? (
                    <React.Fragment key={o.spec.id}>
                      <Row title={o.spec.name} subtitle={`${formatBytes(o.spec.sizeBytes)} · same tokenizer · ${items[o.spec.id]?.status === 'completed' ? 'on the phone' : 'not downloaded'} · not supported`} selected={sp.draftModelId === o.spec.id} disabled />
                      <Divider />
                    </React.Fragment>
                  ) : null,
                )}
              </View>
              {sp.draftModelId && !builtIn ? <Button label="Switch back to the built-in draft" variant="quiet" onPress={() => updateSection('speculative', { draftModelId: null })} /> : null}
            </>
          ) : null}
        </>
      ) : null}

      <SectionHeader title="Tuning" />
      <Slider label="Draft tokens per step" value={sp.nDraft} onChange={(nDraft) => updateSection('speculative', { nDraft })} min={1} max={16} step={1} hint="How many words it guesses ahead. More helps when guesses are good, costs when they are not." />
      <Slider label="Minimum confidence" value={sp.pMin} onChange={(pMin) => updateSection('speculative', { pMin })} min={0} max={1} step={0.05} format={(x) => formatPercent(x)} hint="The draft stops guessing when it is less sure than this." />
      {loadedTarget ? <Text variant="small">Tuning applies the next time the model loads.</Text> : null}

      <SectionHeader title="Pairs that run" hint="Models with their own MTP head. One tap downloads what is missing, then reloads the model with drafting on." />
      <View>
        <Divider />
        {mtpTargets().map((m) => {
          const ready = items[m.id]?.status === 'completed' && headOnPhone(m);
          return (
            <React.Fragment key={m.id}>
              <Row
                title={m.name}
                subtitle={`${formatBytes(m.sizeBytes)} + ${formatBytes(m.draft?.sizeBytes ?? 0)} head · ${ready ? 'ready' : items[m.id]?.status === 'completed' ? 'head not downloaded' : 'not downloaded'}`}
                right={<Button label={ready ? 'Use' : 'Get'} variant="quiet" onPress={() => runMtpPair(m)} accessibilityLabel={`${ready ? 'Use' : 'Download'} ${m.name} with its speed-up head`} />}
              />
              <Divider />
            </React.Fragment>
          );
        })}
      </View>

      <SectionHeader title="Pairs from the old app" hint="Kept so nothing is lost. They need a separate small draft model." />
      {SPEC_PRESETS.map((p, i) => {
        const x = presetSupport(p);
        return (
          <Card key={p.id} selected={settings.activePresetIndex === i} onPress={() => updateSettings({ activePresetIndex: i })} accessibilityLabel={`${p.name}, ${x.reason ?? 'runnable'}`}>
            <Text variant="strong">{p.name}</Text>
            <Text variant="small">{`Checks: ${x.target?.name ?? p.targetId} · ${x.target ? formatBytes(x.target.sizeBytes) : '?'} · ${x.target?.quantization ?? ''}`}</Text>
            <Text variant="small">{`Drafts: ${x.draft?.name ?? p.draftId} · ${x.draft ? formatBytes(x.draft.sizeBytes) : '?'} · ${x.draft?.quantization ?? ''}`}</Text>
            <Text variant="small">{p.description}</Text>
            <View style={s.tags}>
              <Tag label={x.pairRunnable ? 'Runnable' : 'Not supported by this engine version'} tone={x.pairRunnable ? 'accent' : 'danger'} />
            </View>
            {x.reason ? <Text variant="small">{x.reason}</Text> : null}
            <View style={s.buttons}>
              {x.mtpAlternative && x.target ? <Button label={`Run ${x.target.name} with its MTP head`} variant="quiet" onPress={() => runMtpPair(x.target as ModelSpec)} /> : null}
              {x.target ? <Button label={`Open ${x.target.name}`} variant="text" onPress={() => push('models/detail', { id: x.target?.id })} /> : null}
            </View>
          </Card>
        );
      })}
      <Text variant="small">{`${MODEL_CATALOG.length} models in the library. The speed-up and acceptance numbers above are measured on this phone; the old app showed fixed numbers, which were removed.`}</Text>
    </Screen>
  );
}

const useStyles = makeStyles(({ colors, space, line }) => ({
  stats: { flexDirection: 'row', borderTopWidth: line, borderBottomWidth: line, borderColor: colors.border },
  stat: { flex: 1, paddingVertical: space.md, paddingHorizontal: space.xs },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
}));
