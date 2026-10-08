/**
 * Expo/React Native implementation of the DownloadPlatform contract used by
 * core/downloadManager.ts.
 *
 * Resume strategy (verified against expo-file-system's native source):
 *  - Android: DownloadTask.resume() sends `Range: bytes=<offset>-`, truncates the
 *    file to <offset> and APPENDS the 206 body (or restarts if the server answers
 *    200). The offset is simply the partial file's length, so a resume survives app
 *    restarts. We must NOT add our own Range header to a fresh task: native start()
 *    would overwrite the file with the tail (the corruption bug of the old code).
 *  - iOS: resume data is an opaque blob that only exists in memory, so after a
 *    restart the partial is discarded and the download restarts. (Best effort.)
 */
import { Platform } from 'react-native';
import { DownloadTask, File, Paths } from 'expo-file-system';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import type { DownloadFile, DownloadPlatform, ModelFiles, TransferTask } from '../core/downloadManager.ts';
import { uriToPath } from '../core/paths.ts';
import { fetchRemoteFileInfo } from './hfClient.ts';
import { destFile, fileSize, hashFile, partFile, readHeader } from './modelLibrary.ts';
import { downloadModelsDir, isStorageReady, locateModelFile, volumeSpace } from './storage.ts';

const KEEP_AWAKE_TAG = 'chiwiwi-download';

function filesFor(f: DownloadFile): ModelFiles {
  return {
    destExists: () => destFile(f).exists,
    destSize: () => fileSize(destFile(f)),
    partExists: () => partFile(f).exists,
    partSize: () => fileSize(partFile(f)),
    deletePart: () => {
      const file = partFile(f);
      if (file.exists) file.delete();
    },
    deleteDest: () => {
      const file = destFile(f);
      if (file.exists) file.delete();
    },
    readHeader: (which) => readHeader(which === 'part' ? partFile(f) : destFile(f)),
    promotePart: () => {
      const part = partFile(f);
      const dest = new File(part.parentDirectory, f.localName);
      if (dest.exists) dest.delete();
      // rename() stays inside one directory, so it is atomic and never crosses volumes.
      part.rename(f.localName);
    },
  };
}

/** Where the model (or its partial) already is, in any slot. */
function modelDir(model: DownloadFile): string | undefined {
  try {
    const hit = locateModelFile(model.localName) ?? locateModelFile(`${model.localName}.part`);
    return hit ? uriToPath(hit.file.parentDirectory.uri) : undefined;
  } catch {
    return undefined;
  }
}

function freeSpace(dir?: string): number | null {
  try {
    return volumeSpace(dir ?? uriToPath(downloadModelsDir().uri)).freeBytes;
  } catch {
    return null;
  }
}

class ExpoTransfer implements TransferTask {
  private task: DownloadTask | null = null;
  private readonly spec: DownloadFile;
  private readonly url: string;
  private readonly onProgress: (absoluteBytes: number) => void;

  constructor(spec: DownloadFile, url: string, onProgress: (absoluteBytes: number) => void) {
    this.spec = spec;
    this.url = url;
    this.onProgress = onProgress;
  }

  isPaused(): boolean {
    return this.task?.state === 'paused';
  }

  async pause(): Promise<void> {
    if (this.task && this.task.state === 'active') await this.task.pauseAsync();
  }

  cancel(): void {
    this.task?.cancel();
  }

  async run(): Promise<'completed' | 'paused'> {
    const part = partFile(this.spec);
    const options = { onProgress: (p: { bytesWritten: number }) => this.onProgress(p.bytesWritten) };

    // In-memory resume after Pause.
    if (this.task && this.task.state === 'paused') {
      const file = await this.task.resumeAsync();
      return file ? 'completed' : 'paused';
    }

    const have = fileSize(part);
    if (have > 0 && Platform.OS === 'android') {
      this.task = DownloadTask.fromSavable(
        { url: this.url, fileUri: part.uri, isDirectory: false, resumeData: String(have) },
        options,
      );
      const file = await this.task.resumeAsync();
      return file ? 'completed' : 'paused';
    }

    if (have > 0) part.delete(); // cannot resume safely: start clean
    this.task = new DownloadTask(this.url, part, options);
    const file = await this.task.downloadAsync();
    return file ? 'completed' : 'paused';
  }
}

const INTENT_FILE = 'chiwiwi_downloads.json';

/** App-private note of which downloads were running, so a process kill / swipe-away can be continued at next launch. */
function saveIntent(ids: string[]): void {
  try {
    const f = new File(Paths.document, INTENT_FILE);
    if (ids.length === 0) {
      if (f.exists) f.delete();
      return;
    }
    if (!f.exists) f.create({ intermediates: true });
    f.write(JSON.stringify({ active: ids }));
  } catch {
    // best effort: without it the partial file still shows "Paused - tap Resume"
  }
}

function loadIntent(): string[] {
  try {
    const f = new File(Paths.document, INTENT_FILE);
    if (!f.exists) return [];
    const parsed = JSON.parse(f.textSync()) as { active?: unknown };
    return Array.isArray(parsed.active) ? parsed.active.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export const expoDownloadPlatform: DownloadPlatform = {
  isStorageReady,
  freeSpaceBytes: freeSpace,
  files: filesFor,
  fetchInfo: (f) => fetchRemoteFileInfo(f.repo, f.filename),
  createTask: ({ spec, url, onProgress }) => new ExpoTransfer(spec, url, onProgress),
  async verifySha256(f, expected, onProgress, shouldStop) {
    const r = await hashFile(partFile(f), onProgress, shouldStop);
    return { ok: !r.stopped && r.actual === expected.toLowerCase(), actual: r.actual, stopped: r.stopped };
  },
  saveIntent,
  loadIntent,
  modelDir,
  keepAwake: (on) => {
    if (on) void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
    else void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
  },
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};
