/**
 * What is on disk: installed models and their companions (image/audio projector, draft head), partial downloads,
 * integrity checks. Files are found in any storage slot (services/storage.ts `locateModelFile`); new downloads go to
 * the download slot (`downloadModelsDir`) unless a destination folder is given.
 */
import { Directory, File, FileMode } from 'expo-file-system';
import type { ModelSpec } from '../core/catalog.ts';
import { companionLocalName, installFiles, type DownloadFile, type FileKind } from '../core/downloadManager.ts';
import { hasGgufMagic } from '../core/gguf.ts';
import { pathToUri, uriToPath } from '../core/paths.ts';
import { Sha256Digest } from '../core/sha256.ts';
import { downloadModelsDir, invalidateModelIndex, locateModelFile } from './storage.ts';

export const PARTIAL_SUFFIX = '.part';

/** Folder for a file: its explicit destination, else wherever it (or its partial) already is, else the download slot. */
function folderFor(localName: string, dir?: string): Directory {
  if (dir) return new Directory(pathToUri(dir));
  const hit = locateModelFile(localName) ?? locateModelFile(`${localName}${PARTIAL_SUFFIX}`);
  return hit ? hit.file.parentDirectory : downloadModelsDir();
}

export function destFile(f: Pick<DownloadFile, 'localName' | 'dir'>): File {
  if (!f.dir) {
    const hit = locateModelFile(f.localName);
    if (hit) return hit.file;
  }
  return new File(folderFor(f.localName, f.dir), f.localName);
}

export function partFile(f: Pick<DownloadFile, 'localName' | 'dir'>): File {
  const partName = `${f.localName}${PARTIAL_SUFFIX}`;
  if (!f.dir) {
    const hit = locateModelFile(partName);
    if (hit) return hit.file;
  }
  return new File(folderFor(f.localName, f.dir), partName);
}

const modelEntry = (spec: ModelSpec): DownloadFile => installFiles(spec, { vision: false })[0];

export function modelFile(spec: ModelSpec): File {
  return destFile(modelEntry(spec));
}

export function partialFile(spec: ModelSpec): File {
  return partFile(modelEntry(spec));
}

/** Real filesystem path for the inference engine. */
export function modelPath(spec: ModelSpec): string {
  return uriToPath(modelFile(spec).uri);
}

/** Real folder path of an installed (or partial) model, or undefined when it is not on the phone. */
export function modelFolder(spec: ModelSpec): string | undefined {
  const m = modelEntry(spec);
  const hit = locateModelFile(m.localName) ?? locateModelFile(`${m.localName}${PARTIAL_SUFFIX}`);
  return hit ? uriToPath(hit.file.parentDirectory.uri) : undefined;
}

/** Companion file next to the model (`mmproj` = image/audio projector, `draft` = speculative draft head). */
function companionFile(spec: ModelSpec, kind: Exclude<FileKind, 'model'>): File | null {
  const hub = kind === 'mmproj' ? spec.mmproj : spec.draft;
  if (!hub) return null;
  try {
    return new File(modelFile(spec).parentDirectory, companionLocalName(hub));
  } catch {
    return null;
  }
}

/**
 * Path of the downloaded companion for llama.rn (`initMultimodal({ path })` / `model_draft`), or null when the model has
 * none or it is not (completely) on the phone. Use this, not `mmproj.filename`: Hub names such as `mmproj-F16.gguf`
 * repeat across repos, so local copies are named `<owner>_<repo>.<file>`.
 */
export function companionPath(spec: ModelSpec, kind: Exclude<FileKind, 'model'>): string | null {
  const hub = kind === 'mmproj' ? spec.mmproj : spec.draft;
  const f = companionFile(spec, kind);
  if (!hub || !f) return null;
  return f.exists && fileSize(f) >= hub.sizeBytes * 0.9 ? uriToPath(f.uri) : null;
}

export const mmprojPath = (spec: ModelSpec): string | null => companionPath(spec, 'mmproj');
export const draftPath = (spec: ModelSpec): string | null => companionPath(spec, 'draft');

/** Every file of an install that exists on the phone (for moving between slots or showing details). */
export function installedFiles(spec: ModelSpec): { kind: FileKind; localName: string; path: string; bytes: number }[] {
  const out: { kind: FileKind; localName: string; path: string; bytes: number }[] = [];
  for (const f of installFiles(spec, { vision: true, draft: true })) {
    try {
      const file = f.kind === 'model' ? modelFile(spec) : companionFile(spec, f.kind);
      if (file?.exists) out.push({ kind: f.kind, localName: f.localName, path: uriToPath(file.uri), bytes: fileSize(file) });
    } catch {
      // unreadable slot: skip
    }
  }
  return out;
}

export function fileSize(file: File): number {
  try {
    return file.exists ? (file.size ?? 0) : 0;
  } catch {
    return 0;
  }
}

export function readHeader(file: File, bytes = 4): Uint8Array | null {
  try {
    const handle = file.open(FileMode.ReadOnly);
    try {
      return handle.readBytes(bytes);
    } finally {
      handle.close();
    }
  } catch {
    return null;
  }
}

export interface QuickVerify {
  ok: boolean;
  sizeBytes: number;
  reason?: string;
}

/**
 * Cheap integrity check (milliseconds, any file size): present, plausible size,
 * real GGUF header. The decisive check is that the engine can load it and
 * generate a reply (core/engineManager.ts).
 */
export function quickVerify(spec: ModelSpec): QuickVerify {
  const file = modelFile(spec);
  if (!file.exists) return { ok: false, sizeBytes: 0, reason: 'Model file not found in the storage folder.' };
  const size = fileSize(file);
  if (size < spec.sizeBytes * 0.9) {
    return { ok: false, sizeBytes: size, reason: 'The model file is incomplete. Delete it and download again.' };
  }
  const head = readHeader(file);
  if (!head || !hasGgufMagic(head)) {
    return { ok: false, sizeBytes: size, reason: 'The file is not a valid GGUF model. Delete it and download again.' };
  }
  return { ok: true, sizeBytes: size };
}

export function isInstalled(spec: ModelSpec): boolean {
  try {
    const file = modelFile(spec);
    return file.exists && fileSize(file) >= spec.sizeBytes * 0.9;
  } catch {
    return false;
  }
}

export function partialBytes(spec: ModelSpec): number {
  try {
    return fileSize(partialFile(spec));
  } catch {
    return 0;
  }
}

/** Deletes the model, its partial and its companions. Prefer `downloads.remove(spec)`, which keeps a projector another model shares. */
export function deleteModelFiles(spec: ModelSpec): void {
  const files = [modelFile(spec), partialFile(spec)];
  for (const kind of ['mmproj', 'draft'] as const) {
    const c = companionFile(spec, kind);
    if (c) files.push(c, new File(c.parentDirectory, `${c.name}${PARTIAL_SUFFIX}`));
  }
  for (const f of files) {
    try {
      if (f.exists) f.delete();
    } catch {
      // ignore: reported by the caller if the file is still there
    }
  }
  invalidateModelIndex();
}

/** Bytes on disk for these models, companions and partials included (shared projectors counted once). */
export function installedBytes(specs: ModelSpec[]): number {
  let total = 0;
  const seen = new Set<string>();
  for (const s of specs) {
    try {
      for (const f of installFiles(s, { vision: true, draft: true })) {
        const dest = f.kind === 'model' ? modelFile(s) : companionFile(s, f.kind);
        if (!dest || seen.has(dest.uri)) continue;
        seen.add(dest.uri);
        total += fileSize(dest) + fileSize(new File(dest.parentDirectory, `${dest.name}${PARTIAL_SUFFIX}`));
      }
    } catch {
      // ignore
    }
  }
  return total;
}

export interface CancelToken {
  cancelled: boolean;
}

const yieldToUi = (): Promise<void> => new Promise<void>((r) => setTimeout(r, 0));

/**
 * SHA-256 of a whole file in pure JavaScript, in time slices: hash 64 KB blocks for ~12 ms, hand the thread back,
 * repeat. Slow on a phone (Hermes has no JIT) but never freezes the UI, reports progress ~4x/second and stops within
 * one slice when `shouldStop()` turns true.
 */
export async function hashFile(
  file: File,
  onProgress: (fraction: number) => void,
  shouldStop: () => boolean,
  sliceMs = 12,
  /** Returns a promise while hashing must wait (app in background); checked between slices. */
  gate?: () => Promise<void> | undefined,
): Promise<{ actual: string; stopped: boolean }> {
  const total = fileSize(file);
  const digest = new Sha256Digest();
  const handle = file.open(FileMode.ReadOnly);
  const CHUNK = 64 * 1024;
  let done = 0;
  let sliceStart = Date.now();
  let lastReport = 0;
  try {
    for (;;) {
      if (shouldStop()) return { actual: '', stopped: true };
      const chunk = handle.readBytes(CHUNK);
      if (chunk.length === 0) break;
      digest.update(chunk);
      done += chunk.length;
      const now = Date.now();
      if (now - lastReport >= 250) {
        lastReport = now;
        onProgress(total > 0 ? Math.min(1, done / total) : 0);
      }
      if (now - sliceStart >= sliceMs) {
        await yieldToUi();
        const wait = gate?.();
        if (wait) await wait;
        sliceStart = Date.now();
      }
    }
  } finally {
    handle.close();
  }
  onProgress(1);
  return { actual: digest.digestHex(), stopped: false };
}

/** Optional, user-triggered full SHA-256 check of an INSTALLED model against the Hub's LFS hash. */
export async function deepVerify(
  spec: ModelSpec,
  expectedSha256: string,
  onProgress: (fraction: number) => void,
  token: CancelToken,
): Promise<{ ok: boolean; actual: string; cancelled: boolean }> {
  const r = await hashFile(modelFile(spec), onProgress, () => token.cancelled);
  if (r.stopped) return { ok: false, actual: '', cancelled: true };
  return { ok: r.actual === expectedSha256.toLowerCase(), actual: r.actual, cancelled: false };
}
