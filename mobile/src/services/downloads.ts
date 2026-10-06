import { useSyncExternalStore } from 'react';
import { MODEL_CATALOG } from '../core/catalog.ts';
import { DownloadManager, IDLE_STATE, type DownloadState } from '../core/downloadManager.ts';
import { expoDownloadPlatform } from './downloadPlatform.ts';

/** App-wide singleton: downloads keep running while the user navigates between screens. */
export const downloads = new DownloadManager(expoDownloadPlatform);

export function refreshDownloads(): void {
  downloads.refresh(MODEL_CATALOG);
}

export function useDownloadState(modelId: string): DownloadState {
  return useSyncExternalStore(
    downloads.store.subscribe,
    () => downloads.store.getState().items[modelId] ?? IDLE_STATE,
  );
}

export function useDownloadItems(): Record<string, DownloadState> {
  return useSyncExternalStore(downloads.store.subscribe, () => downloads.store.getState().items);
}
