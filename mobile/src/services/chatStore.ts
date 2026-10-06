/** Chat threads on disk: <vault>/chats/<id>.json. Incognito threads are never written. */
import { File } from 'expo-file-system';
import { isSafeThreadId, sanitizeThread, toPersistable, type ChatThread } from '../core/chatTypes.ts';
import { chatsDir } from './storage.ts';

export interface ThreadMeta {
  id: string;
  title: string;
  updatedAt: number;
  messageCount: number;
}

function fileFor(id: string): File {
  if (!isSafeThreadId(id)) throw new Error(`Unsafe chat id: ${id}`);
  return new File(chatsDir(), `${id}.json`);
}

export async function saveThread(thread: ChatThread): Promise<void> {
  if (thread.incognito) return;
  const file = fileFor(thread.id);
  if (!file.exists) file.create({ intermediates: true });
  file.write(JSON.stringify(toPersistable(thread)));
}

export async function loadThread(id: string): Promise<ChatThread | null> {
  try {
    const file = fileFor(id);
    if (!file.exists) return null;
    return sanitizeThread(JSON.parse(await file.text()));
  } catch {
    return null;
  }
}

export async function listThreads(): Promise<ThreadMeta[]> {
  const out: ThreadMeta[] = [];
  let entries: Array<File | unknown> = [];
  try {
    entries = chatsDir().list();
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (!(entry instanceof File) || !entry.name.endsWith('.json')) continue;
    try {
      const t = sanitizeThread(JSON.parse(await entry.text()));
      if (t && t.messages.length > 0) {
        out.push({ id: t.id, title: t.title, updatedAt: t.updatedAt, messageCount: t.messages.length });
      }
    } catch {
      // skip unreadable file
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function deleteThreadFile(id: string): void {
  try {
    const file = fileFor(id);
    if (file.exists) file.delete();
  } catch {
    // already gone
  }
}
