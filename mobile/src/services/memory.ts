/** Memory vault: user-managed facts, stored in <vault>/memory.json. What reaches the prompt: `useMemoryBudget()`. */
import { useMemo, useSyncExternalStore } from 'react';
import { readWithFallback, writeAtomic } from '../core/atomicFile.ts';
import { addFact, editFact, memoryBudget, removeFact, sanitizeFacts, setFactPaused, type MemoryBudget, type MemoryFact } from '../core/memory.ts';
import { newId } from '../core/chatTypes.ts';
import { createStore } from '../core/store.ts';
import { directoryIO } from './atomicIo.ts';
import { isStorageReady, vaultRoot } from './storage.ts';

export type { MemoryBudget, MemoryFact } from '../core/memory.ts';

export const memoryStore = createStore<{ facts: MemoryFact[]; loaded: boolean }>({ facts: [], loaded: false });

export const MEMORY_FILE = 'memory.json';
const io = () => directoryIO(vaultRoot);

function persist(facts: MemoryFact[]): void {
  try {
    writeAtomic(io(), MEMORY_FILE, JSON.stringify(facts));
  } catch {
    // The in-memory list stays correct for this session.
  }
}

function commit(facts: MemoryFact[]): void {
  memoryStore.setState({ facts });
  persist(facts);
}

export async function loadMemory(): Promise<void> {
  if (!isStorageReady()) return;
  try {
    const facts = (await readWithFallback(io(), MEMORY_FILE, (text) => sanitizeFacts(JSON.parse(text)))) ?? [];
    memoryStore.setState({ facts, loaded: true });
  } catch {
    memoryStore.setState({ facts: [], loaded: true });
  }
}

export function addMemory(text: string): { ok: true; fact: MemoryFact } | { ok: false; reason: string } {
  const r = addFact(memoryStore.getState().facts, text, Date.now(), newId('mem'));
  if (!r.ok) return r;
  commit(r.facts);
  return { ok: true, fact: r.fact };
}

export function editMemory(id: string, text: string): { ok: true; fact: MemoryFact } | { ok: false; reason: string } {
  const r = editFact(memoryStore.getState().facts, id, text, Date.now());
  if (!r.ok) return r;
  commit(r.facts);
  return { ok: true, fact: r.fact };
}

/** Paused facts stay in the vault but are not sent to the model. */
export function setMemoryPaused(id: string, paused: boolean): void {
  commit(setFactPaused(memoryStore.getState().facts, id, paused));
}

export function deleteMemory(id: string): void {
  commit(removeFact(memoryStore.getState().facts, id));
}

export function clearMemory(): void {
  commit([]);
}

/** Exactly which facts reach the system prompt, chars used / max, and the prompt text block. */
export function getMemoryBudget(): MemoryBudget {
  return memoryBudget(memoryStore.getState().facts);
}

export function useMemory(): { facts: MemoryFact[]; loaded: boolean } {
  return useSyncExternalStore(memoryStore.subscribe, memoryStore.getState);
}

export function useMemoryBudget(): MemoryBudget {
  const { facts } = useMemory();
  return useMemo(() => memoryBudget(facts), [facts]);
}
