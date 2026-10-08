/**
 * Attachment model + the checks that decide what a picked file becomes (pure; pickers live in services/attachments.ts).
 *
 * - Images become files in app storage, passed to a vision model by path (llama.rn multimodal). llama.cpp decodes them
 *   with stb_image, so only JPEG / PNG / BMP / GIF bytes are accepted (the photo picker re-encodes everything else).
 * - Text files are read into the prompt with a size cap and a binary guard.
 * The text variant is structurally a core/chatTypes `Attachment` ({ name, content, truncated }), so it can be sent today.
 */

export interface ImageAttachment {
  kind: 'image';
  id: string;
  name: string;
  /** Real filesystem path (no scheme) of the copy in app storage: what llama.rn's multimodal API takes. */
  path: string;
  /** file:// URI of the same copy, for <Image source={{ uri }} />. */
  uri: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/bmp' | 'image/gif';
  width: number | null;
  height: number | null;
  bytes: number;
}

export interface TextAttachment {
  kind: 'text';
  id: string;
  name: string;
  /** Text added to the prompt (cut at chatTypes.MAX_ATTACHMENT_CHARS). */
  content: string;
  truncated: boolean;
  bytes: number;
}

export type PickedAttachment = ImageAttachment | TextAttachment;

export const MAX_TEXT_FILE_BYTES = 1_000_000;
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

const OFFICE_OR_ARCHIVE = /\.(pdf|docx?|xlsx?|pptx?|odt|ods|odp|rtf|epub|pages|key|numbers|zip|rar|7z|gz|tgz|tar|apk)$/i;
const IMAGE_EXT = /\.(jpe?g|png|gif|bmp|webp|heic|heif|avif|tiff?)$/i;

export type FileClass = 'image' | 'text' | 'unsupported';

export function classifyFile(name: string, mimeType?: string | null): FileClass {
  const mime = (mimeType ?? '').toLowerCase();
  if (mime.startsWith('image/') || IMAGE_EXT.test(name)) return 'image';
  if (OFFICE_OR_ARCHIVE.test(name) || /^(audio|video)\//.test(mime) || mime === 'application/pdf' || mime.includes('zip')) return 'unsupported';
  return 'text';
}

export function unsupportedMessage(name: string): string {
  return /\.pdf$/i.test(name)
    ? `${name}: PDF text cannot be extracted on the phone yet. Copy the text into the message or share it as a .txt file.`
    : `${name}: only images and plain-text files (txt, md, csv, json, code...) can be attached.`;
}

/** Image format from the first bytes; null = not something llama.cpp's image decoder reads. */
export function sniffImage(head: Uint8Array): ImageAttachment['mimeType'] | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  if (head.length >= 4 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return 'image/png';
  if (head.length >= 3 && head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46) return 'image/gif';
  if (head.length >= 2 && head[0] === 0x42 && head[1] === 0x4d) return 'image/bmp';
  return null;
}

export const IMAGE_EXTENSION: Record<ImageAttachment['mimeType'], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
};

/** Binary guard for "text" files: any NUL byte, or more than 2% control characters in the sample. */
export function looksBinary(sample: Uint8Array): boolean {
  if (sample.length === 0) return false;
  let control = 0;
  for (const b of sample) {
    if (b === 0) return true;
    if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d && b !== 0x0c) control++;
  }
  return control / sample.length > 0.02;
}

/** A display name that is safe to show and to use as part of a file name. */
export function safeName(name: string | null | undefined, fallback: string): string {
  const base = (name ?? '').split(/[\\/]/).pop()?.replace(/[\u0000-\u001f]/g, '').trim() ?? '';
  return base.slice(0, 120) || fallback;
}
