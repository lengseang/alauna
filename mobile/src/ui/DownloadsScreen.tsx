import React, { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { getModel, type ModelSpec } from '../core/catalog.ts';
import { formatBytes, formatDuration, formatSpeed } from '../core/format.ts';
import { downloads, resumeAllDownloads, useDownloadsHub } from '../services/downloads.ts';
import { useEngineState } from '../services/engine.ts';
import { installedBytes } from '../services/modelLibrary.ts';
import { locateModelFile, useStorageSlots } from '../services/storage.ts';
import { refreshSlots } from '../services/storageSlots.ts';
import { showToast } from '../services/toast.ts';
import { makeStyles } from '../theme';
import { Button } from './Button';
import { Divider } from './Divider';
import { ProgressBar } from './ProgressBar';
import { InstalledRow, QueueCard } from './ModelCards';
import { Notice } from './Notice';
import { Row } from './Row';
import { Screen } from './Screen';
import { SectionHeader } from './SectionHeader';
import { Segmented } from './Segmented';
import { Stat } from './Stat';
import { Text } from './Text';
import { confirm } from './confirm';
import { applySavedConcurrency, saveConcurrency } from './downloadPrefs';
import { goBack, push } from './nav';
import { partitionDownloads } from './vaultLogic';

const specs = (ids: string[]): ModelSpec[] => ids.map((id) => getModel(id)).filter((m): m is ModelSpec => !!m);

/**
 * Downloads Hub: the live queue (speed, ETA, parts, verification), reorder, pause and resume one or all, parallel
 * downloads, failures with their reason and a retry, and what is installed with its disk use per storage slot.
 */
export function DownloadsScreen() {
  const s = useStyles();
  const hub = useDownloadsHub();
  const eng = useEngineState();
  const slots = useStorageSlots();
  const { summary } = hub;
  const open = (id: string) => push('models/detail', { id });
  const groups = useMemo(() => partitionDownloads(hub.items, hub.queue), [hub.items, hub.queue]);
  const installedKey = groups.installed.join('|');
  const nothing = groups.active.length + groups.queued.length + groups.paused.length + groups.failed.length === 0;

  useEffect(() => {
    void applySavedConcurrency();
  }, []);
  useEffect(() => {
    refreshSlots();
  }, [installedKey]);

  const installed = useMemo(() => specs(groups.installed), [installedKey]);
  const diskTotal = useMemo(() => installedBytes(installed), [installed]);
  const slotOf = (spec: ModelSpec): string | null => {
    const id = locateModelFile(spec.filename)?.slotId;
    return (id && slots.find((x) => x.id === id)?.label) || null;
  };

  const clearFailed = async () => {
    const failed = specs(groups.failed);
    if (!(await confirm('Clear failed downloads?', `The partly downloaded files of ${failed.length} ${failed.length === 1 ? 'model' : 'models'} will be deleted.`, 'Clear', true))) return;
    for (const m of failed) await downloads.cancel(m, true);
    showToast('Failed downloads cleared');
  };

  const queueSection = (title: string, ids: string[], hint?: string) =>
    ids.length === 0 ? null : (
      <View style={s.section}>
        <SectionHeader title={title} hint={hint} />
        {specs(ids).map((m) => (
          <QueueCard key={m.id} spec={m} queueIndex={groups.queued.indexOf(m.id)} queueLength={groups.queued.length} onOpen={open} />
        ))}
      </View>
    );

  return (
    <Screen title="Downloads" onBack={goBack} scroll>
      <View style={s.stats}>
        <Stat label="Speed" value={summary.speedBps > 0 ? formatSpeed(summary.speedBps) : null} hint="all downloads" style={s.stat} />
        <Stat label="Left" value={formatBytes(summary.bytesRemaining)} hint={`${summary.active + summary.queued + summary.paused} in the list`} style={s.stat} />
        <Stat label="Time" value={summary.etaSec > 0 ? formatDuration(summary.etaSec) : null} hint="at this speed" style={s.stat} />
      </View>

      <View style={s.buttons}>
        <Button label="Pause all" variant="quiet" icon="pause" disabled={summary.active + summary.queued === 0} onPress={() => downloads.pauseAll()} />
        <Button label="Resume all" variant="quiet" icon="play" disabled={summary.paused + summary.failed === 0} onPress={() => resumeAllDownloads()} />
        {summary.failed > 0 ? <Button label="Clear failed" variant="text" onPress={clearFailed} /> : null}
      </View>

      <View style={s.group}>
        <Segmented
          label="Downloads at the same time"
          options={[
            { value: '1', label: '1' },
            { value: '2', label: '2' },
            { value: '3', label: '3' },
            { value: '4', label: '4' },
          ]}
          value={String(hub.concurrency)}
          onChange={(v) => saveConcurrency(Number(v))}
        />
        <Text variant="small">Downloads at the same time. More can be faster on a fast network; one at a time is gentler on a weak one.</Text>
      </View>

      {nothing ? (
        <Notice tone="quiet" title="No downloads running" action={<Button label="Open the Model Vault" variant="quiet" onPress={() => void goBack()} />}>
          Models you download from Hugging Face show up here with speed, time left and a fingerprint check, and keep going if you leave the app.
        </Notice>
      ) : null}
      {queueSection('Downloading', groups.active)}
      {queueSection('Waiting', groups.queued, 'They start in this order. Move one up to go next.')}
      {queueSection('Paused', groups.paused)}
      {queueSection('Needs attention', groups.failed)}
      {groups.verifying.length > 0 ? (
        <View style={s.section}>
          <SectionHeader title="Verifying in the background" hint="These models are already usable. The fingerprint check never blocks the queue; a damaged file is removed automatically." />
          {specs(groups.verifying).map((m) => {
            const dl = hub.items[m.id];
            return (
              <View key={m.id}>
                <Text variant="strong">{m.name}</Text>
                <Text variant="small">{`Verifying ${Math.round((dl?.verifyFraction ?? 0) * 100)}% · usable now${dl?.verifyEtaSec ? ` · ${formatDuration(dl.verifyEtaSec)} left` : ''}`}</Text>
                <ProgressBar fraction={dl?.verifyFraction ?? 0} label={`${m.name} verification`} />
              </View>
            );
          })}
        </View>
      ) : null}

      <View style={s.section}>
        <SectionHeader title="On this phone" hint={installed.length ? `${installed.length} ${installed.length === 1 ? 'model' : 'models'} · ${formatBytes(diskTotal)} on disk, add-ons included` : undefined} />
        {installed.length === 0 ? <Text variant="small">Nothing is installed yet.</Text> : null}
        <View>
          {installed.map((m, i) => (
            <React.Fragment key={m.id}>
              {i > 0 ? <Divider /> : null}
              <InstalledRow spec={m} active={eng.modelId === m.id && (eng.status === 'ready' || eng.status === 'generating')} slotLabel={slotOf(m)} onOpen={open} />
            </React.Fragment>
          ))}
        </View>
      </View>

      <View style={s.section}>
        <SectionHeader title="Storage" hint="Where model files live. Move a model between slots from its details." />
        <View>
          <Divider />
          {slots.map((x) => (
            <React.Fragment key={x.id}>
              <Row
                title={`${x.label}${x.isDownloadTarget ? ' (new downloads)' : ''}`}
                value={x.modelBytes !== null ? formatBytes(x.modelBytes) : undefined}
                subtitle={x.available ? `${x.modelFiles} model ${x.modelFiles === 1 ? 'file' : 'files'} · ${x.freeBytes !== null ? `${formatBytes(x.freeBytes)} free` : 'free space not reported for this location'}` : 'Not available right now'}
              />
              <Divider />
            </React.Fragment>
          ))}
          <Row title="Manage storage slots" subtitle="Add a folder, choose where new downloads go." onPress={() => push('settings/storage')} />
          <Divider />
        </View>
      </View>
    </Screen>
  );
}

const useStyles = makeStyles(({ colors, space, line }) => ({
  stats: { flexDirection: 'row', borderTopWidth: line, borderBottomWidth: line, borderColor: colors.border },
  stat: { flex: 1, paddingVertical: space.md, paddingHorizontal: space.xs },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  group: { gap: space.sm },
  section: { gap: space.md },
}));
