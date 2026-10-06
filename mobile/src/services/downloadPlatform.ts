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
import { DownloadTask } from 'expo-file-system';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import type { DownloadPlatform, ModelFiles, TransferTask } from '../core/downloadManager.ts';
import type { ModelSpec } from '../core/catalog.ts';
import { fetchRemoteFileInfo } from './hfClient.ts';
import { fileSize, modelFile, partialFile, readHeader } from './modelLibrary.ts';
import { freeSpaceBytes, isStorageReady } from './storage.ts';

const KEEP_AWAKE_TAG = 'chiwiwi-download';

function filesFor(spec: ModelSpec): ModelFiles {
  return {
    destExists: () => modelFile(spec).exists,
    destSize: () => fileSize(modelFile(spec)),
    partExists: () => partialFile(spec).exists,
    partSize: () => fileSize(partialFile(spec)),
    deletePart: () => {
      const f = partialFile(spec);
      if (f.exists) f.delete();
    },
    deleteDest: () => {
      const f = modelFile(spec);
      if (f.exists) f.delete();
    },
    readHeader: (which) => readHeader(which === 'part' ? partialFile(spec) : modelFile(spec)),
    promotePart: () => {
      const dest = modelFile(spec);
      if (dest.exists) dest.delete();
      // rename() stays inside one directory, so it is atomic and never crosses volumes.
      partialFile(spec).rename(spec.filename);
    },
  };
}

class ExpoTransfer implements TransferTask {
  private task: DownloadTask | null = null;
  private readonly spec: ModelSpec;
  private readonly url: string;
  private readonly onProgress: (absoluteBytes: number) => void;

  constructor(spec: ModelSpec, url: string, onProgress: (absoluteBytes: number) => void) {
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
    const part = partialFile(this.spec);
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

export const expoDownloadPlatform: DownloadPlatform = {
  isStorageReady,
  freeSpaceBytes,
  files: filesFor,
  fetchInfo: (spec) => fetchRemoteFileInfo(spec.repo, spec.filename),
  createTask: ({ spec, url, onProgress }) => new ExpoTransfer(spec, url, onProgress),
  keepAwake: (on) => {
    if (on) void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
    else void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
  },
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};
