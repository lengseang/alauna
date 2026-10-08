/**
 * Sentence chunker for spoken replies: turns the streaming answer into whole sentences that can be handed to TTS as soon
 * as each one is complete (the old app's VoiceStreamer, fixed).
 *
 * Fixes vs the old token chunker: it works on the WHOLE answer so far (chat updates are coalesced, so tokens arrive in
 * batches), emits every finished sentence (not one per token), never splits "3.14", "e.g.", "Dr. Smith", "1. item" or a
 * period that might still be followed by more text, skips fenced code blocks, strips markdown so TTS does not read
 * asterisks, and force-splits very long runs so speech starts quickly. Pure: no platform imports.
 */

/** Force a split when a run without sentence punctuation gets this long (keeps TTS responsive). */
export const MAX_SENTENCE_CHARS = 240;

const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'vs', 'etc', 'e.g', 'i.e', 'eg', 'ie', 'no', 'fig', 'approx', 'inc', 'ltd', 'co', 'mt', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
]);

// Sentence end: . ! ? … (plus closing quotes/brackets) that is FOLLOWED by whitespace, a CJK full stop, or a newline.
const BOUNDARY = /[.!?…]+["'”’)\]]*(?=\s)|[。！？]+["'”’)\]]*|\n+/g;

/** Answer text with complete ``` blocks removed and everything from an unclosed ``` cut off. Prefix-stable while text grows. */
function withoutCode(text: string): string {
  let out = '';
  let i = 0;
  for (;;) {
    const open = text.indexOf('```', i);
    if (open < 0) return out + text.slice(i);
    out += text.slice(i, open);
    const close = text.indexOf('```', open + 3);
    if (close < 0) return out; // still streaming the code block
    out += '\n';
    i = close + 3;
  }
}

function isFalseStop(before: string, punct: string): boolean {
  if (punct !== '.') return false;
  const word = /(\S+)$/.exec(before)?.[1] ?? '';
  const bare = word.replace(/^["'“‘([]+/, '').toLowerCase();
  return /^\d+$/.test(bare) || /^[a-z]$/i.test(bare) || bare.includes('.') || ABBREVIATIONS.has(bare);
}

/** Markdown and symbols a voice should not read. Returns '' when nothing speakable is left. */
export function toSpeakable(sentence: string): string {
  const s = sentence
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, 'link')
    .replace(/^\s*(?:[-+•]|\d+[.)])\s+/gm, '')
    .replace(/[*_~`#>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return /[A-Za-z0-9À-￿]/.test(s) ? s : '';
}

export interface ChunkResult {
  /** Speakable sentences completed since `from`. */
  sentences: string[];
  /** Pass back as `from` next time (offset into the code-stripped text). */
  next: number;
}

/**
 * Split the answer so far into newly finished sentences.
 * @param fullText the whole visible answer so far (reasoning excluded)
 * @param from the `next` value returned by the previous call (0 for a new answer)
 * @param final true when the answer is complete: whatever is left is returned too
 */
export function nextSentences(fullText: string, from: number, final: boolean): ChunkResult {
  const text = withoutCode(fullText);
  const sentences: string[] = [];
  let start = Math.min(from, text.length);
  const push = (end: number) => {
    const s = toSpeakable(text.slice(start, end));
    if (s) sentences.push(s);
    start = end;
  };

  BOUNDARY.lastIndex = start;
  for (let m = BOUNDARY.exec(text); m; m = BOUNDARY.exec(text)) {
    const punct = m[0].replace(/["'”’)\]]+$/, '');
    if (isFalseStop(text.slice(start, m.index), punct)) continue;
    // A run that grew past the cap before this boundary is split first, at its last comma/space.
    while (m.index - start > MAX_SENTENCE_CHARS) push(softBreak(text, start));
    push(m.index + m[0].length);
    BOUNDARY.lastIndex = start;
  }
  while (text.length - start > MAX_SENTENCE_CHARS) push(softBreak(text, start));
  if (final && start < text.length) push(text.length);
  return { sentences, next: start };
}

function softBreak(text: string, start: number): number {
  const window = text.slice(start, start + MAX_SENTENCE_CHARS);
  const at = Math.max(window.lastIndexOf(', '), window.lastIndexOf('; '), window.lastIndexOf(': '));
  if (at > MAX_SENTENCE_CHARS / 3) return start + at + 1;
  const space = window.lastIndexOf(' ');
  return start + (space > 0 ? space : MAX_SENTENCE_CHARS);
}

/** Whisper marks non-speech as "[BLANK_AUDIO]", "(music)", "*coughs*"; strip all of them. */
export function cleanTranscript(text: string): string {
  return text
    .replace(/\[[^\]]*\]|\([^)]*\)|\*[^*]*\*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
