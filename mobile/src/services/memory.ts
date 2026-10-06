/** User-managed memory facts, stored in <vault>/memory.json. */
import { File } from 'expo-file-system';
import { addFact, removeFact, sanitizeFacts, type MemoryFact } from '../core/memory.ts';
import { newId } from '../core/chatTypes.ts';
import { createStore } from '../core/store.ts';
import { isStorageReady, vaultRoot } from './storage.ts';

export const memoryStore = createStore<{ facts: MemoryFact[]; loaded: boolean }>({ facts: [], loaded: false });

function file(): File {
  return new File(vaultRoot(), 'memory.json');
}

function persist(facts: MemoryFact[]): void {
  try {
    const f = file();
    if (!f.exists) f.create({ intermediates: true });
    f.write(JSON.stringify(facts));
  } catch {
    // The in-memory list stays correct for this session.
  }
}

export async function loadMemory(): Promise<void> {
  if (!isStorageReady()) return;
  try {
    const f = file();
    const facts = f.exists ? sanitizeFacts(JSON.parse(await f.text())) : [];
    memoryStore.setState({ facts, loaded: true });
  } catch {
    memoryStore.setState({ facts: [], loaded: true });
  }
}

export function addMemory(text: string): { ok: true; fact: MemoryFact } | { ok: false; reason: string } {
  const r = addFact(memoryStore.getState().facts, text, Date.now(), newId('mem'));
  if (!r.ok) return r;
  memoryStore.setState({ facts: r.facts });
  persist(r.facts);
  return { ok: true, fact: r.fact };
}

export function deleteMemory(id: string): void {
  const facts = removeFact(memoryStore.getState().facts, id);
  memoryStore.setState({ facts });
  persist(facts);
}

export function clearMemory(): void {
  memoryStore.setState({ facts: [] });
  persist([]);
}
