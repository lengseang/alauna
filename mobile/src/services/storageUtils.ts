/**
 * CHIWIWI Storage Utilities & SAF Decoders
 * Pure functions for decoding Android SAF tree URIs and mapping POSIX storage paths.
 */

/**
 * Decode Android Storage Access Framework (SAF) URI into real POSIX filesystem path.
 * e.g., "content://com.android.externalstorage.documents/tree/primary%3AAi/" -> "/storage/emulated/0/Ai"
 */
export function parseAndroidSafUri(uri: string): { realPath: string | null; displayLabel: string } {
  if (!uri || !uri.startsWith('content://')) {
    const clean = (uri || '').replace('file://', '');
    return {
      realPath: clean || null,
      displayLabel: clean ? `Internal Storage: ${clean}` : 'Default Private Sandbox',
    };
  }

  // Matches tree/primary%3A<subpath> or document/primary%3A<subpath> or raw%3A<subpath>
  const match = uri.match(/(?:tree|document)\/(?:primary|raw)%3A([^/?#]*)/i);
  if (match) {
    const rawSub = match[1];
    const decoded = decodeURIComponent(rawSub).replace(/^\/+|\/+$/g, '');
    const realPath = decoded ? `/storage/emulated/0/${decoded}` : '/storage/emulated/0';
    const displayLabel = decoded ? `Internal Storage / ${decoded}` : 'Internal Storage (Root)';
    return { realPath, displayLabel };
  }

  return { realPath: null, displayLabel: 'Custom Android Storage' };
}
