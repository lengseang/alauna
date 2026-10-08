/** Chat threads on disk: <vault>/chats/<id>.json. Incognito threads are never written. */
import { File } from 'expo-file-system';
import { orphanedTemps, readWithFallback, writeAtomic, TMP_SUFFIX } from '../core/atomicFile.ts';
import { isSafeThreadId, sanitizeThread, threadMatch, toPersistable, type ChatThread } from '../core/chatTypes.ts';
import { directoryIO } from './atomicIo.ts';
import { chatsDir } from './storage.ts';

export interface ThreadMeta {
  id: string;
  title: string;
  updatedAt: number;
  messageCount: number;
  pinned: boolean;
  /** Search results only: text around the first hit. */
  snippet?: string;
}

const io = () => directoryIO(chatsDir);
const nameFor = (id: string): string => {
  if (!isSafeThreadId(id)) throw new Error(`Unsafe chat id: ${id}`);
  return `${id}.json`;
};

/** Crash-safe: a kill in the middle of a save leaves either the old or the new complete file (core/atomicFile.ts). */
export async function saveThread(thread: ChatThread): Promise<void> {
  if (thread.incognito) return;
  writeAtomic(io(), nameFor(thread.id), JSON.stringify(toPersistable(thread)));
}

export async function loadThread(id: string): Promise<ChatThread | null> {
  try {
    return await readWithFallback(io(), nameFor(id), (text) => sanitizeThread(JSON.parse(text)));
  } catch {
    return null;
  }
}

/** Ids of every chat file on disk (including one only present as a leftover .tmp after a kill mid-save). */
function threadIdsOnDisk(): string[] {
  let names: string[] = [];
  try {
    names = chatsDir()
      .list()
      .filter((e): e is File => e instanceof File)
      .map((e) => e.name);
  } catch {
    return [];
  }
  const ids = new Set<string>();
  for (const n of names) if (n.endsWith('.json')) ids.add(n.slice(0, -5));
  for (const n of orphanedTemps(names.filter((x) => x.endsWith('.json') || x.endsWith('.json' + TMP_SUFFIX)))) ids.add(n.slice(0, -5)); // killed mid-replace
  return [...ids].filter(isSafeThreadId);
}

const metaOf = (t: ChatThread, snippet?: string): ThreadMeta => ({
  id: t.id,
  title: t.title,
  updatedAt: t.updatedAt,
  messageCount: t.messages.length,
  pinned: t.pinned,
  ...(snippet !== undefined ? { snippet } : {}),
});

/** Pinned first, then most recently updated. */
export const sortThreads = (list: ThreadMeta[]): ThreadMeta[] =>
  list.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);

export async function listThreads(): Promise<ThreadMeta[]> {
  const out: ThreadMeta[] = [];
  for (const id of threadIdsOnDisk()) {
    const t = await loadThread(id);
    if (t && t.messages.length > 0) out.push(metaOf(t));
  }
  return sortThreads(out);
}

/** Search titles and every message (case-insensitive). ponytail: parses every file, add an index when chats number in the thousands. */
export async function searchThreads(query: string): Promise<ThreadMeta[]> {
  if (!query.trim()) return listThreads();
  const out: ThreadMeta[] = [];
  for (const id of threadIdsOnDisk()) {
    const t = await loadThread(id);
    if (!t || t.messages.length === 0) continue;
    const hit = threadMatch(t, query);
    if (hit) out.push(metaOf(t, hit.snippet));
  }
  return sortThreads(out);
}

/** Read, change and save one chat file. Returns the updated thread, or null if it does not exist. */
export async function updateThreadFile(id: string, change: (t: ChatThread) => ChatThread): Promise<ChatThread | null> {
  const t = await loadThread(id);
  if (!t) return null;
  const next = change(t);
  await saveThread(next);
  return next;
}

export function deleteThreadFile(id: string): void {
  try {
    const name = nameFor(id);
    const dir = io();
    for (const n of [name, name + TMP_SUFFIX]) dir.remove(n);
  } catch {
    // already gone
  }
}

/** Delete every chat file. Returns how many chats were removed. */
export function deleteAllThreadFiles(): number {
  const ids = threadIdsOnDisk();
  for (const id of ids) deleteThreadFile(id);
  return ids.length;
}

export interface ThreadIntegrity {
  ok: number;
  /** Main file unreadable but the complete temp copy was used. */
  recovered: string[];
  /** Neither copy parses: the chat cannot be opened. */
  corrupt: string[];
}

/** Validate every chat file (JSON + schema). Never modifies anything. */
export async function validateThreads(): Promise<ThreadIntegrity> {
  const out: ThreadIntegrity = { ok: 0, recovered: [], corrupt: [] };
  const dir = io();
  for (const id of threadIdsOnDisk()) {
    const name = nameFor(id);
    let main = false;
    try {
      main = dir.exists(name) && sanitizeThread(JSON.parse(await dir.read(name))) !== null;
    } catch {
      main = false;
    }
    if (main) {
      out.ok++;
      continue;
    }
    if ((await loadThread(id)) !== null) out.recovered.push(id);
    else out.corrupt.push(id);
  }
  return out;
}
