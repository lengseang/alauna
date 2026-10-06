import { useSyncExternalStore } from 'react';
import { EngineManager, type EngineState } from '../core/engineManager.ts';
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

export function useEngineState(): EngineState {
  return useSyncExternalStore(engine.store.subscribe, engine.store.getState);
}
