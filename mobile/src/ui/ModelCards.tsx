import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { installSizeBytes, isSmallUncensored, speedHint, type ModelSpec } from '../core/catalog.ts';
import { formatBytes, formatDuration, formatPercent, formatSpeed } from '../core/format.ts';
import { actionsFor } from '../core/modelStatus.ts';
import { visionQuality } from '../core/visionProfile.ts';
import { downloads, useDownloadState } from '../services/downloads.ts';
import { installedBytes } from '../services/modelLibrary.ts';
import { makeStyles } from '../theme';
import { Button } from './Button';
import { Card } from './Card';
import { IconButton } from './IconButton';
import { Notice } from './Notice';
import { ProgressBar } from './ProgressBar';
import { Tag } from './Tag';
import { Text } from './Text';
import { deleteModel, pauseDownload, runModelAction } from './modelActions';
import { ACTION_LABEL, fitVerdict, paramsLabel, partsLine, rowState, type EngineLike } from './vaultLogic';

// ===================================================================== Model Vault row

interface RowProps {
  spec: ModelSpec;
  /** The engine's state when it is working on THIS model, else IDLE_ENGINE (keeps every other row from re-rendering). */
  eng: EngineLike;
  /** Loaded and answered a test on this phone. */
  verified: boolean;
  ramBytes: number | null;
  nCtx: number;
  /** Show the grade tag (only needed when the list is not grouped by grade). */
  showGrade: boolean;
  onOpen: (id: string) => void;
}

const NO_FIT_WHILE = new Set(['resolving', 'downloading', 'finalizing', 'queued', 'paused', 'download_error']);

/**
 * One model in the Vault: name, size facts, status and fit in words, tags, ONE primary action. Tapping the text opens the
 * detail screen. Subscribes to its own download state only, so a progress tick re-renders one row.
 */
export const ModelRow = React.memo(function ModelRow({ spec, eng, verified, ramBytes, nCtx, showGrade, onOpen }: RowProps) {
  const s = useStyles();
  const dl = useDownloadState(spec.id);
  const st = rowState(spec, dl, eng, verified);
  const fit = fitVerdict(spec, ramBytes, nCtx);
  const status = [st.label, NO_FIT_WHILE.has(st.kind) ? '' : fit.label].filter(Boolean).join(' · ');
  const tone = st.tone === 'bad' ? 'danger' : st.tone === 'accent' || st.tone === 'good' ? 'accent' : st.label ? 'text' : fit.tone;
  const action = st.primary?.action;
  return (
    <View style={s.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${spec.name}, ${paramsLabel(spec.paramsB)}, ${status}`}
        accessibilityHint="Opens the model details"
        onPress={() => onOpen(spec.id)}
        style={({ pressed }) => [s.info, pressed && s.pressed]}
      >
        <Text variant="strong">{spec.name}</Text>
        <Text variant="small">{`${paramsLabel(spec.paramsB)} · ${spec.quantization} · ${formatBytes(installSizeBytes(spec))} · needs ${formatBytes(fit.ramBytes)} memory`}</Text>
        <Text variant="small" tone={tone}>
          {status}
        </Text>
        <Text variant="small">{`${spec.uniqueTag} · ${spec.bestFor}${isSmallUncensored(spec) ? ' · ' + speedHint(spec).label : ''}`}</Text>
        {st.fraction !== null ? <ProgressBar fraction={st.fraction} label={`${spec.name}, ${st.label}`} tone={st.tone === 'bad' ? 'danger' : 'accent'} /> : null}
        <View style={s.tags}>
          {showGrade ? <Tag label={`Grade ${spec.grade}`} tone="accent" /> : null}
          {spec.capabilities.map((c) => (
            <Tag key={c} label={c} />
          ))}
          {spec.contentPolicy === 'Uncensored' ? <Tag label="Uncensored" tone="accent" /> : null}
          {visionQuality(spec) ? <Tag label={visionQuality(spec)!.label} /> : null}
        </View>
      </Pressable>
      {st.primary && action ? (
        <Button
          label={st.primary.label}
          variant="quiet"
          disabled={action === 'busy'}
          loading={action === 'busy'}
          accessibilityLabel={`${st.primary.label} ${spec.name}`}
          onPress={() => (action === 'busy' ? undefined : runModelAction(spec, action))}
          style={s.action}
        />
      ) : null}
    </View>
  );
});

// ===================================================================== Downloads Hub

interface QueueProps {
  spec: ModelSpec;
  /** Index in the waiting queue (0 = next), or -1 when it is not waiting. */
  queueIndex: number;
  queueLength: number;
  onOpen: (id: string) => void;
}

/** A transfer in flight, waiting, paused or failed: live progress, speed, ETA, parts, reason, and every control it can use. */
export function QueueCard({ spec, queueIndex, queueLength, onOpen }: QueueProps) {
  const s = useStyles();
  const dl = useDownloadState(spec.id);
  const st = rowState(spec, dl, { status: 'unmounted', modelId: null, stage: null, loadProgress: 0 }, false);
  const fraction = st.fraction ?? (dl.totalBytes > 0 ? dl.bytesWritten / dl.totalBytes : 0);
  const actions = actionsFor(st.kind, dl.retryable);
  const moving = dl.status === 'downloading';
  return (
    <Card>
      <Pressable accessibilityRole="button" accessibilityLabel={`${spec.name}, ${st.label || 'waiting'}`} accessibilityHint="Opens the model details" onPress={() => onOpen(spec.id)} style={s.head}>
        <Text variant="strong">{spec.name}</Text>
        <Text variant="small" tone={st.tone === 'bad' ? 'danger' : 'muted'}>
          {st.label || 'Waiting'}
        </Text>
      </Pressable>
      {st.kind !== 'download_error' && st.kind !== 'queued' && dl.totalBytes > 0 ? <ProgressBar fraction={fraction} label={`${spec.name} download`} /> : null}
      {dl.totalBytes > 0 && st.kind !== 'download_error' ? (
        <Text variant="small">
          {`${formatBytes(dl.bytesWritten)} of ${formatBytes(dl.totalBytes)} · ${formatPercent(dl.bytesWritten / dl.totalBytes)}`}
          {moving ? ` · ${dl.speedBps > 0 ? formatSpeed(dl.speedBps) : 'measuring speed'}${dl.etaSec > 0 ? ` · ${formatDuration(dl.etaSec)} left` : ''}` : ''}
        </Text>
      ) : null}
      {dl.status === 'finalizing' ? <Text variant="small">Checking the SHA-256 fingerprint against the Hub. This can take minutes on a phone.</Text> : null}
      {partsLine(dl) ? <Text variant="small">{partsLine(dl)}</Text> : null}
      {dl.note && dl.status !== 'error' ? <Text variant="small">{dl.note}</Text> : null}
      {dl.status === 'error' ? <Notice tone="danger" title="Download failed">{dl.error ?? 'The download stopped for an unknown reason.'}</Notice> : null}
      <View style={s.buttons}>
        {actions
          .filter((a) => a === 'pause' || a === 'resume' || a === 'retry' || a === 'cancel')
          .map((a) => (
            <Button
              key={a}
              label={a === 'cancel' && st.kind === 'download_error' ? 'Discard' : (ACTION_LABEL[a] ?? a)}
              variant={a === 'cancel' ? 'text' : 'quiet'}
              onPress={() => (a === 'pause' ? pauseDownload(spec) : runModelAction(spec, a))}
            />
          ))}
        {queueIndex > 0 ? <Button label="Move up" variant="text" onPress={() => downloads.moveInQueue(spec.id, queueIndex - 1)} /> : null}
        {queueIndex >= 0 && queueIndex < queueLength - 1 ? <Button label="Move down" variant="text" onPress={() => downloads.moveInQueue(spec.id, queueIndex + 1)} /> : null}
      </View>
    </Card>
  );
}

interface InstalledProps {
  spec: ModelSpec;
  active: boolean;
  slotLabel?: string | null;
  onOpen: (id: string) => void;
  onDelete?: (spec: ModelSpec) => void;
}

/** A model on the phone: its real disk use (model plus add-ons), where it lives, Load / Chat, and delete. */
export function InstalledRow({ spec, active, slotLabel, onOpen, onDelete }: InstalledProps) {
  const s = useStyles();
  const dl = useDownloadState(spec.id);
  const bytes = useMemo(() => installedBytes([spec]), [spec, dl.status]);
  const where = slotLabel;
  return (
    <View style={s.row}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${spec.name}, ${formatBytes(bytes)} on disk`} accessibilityHint="Opens the model details" onPress={() => onOpen(spec.id)} style={({ pressed }) => [s.info, pressed && s.pressed]}>
        <Text variant="strong">{spec.name}</Text>
        <Text variant="small">{`${formatBytes(bytes)} on disk${where ? ` · ${where}` : ''}${active ? ' · loaded' : ''}`}</Text>
        {dl.missing && dl.missing.length > 0 ? <Text variant="small">{`Not on the phone: ${dl.missing.map((m) => (m === 'mmproj' ? 'image add-on' : m === 'draft' ? 'speed-up head' : m)).join(', ')}`}</Text> : null}
      </Pressable>
      <View style={s.actions}>
        <Button
          label={active ? 'Chat' : 'Load'}
          variant="quiet"
          onPress={() => runModelAction(spec, active ? 'start_chat' : 'load')}
          accessibilityLabel={`${active ? 'Chat with' : 'Load'} ${spec.name}`}
          style={s.action}
        />
        <IconButton
          icon="trash"
          label={`Delete ${spec.name}`}
          accessibilityHint="Frees disk space"
          onPress={() => (onDelete ? onDelete(spec) : deleteModel(spec))}
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors, space, radius, line }) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    marginVertical: 4,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: line,
    borderColor: colors.border,
  },
  info: { flex: 1, gap: space.xs, minHeight: 56 },
  head: { gap: space.xs, minHeight: 48 },
  pressed: { opacity: 0.75 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, paddingTop: space.xs },
  action: { minWidth: 84 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
}));
