import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { getModel, type ModelSpec } from '../../core/catalog.ts';
import { formatBytes } from '../../core/format.ts';
import { onStorageChanged } from '../../services/lifecycle.ts';
import { moveModel, refreshSlots, vaultUsage, type VaultUsage } from '../../services/storageSlots.ts';
import {
  addFolderSlot,
  addInternalSlot,
  describeLocation,
  INTERNAL_SLOT_ID,
  locateModelFile,
  MAX_SLOTS,
  openAllFilesAccessSettings,
  removeSlot,
  setDownloadSlot,
  useStorage,
  useStorageSlots,
  volumeSpace,
  canPickExternalFolder,
  type SlotInfo,
} from '../../services/storage.ts';
import { showToast } from '../../services/toast.ts';
import { makeStyles } from '../../theme';
import { Button } from '../Button';
import { confirm } from '../confirm';
import { goBack } from '../nav';
import { Notice } from '../Notice';
import { ProgressBar } from '../ProgressBar';
import { ListRow } from '../Row';
import { Screen } from '../Screen';
import { Sheet } from '../Sheet';
import { Stat } from '../Stat';
import { StoragePicker } from '../StoragePicker';
import { Tag } from '../Tag';
import { Text } from '../Text';
import { useInstalledIds } from '../useInstalled';
import { slotLine } from './logic';
import { galleryHidden, Group, PurgeActions, Rows, StatRow } from './parts';

type SlotProblem = { message: string; pickedUri?: string; needsAccess: boolean };

/** Settings > Data and storage: where things are, how big each part is, up to five locations, moving models, erasing. */
export function StorageScreen() {
  const s = useStyles();
  const storage = useStorage();
  const slots = useStorageSlots();
  const installed = useInstalledIds();
  const [usage, setUsage] = useState<VaultUsage | null>(null);
  const [hidden, setHidden] = useState<boolean | null>(null);
  const [changing, setChanging] = useState(false);
  const [problem, setProblem] = useState<SlotProblem | null>(null);
  const [pick, setPick] = useState<ModelSpec | null>(null);
  const [quick, setQuick] = useState(false);
  const [moving, setMoving] = useState<{ name: string; stage: string; fraction: number } | null>(null);
  const token = useRef({ cancelled: false });

  const refresh = useCallback(() => {
    refreshSlots();
    setUsage(vaultUsage());
    setHidden(galleryHidden());
  }, []);
  useEffect(() => {
    const id = setTimeout(refresh, 60); // let the screen paint before walking folders
    return () => clearTimeout(id);
  }, [refresh]);

  const cfg = storage.config;
  const space = cfg ? volumeSpace(cfg.rootPath) : { freeBytes: null, totalBytes: null };
  const hasInternal = slots.some((x) => x.id === INTERNAL_SLOT_ID);
  const full = slots.length >= MAX_SLOTS;

  const afterAdd = (r: Awaited<ReturnType<typeof addFolderSlot>>) => {
    if (r.ok) {
      setProblem(null);
      showToast(`Added ${r.slot.label}`);
      refresh();
    } else if (r.reason !== 'cancelled') {
      setProblem({ message: r.message, pickedUri: r.pickedUri, needsAccess: r.reason === 'needs_permission' });
    }
  };

  const move = async (spec: ModelSpec, to: SlotInfo) => {
    setPick(null);
    const from = locateModelFile(spec.filename);
    if (!(await confirm(`Move ${spec.name}?`, `It is copied to "${to.label}", checked, and only then deleted from ${slots.find((x) => x.id === from?.slotId)?.label ?? 'where it is now'}. The old copy stays if anything goes wrong. This can take several minutes.`, 'Move'))) return;
    token.current = { cancelled: false };
    setMoving({ name: spec.name, stage: 'copying', fraction: 0 });
    const r = await moveModel(spec, to.id, {
      verify: quick ? 'size' : 'sha256',
      token: token.current,
      onProgress: (stage, fraction) => setMoving({ name: spec.name, stage, fraction }),
    });
    setMoving(null);
    showToast(r.ok ? `${spec.name} moved (${formatBytes(r.bytes)}, checked by ${r.verified === 'sha256' ? 'SHA-256' : 'size'})` : r.message);
    refresh();
  };

  const models = installed.map((id) => getModel(id)).filter((m): m is ModelSpec => !!m);
  const usageRows: Array<[string, number | undefined]> = [
    ['Models', usage?.models],
    ['Chats', usage?.chats],
    ['Memory', usage?.memory],
    ['Photos and files', usage?.media],
    ['KV cache', usage?.kvCache],
  ];

  return (
    <Screen title="Storage" onBack={goBack} scroll>
      <Group index={1} title="Main location" hint="Chats, memory and attachments live here. Models can live in any location below.">
        {cfg ? (
          <>
            <Text selectable>{describeLocation(cfg)}</Text>
            <Text variant="small" selectable>
              {cfg.rootPath}
            </Text>
            <StatRow>
              <Stat label="CHIWIWI uses" value={usage ? formatBytes(usage.total) : null} />
              <Stat label="Free" value={space.freeBytes !== null ? formatBytes(space.freeBytes) : null} hint={space.freeBytes === null ? 'unknown for this volume' : undefined} />
              <Stat label="Volume" value={space.totalBytes !== null ? formatBytes(space.totalBytes) : null} />
            </StatRow>
          </>
        ) : null}
        {storage.status !== 'ready' && storage.reason ? <Notice tone="danger">{storage.reason}</Notice> : null}
        {!changing ? (
          <Button label="Change main location" variant="quiet" onPress={() => setChanging(true)} />
        ) : (
          <>
            <Notice>
              Changing the main location does not move your files. Chats and memory stay in the old place (copy the CHIWIWI folder yourself to keep them). The model that is loaded now will be unloaded.
            </Notice>
            <StoragePicker
              onDone={async () => {
                await onStorageChanged();
                setChanging(false);
                showToast('Storage location updated');
                refresh();
              }}
            />
            <Button label="Keep the current location" variant="text" onPress={() => setChanging(false)} />
          </>
        )}
      </Group>

      <Group index={2} title="What is stored" hint="Measured from the folders just now.">
        <Rows>
          {usageRows.map(([name, bytes]) => (
            <ListRow key={name} title={name} value={bytes === undefined ? '...' : formatBytes(bytes)} />
          ))}
          <ListRow title="Hidden from gallery apps" subtitle="A .nomedia marker keeps photo and cloud apps out of the vault." value={hidden === null ? 'unknown' : hidden ? 'Yes' : 'No'} />
        </Rows>
      </Group>

      <Group index={3} title={`Locations (${slots.length} of ${MAX_SLOTS})`} hint="Model files can sit in app storage, an SD card or any folder. New downloads go to the one marked for downloads.">
        {slots.map((slot) => (
          <View key={slot.id} style={s.slot}>
            <ListRow title={slot.label} subtitle={`${slotLine(slot)}\n${slot.rootPath}`} value={slot.isPrimary ? 'Main' : undefined} />
            <View style={s.tags}>
              {slot.isPrimary ? <Tag label="Main vault" tone="accent" /> : null}
              {slot.isDownloadTarget ? <Tag label="New downloads" tone="accent" /> : null}
              {slot.kind === 'folder' ? <Tag label="Your folder" /> : <Tag label="App storage" />}
            </View>
            <View style={s.actions}>
              {!slot.isDownloadTarget ? (
                <Button
                  label="Download here"
                  variant="text"
                  onPress={() => {
                    const r = setDownloadSlot(slot.id);
                    showToast(r.ok ? `New models go to ${slot.label}` : r.message);
                  }}
                />
              ) : null}
              {!slot.isPrimary ? (
                <Button
                  label="Remove"
                  variant="text"
                  onPress={async () => {
                    if (!(await confirm(`Remove ${slot.label}?`, 'Only the entry is removed from CHIWIWI. Files in the folder are not deleted. It is refused while models are still in it.', 'Remove', true))) return;
                    const r = removeSlot(slot.id);
                    showToast(r.ok ? 'Location removed' : r.message);
                    refresh();
                  }}
                />
              ) : null}
            </View>
          </View>
        ))}
        {problem ? (
          <Notice
            tone="danger"
            action={
              problem.needsAccess && problem.pickedUri ? (
                <Button
                  label="Open Android settings"
                  variant="quiet"
                  busyLabel="Checking..."
                  onPress={async () => {
                    await openAllFilesAccessSettings();
                    afterAdd(await addFolderSlot(problem.pickedUri));
                  }}
                />
              ) : undefined
            }
          >
            {problem.message}
          </Notice>
        ) : null}
        {!full && canPickExternalFolder() ? <Button label="Add a folder or SD card" variant="quiet" busyLabel="Waiting for you to pick..." onPress={async () => afterAdd(await addFolderSlot())} /> : null}
        {!full && !hasInternal && cfg?.mode === 'external' ? <Button label="Add app storage" variant="quiet" onPress={async () => afterAdd(await addInternalSlot())} /> : null}
        {full ? <Text variant="small">The limit is five locations. Remove one to add another.</Text> : null}
      </Group>

      <Group index={4} title="Move models" hint={slots.length < 2 ? 'Add a second location above to move models between locations.' : 'Tap a model to choose where it should live.'}>
        {moving ? (
          <View style={s.slot}>
            <Text variant="strong">{moving.name}</Text>
            <ProgressBar fraction={moving.fraction} label={`${moving.stage} ${moving.name}`} />
            <Text variant="small">{`${moving.stage === 'copying' ? 'Copying' : moving.stage === 'verifying' ? 'Checking the copy' : 'Cleaning up'} · ${Math.round(moving.fraction * 100)}%`}</Text>
            <Button label="Cancel" variant="quiet" onPress={() => {
                token.current.cancelled = true;
              }} />
          </View>
        ) : null}
        <Rows>
          {models.map((m) => {
            const where = locateModelFile(m.filename);
            return <ListRow key={m.id} title={m.name} subtitle={formatBytes(m.sizeBytes)} value={slots.find((x) => x.id === where?.slotId)?.label ?? '...'} onPress={slots.length >= 2 && !moving ? () => setPick(m) : undefined} />;
          })}
        </Rows>
        {models.length === 0 ? <Text variant="small">No models downloaded yet.</Text> : null}
      </Group>

      <Group index={5} title="Erase" hint="Each action asks first. Models and settings are never touched here; delete models in the Model Vault.">
        <PurgeActions kinds={['chats', 'memory', 'kv', 'media', 'all']} onDone={refresh} />
      </Group>

      <Sheet visible={!!pick} onClose={() => setPick(null)} title={pick ? `Move ${pick.name}` : 'Move'}>
        <ListRow title="Quick check only" subtitle="Compare size and file header instead of the full SHA-256 (much faster, a little less safe)." switchValue={quick} onSwitch={setQuick} />
        {pick
          ? slots
              .filter((x) => x.id !== locateModelFile(pick.filename)?.slotId)
              .map((x) => <ListRow key={x.id} title={x.label} subtitle={x.freeBytes !== null ? `${formatBytes(x.freeBytes)} free` : 'free space unknown'} onPress={() => move(pick, x)} />)
          : null}
      </Sheet>
    </Screen>
  );
}

const useStyles = makeStyles(({ space }) => ({
  slot: { gap: space.xs },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingHorizontal: space.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
}));
