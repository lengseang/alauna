import { downloads } from '../services/downloads.ts';
import { settingsStore, updateSection } from '../services/settings.ts';

/**
 * How many installs download at the same time (1..4). Stored in Settings v2 (`downloads.parallel`).
 * Applied at app start (services/lifecycle.ts).
 */
export function applySavedConcurrency(): Promise<void> {
  downloads.setConcurrency(settingsStore.getState().downloads.parallel);
  return Promise.resolve();
}

export function saveConcurrency(n: number): void {
  updateSection('downloads', { parallel: n });
  downloads.setConcurrency(n);
}
