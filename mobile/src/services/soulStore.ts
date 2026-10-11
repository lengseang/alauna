/**
 * Persisted Soul Library & Personality Studio Store.
 *
 * Manages custom souls, favorites, trait packs, and thread emotional runtimes.
 * Built-in templates cannot be deleted or mutated; edits create custom versions.
 */
import { useSyncExternalStore } from 'react';
import { Paths } from 'expo-file-system';
import { createStore } from '../core/store.ts';
import { readWithFallback, writeAtomic } from '../core/atomicFile.ts';
import { directoryIO } from './atomicIo.ts';
import type { SoulDefinition, TraitPack } from '../core/soulSchema.ts';
import {
  sanitizeSoul,
  duplicateSoulDef,
  exportSoulDefJson,
  importSoulDefJson,
} from '../core/soulSchema.ts';
import { BUILT_IN_SOULS, BUILT_IN_SOUL_MAP, getBuiltInSoul } from '../core/builtInSouls.ts';
import { settingsStore, updateSettings } from './settings.ts';
import type { ThreadEmotionalState } from '../core/soulRuntime.ts';
import {
  initThreadEmotionalState,
  stepEmotionalDecay,
  evaluateTriggers,
} from '../core/soulRuntime.ts';

export const SOULS_FILE = 'chiwiwi_custom_souls.json';
export const PACKS_FILE = 'chiwiwi_trait_packs.json';

export interface SoulStoreState {
  customSouls: Record<string, SoulDefinition>;
  favoriteIds: string[];
  packs: Record<string, TraitPack>;
  emotionalStates: Record<string, ThreadEmotionalState>; // threadId -> runtime
  loaded: boolean;
}

export const soulStore = createStore<SoulStoreState>({
  customSouls: {},
  favoriteIds: ['soul_alauna', 'soul_companion'],
  packs: {},
  emotionalStates: {},
  loaded: false,
});

const io = () => directoryIO(() => Paths.document);

let writeTimer: ReturnType<typeof setTimeout> | null = null;
function persistSoon(): void {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    try {
      const { customSouls, favoriteIds, packs } = soulStore.getState();
      writeAtomic(io(), SOULS_FILE, JSON.stringify({ customSouls, favoriteIds }));
      writeAtomic(io(), PACKS_FILE, JSON.stringify(packs));
    } catch {
      // Storage write error handled gracefully
    }
  }, 500);
}

let loadPromise: Promise<void> | null = null;
export function initSoulStore(): Promise<void> {
  if (!loadPromise) {
    loadPromise = (async () => {
      let customSouls: Record<string, SoulDefinition> = {};
      let favoriteIds: string[] = ['soul_sage'];
      let packs: Record<string, TraitPack> = {};

      try {
        const parsedSouls = await readWithFallback(io(), SOULS_FILE, (text) => {
          try {
            return JSON.parse(text) as { customSouls?: unknown; favoriteIds?: unknown };
          } catch {
            return null;
          }
        });
        if (parsedSouls) {
          if (parsedSouls.customSouls && typeof parsedSouls.customSouls === 'object') {
            for (const [id, s] of Object.entries(parsedSouls.customSouls as Record<string, unknown>)) {
              customSouls[id] = sanitizeSoul(s, id);
            }
          }
          if (Array.isArray(parsedSouls.favoriteIds)) {
            favoriteIds = parsedSouls.favoriteIds.filter((x: unknown): x is string => typeof x === 'string');
          }
        }
      } catch {
        // Fallback
      }

      try {
        const parsedPacks = await readWithFallback(io(), PACKS_FILE, (text) => {
          try {
            return JSON.parse(text) as Record<string, TraitPack>;
          } catch {
            return null;
          }
        });
        if (parsedPacks && typeof parsedPacks === 'object') {
          packs = parsedPacks;
        }
      } catch {
        // Fallback
      }

      soulStore.setState({ customSouls, favoriteIds, packs, loaded: true });
    })();
  }
  return loadPromise;
}

export function useSoulLibrary(): SoulStoreState & { allSouls: SoulDefinition[]; activeSoul: SoulDefinition } {
  const state = useSyncExternalStore(soulStore.subscribe, soulStore.getState);
  const activeId = settingsStore.getState().activeSoulId || 'soul_sage';
  const activeSoul = getSoul(activeId) ?? BUILT_IN_SOULS[0];
  const allSouls = [...BUILT_IN_SOULS, ...Object.values(state.customSouls)];
  return { ...state, allSouls, activeSoul };
}

export const useSoulStore = useSoulLibrary;

export function getSoul(id: string): SoulDefinition | null {
  const custom = soulStore.getState().customSouls[id];
  if (custom) return custom;
  return getBuiltInSoul(id);
}

export function getActiveSoul(): SoulDefinition {
  const activeId = settingsStore.getState().activeSoulId || 'soul_sage';
  return getSoul(activeId) ?? BUILT_IN_SOULS[0];
}

export function setActiveSoul(soulId: string): void {
  const target = getSoul(soulId);
  if (!target) return;
  updateSettings({ activeSoulId: target.id });
}

export function saveCustomSoul(soul: SoulDefinition): SoulDefinition {
  const sanitized = sanitizeSoul({ ...soul, type: 'custom', updatedAt: Date.now() });
  const customSouls = { ...soulStore.getState().customSouls, [sanitized.id]: sanitized };
  soulStore.setState({ customSouls });
  persistSoon();
  return sanitized;
}

export function deleteCustomSoul(soulId: string): boolean {
  if (BUILT_IN_SOUL_MAP[soulId]) return false; // Cannot delete built-ins
  const customSouls = { ...soulStore.getState().customSouls };
  if (!customSouls[soulId]) return false;
  delete customSouls[soulId];
  soulStore.setState({ customSouls });
  persistSoon();
  return true;
}

export function duplicateSoul(sourceId: string, newName?: string): SoulDefinition | null {
  const source = getSoul(sourceId);
  if (!source) return null;
  const clone = duplicateSoulDef(source, newName);
  return saveCustomSoul(clone);
}

export function toggleFavoriteSoul(soulId: string): void {
  const { favoriteIds } = soulStore.getState();
  const exists = favoriteIds.includes(soulId);
  const next = exists ? favoriteIds.filter((id) => id !== soulId) : [...favoriteIds, soulId];
  soulStore.setState({ favoriteIds: next });
  persistSoon();
}

/**
 * Exports a portable Soul JSON document. Strips private user memories.
 */
export function exportSoulJson(soulId: string): string | null {
  const soul = getSoul(soulId);
  if (!soul) return null;
  return exportSoulDefJson(soul);
}

/**
 * Imports a Soul JSON document with validation.
 */
export function importSoulJson(rawJson: string): SoulDefinition | null {
  const imported = importSoulDefJson(rawJson);
  if (!imported) return null;
  return saveCustomSoul(imported);
}

// --- Thread Runtime State helpers
export function getThreadEmotionalState(threadId: string, soul: SoulDefinition): ThreadEmotionalState {
  const { emotionalStates } = soulStore.getState();
  const existing = emotionalStates[threadId];
  if (existing && existing.soulId === soul.id) {
    return existing;
  }
  const fresh = initThreadEmotionalState(threadId, soul);
  soulStore.setState({ emotionalStates: { ...emotionalStates, [threadId]: fresh } });
  return fresh;
}

export function updateThreadRuntimeOnTurn(
  threadId: string,
  soul: SoulDefinition,
  userMessage: string,
): { state: ThreadEmotionalState; behavioralPrompts: string[] } {
  const current = getThreadEmotionalState(threadId, soul);
  const decayed = stepEmotionalDecay(current, soul);
  const evaluated = evaluateTriggers(decayed, soul, userMessage);

  soulStore.setState({
    emotionalStates: {
      ...soulStore.getState().emotionalStates,
      [threadId]: evaluated.updatedState,
    },
  });

  return {
    state: evaluated.updatedState,
    behavioralPrompts: evaluated.behavioralPrompts,
  };
}
