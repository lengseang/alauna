import { useMemo, useSyncExternalStore } from 'react';
import { downloads } from '../services/downloads.ts';

const completedKey = () =>
  Object.entries(downloads.store.getState().items)
    .filter(([, d]) => d.status === 'completed')
    .map(([id]) => id)
    .sort()
    .join('|');

/**
 * Ids of models fully on the phone. The snapshot is a string, so components re-render only when the SET changes,
 * not on every download progress tick (useDownloadItems would).
 */
export function useInstalledIds(): string[] {
  const key = useSyncExternalStore(downloads.store.subscribe, completedKey);
  return useMemo(() => (key ? key.split('|') : []), [key]);
}

export function useIsInstalled(id: string | null | undefined): boolean {
  return useSyncExternalStore(downloads.store.subscribe, () => !!id && downloads.store.getState().items[id]?.status === 'completed');
}
