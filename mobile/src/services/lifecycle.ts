/**
 * Startup order and "what must be refreshed when storage changes".
 *
 * Order matters (docs/REQUIREMENTS.md ST-1/ST-2): settings -> storage -> crash check ->
 * only then data that lives inside the vault (downloads, chats, memory).
 */
import { engine } from './engine.ts';
import { initChat } from './chat.ts';
import { refreshDownloads } from './downloads.ts';
import { loadMemory } from './memory.ts';
import { initSettings, updateSettings } from './settings.ts';
import { initStorage, isStorageReady } from './storage.ts';

/** Load everything that lives inside the vault. Call whenever storage becomes (or changes to) ready. */
export async function onStorageReady(): Promise<void> {
  if (!isStorageReady()) return;
  refreshDownloads();
  await Promise.all([loadMemory(), initChat()]);
}

/** The vault moved: whatever was in RAM came from the old location, so release it. */
export async function onStorageChanged(): Promise<void> {
  await engine.unmount();
  updateSettings({ activeModelId: null });
  await onStorageReady();
}

let started: Promise<void> | null = null;
export function bootstrap(): Promise<void> {
  if (!started) {
    started = (async () => {
      await initSettings();
      await initStorage();
      await engine.noteStartup();
      await onStorageReady();
    })();
  }
  return started;
}

/** Re-check the saved folder when the app returns to the foreground (SD card removed, permission revoked...). */
export async function recheckStorage(): Promise<void> {
  const before = isStorageReady();
  await initStorage();
  if (!before && isStorageReady()) await onStorageReady();
}
