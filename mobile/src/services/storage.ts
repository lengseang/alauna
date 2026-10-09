/**
 * Storage "vault": the single folder that holds models, chats, memory and media.
 *
 * Rules (docs/REQUIREMENTS.md ST-1..ST-6):
 *  - Nothing else in the app works until a vault is configured and PROVEN usable.
 *  - The user can pick an external folder, or use app-private storage.
 *  - A folder is only accepted after a real write/read probe succeeds.
 *
 * Why the probe + path mapping: the AI engine (llama.cpp) opens models by real
 * file path. Android's picker returns a content:// URI which it cannot read, so we
 * translate it to /storage/... and require that path to be writable (which on
 * Android 11+ needs "All files access"). If that is refused, the user can fall
 * back to app-private storage, which always works.
 */
import { useSyncExternalStore } from 'react';
import { Linking, PermissionsAndroid, Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { readWithFallback, writeAtomic } from '../core/atomicFile.ts';
import { newId } from '../core/chatTypes.ts';
import { createStore } from '../core/store.ts';
import { baseName, joinPath, pathToUri, safTreeUriToPath, uriToPath } from '../core/paths.ts';
import { directoryIO } from './atomicIo.ts';
import { getDeviceProfile } from './device.ts';
import { settingsStore, updateSettings } from './settings.ts';

/** Must equal expo.android.package in app.json (checked by test/config.test.ts). */
export const APP_PACKAGE = 'com.chiwiwi.sovereign';
export const VAULT_DIRNAME = 'CHIWIWI';
const CONFIG_FILE = 'chiwiwi_storage_config.json';

export type StorageMode = 'internal' | 'external';

/**
 * A storage slot = a root folder that can hold models (`<root>/models`). The main vault is always slot `primary`
 * (it also holds chats, memory and media). Up to MAX_SLOTS roots in total: app storage and folders the user picked.
 */
export interface StorageSlot {
  id: string;
  kind: 'internal' | 'folder';
  label: string;
  /** Real filesystem path of the slot root (the CHIWIWI folder). */
  rootPath: string;
  pickedUri?: string;
  addedAt: number;
}

export const MAX_SLOTS = 5;
export const PRIMARY_SLOT_ID = 'primary';
export const INTERNAL_SLOT_ID = 'internal';

export interface StorageConfig {
  version: 1 | 2;
  mode: StorageMode;
  /** Real filesystem path of the vault root (no scheme, not percent-encoded). */
  rootPath: string;
  /** Original SAF URI the user picked (external mode only). */
  pickedUri?: string;
  configuredAt: number;
  /** v2: extra model slots (the vault itself is not listed here). */
  slots?: StorageSlot[];
}

/** A slot with its live numbers (services/storageSlots.ts `refreshSlots`). */
export interface SlotInfo extends StorageSlot {
  isPrimary: boolean;
  /** New model downloads go here (Settings.storage.modelSlotId). */
  isDownloadTarget: boolean;
  /** Folder exists and is readable right now. */
  available: boolean;
  /** Bytes of everything under the slot root (measured by walking the folder). */
  usedBytes: number | null;
  /** Bytes of GGUF/partial files in `<root>/models`, and their count. */
  modelBytes: number | null;
  modelFiles: number;
  /** Free bytes on that volume; null = Android gives no number for this volume (e.g. SD card) without native code. */
  freeBytes: number | null;
  totalBytes: number | null;
}

export interface StorageState {
  status: 'loading' | 'unconfigured' | 'ready' | 'unavailable';
  config: StorageConfig | null;
  /** Why the saved location cannot be used (status === 'unavailable'). */
  reason?: string;
  /** Live slot list (refreshSlots); [] until measured. */
  slots: SlotInfo[];
}

export const storageStore = createStore<StorageState>({ status: 'loading', config: null, slots: [] });

export type ExternalFailure = 'cancelled' | 'unmappable' | 'needs_permission' | 'not_writable';
export type ExternalResult =
  | { ok: true; config: StorageConfig }
  | { ok: false; reason: ExternalFailure; message: string; pickedUri?: string; rootPath?: string };

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

function dirAt(path: string): Directory {
  return new Directory(pathToUri(path));
}

const configIO = () => directoryIO(() => Paths.document);

/** Validate a config read from disk (v1 or v2). Exported for tests. */
export function sanitizeStorageConfig(raw: unknown): StorageConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Partial<StorageConfig>;
  if ((p.version !== 1 && p.version !== 2) || typeof p.rootPath !== 'string' || (p.mode !== 'internal' && p.mode !== 'external')) return null;
  const slots: StorageSlot[] = [];
  for (const x of Array.isArray(p.slots) ? p.slots : []) {
    const s = x as Partial<StorageSlot>;
    if (!s || typeof s.id !== 'string' || typeof s.rootPath !== 'string' || (s.kind !== 'internal' && s.kind !== 'folder')) continue;
    if (s.id === PRIMARY_SLOT_ID || s.rootPath === p.rootPath || slots.some((o) => o.id === s.id || o.rootPath === s.rootPath)) continue;
    slots.push({
      id: s.id,
      kind: s.kind,
      label: typeof s.label === 'string' ? s.label : s.rootPath,
      rootPath: s.rootPath,
      ...(typeof s.pickedUri === 'string' ? { pickedUri: s.pickedUri } : {}),
      addedAt: typeof s.addedAt === 'number' ? s.addedAt : 0,
    });
  }
  return {
    version: 2,
    mode: p.mode,
    rootPath: p.rootPath,
    ...(typeof p.pickedUri === 'string' ? { pickedUri: p.pickedUri } : {}),
    configuredAt: typeof p.configuredAt === 'number' ? p.configuredAt : 0,
    slots: slots.slice(0, MAX_SLOTS - 1),
  };
}

async function readConfig(): Promise<StorageConfig | null> {
  try {
    return await readWithFallback(configIO(), CONFIG_FILE, (text) => sanitizeStorageConfig(JSON.parse(text)));
  } catch {
    return null; // corrupt config => treat as unconfigured
  }
}

/** Atomic (tmp + rename): a kill mid-write cannot lose the storage choice. */
function saveConfig(config: StorageConfig): void {
  writeAtomic(configIO(), CONFIG_FILE, JSON.stringify({ ...config, version: 2 }));
}

/** Write -> read back -> delete a tiny file. The only reliable test that a folder is usable. */
export async function probeWritable(rootPath: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const dir = dirAt(rootPath);
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const f = new File(dir, '.chiwiwi_probe');
    if (f.exists) f.delete();
    f.create();
    f.write('chiwiwi');
    const back = await f.text();
    f.delete();
    return back === 'chiwiwi' ? { ok: true } : { ok: false, error: 'Read-back did not match what was written.' };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

function ensureLayout(rootPath: string, subs: string[] = ['models', 'chats', 'media', 'gallery']): void {
  const root = dirAt(rootPath);
  if (!root.exists) root.create({ intermediates: true, idempotent: true });
  for (const sub of subs) {
    const d = new Directory(root, sub);
    if (!d.exists) d.create({ idempotent: true });
  }
  // Keep gallery/media scanners out of the vault.
  for (const dir of [root, new Directory(root, 'models')]) {
    const nm = new File(dir, '.nomedia');
    if (!nm.exists) {
      nm.create();
      nm.write('');
    }
  }
}

function activate(config: StorageConfig): StorageConfig {
  ensureLayout(config.rootPath);
  // Keep the extra slots when the vault moves (minus one that now IS the vault).
  const previous = storageStore.getState().config?.slots ?? [];
  const next: StorageConfig = { ...config, version: 2, slots: config.slots ?? previous.filter((s) => s.rootPath !== config.rootPath) };
  saveConfig(next);
  storageStore.setState({ status: 'ready', config: next, reason: undefined });
  invalidateModelIndex();
  return next;
}

/** Real path of the app-private vault folder. */
export const internalVaultPath = (): string => uriToPath(new Directory(Paths.document, 'vault').uri);

/** App-private storage: always works, no permission, removed if the app is uninstalled. */
export async function useInternalStorage(): Promise<StorageConfig> {
  return activate({ version: 2, mode: 'internal', rootPath: internalVaultPath(), configuredAt: Date.now() });
}

export const canPickExternalFolder = (): boolean => Platform.OS === 'android';

async function requestLegacyStoragePermission(): Promise<void> {
  try {
    await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
      PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
    ]);
  } catch {
    // The probe below decides; a failed request is not fatal.
  }
}

/** Open the system folder picker, then validate the choice. */
export async function chooseExternalFolder(): Promise<ExternalResult> {
  let pickedUri: string;
  try {
    pickedUri = (await Directory.pickDirectoryAsync()).uri;
  } catch {
    return { ok: false, reason: 'cancelled', message: 'No folder was selected.' };
  }
  return applyPickedFolder(pickedUri);
}

/** Validate (and activate) a folder the user already picked. Also used to re-check after granting access. */
export async function applyPickedFolder(pickedUri: string): Promise<ExternalResult> {
  const mapped = pickedUri.startsWith('file://') ? uriToPath(pickedUri) : safTreeUriToPath(pickedUri);
  if (!mapped) {
    return {
      ok: false,
      reason: 'unmappable',
      pickedUri,
      message: 'That location (for example a cloud drive or the Downloads app) cannot be used. Pick a normal folder on this phone or SD card, or use app storage.',
    };
  }
  const rootPath = baseName(mapped) === VAULT_DIRNAME ? mapped : joinPath(mapped, VAULT_DIRNAME);

  const api = getDeviceProfile().apiLevel;
  if (Platform.OS === 'android' && api !== null && api <= 29) await requestLegacyStoragePermission();

  const probe = await probeWritable(rootPath);
  if (!probe.ok) {
    const needsAllFiles = Platform.OS === 'android' && (api === null || api >= 30);
    return needsAllFiles
      ? {
          ok: false,
          reason: 'needs_permission',
          pickedUri,
          rootPath,
          message: 'Android needs "All files access" so the AI engine can read models from this folder. Allow it, then come back.',
        }
      : { ok: false, reason: 'not_writable', pickedUri, rootPath, message: `This folder is not writable (${probe.error}).` };
  }
  return { ok: true, config: activate({ version: 2, mode: 'external', rootPath, pickedUri, configuredAt: Date.now() }) };
}

/** Send the user to the Android "All files access" screen for this app. */
export async function openAllFilesAccessSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await IntentLauncher.startActivityAsync('android.settings.MANAGE_APP_ALL_FILES_ACCESS_PERMISSION', { data: `package:${APP_PACKAGE}` });
    return;
  } catch {
    // Some OEM builds lack the per-app screen; try the generic list, then app settings.
  }
  try {
    await IntentLauncher.startActivityAsync('android.settings.MANAGE_ALL_FILES_ACCESS_PERMISSION');
    return;
  } catch {
    await Linking.openSettings();
  }
}

/** Run at launch and whenever the app returns to the foreground. */
export async function initStorage(): Promise<void> {
  const config = await readConfig();
  if (!config) {
    storageStore.setState({ status: 'unconfigured', config: null, reason: undefined });
    return;
  }
  try {
    if (config.mode === 'internal') {
      ensureLayout(config.rootPath);
    } else {
      const probe = await probeWritable(config.rootPath);
      if (!probe.ok) {
        storageStore.setState({
          status: 'unavailable',
          config,
          reason: `The saved folder is not accessible any more (${probe.error}). Was the SD card removed or access revoked?`,
        });
        return;
      }
      ensureLayout(config.rootPath);
    }
    storageStore.setState({ status: 'ready', config, reason: undefined });
  } catch (e) {
    storageStore.setState({ status: 'unavailable', config, reason: message(e) });
  }
}

// ----------------------------------------------------------------------- accessors

export function requireConfig(): StorageConfig {
  const { status, config } = storageStore.getState();
  if (status !== 'ready' || !config) throw new StorageNotReadyError();
  return config;
}

export class StorageNotReadyError extends Error {
  constructor() {
    super('Storage location is not set up yet. Choose where CHIWIWI keeps its data first.');
    this.name = 'StorageNotReadyError';
  }
}

export const isStorageReady = (): boolean => storageStore.getState().status === 'ready';
export const vaultRoot = (): Directory => dirAt(requireConfig().rootPath);
export const modelsDir = (): Directory => new Directory(vaultRoot(), 'models');
export const chatsDir = (): Directory => new Directory(vaultRoot(), 'chats');
export const mediaDir = (): Directory => new Directory(vaultRoot(), 'media');
export const galleryDir = (): Directory => new Directory(vaultRoot(), 'gallery');

/**
 * Is this path on the phone's internal data volume? App storage and /storage/emulated/* (emulated shared storage is
 * backed by the same /data partition). SD cards / USB drives are other volumes.
 */
export function onInternalVolume(path: string): boolean {
  return path.startsWith('/data/') || path.startsWith('/storage/emulated/') || path.startsWith('/sdcard');
}

/** Free / total bytes of the volume holding `path`; null when Android gives no number for it without native code. */
export function volumeSpace(path: string): { freeBytes: number | null; totalBytes: number | null } {
  if (!onInternalVolume(path)) return { freeBytes: null, totalBytes: null };
  try {
    const free = Paths.availableDiskSpace;
    const total = Paths.totalDiskSpace;
    return { freeBytes: typeof free === 'number' && free > 0 ? free : null, totalBytes: typeof total === 'number' && total > 0 ? total : null };
  } catch {
    return { freeBytes: null, totalBytes: null };
  }
}

/** Free bytes on the volume that holds the vault, or null if unknown / different volume. */
export function freeSpaceBytes(): number | null {
  const { config } = storageStore.getState();
  return config ? volumeSpace(config.rootPath).freeBytes : null;
}

/** First-run gate: what the user can choose, with the real free space of app storage. */
export function getStorageChoices(): { internal: { path: string; freeBytes: number | null; totalBytes: number | null }; canPickFolder: boolean } {
  const path = internalVaultPath();
  return { internal: { path, ...volumeSpace(path) }, canPickFolder: canPickExternalFolder() };
}

// ----------------------------------------------------------------------- slots (roots that hold models)

/** All slot roots, the vault first. */
export function listSlotRoots(): StorageSlot[] {
  const { config } = storageStore.getState();
  if (!config) return [];
  const primary: StorageSlot = {
    id: PRIMARY_SLOT_ID,
    kind: config.mode === 'internal' ? 'internal' : 'folder',
    label: config.mode === 'internal' ? 'App storage (main)' : `${baseName(config.rootPath.replace(/\/CHIWIWI$/, '')) || config.rootPath} (main)`,
    rootPath: config.rootPath,
    ...(config.pickedUri ? { pickedUri: config.pickedUri } : {}),
    addedAt: config.configuredAt,
  };
  return [primary, ...(config.slots ?? [])];
}

export function slotById(id: string | null | undefined): StorageSlot | undefined {
  return listSlotRoots().find((s) => s.id === id);
}

export function slotModelsDir(slot: StorageSlot): Directory {
  return new Directory(dirAt(slot.rootPath), 'models');
}

/** Where NEW model downloads go: the slot chosen in Settings > Storage, else the vault. */
export function downloadSlot(): StorageSlot {
  const roots = listSlotRoots();
  if (roots.length === 0) throw new StorageNotReadyError();
  return roots.find((s) => s.id === settingsStore.getState().storage?.modelSlotId) ?? roots[0];
}

export function downloadModelsDir(): Directory {
  const dir = slotModelsDir(downloadSlot());
  try {
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  } catch {
    // the caller's write reports the real error
  }
  return dir;
}

interface SlotIndex {
  files: Map<string, File>;
  timestamp: number;
}

const slotIndices = new Map<string, SlotIndex>();
const INDEX_TTL_MS = 5000;

/** Invalidate cached directory listing for model slots (e.g. after download, move, or delete). */
export function invalidateModelIndex(slotId?: string): void {
  if (slotId) {
    slotIndices.delete(slotId);
  } else {
    slotIndices.clear();
  }
}

function getSlotFileMap(slot: StorageSlot): Map<string, File> {
  const now = Date.now();
  const cached = slotIndices.get(slot.id);
  if (cached && now - cached.timestamp < INDEX_TTL_MS) {
    return cached.files;
  }
  const files = new Map<string, File>();
  try {
    const dir = slotModelsDir(slot);
    if (dir.exists) {
      for (const entry of dir.list()) {
        if (entry instanceof File) {
          files.set(entry.name, entry);
        }
      }
    }
  } catch {
    // unavailable slot (e.g. unmounted SD card)
  }
  slotIndices.set(slot.id, { files, timestamp: now });
  return files;
}

/** Find a model file (or `.part`) by name in any slot: the download slot first, then the vault, then the others. */
export function locateModelFile(filename: string): { slotId: string; file: File } | null {
  let order: StorageSlot[];
  try {
    const first = downloadSlot();
    order = [first, ...listSlotRoots().filter((s) => s.id !== first.id)];
  } catch {
    return null;
  }
  for (const slot of order) {
    try {
      const fileMap = getSlotFileMap(slot);
      const hit = fileMap.get(filename);
      if (hit) return { slotId: slot.id, file: hit };
    } catch {
      // unavailable slot (SD card removed): skip
    }
  }
  return null;
}

export type AddSlotResult =
  | { ok: true; slot: StorageSlot }
  | { ok: false; reason: ExternalFailure | 'limit' | 'duplicate' | 'not_ready'; message: string; pickedUri?: string };

function addSlot(slot: StorageSlot): AddSlotResult {
  const { config } = storageStore.getState();
  if (!config) return { ok: false, reason: 'not_ready', message: 'Set up the main storage first.' };
  const roots = listSlotRoots();
  if (roots.length >= MAX_SLOTS) return { ok: false, reason: 'limit', message: `You can use up to ${MAX_SLOTS} storage locations. Remove one first.` };
  if (roots.some((r) => r.rootPath === slot.rootPath || r.id === slot.id)) return { ok: false, reason: 'duplicate', message: 'That location is already in the list.' };
  ensureLayout(slot.rootPath, ['models']);
  const next: StorageConfig = { ...config, slots: [...(config.slots ?? []), slot] };
  saveConfig(next);
  storageStore.setState({ config: next });
  invalidateModelIndex();
  return { ok: true, slot };
}

/** Add app-private storage as a model slot (when the vault itself is on a picked folder). */
export async function addInternalSlot(): Promise<AddSlotResult> {
  const path = internalVaultPath();
  const probe = await probeWritable(path);
  if (!probe.ok) return { ok: false, reason: 'not_writable', message: `App storage is not writable (${probe.error}).` };
  return addSlot({ id: INTERNAL_SLOT_ID, kind: 'internal', label: 'App storage', rootPath: path, addedAt: Date.now() });
}

/** Pick a folder (SAF) - or pass the URI already picked - map it to a real path, prove it is writable, add it as a model slot. */
export async function addFolderSlot(pickedUri?: string): Promise<AddSlotResult> {
  let uri = pickedUri;
  if (!uri) {
    try {
      uri = (await Directory.pickDirectoryAsync()).uri;
    } catch {
      return { ok: false, reason: 'cancelled', message: 'No folder was selected.' };
    }
  }
  const mapped = uri.startsWith('file://') ? uriToPath(uri) : safTreeUriToPath(uri);
  if (!mapped) {
    return { ok: false, reason: 'unmappable', pickedUri: uri, message: 'That location (a cloud drive or the Downloads app) cannot hold models. Pick a normal folder on this phone or SD card.' };
  }
  const rootPath = baseName(mapped) === VAULT_DIRNAME ? mapped : joinPath(mapped, VAULT_DIRNAME);
  const probe = await probeWritable(joinPath(rootPath, 'models'));
  if (!probe.ok) {
    const api = getDeviceProfile().apiLevel;
    const needsAllFiles = Platform.OS === 'android' && (api === null || api >= 30);
    return needsAllFiles
      ? { ok: false, reason: 'needs_permission', pickedUri: uri, message: 'Android needs "All files access" so the AI engine can read models from this folder. Allow it, then add the folder again.' }
      : { ok: false, reason: 'not_writable', pickedUri: uri, message: `This folder is not writable (${probe.error}).` };
  }
  return addSlot({ id: newId('folder'), kind: 'folder', label: baseName(mapped) || mapped, rootPath, pickedUri: uri, addedAt: Date.now() });
}

/** Model files (complete or partial) in a slot. */
export function slotModelFileNames(slot: StorageSlot): string[] {
  try {
    const map = getSlotFileMap(slot);
    return Array.from(map.keys()).filter((n) => /\.gguf(\.part)?$/i.test(n));
  } catch {
    return [];
  }
}

/** Remove an extra slot from the list. Never deletes files; refuses while it still holds models. */
export function removeSlot(id: string): { ok: true } | { ok: false; message: string } {
  const { config } = storageStore.getState();
  if (!config) return { ok: false, message: 'Storage is not set up.' };
  if (id === PRIMARY_SLOT_ID) return { ok: false, message: 'The main storage cannot be removed. Use "Change location" instead.' };
  const slot = (config.slots ?? []).find((s) => s.id === id);
  if (!slot) return { ok: false, message: 'That location is not in the list.' };
  const files = slotModelFileNames(slot);
  if (files.length > 0) return { ok: false, message: `This location still holds ${files.length} model file${files.length === 1 ? '' : 's'}. Move or delete them first.` };
  const next: StorageConfig = { ...config, slots: (config.slots ?? []).filter((s) => s.id !== id) };
  saveConfig(next);
  storageStore.setState({ config: next, slots: storageStore.getState().slots.filter((s) => s.id !== id) });
  if (settingsStore.getState().storage?.modelSlotId === id) updateSettings({ storage: { modelSlotId: null } });
  invalidateModelIndex(id);
  return { ok: true };
}

/** Choose where new model downloads go. */
export function setDownloadSlot(id: string): { ok: true } | { ok: false; message: string } {
  if (!slotById(id)) return { ok: false, message: 'That location is not in the list.' };
  updateSettings({ storage: { modelSlotId: id === PRIMARY_SLOT_ID ? null : id } });
  return { ok: true };
}


export function describeLocation(config: StorageConfig): string {
  return config.mode === 'internal' ? 'App storage (private to CHIWIWI)' : config.rootPath;
}

export function useStorageSlots(): SlotInfo[] {
  return useSyncExternalStore(storageStore.subscribe, () => storageStore.getState().slots);
}

export function useStorage(): StorageState {
  return useSyncExternalStore(storageStore.subscribe, storageStore.getState);
}
