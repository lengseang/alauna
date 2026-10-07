/**
 * What is on disk: installed models, partial downloads, integrity checks.
 * Everything resolves through the configured vault (services/storage.ts).
 */
import { File, FileMode } from 'expo-file-system';
import type { ModelSpec } from '../core/catalog.ts';
import { hasGgufMagic } from '../core/gguf.ts';
import { uriToPath } from '../core/paths.ts';
import { Sha256Digest } from '../core/sha256.ts';
import { modelsDir } from './storage.ts';

export const PARTIAL_SUFFIX = '.part';

export function modelFile(spec: ModelSpec): File {
  return new File(modelsDir(), spec.filename);
}

export function partialFile(spec: ModelSpec): File {
  return new File(modelsDir(), `${spec.filename}${PARTIAL_SUFFIX}`);
}

/** Real filesystem path for the inference engine. */
export function modelPath(spec: ModelSpec): string {
  return uriToPath(modelFile(spec).uri);
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
 * generate a reply (services/engine/engineManager.ts).
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

export function deleteModelFiles(spec: ModelSpec): void {
  for (const f of [modelFile(spec), partialFile(spec)]) {
    try {
      if (f.exists) f.delete();
    } catch {
      // ignore: reported by the caller if the file is still there
    }
  }
}

export function installedBytes(specs: ModelSpec[]): number {
  let total = 0;
  for (const s of specs) {
    try {
      total += fileSize(modelFile(s)) + fileSize(partialFile(s));
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
