/** Chat threads on disk: <vault>/chats/<id>.json. Incognito threads are never written. */
import { File } from 'expo-file-system';
import { orphanedTemps, readWithFallback, writeAtomic, TMP_SUFFIX } from '../core/atomicFile.ts';
import { isSafeThreadId, sanitizeThread, toPersistable, type ChatThread } from '../core/chatTypes.ts';
import { directoryIO } from './atomicIo.ts';
import { chatsDir } from './storage.ts';

export interface ThreadMeta {
  id: string;
  title: string;
  updatedAt: number;
  messageCount: number;
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

export async function listThreads(): Promise<ThreadMeta[]> {
  const out: ThreadMeta[] = [];
  let names: string[] = [];
  try {
    names = chatsDir()
      .list()
      .filter((e): e is File => e instanceof File)
      .map((e) => e.name);
  } catch {
    return out;
  }
  const ids = new Set<string>();
  for (const n of names) if (n.endsWith('.json')) ids.add(n.slice(0, -5));
  for (const n of orphanedTemps(names.filter((x) => x.endsWith('.json') || x.endsWith('.json' + TMP_SUFFIX)))) ids.add(n.slice(0, -5)); // killed mid-replace
  for (const id of ids) {
    if (!isSafeThreadId(id)) continue;
    const t = await loadThread(id);
    if (t && t.messages.length > 0) out.push({ id: t.id, title: t.title, updatedAt: t.updatedAt, messageCount: t.messages.length });
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
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
