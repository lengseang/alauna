import { useMemo, useSyncExternalStore } from 'react';
import { MODEL_CATALOG, getModel, type ModelSpec } from '../core/catalog.ts';
import { EngineManager, type EngineState } from '../core/engineManager.ts';
import { deriveEngineStatus, type EngineStatus } from '../core/engineStatus.ts';
import { recommendModel } from '../core/fit.ts';
import { runSelfTest as runCoreSelfTest, type SelfTestResult } from '../core/selfTest.ts';
import { getDeviceProfile } from './device.ts';
import { LlamaEngine } from './llamaEngine.ts';
import { modelPath, quickVerify } from './modelLibrary.ts';
import { settingsStore, updateSettingsNow } from './settings.ts';

/** App-wide inference engine: one model in RAM at a time. */
export const engine = new EngineManager({
  engine: new LlamaEngine(),
  getSettings: () => settingsStore.getState(),
  updateSettingsNow,
  verifyFile: (spec) => quickVerify(spec),
  modelPath,
  totalRamBytes: () => getDeviceProfile().totalRamBytes,
  now: () => Date.now(),
});

/** Raw engine machine (status/stage/info). Prefer `useEngineStatus()` in new UI. */
export function useEngineState(): EngineState {
  return useSyncExternalStore(engine.store.subscribe, engine.store.getState);
}

/** The ONE flat status for UI chips/cards: { state: idle|loading|warming|ready|generating|error, progress, modelId, backend, nCtx, lastTokPerSec, lastTokens, ttftMs, ramEstimateMb, error, errorFix, headline, ... }. */
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
