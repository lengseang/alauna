/**
 * One-call first run: `downloadAndLoad(modelId)` = download (resume, verify) -> load -> warm-up proof.
 * `useSetup()` exposes the coarse stage for a single "Getting ready" screen; fine-grained numbers come from
 * `useDownloadState(modelId)` (bytes, speed, ETA, verify %) and `useEngineStatus()` (load %, backend, tok/s).
 */
import { useSyncExternalStore } from 'react';
import { MODEL_CATALOG, getModel } from '../core/catalog.ts';
import { createStore } from '../core/store.ts';
import { downloadAndLoad as coreDownloadAndLoad, type SetupResult, type SetupStage } from '../core/setup.ts';
import { downloads } from './downloads.ts';
import { engine, recommendedModel } from './engine.ts';
import { isInstalled } from './modelLibrary.ts';

export interface SetupState {
  modelId: string | null;
  stage: SetupStage | null;
  /** Set when the last run finished (ok or not). */
  result: SetupResult | null;
}

export const setupStore = createStore<SetupState>({ modelId: null, stage: null, result: null });

export function useSetup(): SetupState {
  return useSyncExternalStore(setupStore.subscribe, setupStore.getState);
}

let inFlight: { id: string; promise: Promise<SetupResult> } | null = null;

export function downloadAndLoad(modelId: string, opts: { force?: boolean } = {}): Promise<SetupResult> {
  if (inFlight?.id === modelId) return inFlight.promise;
  const spec = getModel(modelId);
  if (!spec) return Promise.resolve({ ok: false, stage: 'download', reason: 'refused', message: 'Unknown model.' });
  if (inFlight) return Promise.resolve({ ok: false, stage: 'download', reason: 'refused', message: 'Another model is being set up. Wait for it to finish.' });

  setupStore.setState({ modelId, stage: 'downloading', result: null });
  const promise = coreDownloadAndLoad(
    spec,
    { downloads, engine, isInstalled, onStage: (stage) => setupStore.setState({ stage }) },
    opts,
  )
    .then((result) => {
      setupStore.setState({ stage: result.ok ? 'done' : null, result });
      return result;
    })
    .finally(() => {
      inFlight = null;
    });
  inFlight = { id: modelId, promise };
  return promise;
}

/** First run: pick the right model for THIS phone's RAM, then download + verify + load it. */
export function setupRecommended(): Promise<SetupResult> {
  const spec = recommendedModel() ?? MODEL_CATALOG[0];
  return downloadAndLoad(spec.id);
}
