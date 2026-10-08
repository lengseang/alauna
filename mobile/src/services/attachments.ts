/**
 * Attach sheet back end: camera, photo library, documents.
 *
 * - Permissions are asked only at the moment of use: the camera permission when "Camera" is tapped. The Android photo
 *   picker and the document picker need no permission at all.
 * - Images are copied into `<vault>/media/` (the picker's cache copy can vanish) and returned with a real path for the
 *   vision model. Only formats llama.cpp can decode are accepted (the photo picker re-encodes to JPEG/PNG).
 * - Text files are read with a size cap and a binary guard.
 * Native pickers are required lazily so an APK without them reports "not in this build" instead of crashing.
 */
import { Platform } from 'react-native';
import { File, FileMode } from 'expo-file-system';
import {
  IMAGE_EXTENSION,
  MAX_IMAGE_BYTES,
  MAX_TEXT_FILE_BYTES,
  classifyFile,
  looksBinary,
  safeName,
  sniffImage,
  unsupportedMessage,
  type ImageAttachment,
  type PickedAttachment,
  type TextAttachment,
} from '../core/attachmentRules.ts';
import { makeAttachment, newId, type Attachment } from '../core/chatTypes.ts';
import { formatBytes } from '../core/format.ts';
import { uriToPath } from '../core/paths.ts';
import { expectExternalActivity } from './security.ts';
import { isStorageReady, mediaDir } from './storage.ts';

export type { ImageAttachment, PickedAttachment, TextAttachment } from '../core/attachmentRules.ts';

type ImagePickerModule = typeof import('expo-image-picker');
type DocumentPickerModule = typeof import('expo-document-picker');

export type AttachFailure = 'cancelled' | 'permission' | 'no_storage' | 'unavailable' | 'error';

export type AttachResult =
  | {
      ok: true;
      attachments: PickedAttachment[];
      /** Files that were picked but could not be attached, with the reason in plain words. */
      skipped: Array<{ name: string; message: string }>;
    }
  | {
      ok: false;
      reason: AttachFailure;
      message: string;
      /** Permission was permanently denied: offer Linking.openSettings(). */
      canOpenSettings?: boolean;
    };

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const NOT_IN_BUILD = 'This picker is not in this build of the app. Install the latest APK.';
const NO_STORAGE = 'Choose where CHIWIWI keeps its data first.';

function load<T>(name: 'expo-image-picker' | 'expo-document-picker'): T | null {
  try {
    return (name === 'expo-image-picker' ? require('expo-image-picker') : require('expo-document-picker')) as T;
  } catch {
    return null;
  }
}

function readHead(file: File, n: number): Uint8Array {
  const h = file.open(FileMode.ReadOnly);
  try {
    return h.readBytes(n);
  } finally {
    h.close();
  }
}

/** Copy a picked image into the vault and describe it. Throws a user-facing message when it cannot be used. */
async function importImage(uri: string, name: string, width: number | null, height: number | null): Promise<ImageAttachment> {
  const src = new File(uri);
  const bytes = src.size;
  if (bytes > MAX_IMAGE_BYTES) throw new Error(`${name} is ${formatBytes(bytes)}; the limit is ${formatBytes(MAX_IMAGE_BYTES)}.`);
  const mimeType = sniffImage(readHead(src, 16));
  if (!mimeType) throw new Error(`${name}: this image format (for example WebP or HEIC) cannot be read by the on-device vision engine. Pick it from Photos instead (it is converted to JPEG).`);
  const dir = mediaDir();
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const id = newId('img');
  const dest = new File(dir, `${id}.${IMAGE_EXTENSION[mimeType]}`);
  await src.copy(dest);
  return { kind: 'image', id, name, path: uriToPath(dest.uri), uri: dest.uri, mimeType, width, height, bytes };
}

async function importText(uri: string, name: string, size: number | undefined): Promise<TextAttachment> {
  const file = new File(uri);
  const bytes = size ?? file.size;
  if (bytes > MAX_TEXT_FILE_BYTES) throw new Error(`${name} is ${formatBytes(bytes)}; text files up to ${formatBytes(MAX_TEXT_FILE_BYTES)} can be attached.`);
  if (looksBinary(readHead(file, 8192))) throw new Error(unsupportedMessage(name));
  const base = makeAttachment(name, await file.text());
  return { kind: 'text', id: newId('txt'), name: base.name, content: base.content, truncated: base.truncated, bytes };
}

async function collect<T>(items: T[], one: (item: T) => Promise<PickedAttachment>, nameOf: (item: T) => string): Promise<AttachResult> {
  const attachments: PickedAttachment[] = [];
  const skipped: Array<{ name: string; message: string }> = [];
  for (const item of items) {
    try {
      attachments.push(await one(item));
    } catch (e) {
      skipped.push({ name: nameOf(item), message: message(e) });
    }
  }
  return { ok: true, attachments, skipped };
}

// ------------------------------------------------------------------ public API

/** Take a photo with the system camera. Asks for the camera permission now (and only now). */
export async function takePhoto(): Promise<AttachResult> {
  const picker = load<ImagePickerModule>('expo-image-picker');
  if (!picker) return { ok: false, reason: 'unavailable', message: NOT_IN_BUILD };
  if (!isStorageReady()) return { ok: false, reason: 'no_storage', message: NO_STORAGE };
  try {
    const perm = await picker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      return {
        ok: false,
        reason: 'permission',
        message: perm.canAskAgain ? 'Camera access was not allowed.' : 'Camera access is turned off for CHIWIWI. Allow it in the app settings.',
        canOpenSettings: !perm.canAskAgain,
      };
    }
    expectExternalActivity();
    const r = await picker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85, exif: false });
    if (r.canceled) return { ok: false, reason: 'cancelled', message: 'No photo taken.' };
    return collect(r.assets, (a) => importImage(a.uri, safeName(a.fileName, 'Camera photo'), a.width || null, a.height || null), (a) => a.fileName ?? 'Camera photo');
  } catch (e) {
    return { ok: false, reason: 'error', message: `Camera failed: ${message(e)}` };
  }
}

/** Pick up to `limit` photos with the system photo picker (no permission needed on Android 13+). */
export async function pickPhotos(limit = 3): Promise<AttachResult> {
  const picker = load<ImagePickerModule>('expo-image-picker');
  if (!picker) return { ok: false, reason: 'unavailable', message: NOT_IN_BUILD };
  if (!isStorageReady()) return { ok: false, reason: 'no_storage', message: NO_STORAGE };
  try {
    if (Platform.OS === 'ios') {
      const perm = await picker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return { ok: false, reason: 'permission', message: 'Photo access was not allowed.', canOpenSettings: !perm.canAskAgain };
    }
    expectExternalActivity();
    // quality < 1 makes the picker re-encode (HEIC/WebP -> JPEG), which llama.cpp's image decoder needs.
    const r = await picker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, allowsMultipleSelection: limit > 1, selectionLimit: limit, exif: false });
    if (r.canceled) return { ok: false, reason: 'cancelled', message: 'No photo selected.' };
    return collect(r.assets.slice(0, limit), (a) => importImage(a.uri, safeName(a.fileName, 'Photo'), a.width || null, a.height || null), (a) => a.fileName ?? 'Photo');
  } catch (e) {
    return { ok: false, reason: 'error', message: `Photo picker failed: ${message(e)}` };
  }
}

/** Pick files: images go to the vision model, text files into the prompt, anything else is skipped with a reason. */
export async function pickDocuments(limit = 3): Promise<AttachResult> {
  const picker = load<DocumentPickerModule>('expo-document-picker');
  if (!picker) return { ok: false, reason: 'unavailable', message: NOT_IN_BUILD };
  try {
    expectExternalActivity();
    const r = await picker.getDocumentAsync({ copyToCacheDirectory: true, multiple: limit > 1, type: '*/*' });
    if (r.canceled) return { ok: false, reason: 'cancelled', message: 'No file selected.' };
    return collect(
      r.assets.slice(0, limit),
      async (a) => {
        const name = safeName(a.name, 'File');
        const kind = classifyFile(name, a.mimeType);
        if (kind === 'unsupported') throw new Error(unsupportedMessage(name));
        if (kind === 'image') {
          if (!isStorageReady()) throw new Error(NO_STORAGE);
          return importImage(a.uri, name, null, null);
        }
        return importText(a.uri, name, a.size);
      },
      (a) => a.name,
    );
  } catch (e) {
    return { ok: false, reason: 'error', message: `File picker failed: ${message(e)}` };
  }
}

/** The shape services/chat.ts sends (core/chatTypes Attachment). */
export function toChatAttachment(a: PickedAttachment): Attachment {
  return a.kind === 'image'
    ? { kind: 'image', name: a.name, content: '', truncated: false, path: a.path, mime: a.mimeType }
    : { kind: 'text', name: a.name, content: a.content, truncated: a.truncated };
}

/** The user removed an attachment before sending: delete the copied image so it does not pile up in the vault. */
export function discardAttachment(a: PickedAttachment): void {
  if (a.kind !== 'image') return;
  try {
    // Only ever delete our own copy inside the vault media folder.
    if (!a.path.startsWith(`${uriToPath(mediaDir().uri).replace(/\/$/, '')}/`)) return;
    const f = new File(a.uri);
    if (f.exists) f.delete();
  } catch {
    // best effort
  }
}
