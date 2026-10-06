/**
 * Path/URI helpers. Pure string functions, no platform imports.
 *
 * Why this exists: the Android folder picker returns a `content://` URI, but the
 * on-device engine (llama.cpp) can only open a model through a real filesystem
 * path. When the user picks a folder on shared storage we translate the picker's
 * URI into the real path (`/storage/emulated/0/...`) and then PROVE it is usable
 * with a write/read probe (see services/storage.ts) before accepting it.
 */

/** `file:///a%20b/c` -> `/a b/c`. Leaves already-plain paths alone. */
export function uriToPath(uri: string): string {
  const stripped = uri.replace(/^file:\/\//, '');
  try {
    return decodeURIComponent(stripped);
  } catch {
    return stripped;
  }
}

/** `/a b/c` -> `file:///a%20b/c` (encodes `#`, `?`, `%` too). */
export function pathToUri(path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  const encoded = clean
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  return `file://${encoded}`;
}

export function joinPath(...parts: string[]): string {
  return parts
    .filter((p) => p.length > 0)
    .join('/')
    .replace(/\/{2,}/g, '/');
}

const EXTERNAL_STORAGE_AUTHORITY = 'com.android.externalstorage.documents';

/**
 * Translate a Storage Access Framework tree/document URI for a folder on shared
 * or removable storage into its real path. Returns null when it cannot be mapped
 * (cloud providers, Downloads provider, malformed input, ...).
 *
 *   content://com.android.externalstorage.documents/tree/primary%3AChiwiwi
 *     -> /storage/emulated/0/Chiwiwi
 *   content://com.android.externalstorage.documents/tree/1A2B-3C4D%3AModels%2FGGUF
 *     -> /storage/1A2B-3C4D/Models/GGUF
 */
export function safTreeUriToPath(uri: string): string | null {
  const match = /^content:\/\/([^/]+)\/(?:tree|document)\/([^/?#]+)/.exec(uri);
  if (!match || match[1] !== EXTERNAL_STORAGE_AUTHORITY) return null;

  let docId: string;
  try {
    docId = decodeURIComponent(match[2]);
  } catch {
    return null;
  }
  const colon = docId.indexOf(':');
  if (colon < 0) return null;

  const volume = docId.slice(0, colon);
  const relative = docId.slice(colon + 1).replace(/^\/+|\/+$/g, '');
  if (!volume || volume.includes('/') || relative.split('/').includes('..')) return null;

  const root = volume === 'primary' ? '/storage/emulated/0' : `/storage/${volume}`;
  return relative ? `${root}/${relative}` : root;
}

/** Last segment of a path, used to avoid nesting `CHIWIWI/CHIWIWI`. */
export function baseName(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  return trimmed.slice(trimmed.lastIndexOf('/') + 1);
}
