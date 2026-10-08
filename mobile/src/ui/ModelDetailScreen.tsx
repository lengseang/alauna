import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { CAPABILITY_INFO, getModel, installSizeBytes, speedHint, type ModelSpec } from '../core/catalog.ts';
import { defaultContext } from '../core/fit.ts';
import { formatBytes, formatDuration, formatPercent, formatSpeed } from '../core/format.ts';
import { actionsFor, type ModelAction } from '../core/modelStatus.ts';
import { getDeviceProfile } from '../services/device.ts';
import { refreshDownloads, useDownloadState } from '../services/downloads.ts';
import { useEngineState } from '../services/engine.ts';
import { deepVerify, type CancelToken } from '../services/modelLibrary.ts';
import { useSettings } from '../services/settings.ts';
import { locateModelFile, useStorageSlots } from '../services/storage.ts';
import { refreshSlots } from '../services/storageSlots.ts';
import { showToast } from '../services/toast.ts';
import { makeStyles } from '../theme';
import { Button } from './Button';
import { Divider } from './Divider';
import { Eclipse, type EclipseState } from './Eclipse';
import { Notice } from './Notice';
import { ProgressBar } from './ProgressBar';
import { Row } from './Row';
import { Screen } from './Screen';
import { SectionHeader } from './SectionHeader';
import { Sheet } from './Sheet';
import { Stat } from './Stat';
import { Tag } from './Tag';
import { Text } from './Text';
import { confirm } from './confirm';
import { addAddon, deleteModel, describeTest, moveToSlot, removeAddon, runModelAction, startDownload, testModel, unloadModel } from './modelActions';
import { goBack, useParams } from './nav';
import {
  FILE_LABEL,
  IDLE_ENGINE,
  contextLabel,
  fitVerdict,
  isOnPhone,
  isTransferring,
  licenseNote,
  paramsLabel,
  partsLine,
  rowState,
  shortSha,
} from './vaultLogic';

const THINKING = { none: 'Answers directly, no thinking phase', always: 'Always thinks first (shown in a collapsible block)', toggle: 'Thinking can be switched on or off per message' } as const;

/** One model in full: facts, add-ons, every action it can take, storage, integrity. Route `models/detail` with `{ id }`. */
export function ModelDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const spec = getModel(id);
  if (!spec) {
    return (
      <Screen title="Model" onBack={goBack} scroll>
        <Notice tone="quiet" title="Not in the library">
          This model is not part of the library any more. Go back to the Model Vault to pick another one.
        </Notice>
        <Button label="Back to the Vault" variant="quiet" onPress={() => void goBack()} />
      </Screen>
    );
  }
  return <Detail spec={spec} />;
}

function Detail({ spec }: { spec: ModelSpec }) {
  const s = useStyles();
  const dl = useDownloadState(spec.id);
  const eng = useEngineState();
  const settings = useSettings();
  const slots = useStorageSlots();
  const device = getDeviceProfile();
  const nCtx = settings.compute.nCtx ?? defaultContext(device.totalRamBytes);
  const fit = fitVerdict(spec, device.totalRamBytes, nCtx);
  const mine = eng.modelId === spec.id;
  const verified = settings.verified[spec.id];
  const st = rowState(spec, dl, mine ? eng : IDLE_ENGINE, !!verified);
  const onPhone = isOnPhone(st.kind);
  const loaded = st.kind === 'active';
  const actions = actionsFor(st.kind, dl.retryable);
  const license = licenseNote(spec.license);

  useEffect(() => {
    refreshSlots();
  }, []);

  // Choices made before the download (the add-ons are optional: the manager takes vision/draft options).
  const [withVision, setWithVision] = useState(true);
  const [withDraft, setWithDraft] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);
  const [check, setCheck] = useState<{ fraction: number; message?: string; good?: boolean } | null>(null);
  const checkToken = useRef<CancelToken>({ cancelled: false });
  const [moveOpen, setMoveOpen] = useState(false);
  const [move, setMove] = useState<{ stage: string; fraction: number } | null>(null);
  const moveToken = useRef<CancelToken>({ cancelled: false });

  const slotId = useMemo(() => (onPhone ? (locateModelFile(spec.filename)?.slotId ?? null) : null), [onPhone, spec.filename, move]);
  const slot = slots.find((x) => x.id === slotId);
  const otherSlots = slots.filter((x) => x.available && x.id !== slotId);

  const eclipse: EclipseState = !mine ? 'idle' : eng.status === 'mounting' ? 'loading' : eng.status === 'generating' ? 'busy' : eng.status === 'ready' ? 'ready' : eng.status === 'error' ? 'error' : 'idle';
  const total = dl.totalBytes > 0 ? dl.totalBytes : installSizeBytes(spec, { vision: withVision, draft: withDraft });
  const hasMmproj = onPhone ? !dl.missing?.includes('mmproj') : withVision;
  const hasDraft = onPhone ? !dl.missing?.includes('draft') : withDraft;

  const verify = async () => {
    if (check && check.message === undefined) {
      checkToken.current.cancelled = true;
      return;
    }
    checkToken.current = { cancelled: false };
    setCheck({ fraction: 0 });
    try {
      const r = await deepVerify(spec, spec.sha256, (f) => setCheck({ fraction: f }), checkToken.current);
      setCheck(r.cancelled ? null : { fraction: 1, good: r.ok, message: r.ok ? 'The file matches the official fingerprint.' : 'The fingerprint does NOT match. Delete the model and download it again.' });
    } catch (e) {
      setCheck({ fraction: 0, good: false, message: e instanceof Error ? e.message : 'Could not check the file.' });
    }
  };

  const doMove = async (targetId: string, label: string) => {
    setMoveOpen(false);
    const ok = await confirm(`Move ${spec.name}?`, `This copies the files to ${label}, checks the copy, then deletes the originals. It can take several minutes.`, 'Move');
    if (!ok) return;
    moveToken.current = { cancelled: false };
    setMove({ stage: 'copying', fraction: 0 });
    const r = await moveToSlot(spec, targetId, { token: moveToken.current, onProgress: (stage, fraction) => setMove({ stage, fraction }) });
    setMove(null);
    refreshDownloads();
    refreshSlots();
    showToast(r.ok ? `Moved to ${label} (${r.verified === 'sha256' ? 'fingerprint checked' : 'size checked'})` : r.message, 5000);
  };

  const primary = (a: ModelAction) => a === 'download' || a === 'resume' || a === 'retry' || a === 'load' || a === 'start_chat';
  const label = (a: ModelAction): string => {
    switch (a) {
      case 'download':
        return `Download · ${formatBytes(total)}`;
      case 'pause':
        return 'Pause';
      case 'resume':
        return 'Resume download';
      case 'retry':
        return 'Try again';
      case 'cancel':
        return st.kind === 'download_error' ? 'Discard' : st.kind === 'queued' ? 'Leave the queue' : 'Cancel download';
      case 'load':
        return 'Load into memory';
      case 'start_chat':
        return 'Chat with it';
      case 'unload':
        return 'Unload from memory';
      default:
        return a;
    }
  };
  const shown = actions.filter((a) => a !== 'delete' && a !== 'verify_checksum');

  return (
    <Screen title="Model" onBack={goBack} scroll>
      <View style={s.head}>
        <Eclipse state={eclipse} progress={eng.loadProgress} size={44} label={mine ? `${spec.name}, ${st.label || fit.label}` : undefined} />
        <View style={s.grow}>
          <Text variant="title">{spec.name}</Text>
          <Text variant="small">{`${paramsLabel(spec.paramsB)} parameters · ${spec.quantization} · ${spec.role}`}</Text>
        </View>
      </View>
      <View style={s.tags}>
        <Tag label={`Grade ${spec.grade}`} tone="accent" />
        {spec.capabilities.map((c) => (
          <Tag key={c} label={CAPABILITY_INFO[c].label} />
        ))}
        {spec.contentPolicy === 'Uncensored' ? <Tag label="Uncensored" /> : null}
        {spec.thinking !== 'none' ? <Tag label={spec.thinking === 'always' ? 'Thinks first' : 'Optional thinking'} /> : null}
      </View>
      <Text variant="strong">{spec.uniqueTag}</Text>
      <Text>{`Best for: ${spec.bestFor}`}</Text>
      <Text variant="small">{speedHint(spec).label}. A class from file size, not a measurement.</Text>
      <Text tone="muted">{spec.description}</Text>

      {/* ------------------------------------------------ status and actions */}
      <View style={s.block}>
        <Text variant="strong" tone={st.tone === 'bad' ? 'danger' : st.label ? 'text' : fit.tone}>
          {[st.label || 'Not on this phone', onPhone || !st.label ? fit.label : ''].filter(Boolean).join(' · ')}
        </Text>
        {st.fraction !== null ? <ProgressBar fraction={st.fraction} label={`${spec.name}, ${st.label}`} tone={st.tone === 'bad' ? 'danger' : 'accent'} /> : null}
        {dl.totalBytes > 0 && (isTransferring(st.kind) || st.kind === 'paused' || st.kind === 'queued') ? (
          <Text variant="small">
            {`${formatBytes(dl.bytesWritten)} of ${formatBytes(dl.totalBytes)} · ${formatPercent(dl.bytesWritten / dl.totalBytes)}`}
            {dl.status === 'downloading' ? ` · ${dl.speedBps > 0 ? formatSpeed(dl.speedBps) : 'measuring speed'}${dl.etaSec > 0 ? ` · ${formatDuration(dl.etaSec)} left` : ''}` : ''}
          </Text>
        ) : null}
        {partsLine(dl) ? <Text variant="small">{partsLine(dl)}</Text> : null}
        {dl.status === 'finalizing' ? <Text variant="small">Checking the SHA-256 fingerprint against the Hub. This can take minutes on a phone.</Text> : null}
        {dl.note && dl.status !== 'error' ? <Text variant="small">{dl.note}</Text> : null}
        {dl.status === 'error' ? <Notice tone="danger" title="Download failed">{dl.error ?? 'The download stopped for an unknown reason.'}</Notice> : null}
        {mine && eng.status === 'error' && eng.error ? <Notice tone="danger" title="Could not load">{`${eng.error} ${eng.errorFix ?? ''}`.trim()}</Notice> : null}
        {test ? <Notice tone={test.ok ? 'info' : 'danger'} title={test.ok ? 'Test passed' : 'Test failed'}>{test.text}</Notice> : null}
        {onPhone && dl.missing?.includes('mmproj') && spec.mmproj ? <Notice tone="quiet" title="Images are off">{`The image add-on (${formatBytes(spec.mmproj.sizeBytes)}) is not on the phone, so this model cannot read photos.`}</Notice> : null}

        <View style={s.buttons}>
          {shown.map((a) => (
            <Button
              key={a}
              label={label(a)}
              variant={primary(a) && a === shown.find(primary) ? 'primary' : a === 'cancel' ? 'text' : 'quiet'}
              onPress={() => (a === 'download' ? startDownload(spec, { vision: withVision, draft: withDraft }) : runModelAction(spec, a))}
            />
          ))}
          {onPhone && st.kind !== 'loading' ? (
            <Button
              label="Test model"
              variant="quiet"
              busyLabel="Testing"
              onPress={async () => {
                setTest(null);
                const r = await testModel(spec);
                if (r) setTest(describeTest(r));
              }}
            />
          ) : null}
        </View>
      </View>

      {/* ------------------------------------------------ facts */}
      <SectionHeader title="Facts" hint="From the model's own file and the Hugging Face listing." />
      <View style={s.stats}>
        <Stat label="Download" value={formatBytes(installSizeBytes(spec))} hint={spec.mmproj ? 'with image add-on' : 'one file'} style={s.stat} />
        <Stat label="Memory" value={formatBytes(fit.ramBytes)} hint={`${nCtx} token window`} style={s.stat} />
        <Stat label="Speed here" value={verified ? verified.tokensPerSecond.toFixed(1) : null} unit={verified ? 'tok/s' : undefined} hint={verified ? `measured ${new Date(verified.at).toLocaleDateString()}` : 'not tested yet'} style={s.stat} />
      </View>
      <View>
        <Divider />
        <Row title="Fit for this phone" value={fit.label} subtitle={device.totalRamBytes ? `${device.name}: ${formatBytes(device.totalRamBytes)} memory` : `${device.name}: memory unknown`} />
        <Divider />
        <Row title="Context length" value={contextLabel(spec.contextLength)} subtitle={`Trained length. This phone runs it at ${nCtx} tokens (Settings > Advanced).`} />
        <Divider />
        <Row title="Repository" subtitle={spec.repo} />
        <Divider />
        <Row title="File" subtitle={spec.filename} />
        <Divider />
        <Row title="SHA-256" value={shortSha(spec.sha256)} subtitle="The first 12 characters. The full fingerprint is checked after every download." />
        <Divider />
        <Row title="License" value={spec.license} />
        <Divider />
        <Row title="Thinking" subtitle={THINKING[spec.thinking]} />
        <Divider />
        <Row title="Content policy" value={spec.contentPolicy} />
        <Divider />
        <Row title="On the Hub since" value={spec.published} />
        <Divider />
      </View>
      {license ? <Notice tone="info" title="Check the license">{license.text}</Notice> : null}

      {/* ------------------------------------------------ add-ons */}
      {spec.mmproj || spec.draft ? (
        <>
          <SectionHeader title="Add-ons" hint={onPhone ? 'Extra files that give this model more abilities.' : 'Choose what to download with the model.'} />
          <View>
            <Divider />
            {spec.mmproj ? (
              <>
                <Row
                  title={`${FILE_LABEL.mmproj} (${formatBytes(spec.mmproj.sizeBytes)})`}
                  subtitle={`${spec.capabilities.includes('Voice') ? 'Lets it read photos and understand recorded speech.' : 'Lets it read photos you attach.'} Loaded together with the model.`}
                  switchValue={hasMmproj}
                  onSwitch={(on) => (onPhone ? (on ? addAddon(spec, 'mmproj') : void removeAddon(spec, 'mmproj')) : setWithVision(on))}
                  disabled={isTransferring(st.kind) || st.kind === 'queued'}
                />
                <Divider />
              </>
            ) : null}
            {spec.draft ? (
              <>
                <Row
                  title={`${FILE_LABEL.draft} (${formatBytes(spec.draft.sizeBytes)})`}
                  subtitle="A small draft head for speculative decoding: it guesses ahead, the model checks. Used when Speculative decoding is on."
                  switchValue={hasDraft}
                  onSwitch={(on) => (onPhone ? (on ? addAddon(spec, 'draft') : void removeAddon(spec, 'draft')) : setWithDraft(on))}
                  disabled={isTransferring(st.kind) || st.kind === 'queued'}
                />
                <Divider />
              </>
            ) : null}
          </View>
          {loaded && onPhone ? <Text variant="small">Changes to add-ons apply the next time the model loads.</Text> : null}
        </>
      ) : null}

      {/* ------------------------------------------------ storage and integrity */}
      {onPhone ? (
        <>
          <SectionHeader title="On this phone" />
          <View>
            <Divider />
            <Row title="Stored in" value={slot?.label ?? 'Unknown'} subtitle={slot ? `${slot.freeBytes !== null ? `${formatBytes(slot.freeBytes)} free there` : 'Free space is not reported for this location'}` : undefined} />
            {otherSlots.length > 0 ? (
              <>
                <Divider />
                <Row title="Move to another slot" subtitle={loaded ? 'Unload the model first.' : 'Copies, checks the copy, then deletes the original.'} onPress={() => setMoveOpen(true)} disabled={loaded || !!move} />
              </>
            ) : null}
            <Divider />
          </View>
          {move ? (
            <View style={s.block}>
              <Text variant="small">{`Moving: ${move.stage} ${formatPercent(move.fraction)}`}</Text>
              <ProgressBar fraction={move.fraction} label="Move progress" />
              <Button label="Stop" variant="quiet" onPress={() => void (moveToken.current.cancelled = true)} />
            </View>
          ) : null}
          {check ? (
            check.message ? (
              <Notice tone={check.good ? 'info' : 'danger'}>{check.message}</Notice>
            ) : (
              <View style={s.block}>
                <Text variant="small">{`Checking the file (slow on phones) · ${formatPercent(check.fraction)}`}</Text>
                <ProgressBar fraction={check.fraction} label="File check" />
              </View>
            )
          ) : null}
          <View style={s.buttons}>
            <Button label={check && check.message === undefined ? 'Stop the check' : 'Check file integrity'} variant="quiet" onPress={verify} />
            {loaded ? <Button label="Unload from memory" variant="quiet" onPress={unloadModel} /> : null}
            <Button label="Delete model" variant="danger" onPress={() => deleteModel(spec)} />
          </View>
        </>
      ) : null}

      <Sheet visible={moveOpen} onClose={() => setMoveOpen(false)} title="Move to">
        {slots
          .filter((x) => x.available)
          .map((x, i) => (
            <React.Fragment key={x.id}>
              {i > 0 ? <Divider /> : null}
              <Row
                title={x.label}
                subtitle={`${x.freeBytes !== null ? `${formatBytes(x.freeBytes)} free` : 'free space not reported'} · ${x.modelFiles} model ${x.modelFiles === 1 ? 'file' : 'files'}`}
                selected={x.id === slotId}
                onPress={x.id === slotId ? undefined : () => void doMove(x.id, x.label)}
              />
            </React.Fragment>
          ))}
      </Sheet>
    </Screen>
  );
}

const useStyles = makeStyles(({ colors, space, line }) => ({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  grow: { flex: 1, gap: space.xs },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  block: { gap: space.sm },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  stats: { flexDirection: 'row', borderTopWidth: line, borderBottomWidth: line, borderColor: colors.border },
  stat: { flex: 1, paddingVertical: space.md, paddingHorizontal: space.xs },
}));
