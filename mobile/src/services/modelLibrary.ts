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

/**
 * Optional full SHA-256 check against the Hub's LFS hash. Slow on phones (pure
 * JS), so it runs in small chunks and yields between them to keep the UI alive.
 */
export async function deepVerify(
  spec: ModelSpec,
  expectedSha256: string,
  onProgress: (fraction: number) => void,
  token: CancelToken,
): Promise<{ ok: boolean; actual: string; cancelled: boolean }> {
  const file = modelFile(spec);
  const total = fileSize(file);
  const digest = new Sha256Digest();
  const handle = file.open(FileMode.ReadOnly);
  const CHUNK = 256 * 1024;
  let done = 0;
  try {
    for (;;) {
      if (token.cancelled) return { ok: false, actual: '', cancelled: true };
      const chunk = handle.readBytes(CHUNK);
      if (chunk.length === 0) break;
      digest.update(chunk);
      done += chunk.length;
      onProgress(total > 0 ? Math.min(1, done / total) : 0);
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  } finally {
    handle.close();
  }
  const actual = digest.digestHex();
  return { ok: actual === expectedSha256.toLowerCase(), actual, cancelled: false };
}
