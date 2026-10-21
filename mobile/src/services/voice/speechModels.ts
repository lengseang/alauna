/**
 * Download / verify / delete the whisper STT models and the Silero VAD model, into `<vault>/voice/`.
 *
 * Self-contained on purpose: W1's DownloadManager is built around GGUF chat models (catalog specs, GGUF header checks),
 * and these are ggml .bin files. Same proven mechanics as services/downloadPlatform.ts though: `.part` file, Android
 * resume with `Range` via DownloadTask.fromSavable (survives app restarts), exact size check, then SHA-256 against the
 * Hugging Face LFS hash, then an atomic rename. Nothing is reported as installed unless its hash matched.
 */
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { Directory, DownloadTask, File } from 'expo-file-system';
import { formatBytes } from '../../core/format.ts';
import { uriToPath } from '../../core/paths.ts';
import { SpeedMeter } from '../../core/speedMeter.ts';
import { createStore } from '../../core/store.ts';
import { SPEECH_MODELS, VAD_MODEL, getSpeechModel, speechModelUrl, type SpeechModelSpec } from '../../core/voiceModels.ts';
import { fileSize, hashFile } from '../modelLibrary.ts';
import { freeSpaceBytes, isStorageReady, vaultRoot } from '../storage.ts';
import { unpackKokoroArchive, isModelDownloaded } from './kokoroNeuralTts.ts';
import {
  showDownloadProgressNotification,
  showVerifyingNotification,
  showUnpackingNotification,
  showDownloadCompleteNotification,
  cancelDownloadNotification,
} from '../notifications/downloadNotifications.ts';

export type SpeechModelStatus = 'absent' | 'downloading' | 'paused' | 'verifying' | 'installed' | 'error';

export interface SpeechModelState {
  status: SpeechModelStatus;
  receivedBytes: number;
  totalBytes: number;
  bytesPerSecond: number;
  etaSeconds: number;
  /** 0..1 while checking the SHA-256. */
  verifyProgress: number;
  error: string | null;
}

export type SpeechModelResult = { ok: true } | { ok: false; message: string };

const ABSENT = (spec: SpeechModelSpec): SpeechModelState => ({
  status: 'absent',
  receivedBytes: 0,
  totalBytes: spec.bytes,
  bytesPerSecond: 0,
  etaSeconds: 0,
  verifyProgress: 0,
  error: null,
});

export const speechModelStore = createStore<{ items: Record<string, SpeechModelState> }>({
  items: Object.fromEntries(SPEECH_MODELS.map((m) => [m.id, ABSENT(m)])),
});

function patch(id: string, p: Partial<SpeechModelState>): void {
  speechModelStore.setState((s) => ({ items: { ...s.items, [id]: { ...s.items[id], ...p } } }));
}

function voiceDir(): Directory {
  const d = new Directory(vaultRoot(), 'voice');
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
}
const diskFilename = (spec: SpeechModelSpec) => spec.filename.replace(/\//g, '_');
const finalFile = (spec: SpeechModelSpec) => new File(voiceDir(), diskFilename(spec));
const partFile = (spec: SpeechModelSpec) => new File(voiceDir(), `${diskFilename(spec)}.part`);

function isComplete(spec: SpeechModelSpec): boolean {
  try {
    if (!isStorageReady()) return false;
    if (spec.kind === 'tts') {
      return isModelDownloaded() || fileSize(finalFile(spec)) === spec.bytes;
    }
    return fileSize(finalFile(spec)) === spec.bytes;
  } catch {
    return false;
  }
}

/** Real path (no scheme) of an installed model, or null. */
export function speechModelPath(id: string): string | null {
  const spec = getSpeechModel(id);
  return spec && isComplete(spec) ? uriToPath(finalFile(spec).uri) : null;
}

export const isSpeechModelInstalled = (id: string): boolean => speechModelPath(id) !== null;

/** Re-read what is on disk (call when storage becomes ready / changes). Leaves running downloads alone. */
export function refreshSpeechModels(): void {
  for (const spec of SPEECH_MODELS) {
    const cur = speechModelStore.getState().items[spec.id];
    if (cur.status === 'downloading' || cur.status === 'verifying') continue;
    if (!isStorageReady()) {
      patch(spec.id, ABSENT(spec));
      continue;
    }
    if (isComplete(spec)) {
      patch(spec.id, { ...ABSENT(spec), status: 'installed', receivedBytes: spec.bytes });
      if (spec.kind === 'tts' && !isModelDownloaded()) {
        const file = finalFile(spec);
        if (file.exists && fileSize(file) === spec.bytes) {
          unpackKokoroArchive(uriToPath(file.uri)).catch(() => {});
        }
      }
      continue;
    }
    const have = fileSize(partFile(spec));
    patch(spec.id, { ...ABSENT(spec), status: have > 0 ? 'paused' : 'absent', receivedBytes: have, error: cur.status === 'error' ? cur.error : null });
  }
}

interface Running {
  task: DownloadTask | null;
  cancelled: boolean;
  promise: Promise<SpeechModelResult>;
}
const running = new Map<string, Running>();
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function downloadOne(spec: SpeechModelSpec): Promise<SpeechModelResult> {
  const existing = running.get(spec.id);
  if (existing) return existing.promise;
  const run: Running = { task: null, cancelled: false, promise: Promise.resolve({ ok: true }) };
  run.promise = transfer(spec, run).finally(() => running.delete(spec.id));
  running.set(spec.id, run);
  return run.promise;
}

async function transfer(spec: SpeechModelSpec, run: Running): Promise<SpeechModelResult> {
  if (!isStorageReady()) return { ok: false, message: 'Choose where CHIWIWI keeps its data first.' };
  if (isComplete(spec)) {
    patch(spec.id, { ...ABSENT(spec), status: 'installed', receivedBytes: spec.bytes });
    return { ok: true };
  }
  const part = partFile(spec);
  const url = speechModelUrl(spec);
  let have = fileSize(part);
  const free = freeSpaceBytes();
  const need = spec.bytes - have;
  if (free !== null && free < need + 64 * 1024 * 1024) {
    const msg = `Not enough free space: ${spec.name} needs ${formatBytes(need)}, ${formatBytes(free)} free.`;
    patch(spec.id, { status: 'error', error: msg });
    return { ok: false, message: msg };
  }

  const meter = new SpeedMeter();
  meter.reset(have);
  let lastUi = 0;
  const onProgress = ({ bytesWritten }: { bytesWritten: number }) => {
    const now = Date.now();
    const bps = meter.push(bytesWritten, now);
    if (now - lastUi < 250) return;
    lastUi = now;
    const eta = meter.etaSeconds(spec.bytes - bytesWritten);
    patch(spec.id, { receivedBytes: bytesWritten, bytesPerSecond: bps, etaSeconds: eta });
    showDownloadProgressNotification(spec.id, spec.name, bytesWritten, spec.bytes, bps, eta);
  };
  patch(spec.id, { status: 'downloading', receivedBytes: have, error: null, verifyProgress: 0 });

  try {
    let file: File | null;
    if (have > 0 && Platform.OS === 'android') {
      try {
        run.task = DownloadTask.fromSavable({ url, fileUri: part.uri, isDirectory: false, resumeData: String(have) }, { onProgress });
        file = await run.task.resumeAsync();
      } catch (resumeErr) {
        if (run.cancelled) return cancelledResult(spec);
        // The resume attempt failed (e.g. HTTP 416, corrupted partial, or rejected resume offset).
        // Safely cancel the failed resume task so native state does not conflict
        try {
          if (run.task && typeof run.task.cancel === 'function') {
            run.task.cancel();
          }
        } catch {
          // ignore cleanup error
        }
        run.task = null;
        if (part.exists) part.delete();
        have = 0;
        meter.reset(0);
        patch(spec.id, { receivedBytes: 0, bytesPerSecond: 0, etaSeconds: 0 });
        run.task = new DownloadTask(url, part, { onProgress });
        file = await run.task.downloadAsync();
      }
    } else {
      if (have > 0) part.delete();
      have = 0;
      run.task = new DownloadTask(url, part, { onProgress });
      file = await run.task.downloadAsync();
    }
    if (run.cancelled) return cancelledResult(spec);
    if (!file) {
      cancelDownloadNotification(spec.id);
      patch(spec.id, { status: 'paused', receivedBytes: fileSize(part), bytesPerSecond: 0, etaSeconds: 0 });
      return { ok: false, message: 'Paused.' };
    }
  } catch (e) {
    cancelDownloadNotification(spec.id);
    if (run.cancelled) return cancelledResult(spec);
    const errText = message(e);
    // If the error was a rejected resume or Range failure, delete the broken partial so next tap downloads clean
    if (/resume.*reject/i.test(errText) || /416/i.test(errText)) {
      if (part.exists) part.delete();
      patch(spec.id, { receivedBytes: 0 });
    }
    const msg = `Download of ${spec.name} stopped: ${errText}. Tap Download to continue where it stopped.`;
    patch(spec.id, { status: 'error', error: msg, receivedBytes: fileSize(part), bytesPerSecond: 0, etaSeconds: 0 });
    return { ok: false, message: msg };
  }

  const size = fileSize(part);
  if (size !== spec.bytes) {
    cancelDownloadNotification(spec.id);
    if (part.exists) part.delete();
    const msg = `${spec.name} arrived with the wrong size (${formatBytes(size)}, expected ${formatBytes(spec.bytes)}). Download it again.`;
    patch(spec.id, { status: 'error', error: msg, receivedBytes: 0 });
    return { ok: false, message: msg };
  }

  patch(spec.id, { status: 'verifying', receivedBytes: size, bytesPerSecond: 0, etaSeconds: 0, verifyProgress: 0 });
  showVerifyingNotification(spec.id, spec.name, 0);
  const hash = await hashFile(
    part,
    (f) => {
      patch(spec.id, { verifyProgress: f });
      showVerifyingNotification(spec.id, spec.name, f);
    },
    () => run.cancelled
  );
  if (run.cancelled || hash.stopped) {
    cancelDownloadNotification(spec.id);
    return cancelledResult(spec);
  }
  if (hash.actual !== spec.sha256) {
    cancelDownloadNotification(spec.id);
    if (part.exists) part.delete();
    const msg = `${spec.name} failed the integrity check (SHA-256 mismatch), so it was deleted. Download it again.`;
    patch(spec.id, { status: 'error', error: msg, receivedBytes: 0 });
    return { ok: false, message: msg };
  }
  const dest = finalFile(spec);
  if (dest.exists) dest.delete();
  part.rename(diskFilename(spec));
  if (spec.kind === 'tts') {
    patch(spec.id, { status: 'verifying', verifyProgress: 0.99 });
    showUnpackingNotification(spec.id, spec.name);
    await unpackKokoroArchive(uriToPath(dest.uri));
  }
  patch(spec.id, { ...ABSENT(spec), status: 'installed', receivedBytes: spec.bytes });
  showDownloadCompleteNotification(spec.id, spec.name);
  return { ok: true };
}

function cancelledResult(spec: SpeechModelSpec): SpeechModelResult {
  cancelDownloadNotification(spec.id);
  try {
    const part = partFile(spec);
    if (part.exists) part.delete();
  } catch {
    // best effort
  }
  patch(spec.id, ABSENT(spec));
  return { ok: false, message: 'Cancelled.' };
}

/** Download an STT model (and the small VAD model it needs). Resumes a partial download. */
export async function downloadSpeechModel(id: string): Promise<SpeechModelResult> {
  const spec = getSpeechModel(id);
  if (!spec) return { ok: false, message: `Unknown speech model ${id}.` };
  if (spec.kind === 'stt') {
    const vad = await downloadOne(VAD_MODEL);
    if (!vad.ok) return vad;
  }
  return downloadOne(spec);
}

export async function pauseSpeechModelDownload(id: string): Promise<void> {
  const task = running.get(id)?.task;
  if (task && task.state === 'active') await task.pauseAsync();
}

/** Stop and delete the partial file. */
export function cancelSpeechModelDownload(id: string): void {
  const spec = getSpeechModel(id);
  if (!spec) return;
  const run = running.get(id);
  if (run) {
    run.cancelled = true;
    run.task?.cancel();
    return; // transfer() cleans up
  }
  cancelledResult(spec);
}

/** Delete an installed model (safe while loaded: whisper.cpp reads the whole file into RAM at load). */
export function deleteSpeechModel(id: string): void {
  const spec = getSpeechModel(id);
  if (!spec || !isStorageReady()) return;
  cancelDownloadNotification(id);
  for (const f of [finalFile(spec), partFile(spec)]) if (f.exists) f.delete();
  patch(id, ABSENT(spec));
}

export function useSpeechModels(): Record<string, SpeechModelState> {
  return useSyncExternalStore(speechModelStore.subscribe, () => speechModelStore.getState().items);
}
