/**
 * Image Model Download & Storage Manager (pure service).
 *
 * Feature ID: CHIWIWI-IMG-ARCH-001
 * Manages downloading, tracking, and deleting verified on-device image models.
 * Saves model weights directly into the vault models directory (<vault>/models/).
 */

import { useSyncExternalStore } from 'react';
import { DownloadTask, File } from 'expo-file-system';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { createStore } from '../core/store.ts';
import { resolveUrl } from '../core/hf.ts';
import {
  IMAGE_MODEL_MANIFESTS,
  getImageModelManifest,
} from '../core/imageGen/modelRegistry.ts';
import type { ImageModelManifest } from '../core/imageGen/types.ts';
import {
  downloadModelsDir,
  invalidateModelIndex,
  isStorageReady,
  locateModelFile,
  modelsDir,
} from './storage.ts';
import { showToast } from './toast.ts';

const KEEP_AWAKE_TAG = 'chiwiwi-image-model-download';

export interface ImageModelDownloadState {
  modelId: string;
  status: 'not_installed' | 'downloading' | 'installed' | 'error';
  bytesWritten: number;
  totalBytes: number;
  progressPercent: number; // 0..100
  speedBps: number;
  error?: string;
  localPath?: string;
}

interface ImageModelManagerState {
  models: Record<string, ImageModelDownloadState>;
  activeDownloads: number;
}

const managerStore = createStore<ImageModelManagerState>({
  models: {},
  activeDownloads: 0,
});

// Active download tasks in memory
const activeTasks = new Map<string, { task: DownloadTask; lastBytes: number; lastTime: number }>();

export function getModelFileName(manifest: ImageModelManifest): string {
  return manifest.hfFile || `${manifest.modelId}.gguf`;
}

/** Check if an image model's weights exist on disk in the vault. */
export function isImageModelInstalled(manifest: ImageModelManifest): boolean {
  if (!isStorageReady()) return false;
  const fileName = getModelFileName(manifest);
  try {
    const hit = locateModelFile(fileName);
    if (hit && hit.file.exists && hit.file.size > 0) return true;
    const directFile = new File(modelsDir(), fileName);
    return directFile.exists && directFile.size > 0;
  } catch {
    return false;
  }
}

/** Get the local path of an installed model file. */
export function getInstalledModelPath(manifest: ImageModelManifest): string | null {
  if (!isStorageReady()) return null;
  const fileName = getModelFileName(manifest);
  try {
    const hit = locateModelFile(fileName);
    if (hit && hit.file.exists) return hit.file.uri;
    const directFile = new File(modelsDir(), fileName);
    if (directFile.exists) return directFile.uri;
    return null;
  } catch {
    return null;
  }
}

/** Refresh the on-disk status of all image models. */
export function refreshImageModelStatuses(): void {
  const current = managerStore.getState().models;
  const updated: Record<string, ImageModelDownloadState> = { ...current };

  for (const manifest of IMAGE_MODEL_MANIFESTS) {
    const existing = updated[manifest.modelId];
    if (existing?.status === 'downloading') continue; // Don't overwrite active downloads

    const installed = isImageModelInstalled(manifest);
    const localPath = installed ? getInstalledModelPath(manifest) ?? undefined : undefined;

    updated[manifest.modelId] = {
      modelId: manifest.modelId,
      status: installed ? 'installed' : 'not_installed',
      bytesWritten: installed ? manifest.downloadSizeBytes : 0,
      totalBytes: manifest.downloadSizeBytes,
      progressPercent: installed ? 100 : 0,
      speedBps: 0,
      localPath,
    };
  }

  managerStore.setState({ models: updated });
}

/** Start downloading an image model from Hugging Face into the vault. */
export async function startImageModelDownload(modelId: string): Promise<boolean> {
  const manifest = getImageModelManifest(modelId);
  if (!manifest) {
    showToast(`Unknown image model: ${modelId}`);
    return false;
  }

  if (!isStorageReady()) {
    showToast('Storage vault is not ready. Set up storage in Settings first.');
    return false;
  }

  if (activeTasks.has(modelId)) {
    showToast('Model is already downloading.');
    return false;
  }

  const fileName = getModelFileName(manifest);
  const targetDir = downloadModelsDir();
  const destFile = new File(targetDir, fileName);
  const partFile = new File(targetDir, `${fileName}.part`);

  if (!manifest.hfRepo) {
    showToast(`Model ${manifest.displayName} does not specify a download repository.`);
    return false;
  }

  const downloadUrl = resolveUrl(manifest.hfRepo, fileName);

  try {
    if (partFile.exists) {
      partFile.delete();
    }
    partFile.create({ intermediates: true });
  } catch (e) {
    showToast(`Failed to allocate file for download: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }

  // Update store state
  const prevModels = managerStore.getState().models;
  managerStore.setState({
    models: {
      ...prevModels,
      [modelId]: {
        modelId,
        status: 'downloading',
        bytesWritten: 0,
        totalBytes: manifest.downloadSizeBytes,
        progressPercent: 0,
        speedBps: 0,
      },
    },
    activeDownloads: managerStore.getState().activeDownloads + 1,
  });

  try {
    await activateKeepAwakeAsync(KEEP_AWAKE_TAG);
  } catch {
    // Keep awake is best effort
  }

  let lastBytes = 0;
  let lastTime = Date.now();

  const task = new DownloadTask(downloadUrl, partFile, {
    onProgress: (event) => {
      const now = Date.now();
      const dt = (now - lastTime) / 1000;
      const bytesNow = event.bytesWritten;
      let speedBps = 0;
      if (dt >= 0.5) {
        speedBps = Math.max(0, Math.round((bytesNow - lastBytes) / dt));
        lastBytes = bytesNow;
        lastTime = now;
      }

      const total = manifest.downloadSizeBytes > 0 ? manifest.downloadSizeBytes : event.totalBytes;
      const progressPercent = total > 0 ? Math.min(99, Math.round((bytesNow / total) * 100)) : 0;

      const current = managerStore.getState().models[modelId];
      if (current && current.status === 'downloading') {
        managerStore.setState({
          models: {
            ...managerStore.getState().models,
            [modelId]: {
              ...current,
              bytesWritten: bytesNow,
              totalBytes: total,
              progressPercent,
              speedBps: speedBps || current.speedBps,
            },
          },
        });
      }
    },
  });

  activeTasks.set(modelId, { task, lastBytes: 0, lastTime: Date.now() });

  try {
    const downloaded = await task.downloadAsync();
    activeTasks.delete(modelId);

    if (destFile.exists) {
      destFile.delete();
    }
    partFile.rename(fileName);
    invalidateModelIndex();

    managerStore.setState({
      models: {
        ...managerStore.getState().models,
        [modelId]: {
          modelId,
          status: 'installed',
          bytesWritten: manifest.downloadSizeBytes,
          totalBytes: manifest.downloadSizeBytes,
          progressPercent: 100,
          speedBps: 0,
          localPath: destFile.uri,
        },
      },
      activeDownloads: Math.max(0, managerStore.getState().activeDownloads - 1),
    });

    showToast(`✓ Installed ${manifest.displayName}!`);
    return true;
  } catch (err) {
    activeTasks.delete(modelId);
    try {
      if (partFile.exists) partFile.delete();
    } catch {
      // Ignore cleanup error
    }

    managerStore.setState({
      models: {
        ...managerStore.getState().models,
        [modelId]: {
          modelId,
          status: 'error',
          bytesWritten: 0,
          totalBytes: manifest.downloadSizeBytes,
          progressPercent: 0,
          speedBps: 0,
          error: err instanceof Error ? err.message : String(err),
        },
      },
      activeDownloads: Math.max(0, managerStore.getState().activeDownloads - 1),
    });

    showToast(`Download failed: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  } finally {
    if (activeTasks.size === 0) {
      try {
        deactivateKeepAwake(KEEP_AWAKE_TAG);
      } catch {
        // Best effort
      }
    }
  }
}

/** Cancel an active image model download. */
export function cancelImageModelDownload(modelId: string): void {
  const item = activeTasks.get(modelId);
  if (item) {
    try {
      item.task.cancel();
    } catch {
      // Cancel is best effort
    }
    activeTasks.delete(modelId);
  }

  const manifest = getImageModelManifest(modelId);
  if (manifest) {
    try {
      const part = new File(downloadModelsDir(), `${getModelFileName(manifest)}.part`);
      if (part.exists) part.delete();
    } catch {
      // Ignore deletion error
    }
  }

  const prev = managerStore.getState().models[modelId];
  if (prev) {
    managerStore.setState({
      models: {
        ...managerStore.getState().models,
        [modelId]: {
          ...prev,
          status: 'not_installed',
          progressPercent: 0,
          bytesWritten: 0,
          speedBps: 0,
        },
      },
      activeDownloads: Math.max(0, managerStore.getState().activeDownloads - 1),
    });
  }

  showToast('Download cancelled.');
}

/** Delete an installed image model file from disk. */
export async function deleteImageModel(modelId: string): Promise<boolean> {
  const manifest = getImageModelManifest(modelId);
  if (!manifest) return false;

  const fileName = getModelFileName(manifest);
  try {
    const hit = locateModelFile(fileName);
    if (hit && hit.file.exists) {
      hit.file.delete();
    }
    const direct = new File(modelsDir(), fileName);
    if (direct.exists) {
      direct.delete();
    }
    invalidateModelIndex();

    const prev = managerStore.getState().models[modelId];
    managerStore.setState({
      models: {
        ...managerStore.getState().models,
        [modelId]: {
          ...(prev ?? {
            modelId,
            totalBytes: manifest.downloadSizeBytes,
          }),
          status: 'not_installed',
          progressPercent: 0,
          bytesWritten: 0,
          speedBps: 0,
          localPath: undefined,
        },
      },
    });

    showToast(`Deleted ${manifest.displayName} from vault.`);
    return true;
  } catch (e) {
    showToast(`Failed to delete model: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

/** React hook for live image model download states. */
export function useImageModelStates(): Record<string, ImageModelDownloadState> {
  return useSyncExternalStore(
    managerStore.subscribe,
    () => managerStore.getState().models,
    () => ({}),
  );
}

/** React hook for checking active downloads count. */
export function useActiveImageDownloadsCount(): number {
  return useSyncExternalStore(
    managerStore.subscribe,
    () => managerStore.getState().activeDownloads,
    () => 0,
  );
}
