import React, { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ModelSpec } from '../core/catalog.ts';
import { actionsFor, deriveModelStatus, type ModelAction } from '../core/modelStatus.ts';
import { defaultContext, estimateRamBytes, fitFor, FIT_LABEL, type FitRating } from '../core/fit.ts';
import { formatBytes, formatDuration, formatPercent, formatSpeed } from '../core/format.ts';
import { DownloadIcon, PauseIcon, PlayIcon, TrashIcon, ZapIcon } from '../components/Icons';
import { getDeviceProfile } from '../services/device.ts';
import { downloads, useDownloadState } from '../services/downloads.ts';
import { engine, useEngineState } from '../services/engine.ts';
import { fetchRemoteFileInfo } from '../services/hfClient.ts';
import { deepVerify, type CancelToken } from '../services/modelLibrary.ts';
import { updateSettings, useSettings } from '../services/settings.ts';
import { showToast } from '../services/toast.ts';
import { Btn } from './Btn';
import { Badge, Card, ProgressBar, type Tone } from './kit';
import { confirm, notify } from './confirm';
import { colors, font } from './theme';
import { resetTo } from './nav';

const FIT_TONE: Record<FitRating, Tone> = { great: 'good', ok: 'good', tight: 'warn', too_heavy: 'bad', unknown: 'neutral' };

export function ModelCard({ spec, recommended }: { spec: ModelSpec; recommended: boolean }) {
  const dl = useDownloadState(spec.id);
  const eng = useEngineState();
  const settings = useSettings();
  const device = getDeviceProfile();
  const nCtx = settings.contextOverride ?? defaultContext(device.totalRamBytes);
  const fit = fitFor(spec, device.totalRamBytes, nCtx);
  const verified = settings.verified[spec.id];
  const status = deriveModelStatus({ modelId: spec.id, download: dl, engine: eng, verified: !!verified });
  const actions = actionsFor(status.kind, dl.retryable);

  const [checksum, setChecksum] = useState<{ fraction: number; message?: string } | null>(null);
  const token = useRef<CancelToken>({ cancelled: false });

  const run = async (action: ModelAction): Promise<void> => {
    switch (action) {
      case 'download':
      case 'resume':
      case 'retry': {
        if (action === 'download' && fit === 'too_heavy') {
          const ok = await confirm(
            'Too heavy for this phone',
            `${spec.name} needs about ${formatBytes(estimateRamBytes(spec, nCtx))} of memory and this phone reports ${device.totalRamBytes ? formatBytes(device.totalRamBytes) : 'unknown'}. It will probably not load. Download anyway?`,
            'Download anyway',
          );
          if (!ok) return;
        }
        const r = await downloads.start(spec);
        if (!r.ok) notify('Cannot download yet', r.message);
        return;
      }
      case 'pause':
        return downloads.pause(spec.id);
      case 'cancel': {
        const ok = await confirm('Cancel download?', 'The partly downloaded file will be deleted.', 'Cancel download', true);
        if (ok) await downloads.cancel(spec, true);
        return;
      }
      case 'load': {
        const heavy = fit === 'too_heavy';
        if (heavy) {
          const ok = await confirm('Try anyway?', `This model is likely too big for this phone and Android may close CHIWIWI. Try loading it anyway?`, 'Try anyway');
          if (!ok) return;
        }
        const r = await engine.mount(spec, { force: heavy });
        if (r.ok) showToast(`${spec.name} is ready · ${r.tokensPerSecond.toFixed(1)} tok/s`);
        else notify('Could not load the model', r.message);
        return;
      }
      case 'unload':
        await engine.unmount();
        showToast('Model unloaded from memory');
        return;
      case 'start_chat':
        resetTo('chat');
        return;
      case 'delete': {
        const ok = await confirm(`Delete ${spec.name}?`, `This frees ${formatBytes(spec.sizeBytes)}. You can download it again later.`, 'Delete', true);
        if (!ok) return;
        if (eng.modelId === spec.id) await engine.unmount();
        if (settings.activeModelId === spec.id) updateSettings({ activeModelId: null });
        await downloads.remove(spec);
        showToast(`${spec.name} deleted`);
        return;
      }
      case 'verify_checksum': {
        if (checksum) {
          token.current.cancelled = true;
          return;
        }
        token.current = { cancelled: false };
        setChecksum({ fraction: 0 });
        try {
          const expected = spec.sha256 || (await fetchRemoteFileInfo(spec.repo, spec.filename)).sha256;
          if (!expected) {
            setChecksum({ fraction: 0, message: 'The Hub did not publish a checksum for this file.' });
            return;
          }
          const r = await deepVerify(spec, expected, (f) => setChecksum({ fraction: f }), token.current);
          setChecksum(r.cancelled ? null : { fraction: 1, message: r.ok ? 'Checksum matches the official file.' : 'Checksum does NOT match. Delete and download again.' });
        } catch (e) {
          setChecksum({ fraction: 0, message: e instanceof Error ? e.message : 'Could not check the checksum.' });
        }
        return;
      }
    }
  };

  const labelFor: Record<ModelAction, string> = {
    download: `Download · ${formatBytes(spec.sizeBytes)}`,
    pause: 'Pause',
    resume: 'Resume',
    retry: 'Try again',
    cancel: 'Cancel',
    load: 'Load & use',
    unload: 'Unload',
    delete: 'Delete',
    verify_checksum: checksum ? 'Stop check' : 'Check file integrity',
    start_chat: 'Start chatting',
  };

  const iconFor = (a: ModelAction) =>
    a === 'download' || a === 'retry' ? <DownloadIcon size={15} color={colors.black} /> : a === 'pause' ? <PauseIcon size={14} color={colors.text} /> : a === 'resume' ? <PlayIcon size={14} color={colors.black} /> : a === 'delete' ? <TrashIcon size={14} color={colors.bad} /> : a === 'load' ? <ZapIcon size={15} color={colors.black} /> : undefined;

  const variantFor = (a: ModelAction) =>
    a === 'download' || a === 'resume' || a === 'retry' || a === 'load' || a === 'start_chat' ? ('primary' as const) : a === 'delete' || a === 'cancel' ? ('danger' as const) : ('secondary' as const);

  const primary = actions.filter((a) => ['download', 'resume', 'retry', 'load', 'start_chat', 'pause'].includes(a));
  const secondary = actions.filter((a) => !primary.includes(a));
  const downloadingNow = dl.status === 'downloading' || dl.status === 'resolving' || dl.status === 'paused' || dl.status === 'finalizing';

  return (
    <Card style={status.kind === 'active' ? { borderColor: colors.good } : recommended ? { borderColor: colors.accent } : undefined}>
      <View style={styles.top}>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={styles.titleRow}>
            <Text style={styles.name}>{spec.name}</Text>
            <Badge label={`GRADE ${spec.grade}`} tone={spec.grade === 'S' ? 'warn' : spec.grade === 'B' ? 'accent' : 'neutral'} />
            {spec.contentPolicy === 'Uncensored' ? <Badge label="UNCENSORED" tone="bad" /> : null}
            {recommended ? <Badge label="RECOMMENDED" tone="accent" /> : null}
          </View>
          <Text style={styles.repo}>{spec.repo}</Text>
        </View>
        <Text style={styles.size}>{formatBytes(spec.sizeBytes)}</Text>
      </View>

      <Text style={styles.desc}>{spec.description}</Text>

      <View style={styles.badges}>
        {spec.capabilities.map((c) => (
          <Badge key={c} label={c} />
        ))}
        <Badge label={FIT_LABEL[fit]} tone={FIT_TONE[fit]} />
        <Badge label={`~${formatBytes(estimateRamBytes(spec, nCtx))} RAM`} />
      </View>

      <View style={styles.statusRow}>
        <View style={[styles.statusDot, { backgroundColor: status.tone === 'good' ? colors.good : status.tone === 'bad' ? colors.bad : status.tone === 'warn' ? colors.warn : status.tone === 'accent' ? colors.accent : colors.faint }]} />
        <Text style={[styles.status, { color: status.tone === 'neutral' ? colors.muted : status.tone === 'good' ? colors.good : status.tone === 'bad' ? colors.bad : status.tone === 'warn' ? colors.warn : colors.accent }]}>{status.label}</Text>
        {verified && status.kind !== 'active' ? <Text style={styles.statusNote}>{verified.tokensPerSecond.toFixed(1)} tok/s</Text> : null}
      </View>

      {downloadingNow && dl.totalBytes > 0 ? (
        <View style={{ gap: 6 }}>
          <ProgressBar fraction={dl.bytesWritten / dl.totalBytes} color={dl.status === 'paused' ? colors.warn : colors.accent} />
          <View style={styles.progressRow}>
            <Text style={styles.statusNote}>
              {formatBytes(dl.bytesWritten)} / {formatBytes(dl.totalBytes)} · {formatPercent(dl.bytesWritten / dl.totalBytes)}
            </Text>
            {dl.status === 'downloading' ? <Text style={styles.statusNote}>{formatSpeed(dl.speedBps)} · {dl.etaSec > 0 ? `${formatDuration(dl.etaSec)} left` : 'estimating...'}</Text> : null}
          </View>
        </View>
      ) : null}

      {dl.status === 'error' && dl.error ? <Text style={styles.error}>{dl.error}</Text> : null}
      {eng.status === 'error' && eng.modelId === spec.id && eng.error ? <Text style={styles.error}>{eng.error}</Text> : null}
      {dl.status === 'paused' && dl.note ? <Text style={styles.statusNote}>{dl.note}</Text> : null}

      {checksum ? (
        <View style={{ gap: 6 }}>
          {checksum.message ? <Text style={[styles.statusNote, { color: checksum.message.startsWith('Checksum matches') ? colors.good : colors.warn }]}>{checksum.message}</Text> : <Text style={styles.statusNote}>Checking file integrity (slow on phones)... {formatPercent(checksum.fraction)}</Text>}
          {!checksum.message ? <ProgressBar fraction={checksum.fraction} color={colors.good} /> : null}
          {checksum.message ? <Btn small variant="ghost" label="Dismiss" onPress={() => setChecksum(null)} /> : null}
        </View>
      ) : null}

      {actions.length > 0 ? (
        <View style={{ gap: 8 }}>
          {primary.length > 0 ? (
            <View style={styles.actions}>
              {primary.map((a) => (
                <Btn key={a} variant={variantFor(a)} label={labelFor[a]} icon={iconFor(a)} onPress={() => run(a)} style={{ flex: 1 }} debounceMs={600} />
              ))}
            </View>
          ) : null}
          {secondary.length > 0 ? (
            <View style={styles.actions}>
              {secondary.map((a) => (
                <Btn key={a} small variant={variantFor(a)} label={labelFor[a]} icon={iconFor(a)} onPress={() => run(a)} disabled={a === 'verify_checksum' && !!checksum?.message} />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  name: { color: colors.text, fontSize: font.lg, fontWeight: '700' },
  repo: { color: colors.faint, fontSize: font.xs },
  size: { color: colors.muted, fontSize: font.md, fontWeight: '600' },
  desc: { color: colors.muted, fontSize: font.sm, lineHeight: 18 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  status: { fontSize: font.sm, fontWeight: '700' },
  statusNote: { color: colors.faint, fontSize: font.xs },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  error: { color: colors.bad, fontSize: font.sm, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
});
