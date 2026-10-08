/**
 * Startup order and "what must be refreshed when storage changes".
 *
 * Order matters (docs/REQUIREMENTS.md ST-1/ST-2): settings -> storage -> crash check ->
 * only then data that lives inside the vault (downloads, chats, memory).
 */
import { AppState } from 'react-native';
import { MemoryGuard } from '../core/memoryGuard.ts';
import { engine } from './engine.ts';
import { chatStore, initChat } from './chat.ts';
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

let guardInstalled = false;

/**
 * Release the model's RAM when the app has been in the background for a while or the OS warns about memory.
 * Never interrupts a reply or a load; `inactive` (permission dialog, folder picker) does not count as background.
 */
export function installMemoryGuard(): void {
  if (guardInstalled) return;
  guardInstalled = true;
  const guard = new MemoryGuard({
    isBusy: () => engine.state.status === 'generating' || engine.state.status === 'mounting' || chatStore.getState().sending,
    isLoaded: () => engine.isReady(),
    release: (reason) => engine.releaseIdle(reason),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  });
  AppState.addEventListener('change', (next) => {
    if (next === 'background') guard.onBackground();
    else if (next === 'active') guard.onForeground();
  });
  AppState.addEventListener('memoryWarning', () => guard.onMemoryWarning());
}

let started: Promise<void> | null = null;
export function bootstrap(): Promise<void> {
  if (!started) {
    installMemoryGuard();
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
