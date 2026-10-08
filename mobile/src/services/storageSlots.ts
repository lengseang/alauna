/**
 * Storage slots, measured: used/free per slot, vault usage by category, and moving a model between slots
 * (copy -> verify -> delete; the source is only deleted after the copy proved identical).
 * Slot definitions/persistence live in storage.ts; this file adds the parts that need the Vault and the engine.
 */
import { Directory, File } from 'expo-file-system';
import type { ModelSpec } from '../core/catalog.ts';
import { hasGgufMagic } from '../core/gguf.ts';
import { pathToUri, uriToPath } from '../core/paths.ts';
import { MODEL_CATALOG } from '../core/catalog.ts';
import { engine, kvCacheDir } from './engine.ts';
import { MEMORY_FILE } from './memory.ts';
import { hashFile, installedFiles, readHeader, type CancelToken } from './modelLibrary.ts';
import {
  chatsDir,
  isStorageReady,
  listSlotRoots,
  locateModelFile,
  mediaDir,
  PRIMARY_SLOT_ID,
  slotById,
  slotModelFileNames,
  slotModelsDir,
  storageStore,
  vaultRoot,
  volumeSpace,
  downloadSlot,
  type SlotInfo,
} from './storage.ts';

/** Bytes under a folder (native size when available, else a recursive walk). Null when unreadable. */
export function dirBytes(dir: Directory): number | null {
  try {
    if (!dir.exists) return 0;
    const native = (dir as unknown as { size?: unknown }).size;
    if (typeof native === 'number' && native >= 0) return native;
    let total = 0;
    for (const e of dir.list()) total += e instanceof File ? (e.size ?? 0) : (dirBytes(e) ?? 0);
    return total;
  } catch {
    return null;
  }
}

/** Measure every slot (used, model files, free space) and publish it in `storageStore.slots` / `useStorageSlots()`. */
export function refreshSlots(): SlotInfo[] {
  if (!isStorageReady()) {
    storageStore.setState({ slots: [] });
    return [];
  }
  let target: string | null = null;
  try {
    target = downloadSlot().id;
  } catch {
    target = null;
  }
  const slots: SlotInfo[] = listSlotRoots().map((slot) => {
    let available = false;
    try {
      available = slotModelsDir(slot).exists;
    } catch {
      available = false;
    }
    const models = slotModelsDir(slot);
    const names = available ? slotModelFileNames(slot) : [];
    let modelBytes: number | null = 0;
    for (const n of names) {
      try {
        modelBytes += new File(models, n).size ?? 0;
      } catch {
        modelBytes = null;
        break;
      }
    }
    return {
      ...slot,
      isPrimary: slot.id === PRIMARY_SLOT_ID,
      isDownloadTarget: slot.id === target,
      available,
      usedBytes: available ? dirBytes(new Directory(pathToUri(slot.rootPath))) : null,
      modelBytes: available ? modelBytes : null,
      modelFiles: names.filter((n) => !n.endsWith('.part')).length,
      ...volumeSpace(slot.rootPath),
    };
  });
  storageStore.setState({ slots });
  return slots;
}

export interface VaultUsage {
  /** GGUF files (complete + partial) across every slot. */
  models: number;
  chats: number;
  memory: number;
  media: number;
  kvCache: number;
  total: number;
}

/** Real bytes per category (the old "5 slot cards": models, chats, memory, media, KV cache). */
export function vaultUsage(): VaultUsage {
  const n = (v: number | null) => v ?? 0;
  let models = 0;
  for (const slot of listSlotRoots()) {
    for (const name of slotModelFileNames(slot)) {
      try {
        models += new File(slotModelsDir(slot), name).size ?? 0;
      } catch {
        // unreadable: skip
      }
    }
  }
  const ready = isStorageReady();
  const chats = ready ? n(dirBytes(chatsDir())) : 0;
  let memory = 0;
  try {
    if (ready) {
      const f = new File(vaultRoot(), MEMORY_FILE);
      memory = f.exists ? (f.size ?? 0) : 0;
    }
  } catch {
    memory = 0;
  }
  const media = ready ? n(dirBytes(mediaDir())) : 0;
  const kvCache = n(dirBytes(kvCacheDir()));
  return { models, chats, memory, media, kvCache, total: models + chats + memory + media + kvCache };
}

export type MoveModelResult =
  | { ok: true; bytes: number; verified: 'sha256' | 'size'; from: string; to: string }
  | {
      ok: false;
      reason: 'not_found' | 'unknown_slot' | 'same_slot' | 'loaded' | 'no_space' | 'copy_failed' | 'verify_failed' | 'cancelled';
      message: string;
    };

export interface MoveModelOptions {
  /** 'sha256' (default) hashes the copy against the catalog hash (minutes per GB on a phone); 'size' = size + GGUF header only. */
  verify?: 'sha256' | 'size';
  onProgress?: (stage: 'copying' | 'verifying' | 'cleaning', fraction: number) => void;
  token?: CancelToken;
}

const MOVING_SUFFIX = '.moving';

function deleteQuietly(f: File): void {
  try {
    if (f.exists) f.delete();
  } catch {
    // reported by the caller if it matters
  }
}

/**
 * Move a model (and its vision projector, if downloaded) to another slot: copy to `<name>.moving`, verify the copy,
 * rename it into place, and only then delete the original. Any failure deletes the partial copy and keeps the original.
 */
export async function moveModel(spec: ModelSpec, toSlotId: string, opts: MoveModelOptions = {}): Promise<MoveModelResult> {
  const token = opts.token ?? { cancelled: false };
  const progress = opts.onProgress ?? (() => undefined);
  const src = locateModelFile(spec.filename);
  if (!src) return { ok: false, reason: 'not_found', message: `${spec.name} is not downloaded.` };
  const dest = slotById(toSlotId);
  if (!dest) return { ok: false, reason: 'unknown_slot', message: 'That storage location is not in the list.' };
  if (src.slotId === dest.id) return { ok: false, reason: 'same_slot', message: `${spec.name} is already there.` };
  if (engine.state.modelId === spec.id && engine.state.status !== 'unmounted' && engine.state.status !== 'error') {
    return { ok: false, reason: 'loaded', message: `${spec.name} is loaded. Unload it first, then move it.` };
  }

  const destDir = slotModelsDir(dest);
  // Every file of the install (model, projector, draft head) exactly where the Vault resolves it.
  const sources = installedFiles(spec).map((f) => new File(pathToUri(f.path)));
  const bytes = sources.reduce((sum, f) => sum + (f.size ?? 0), 0);
  const { freeBytes } = volumeSpace(dest.rootPath);
  if (freeBytes !== null && freeBytes < bytes + 50e6) {
    return { ok: false, reason: 'no_space', message: `Not enough free space there (needs ${Math.ceil(bytes / 1e6)} MB).` };
  }

  const copies: Array<{ tmp: File; name: string; src: File }> = [];
  const abort = (reason: 'copy_failed' | 'verify_failed' | 'cancelled', message: string): MoveModelResult => {
    for (const c of copies) deleteQuietly(c.tmp);
    return { ok: false, reason, message };
  };
  try {
    if (!destDir.exists) destDir.create({ intermediates: true, idempotent: true });
  } catch (e) {
    return { ok: false, reason: 'copy_failed', message: `Could not open the destination folder (${e instanceof Error ? e.message : String(e)}).` };
  }

  // 1. copy
  for (let i = 0; i < sources.length; i++) {
    if (token.cancelled) return abort('cancelled', 'Move cancelled. The model was not changed.');
    const s = sources[i];
    const tmp = new File(destDir, `${s.name}${MOVING_SUFFIX}`);
    deleteQuietly(tmp);
    copies.push({ tmp, name: s.name, src: s });
    progress('copying', i / sources.length);
    try {
      await s.copy(tmp);
    } catch (e) {
      return abort('copy_failed', `Copying failed (${e instanceof Error ? e.message : String(e)}). The model was not changed.`);
    }
  }
  progress('copying', 1);

  // 2. verify (size + GGUF header always; SHA-256 of the model by default)
  for (const c of copies) {
    if (c.tmp.size !== c.src.size) return abort('verify_failed', `The copy of ${c.name} has the wrong size. The model was not changed.`);
    const head = readHeader(c.tmp);
    if (!head || !hasGgufMagic(head)) return abort('verify_failed', `The copy of ${c.name} is not a valid GGUF file. The model was not changed.`);
  }
  const verify = opts.verify ?? 'sha256';
  if (verify === 'sha256' && spec.sha256) {
    const main = copies.find((c) => c.name === spec.filename);
    if (main) {
      const r = await hashFile(main.tmp, (f) => progress('verifying', f), () => token.cancelled);
      if (r.stopped) return abort('cancelled', 'Move cancelled. The model was not changed.');
      if (r.actual !== spec.sha256.toLowerCase()) return abort('verify_failed', 'The copy does not match the official checksum. The model was not changed.');
    }
  }

  // 3. put in place, then remove the originals
  progress('cleaning', 0);
  for (const c of copies) {
    try {
      deleteQuietly(new File(destDir, c.name));
      c.tmp.rename(c.name);
    } catch (e) {
      return abort('copy_failed', `Could not finish the move (${e instanceof Error ? e.message : String(e)}). The original is unchanged.`);
    }
  }
  // A projector can be shared by several models: keep the source copy while another model in that slot still uses it.
  const shared = new Set(
    MODEL_CATALOG.filter((m) => m.id !== spec.id)
      .map((m) => installedFiles(m))
      .filter((files) => files.some((f) => f.kind === 'model'))
      .flatMap((files) => files.filter((f) => f.kind !== 'model').map((f) => f.path)),
  );
  for (const c of copies) if (!shared.has(uriToPath(c.src.uri))) deleteQuietly(c.src);
  progress('cleaning', 1);
  refreshSlots();
  return { ok: true, bytes, verified: verify === 'sha256' && spec.sha256 ? 'sha256' : 'size', from: src.slotId, to: dest.id };
}
