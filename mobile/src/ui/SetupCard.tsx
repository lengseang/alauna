import React from 'react';
import { View } from 'react-native';
import type { ModelSpec } from '../core/catalog.ts';
import { formatBytes, formatDuration, formatPercent, formatSpeed } from '../core/format.ts';
import { downloads, useDownloadState } from '../services/downloads.ts';
import { useEngineStatus } from '../services/engine.ts';
import { downloadAndLoad, useSetup } from '../services/setup.ts';
import { showToast } from '../services/toast.ts';
import { makeStyles } from '../theme';
import { Button } from './Button';
import { Card } from './Card';
import { push } from './nav';
import { Notice } from './Notice';
import { ProgressBar } from './ProgressBar';
import { Text } from './Text';

interface Props {
  spec: ModelSpec;
  deviceName: string;
  /** 'welcome' = empty chat voice; 'recommended' = Models screen voice. */
  tone: 'welcome' | 'recommended';
}

/**
 * The one-tap path for the model we suggest: download, verify, load and prove it answers (services/setup.ts).
 * Shows exactly where it is (Downloading 42% / Verifying / Loading 60% / Testing) and lets you pause.
 */
export function SetupCard({ spec, deviceName, tone }: Props) {
  const s = useStyles();
  const dl = useDownloadState(spec.id);
  const setup = useSetup();
  const eng = useEngineStatus();
  const mine = setup.modelId === spec.id;
  const running = mine && setup.stage !== null && setup.stage !== 'done';
  const failed = mine && setup.result && !setup.result.ok && setup.result.reason !== 'paused' && setup.result.reason !== 'cancelled' ? setup.result : null;
  const fraction = dl.totalBytes > 0 ? dl.bytesWritten / dl.totalBytes : 0;

  let progress: { value: number; text: string } | null = null;
  if (running || dl.status === 'paused') {
    if (dl.status === 'paused') progress = { value: fraction, text: `Paused at ${formatPercent(fraction)}` };
    else if (setup.stage === 'verifying' || dl.status === 'finalizing')
      progress = { value: dl.verifyFraction ?? 1, text: `Verifying the download ${dl.verifyFraction !== undefined ? formatPercent(dl.verifyFraction) : ''}`.trim() };
    else if (setup.stage === 'loading' || eng.state === 'loading') progress = { value: eng.progress, text: `Loading into memory ${formatPercent(eng.progress)}` };
    else if (setup.stage === 'warming' || eng.state === 'warming') progress = { value: 1, text: 'Testing its first words' };
    else
      progress = {
        value: fraction,
        text: `Downloading ${formatPercent(fraction)} · ${formatBytes(dl.bytesWritten)} of ${formatBytes(dl.totalBytes || spec.sizeBytes)}${dl.speedBps > 0 ? ` · ${formatSpeed(dl.speedBps)}${dl.etaSec > 0 ? ` · ${formatDuration(dl.etaSec)} left` : ''}` : ''}`,
      };
  }

  const start = async () => {
    const r = await downloadAndLoad(spec.id);
    if (!r.ok && r.reason !== 'paused' && r.reason !== 'cancelled') showToast(`${r.message} ${r.fix ?? ''}`.trim(), 6000);
  };

  return (
    <Card>
      {tone === 'recommended' ? (
        <Text variant="label" tone="accent">
          Recommended for your phone
        </Text>
      ) : null}
      <Text variant="title">{tone === 'welcome' ? 'The oracle is silent' : spec.name}</Text>
      <Text tone="muted">
        {tone === 'welcome'
          ? `Wake it with ${spec.name}: ${formatBytes(spec.sizeBytes)}, chosen for your ${deviceName}. It downloads once, then everything works offline.`
          : `${spec.description} ${formatBytes(spec.sizeBytes)}, a good fit for your ${deviceName}.`}
      </Text>
      {progress ? (
        <View style={s.gap}>
          <ProgressBar fraction={progress.value} label={`${spec.name} setup`} />
          <Text variant="small" accessibilityLiveRegion="polite">
            {progress.text}
          </Text>
        </View>
      ) : null}
      {failed ? <Notice tone="danger">{`${failed.message} ${failed.fix ?? ''}`.trim()}</Notice> : null}
      <View style={s.buttons}>
        {dl.status === 'downloading' || dl.status === 'resolving' ? <Button label="Pause" variant="quiet" onPress={() => downloads.pause(spec.id)} /> : null}
        {dl.status === 'paused' ? <Button label="Resume" onPress={start} /> : null}
        {!running && dl.status !== 'paused' ? <Button label={failed ? 'Try again' : `Download · ${formatBytes(spec.sizeBytes)}`} icon="models" onPress={start} /> : null}
        {tone === 'welcome' && !running ? <Button label="Choose another model" variant="text" onPress={() => push('models')} /> : null}
      </View>
    </Card>
  );
}

const useStyles = makeStyles(({ space }) => ({
  gap: { gap: space.xs },
  buttons: { gap: space.xs },
}));
