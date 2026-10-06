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
import { createStore } from '../core/store.ts';
import { baseName, joinPath, pathToUri, safTreeUriToPath, uriToPath } from '../core/paths.ts';
import { getDeviceProfile } from './device.ts';

/** Must equal expo.android.package in app.json (checked by test/config.test.ts). */
export const APP_PACKAGE = 'com.chiwiwi.sovereign';
export const VAULT_DIRNAME = 'CHIWIWI';
const CONFIG_FILE = 'chiwiwi_storage_config.json';

export type StorageMode = 'internal' | 'external';

export interface StorageConfig {
  version: 1;
  mode: StorageMode;
  /** Real filesystem path of the vault root (no scheme, not percent-encoded). */
  rootPath: string;
  /** Original SAF URI the user picked (external mode only). */
  pickedUri?: string;
  configuredAt: number;
}

export interface StorageState {
  status: 'loading' | 'unconfigured' | 'ready' | 'unavailable';
  config: StorageConfig | null;
  /** Why the saved location cannot be used (status === 'unavailable'). */
  reason?: string;
}

export const storageStore = createStore<StorageState>({ status: 'loading', config: null });

export type ExternalFailure = 'cancelled' | 'unmappable' | 'needs_permission' | 'not_writable';
export type ExternalResult =
  | { ok: true; config: StorageConfig }
  | { ok: false; reason: ExternalFailure; message: string; pickedUri?: string; rootPath?: string };

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

function dirAt(path: string): Directory {
  return new Directory(pathToUri(path));
}

function configFile(): File {
  return new File(Paths.document, CONFIG_FILE);
}

function readConfig(): StorageConfig | null {
  try {
    const f = configFile();
    if (!f.exists) return null;
    const parsed = JSON.parse(f.textSync()) as Partial<StorageConfig>;
    if (parsed && parsed.version === 1 && typeof parsed.rootPath === 'string' && (parsed.mode === 'internal' || parsed.mode === 'external')) {
      return parsed as StorageConfig;
    }
  } catch {
    // corrupt config => treat as unconfigured
  }
  return null;
}

function saveConfig(config: StorageConfig): void {
  const f = configFile();
  if (!f.exists) f.create({ intermediates: true });
  f.write(JSON.stringify(config));
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

function ensureLayout(rootPath: string): void {
  const root = dirAt(rootPath);
  if (!root.exists) root.create({ intermediates: true, idempotent: true });
  for (const sub of ['models', 'chats', 'media']) {
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
  saveConfig(config);
  storageStore.setState({ status: 'ready', config, reason: undefined });
  return config;
}

/** App-private storage: always works, no permission, removed if the app is uninstalled. */
export async function useInternalStorage(): Promise<StorageConfig> {
  const root = new Directory(Paths.document, 'vault');
  return activate({ version: 1, mode: 'internal', rootPath: uriToPath(root.uri), configuredAt: Date.now() });
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
  return { ok: true, config: activate({ version: 1, mode: 'external', rootPath, pickedUri, configuredAt: Date.now() }) };
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
  const config = readConfig();
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

/** Free bytes on the volume that holds app storage, or null if unknown / different volume. */
export function freeSpaceBytes(): number | null {
  try {
    const { config } = storageStore.getState();
    if (!config) return null;
    const sameVolume = config.mode === 'internal' || config.rootPath.startsWith('/storage/emulated/0');
    if (!sameVolume) return null;
    const free = Paths.availableDiskSpace;
    return typeof free === 'number' && free > 0 ? free : null;
  } catch {
    return null;
  }
}

export function describeLocation(config: StorageConfig): string {
  return config.mode === 'internal' ? 'App storage (private to CHIWIWI)' : config.rootPath;
}

export function useStorage(): StorageState {
  return useSyncExternalStore(storageStore.subscribe, storageStore.getState);
}
