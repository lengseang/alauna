/**
 * Tiny Markdown parser for chat answers (no dependencies, safe for half-streamed text).
 * Supports: paragraphs, #-headings, fenced code, bullet/numbered lists, > quotes, ---,
 * and inline **bold**, *italic*, `code`. Anything unrecognised renders as plain text.
 */
export interface Inline {
  kind: 'text' | 'bold' | 'italic' | 'code';
  text: string;
}

export type Block =
  | { kind: 'p'; inlines: Inline[] }
  | { kind: 'h'; level: 1 | 2 | 3; inlines: Inline[] }
  | { kind: 'code'; lang: string; code: string; open: boolean }
  | { kind: 'list'; ordered: boolean; items: Inline[][] }
  | { kind: 'quote'; inlines: Inline[] }
  | { kind: 'hr' };

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let i = 0;
  let buf = '';
  const flush = () => {
    if (buf) out.push({ kind: 'text', text: buf });
    buf = '';
  };
  while (i < src.length) {
    const ch = src[i];
    if (ch === '`') {
      const end = src.indexOf('`', i + 1);
      if (end > i + 1) {
        flush();
        out.push({ kind: 'code', text: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (ch === '*' && src[i + 1] === '*') {
      const end = src.indexOf('**', i + 2);
      if (end > i + 2) {
        flush();
        out.push({ kind: 'bold', text: src.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    }
    if ((ch === '*' || ch === '_') && src[i + 1] !== ch && src[i + 1] !== ' ' && src[i + 1] !== undefined) {
      const prev = i === 0 ? ' ' : src[i - 1];
      const wordBoundary = ch === '*' || /[\s([{>"']/.test(prev);
      const end = wordBoundary ? src.indexOf(ch, i + 1) : -1;
      if (end > i + 1 && src[end - 1] !== ' ' && (ch === '*' || !/\w/.test(src[end + 1] ?? ' '))) {
        flush();
        out.push({ kind: 'italic', text: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];
  let i = 0;

  const flushPara = () => {
    if (para.length) blocks.push({ kind: 'p', inlines: parseInline(para.join(' ').trim()) });
    para = [];
  };

  while (i < lines.length) {
    const line = lines[i];
    const fence = /^\s*```\s*([\w+-]*)\s*$/.exec(line);
    if (fence) {
      flushPara();
      const code: string[] = [];
      i++;
      let closed = false;
      while (i < lines.length) {
        if (/^\s*```\s*$/.test(lines[i])) {
          closed = true;
          i++;
          break;
        }
        code.push(lines[i]);
        i++;
      }
      blocks.push({ kind: 'code', lang: fence[1] ?? '', code: code.join('\n'), open: !closed });
      continue;
    }
    if (!line.trim()) {
      flushPara();
      i++;
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flushPara();
      blocks.push({ kind: 'h', level: heading[1].length as 1 | 2 | 3, inlines: parseInline(heading[2].trim()) });
      i++;
      continue;
    }
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      flushPara();
      blocks.push({ kind: 'hr' });
      i++;
      continue;
    }
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flushPara();
      const ordered = !!numbered;
      const items: Inline[][] = [];
      while (i < lines.length) {
        const m = ordered ? /^\s*\d+[.)]\s+(.*)$/.exec(lines[i]) : /^\s*[-*+]\s+(.*)$/.exec(lines[i]);
        if (!m) break;
        items.push(parseInline(m[1].trim()));
        i++;
      }
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }
    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) {
      flushPara();
      const q: string[] = [];
      while (i < lines.length) {
        const m = /^\s*>\s?(.*)$/.exec(lines[i]);
        if (!m) break;
        q.push(m[1]);
        i++;
      }
      blocks.push({ kind: 'quote', inlines: parseInline(q.join(' ').trim()) });
      continue;
    }
    para.push(line.trim());
    i++;
  }
  flushPara();
  return blocks;
}
