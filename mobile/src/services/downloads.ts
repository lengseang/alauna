import { useMemo, useSyncExternalStore } from 'react';
import { MODEL_CATALOG, getModel, type ModelSpec } from '../core/catalog.ts';
import {
  DownloadManager,
  IDLE_STATE,
  summarizeDownloads,
  type DownloadState,
  type DownloadStoreState,
  type InstallOptions,
  type StartResult,
} from '../core/downloadManager.ts';
import { expoDownloadPlatform } from './downloadPlatform.ts';
import { engine } from './engine.ts';
import { showToast } from './toast.ts';

/** App-wide singleton: downloads keep running while the user navigates between screens. */
export const downloads = new DownloadManager(expoDownloadPlatform, {
  // New installs are usable at once; the SHA-256 check runs in the background ('always' = block until checked, 'off' = skip).
  verifyMode: 'background',
  onVerifyFailed: (specId, _kind, message) => {
    // A damaged file must never stay loaded: release it before the manager deletes it.
    if (engine.store.getState().modelId === specId) void engine.unmount();
    showToast(`${getModel(specId)?.name ?? 'A model'}: ${message}`, 8000);
  },
});

export function refreshDownloads(): void {
  downloads.refresh(MODEL_CATALOG);
  // Installs that were running or queued when the app was killed continue from their partial files.
  downloads.resumeInterrupted(MODEL_CATALOG);
}

/** Start (or queue) a model with its image add-on; `opts.dir` = a storage slot's real path, `opts.draft` = also the MTP draft head. */
export function installModel(modelId: string, opts?: InstallOptions): Promise<StartResult> {
  const spec = getModel(modelId);
  if (!spec) return Promise.resolve({ ok: false, message: `Unknown model "${modelId}".` });
  return downloads.start(spec, opts);
}

/** Download only what an installed model is missing (its image add-on and/or draft head). */
export function addCompanions(spec: ModelSpec, kinds: { vision?: boolean; draft?: boolean }): Promise<StartResult> {
  return downloads.start(spec, { vision: kinds.vision ?? true, draft: kinds.draft ?? false });
}

export function resumeAllDownloads(): Promise<void> {
  const order = [...downloads.queueOrder(), ...MODEL_CATALOG.map((m) => m.id)];
  const specs = [...new Set(order)].map((id) => getModel(id)).filter((m): m is ModelSpec => !!m);
  return downloads.resumeAll(specs);
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

/** Everything the Downloads Hub needs: per-install states, queue order, concurrency, and totals (speed, remaining, ETA). */
export function useDownloadsHub(): DownloadStoreState & { summary: ReturnType<typeof summarizeDownloads> } {
  const state = useSyncExternalStore(downloads.store.subscribe, downloads.store.getState);
  return useMemo(() => ({ ...state, summary: summarizeDownloads(state.items) }), [state]);
}
