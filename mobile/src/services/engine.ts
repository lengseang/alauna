import { useMemo, useSyncExternalStore } from 'react';
import { Directory, File, Paths } from 'expo-file-system';
import type { NativeBackendDeviceInfo } from 'llama.rn';
import { MODEL_CATALOG, getModel, type ModelSpec } from '../core/catalog.ts';
import { EngineManager, type EngineState } from '../core/engineManager.ts';
import { deriveEngineStatus, type EngineStatus } from '../core/engineStatus.ts';
import { recommendModel } from '../core/fit.ts';
import { pathToUri, uriToPath } from '../core/paths.ts';
import { runSelfTest as runCoreSelfTest, type SelfTestResult } from '../core/selfTest.ts';
import { createStore } from '../core/store.ts';
import { getDeviceProfile } from './device.ts';
import { getBackendDevices, LlamaEngine } from './llamaEngine.ts';
import { draftPath, mmprojPath, modelPath, quickVerify } from './modelLibrary.ts';
import { settingsStore, updateSettingsNow } from './settings.ts';

/** App-private folder for KV session files (Settings > Advanced "KV session cache"; Storage > purge KV cache). */
export function kvCacheDir(): Directory {
  return new Directory(Paths.document, 'kvcache');
}

/** Catalog says this model can see images (an `Image` projector; it may still need downloading). */
export function modelHasVision(spec: ModelSpec): boolean {
  return !!spec.mmproj && spec.capabilities.includes('Image');
}

/** Downloaded companion (vision projector or MTP draft head), resolved by the Vault (modelLibrary), or null. */
export function companionPath(spec: ModelSpec, kind: 'mmproj' | 'draft'): string | null {
  try {
    return kind === 'mmproj' ? mmprojPath(spec) : draftPath(spec);
  } catch {
    return null;
  }
}

/** App-wide inference engine: one model in RAM at a time. */
export const engine = new EngineManager({
  engine: new LlamaEngine(),
  getSettings: () => settingsStore.getState(),
  updateSettingsNow,
  verifyFile: (spec) => quickVerify(spec),
  modelPath,
  totalRamBytes: () => getDeviceProfile().totalRamBytes,
  now: () => Date.now(),
  getModel: (id) => getModel(id),
  companionPath,
  kvCache: {
    pathFor: (key) => {
      const dir = kvCacheDir();
      if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
      return uriToPath(new File(dir, `${key.replace(/[^A-Za-z0-9._-]/g, '_')}.kv`).uri);
    },
    exists: (path) => new File(pathToUri(path)).exists,
    remove: (path) => {
      const f = new File(pathToUri(path));
      if (f.exists) f.delete();
    },
  },
});

/** Raw engine machine (status/stage/info). Prefer `useEngineStatus()` in new UI. */
export function useEngineState(): EngineState {
  return useSyncExternalStore(engine.store.subscribe, engine.store.getState);
}

/** The ONE flat status for UI chips/cards: { state, progress, modelId, backend, devices, nCtx, lastTokPerSec, ttftMs, promptTokens, ctxUsed, speculative, kvCache, vision, fallbacks, headline, ... }. */
export function useEngineStatus(): EngineStatus {
  const raw = useEngineState();
  return useMemo(() => deriveEngineStatus(raw, getDeviceProfile().totalRamBytes), [raw]);
}

export function getEngineStatus(): EngineStatus {
  return deriveEngineStatus(engine.state, getDeviceProfile().totalRamBytes);
}

/** The model to highlight / auto-download on this phone (real RAM from expo-device). 4B-class on a 12 GB phone, never the 8-9B tier. */
export function recommendedModel(): ModelSpec | null {
  return recommendModel(MODEL_CATALOG, getDeviceProfile().totalRamBytes);
}

/**
 * "Test model": loads the model if needed, asks it one fixed question, returns the real text, time to first token,
 * tokens/second and a pass/fail with reasons. Defaults to the active model, then the recommended one.
 */
export async function runSelfTest(modelId?: string, opts: { force?: boolean } = {}): Promise<SelfTestResult> {
  const spec = getModel(modelId ?? settingsStore.getState().activeModelId) ?? recommendedModel();
  if (!spec) throw new Error('No model to test.');
  return runCoreSelfTest(spec, { engine, now: () => Date.now() }, opts);
}

// ------------------------------------------------------------------ backend devices (Settings > Advanced)

export interface BackendDevicesState {
  status: 'unknown' | 'loading' | 'ready' | 'error';
  /** Exactly what llama.cpp reports (backend, type cpu/gpu/accel, deviceName, maxMemorySize). */
  devices: NativeBackendDeviceInfo[];
  /** A GPU-type device exists in this build on this phone. */
  gpuAvailable: boolean;
  error: string | null;
}

export const backendDevicesStore = createStore<BackendDevicesState>({ status: 'unknown', devices: [], gpuAvailable: false, error: null });

/** Ask llama.cpp which compute devices exist (CPU, Adreno OpenCL GPU, Hexagon...). Cached after the first call. */
export async function refreshBackendDevices(force = false): Promise<BackendDevicesState> {
  const cur = backendDevicesStore.getState();
  if (!force && (cur.status === 'ready' || cur.status === 'loading')) return cur;
  backendDevicesStore.setState({ status: 'loading', error: null });
  try {
    const devices = await getBackendDevices();
    backendDevicesStore.setState({
      status: 'ready',
      devices,
      gpuAvailable: devices.some((d) => /gpu/i.test(d.type)),
      error: null,
    });
  } catch (e) {
    backendDevicesStore.setState({ status: 'error', devices: [], gpuAvailable: false, error: e instanceof Error ? e.message : String(e) });
  }
  return backendDevicesStore.getState();
}

export function useBackendDevices(): BackendDevicesState {
  return useSyncExternalStore(backendDevicesStore.subscribe, backendDevicesStore.getState);
}
