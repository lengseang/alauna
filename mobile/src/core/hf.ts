/**
 * Hugging Face URL building and response parsing (pure; the fetch lives in
 * services/hfClient.ts so this part is unit-testable).
 */

export const HF_BASE = 'https://huggingface.co';

export function resolveUrl(repo: string, filename: string, revision = 'main'): string {
  const r = repo.trim().replace(/^\/+|\/+$/g, '');
  const file = filename
    .trim()
    .replace(/^\/+/, '')
    .split('/')
    .map(encodeURIComponent)
    .join('/');
  return `${HF_BASE}/${r}/resolve/${encodeURIComponent(revision)}/${file}?download=true`;
}

/** Repo-tree listing; `dir` lists a sub-folder (files such as `MTP/mtp-x.gguf` are not in the root listing). */
export function treeUrl(repo: string, revision = 'main', dir = ''): string {
  const folder = dir.replace(/^\/+|\/+$/g, '');
  const path = folder ? `/${folder.split('/').map(encodeURIComponent).join('/')}` : '';
  return `${HF_BASE}/api/models/${repo.trim()}/tree/${encodeURIComponent(revision)}${path}`;
}

/** Folder part of a repo path (`MTP/x.gguf` -> `MTP`, `x.gguf` -> ``). */
export function repoDir(filename: string): string {
  const i = filename.lastIndexOf('/');
  return i < 0 ? '' : filename.slice(0, i);
}

export interface RemoteFileInfo {
  filename: string;
  /** Exact size in bytes. */
  size: number;
  /** LFS sha256 (hex, lowercase) when known. */
  sha256: string | null;
}

interface TreeItem {
  type?: string;
  path?: string;
  size?: number;
  lfs?: { oid?: string; size?: number };
}

/** Pick one file out of the repo-tree response. Returns null if it is absent. */
export function parseTreeForFile(items: unknown, filename: string): RemoteFileInfo | null {
  if (!Array.isArray(items)) return null;
  const hit = (items as TreeItem[]).find((i) => i && i.type === 'file' && i.path === filename);
  if (!hit) return null;
  const size = hit.lfs?.size ?? hit.size;
  if (typeof size !== 'number' || !(size > 0)) return null;
  const oid = hit.lfs?.oid;
  return {
    filename,
    size,
    sha256: typeof oid === 'string' && /^[0-9a-f]{64}$/i.test(oid) ? oid.toLowerCase() : null,
  };
}

/** Human-readable explanation for an HTTP status from the Hub or the CDN. */
export function describeHttpStatus(status: number): string {
  if (status === 401 || status === 403) return 'This model needs a Hugging Face login (gated) and cannot be downloaded in-app.';
  if (status === 404) return 'The model file was not found on Hugging Face (it may have been moved or renamed).';
  if (status === 416) return 'The partial download is out of range; it will restart cleanly.';
  if (status === 429) return 'Hugging Face is rate-limiting this connection. Wait a minute and resume.';
  if (status >= 500) return `Hugging Face had a server problem (HTTP ${status}). Try again shortly.`;
  return `The download failed (HTTP ${status}).`;
}

/** Failure talking to the Hub (or the CDN). `retryable` tells the UI whether Resume makes sense. */
export class RemoteError extends Error {
  status?: number;
  retryable: boolean;
  constructor(message: string, opts: { status?: number; retryable?: boolean } = {}) {
    super(message);
    this.name = 'RemoteError';
    this.status = opts.status;
    this.retryable = opts.retryable ?? true;
  }
}
