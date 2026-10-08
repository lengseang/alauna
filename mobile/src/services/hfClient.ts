/**
 * Talks to the Hugging Face Hub. No Expo imports on purpose so it can be tested
 * under plain Node with a fake fetch.
 *
 * Why this exists: the old downloader read the expected checksum from the CDN
 * `etag` header after redirects, which is NOT the file's SHA-256, so it rejected
 * perfectly good downloads. The repo-tree API returns the true size and LFS sha256.
 */
import { RemoteError, describeHttpStatus, parseTreeForFile, repoDir, treeUrl, type RemoteFileInfo } from '../core/hf.ts';

export { RemoteError };

type FetchLike = (input: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export async function fetchRemoteFileInfo(
  repo: string,
  filename: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
  timeoutMs = 20_000,
): Promise<RemoteFileInfo> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(treeUrl(repo, 'main', repoDir(filename)), { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) {
      const retryable = res.status === 429 || res.status >= 500;
      throw new RemoteError(describeHttpStatus(res.status), { status: res.status, retryable });
    }
    const info = parseTreeForFile(await res.json(), filename);
    if (!info) {
      throw new RemoteError(`"${filename}" was not found in ${repo}. The catalog entry may be out of date.`, { status: 404, retryable: false });
    }
    return info;
  } catch (e) {
    if (e instanceof RemoteError) throw e;
    if (controller.signal.aborted) {
      throw new RemoteError('Hugging Face did not answer in time. Check your internet connection.');
    }
    throw new RemoteError('No internet connection, or Hugging Face is unreachable.');
  } finally {
    clearTimeout(timer);
  }
}
