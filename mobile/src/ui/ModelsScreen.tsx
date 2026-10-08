import React, { useEffect, useMemo } from 'react';
import { MODEL_CATALOG, type ModelSpec } from '../core/catalog.ts';
import { IDLE_STATE } from '../core/downloadManager.ts';
import { defaultContext, recommendModel } from '../core/fit.ts';
import { formatBytes } from '../core/format.ts';
import { getDeviceProfile } from '../services/device.ts';
import { refreshDownloads, useDownloadItems } from '../services/downloads.ts';
import { useEngineState } from '../services/engine.ts';
import { useSettings } from '../services/settings.ts';
import { describeLocation, freeSpaceBytes, useStorage } from '../services/storage.ts';
import { Divider } from './Divider';
import { AvailableRow, DownloadCard, InstalledCard, modelStatus, type ModelCtx } from './ModelCards';
import { goBack, push } from './nav';
import { Row } from './Row';
import { Screen } from './Screen';
import { SetupCard } from './SetupCard';
import { Text } from './Text';

type Group = 'downloading' | 'installed' | 'available';
const GROUP: Record<string, Group> = {
  resolving: 'downloading',
  downloading: 'downloading',
  paused: 'downloading',
  finalizing: 'downloading',
  download_error: 'downloading',
  installed: 'installed',
  loading: 'installed',
  active: 'installed',
  load_failed: 'installed',
  not_downloaded: 'available',
};

/**
 * Models in one scroll: the recommended download first, then what is downloading, what is installed, what else exists.
 * The data and actions are the real ones; Phase 2 owns the final polish.
 */
export function ModelsScreen() {
  const device = getDeviceProfile();
  const settings = useSettings();
  const storage = useStorage();
  const eng = useEngineState();
  const items = useDownloadItems();

  // Re-read the disk whenever this screen opens (installed models, resumable partials).
  useEffect(() => {
    refreshDownloads();
  }, [storage.config?.rootPath]);

  const ctx: ModelCtx = { nCtx: settings.contextOverride ?? defaultContext(device.totalRamBytes), ramBytes: device.totalRamBytes, eng, verified: settings.verified };
  const recommended = useMemo(() => recommendModel(MODEL_CATALOG, device.totalRamBytes), [device.totalRamBytes]);

  const groups: Record<Group, ModelSpec[]> = { downloading: [], installed: [], available: [] };
  for (const m of MODEL_CATALOG) groups[GROUP[modelStatus(m, items[m.id] ?? IDLE_STATE, ctx).status.kind] ?? 'available'].push(m);
  // The suggested model keeps its one-tap card (download + load + proof) until it is on the phone.
  const showRecommended = !!recommended && [...groups.available, ...groups.downloading].some((m) => m.id === recommended.id);
  const rest = groups.available.filter((m) => !(showRecommended && m.id === recommended?.id));
  const downloading = groups.downloading.filter((m) => !(showRecommended && m.id === recommended?.id));
  const free = freeSpaceBytes();

  return (
    <Screen title="Models" onBack={goBack} scroll>
      <Text variant="small">{`Your phone: ${device.name}${device.totalRamBytes ? ` · ${formatBytes(device.totalRamBytes)} memory` : ''}. Models download once, then work offline.`}</Text>

      {showRecommended && recommended ? <SetupCard spec={recommended} deviceName={device.name} tone="recommended" /> : null}

      {downloading.length > 0 ? <Text variant="label">Downloading</Text> : null}
      {downloading.map((m) => (
        <DownloadCard key={m.id} spec={m} dl={items[m.id] ?? IDLE_STATE} ctx={ctx} />
      ))}

      {groups.installed.length > 0 ? <Text variant="label">On this phone</Text> : null}
      {groups.installed.map((m) => (
        <InstalledCard key={m.id} spec={m} dl={items[m.id] ?? IDLE_STATE} ctx={ctx} />
      ))}

      {rest.length > 0 ? <Text variant="label">{showRecommended || groups.installed.length > 0 || downloading.length > 0 ? 'More models' : 'Models'}</Text> : null}
      {rest.map((m, i) => (
        <React.Fragment key={m.id}>
          {i > 0 ? <Divider /> : null}
          <AvailableRow spec={m} ctx={ctx} />
        </React.Fragment>
      ))}

      {storage.config ? (
        <>
          <Divider />
          <Row title="Saved in" subtitle={`${describeLocation(storage.config)}${free ? ` · ${formatBytes(free)} free` : ''}`} onPress={() => push('settings/storage')} />
        </>
      ) : null}
    </Screen>
  );
}
