/**
 * Privacy & data: auto-purge at launch, integrity check, purge actions.
 * Incognito chats are handled by chat.ts/chatStore.ts (never written); offline-strict by networkGate.ts.
 */
import { useSyncExternalStore } from 'react';
import { Directory, File, Paths } from 'expo-file-system';
import { MODEL_CATALOG } from '../core/catalog.ts';
import { staleThreadIds } from '../core/chatTypes.ts';
import { sanitizeFacts } from '../core/memory.ts';
import { createStore } from '../core/store.ts';
import { chatStore, refreshThreadList, resetAllChats } from './chat.ts';
import { deleteThreadFile, listThreads, validateThreads, type ThreadIntegrity } from './chatStore.ts';
import { engine, kvCacheDir } from './engine.ts';
import { clearMemory, MEMORY_FILE, memoryStore } from './memory.ts';
import { deepVerify, isInstalled, type CancelToken } from './modelLibrary.ts';
import { SETTINGS_FILE, settingsStore } from './settings.ts';
import { isStorageReady, mediaDir, vaultRoot } from './storage.ts';

// ------------------------------------------------------------------ auto-purge

/** Delete chats older than Settings.autoPurgeDays (pinned and the open chat are kept). Call at launch, after storage is ready. */
export async function autoPurgeOldChats(now = Date.now()): Promise<number> {
  const days = settingsStore.getState().autoPurgeDays;
  if (!(days > 0) || !isStorageReady()) return 0;
  const open = chatStore.getState().thread.id;
  const ids = staleThreadIds(await listThreads(), days, now).filter((id) => id !== open);
  for (const id of ids) deleteThreadFile(id);
  if (ids.length > 0) await refreshThreadList();
  return ids.length;
}

// ------------------------------------------------------------------ purge actions

function emptyDir(dir: Directory): number {
  let removed = 0;
  try {
    if (!dir.exists) return 0;
    for (const entry of dir.list()) {
      try {
        entry.delete();
        removed++;
      } catch {
        // keep going: report what was removed
      }
    }
  } catch {
    // unreadable folder
  }
  return removed;
}

/** Delete every saved chat and open a blank one. Returns the number of chats removed. */
export async function purgeChats(): Promise<number> {
  if (chatStore.getState().sending) throw new Error('Wait for the reply to finish (or press Stop) first.');
  return resetAllChats();
}

/** Forget every memory fact. */
export function purgeMemory(): number {
  const n = memoryStore.getState().facts.length;
  clearMemory();
  return n;
}

/** Delete saved KV sessions (the persona prefix is evaluated again on the next reply). */
export function purgeKvCache(): number {
  return emptyDir(kvCacheDir());
}

/** Delete attached images/files kept in the vault media folder. */
export function purgeMedia(): number {
  if (!isStorageReady()) return 0;
  return emptyDir(mediaDir());
}

/** Chats + memory + KV cache + media. Models and settings are kept (delete models in the Model Vault). */
export async function purgeAll(): Promise<{ chats: number; memory: number; kvCache: number; media: number }> {
  const chats = await purgeChats();
  return { chats, memory: purgeMemory(), kvCache: purgeKvCache(), media: purgeMedia() };
}

// ------------------------------------------------------------------ integrity check

export interface ModelIntegrity {
  modelId: string;
  name: string;
  ok: boolean;
  /** SHA-256 of the file on disk ('' when cancelled). */
  actual: string;
  cancelled: boolean;
}

export interface IntegrityReport {
  startedAt: number;
  finishedAt: number;
  chats: ThreadIntegrity;
  memory: 'ok' | 'missing' | 'corrupt';
  settings: 'ok' | 'missing' | 'corrupt';
  /** Only when `models: true` was asked: full SHA-256 of each installed model against the official hash. */
  models: ModelIntegrity[];
  /** Plain summary sentence. */
  summary: string;
}

export interface IntegrityProgress {
  running: boolean;
  /** 'chats' | 'memory' | 'settings' | model id */
  step: string | null;
  /** 0..1 of the current step (model hashing). */
  fraction: number;
  report: IntegrityReport | null;
}

export const integrityStore = createStore<IntegrityProgress>({ running: false, step: null, fraction: 0, report: null });

export function useIntegrity(): IntegrityProgress {
  return useSyncExternalStore(integrityStore.subscribe, integrityStore.getState);
}

async function checkJsonFile(file: File, validate: (raw: unknown) => boolean): Promise<'ok' | 'missing' | 'corrupt'> {
  try {
    if (!file.exists) return 'missing';
    return validate(JSON.parse(await file.text())) ? 'ok' : 'corrupt';
  } catch {
    return 'corrupt';
  }
}

/**
 * Validate chats, memory and settings JSON; with `models: true` also hash every installed model (slow on a phone:
 * minutes per GB) via the Vault's `deepVerify`. Cancel with `token.cancelled = true`.
 */
export async function runIntegrityCheck(opts: { models?: boolean; token?: CancelToken } = {}): Promise<IntegrityReport> {
  const token = opts.token ?? { cancelled: false };
  const startedAt = Date.now();
  integrityStore.setState({ running: true, step: 'chats', fraction: 0, report: null });
  try {
    const chats: ThreadIntegrity = isStorageReady() ? await validateThreads() : { ok: 0, recovered: [], corrupt: [] };
    integrityStore.setState({ step: 'memory' });
    const memory = isStorageReady()
      ? await checkJsonFile(new File(vaultRoot(), MEMORY_FILE), (raw) => Array.isArray(raw) && sanitizeFacts(raw).length === raw.length)
      : 'missing';
    integrityStore.setState({ step: 'settings' });
    const settings = await checkJsonFile(new File(Paths.document, SETTINGS_FILE), (raw) => !!raw && typeof raw === 'object' && !Array.isArray(raw));

    const models: ModelIntegrity[] = [];
    if (opts.models && isStorageReady()) {
      for (const spec of MODEL_CATALOG) {
        if (token.cancelled) break;
        if (!isInstalled(spec)) continue;
        if (engine.state.status === 'mounting' && engine.state.modelId === spec.id) continue;
        integrityStore.setState({ step: spec.id, fraction: 0 });
        const r = await deepVerify(spec, spec.sha256, (f) => integrityStore.setState({ fraction: f }), token);
        models.push({ modelId: spec.id, name: spec.name, ok: r.ok, actual: r.actual, cancelled: r.cancelled });
      }
    }

    const problems: string[] = [];
    if (chats.corrupt.length) problems.push(`${chats.corrupt.length} chat file(s) cannot be read`);
    if (chats.recovered.length) problems.push(`${chats.recovered.length} chat(s) were recovered from a backup copy`);
    if (memory === 'corrupt') problems.push('the memory file is damaged');
    if (settings === 'corrupt') problems.push('the settings file is damaged');
    const badModels = models.filter((m) => !m.ok && !m.cancelled);
    if (badModels.length) problems.push(`${badModels.map((m) => m.name).join(', ')} failed the checksum (delete and download again)`);
    const checkedModels = models.filter((m) => !m.cancelled).length;
    const summary = problems.length
      ? `Problems found: ${problems.join('; ')}.`
      : `All good: ${chats.ok} chat(s), memory and settings are valid${checkedModels ? `, ${checkedModels} model(s) match their official checksum` : ''}.`;
    const report: IntegrityReport = { startedAt, finishedAt: Date.now(), chats, memory, settings, models, summary };
    integrityStore.setState({ running: false, step: null, fraction: 1, report });
    return report;
  } catch (e) {
    integrityStore.setState({ running: false, step: null });
    throw e;
  }
}
