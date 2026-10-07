import React, { useRef, useState } from 'react';
import { View } from 'react-native';
import type { ModelSpec } from '../core/catalog.ts';
import type { DownloadState } from '../core/downloadManager.ts';
import type { EngineState } from '../core/engineManager.ts';
import { fitFor, FIT_LABEL, type FitRating } from '../core/fit.ts';
import { formatBytes, formatDuration, formatPercent, formatSpeed } from '../core/format.ts';
import { deriveModelStatus, actionsFor } from '../core/modelStatus.ts';
import { fetchRemoteFileInfo } from '../services/hfClient.ts';
import { deepVerify, type CancelToken } from '../services/modelLibrary.ts';
import { downloads } from '../services/downloads.ts';
import { makeStyles } from '../theme';
import { Button } from './Button';
import { Card } from './Card';
import { Notice } from './Notice';
import { ProgressBar } from './ProgressBar';
import { Row } from './Row';
import { Sheet } from './Sheet';
import { resetTo } from './nav';
import { cancelDownload, deleteModel, describeTest, startDownload, testModel, unloadModel } from './modelActions';
import { Text } from './Text';

export interface ModelCtx {
  nCtx: number;
  ramBytes: number | null;
  eng: EngineState;
  verified: Record<string, { tokensPerSecond: number } | undefined>;
}

export function modelStatus(spec: ModelSpec, dl: DownloadState, ctx: ModelCtx) {
  const status = deriveModelStatus({ modelId: spec.id, download: dl, engine: ctx.eng, verified: !!ctx.verified[spec.id] });
  return { status, actions: actionsFor(status.kind, dl.retryable) };
}

const fitText = (spec: ModelSpec, ctx: ModelCtx): string => FIT_LABEL[fitFor(spec, ctx.ramBytes, ctx.nCtx) as FitRating];

/** A transfer in flight, paused, or failed: progress, speed, Pause/Resume/Try again, Cancel. */
export function DownloadCard({ spec, dl, ctx }: { spec: ModelSpec; dl: DownloadState; ctx: ModelCtx }) {
  const s = useStyles();
  const { status, actions } = modelStatus(spec, dl, ctx);
  const fraction = dl.totalBytes > 0 ? dl.bytesWritten / dl.totalBytes : 0;
  const speed = dl.status === 'downloading' ? ` · ${formatSpeed(dl.speedBps)} · ${dl.etaSec > 0 ? `${formatDuration(dl.etaSec)} left` : 'estimating'}` : '';
  return (
    <Card>
      <Text variant="strong">{spec.name}</Text>
      <Text variant="small" tone={status.tone === 'bad' ? 'danger' : 'muted'}>
        {status.label}
      </Text>
      {dl.totalBytes > 0 ? (
        <>
          <ProgressBar fraction={fraction} label={`${spec.name} download`} />
          <Text variant="small">{`${formatBytes(dl.bytesWritten)} of ${formatBytes(dl.totalBytes)} · ${formatPercent(fraction)}${speed}`}</Text>
        </>
      ) : null}
      {dl.status === 'error' && dl.error ? <Notice tone="danger">{dl.error}</Notice> : null}
      {dl.status === 'paused' && dl.note ? <Text variant="small">{dl.note}</Text> : null}
      <View style={s.buttons}>
        {actions.includes('pause') ? <Button label="Pause" variant="quiet" onPress={() => downloads.pause(spec.id)} /> : null}
        {actions.includes('resume') ? <Button label="Resume" variant="quiet" onPress={() => startDownload(spec)} /> : null}
        {actions.includes('retry') ? <Button label="Try again" variant="quiet" onPress={() => startDownload(spec)} /> : null}
        {actions.includes('cancel') ? <Button label="Cancel" variant="text" onPress={() => cancelDownload(spec)} /> : null}
      </View>
    </Card>
  );
}

/** Installed model: status in plain words, Test model, and a "More" sheet (integrity check, unload, delete). */
export function InstalledCard({ spec, dl, ctx }: { spec: ModelSpec; dl: DownloadState; ctx: ModelCtx }) {
  const s = useStyles();
  const [more, setMore] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);
  const { status } = modelStatus(spec, dl, ctx);
  const mine = ctx.eng.modelId === spec.id;
  const active = status.kind === 'active';
  const tps = ctx.verified[spec.id]?.tokensPerSecond;
  return (
    <Card selected={active}>
      <View style={s.titleRow}>
        <Text variant="strong" style={s.grow}>
          {spec.name}
        </Text>
        {active ? (
          <Text variant="label" tone="accent">
            Active
          </Text>
        ) : null}
      </View>
      <Text variant="small" tone={status.tone === 'bad' ? 'danger' : 'muted'}>
        {`${formatBytes(spec.sizeBytes)} · ${status.label}${tps && !active ? ` · ${tps.toFixed(1)} tok/s` : ''}`}
      </Text>
      {mine && ctx.eng.status === 'error' && ctx.eng.error ? <Notice tone="danger">{`${ctx.eng.error} ${ctx.eng.errorFix ?? ''}`.trim()}</Notice> : null}
      {test ? <Notice tone={test.ok ? 'info' : 'danger'}>{test.text}</Notice> : null}
      <View style={s.buttons}>
        {active ? (
          <Button label="Chat with it" variant="quiet" onPress={() => resetTo('chat')} />
        ) : (
          <Button
            label="Test model"
            variant="quiet"
            loading={status.kind === 'loading'}
            busyLabel={status.label}
            onPress={async () => {
              setTest(null);
              const r = await testModel(spec);
              if (r) setTest(describeTest(r));
            }}
          />
        )}
        <Button label="More" variant="text" onPress={() => setMore(true)} />
      </View>
      <ModelOptions spec={spec} active={active} visible={more} onClose={() => setMore(false)} />
    </Card>
  );
}

/** Not on the phone yet: one line + Download. */
export function AvailableRow({ spec, ctx }: { spec: ModelSpec; ctx: ModelCtx }) {
  return (
    <Row title={spec.name} subtitle={`${spec.role} · ${formatBytes(spec.sizeBytes)} · ${fitText(spec, ctx)}`} right={<Button label="Download" variant="quiet" onPress={() => startDownload(spec)} />} />
  );
}

function ModelOptions({ spec, active, visible, onClose }: { spec: ModelSpec; active: boolean; visible: boolean; onClose: () => void }) {
  const [check, setCheck] = useState<{ fraction: number; message?: string } | null>(null);
  const token = useRef<CancelToken>({ cancelled: false });

  const verify = async () => {
    if (check && !check.message) {
      token.current.cancelled = true;
      return;
    }
    token.current = { cancelled: false };
    setCheck({ fraction: 0 });
    try {
      const expected = spec.sha256 || (await fetchRemoteFileInfo(spec.repo, spec.filename)).sha256;
      if (!expected) return setCheck({ fraction: 0, message: 'The Hub did not publish a checksum for this file.' });
      const r = await deepVerify(spec, expected, (f) => setCheck({ fraction: f }), token.current);
      setCheck(r.cancelled ? null : { fraction: 1, message: r.ok ? 'The file matches the official checksum.' : 'The checksum does NOT match. Delete the model and download it again.' });
    } catch (e) {
      setCheck({ fraction: 0, message: e instanceof Error ? e.message : 'Could not check the file.' });
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={spec.name}>
      <Text tone="muted">{spec.description}</Text>
      {check ? (
        check.message ? (
          <Notice tone={check.message.startsWith('The file matches') ? 'info' : 'danger'}>{check.message}</Notice>
        ) : (
          <>
            <Text variant="small">{`Checking the file (slow on phones) · ${formatPercent(check.fraction)}`}</Text>
            <ProgressBar fraction={check.fraction} label="File check" />
          </>
        )
      ) : null}
      <Button label={check && !check.message ? 'Stop the check' : 'Check file integrity'} variant="quiet" onPress={verify} />
      {active ? (
        <Button
          label="Unload from memory"
          variant="quiet"
          onPress={async () => {
            onClose();
            await unloadModel();
          }}
        />
      ) : null}
      <Button
        label="Delete model"
        variant="danger"
        onPress={async () => {
          onClose();
          await deleteModel(spec);
        }}
      />
    </Sheet>
  );
}

const useStyles = makeStyles(({ space }) => ({
  gap: { gap: space.xs },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  grow: { flex: 1 },
}));
