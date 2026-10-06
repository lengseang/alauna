import test from 'node:test';
import assert from 'node:assert/strict';
import { formatBytes, formatDuration, formatSpeed, formatPercent } from '../src/core/format.ts';
import { MODEL_CATALOG, getModel, queryCatalog } from '../src/core/catalog.ts';
import { estimateRamBytes, rateFit, defaultContext, fitFor, recommendModel } from '../src/core/fit.ts';
import { safTreeUriToPath, uriToPath, pathToUri, joinPath, baseName } from '../src/core/paths.ts';
import { parseThinking } from '../src/core/thinking.ts';
import { buildPrompt, normalizeHistory, estimateTokens } from '../src/core/chatPrompt.ts';
import { parseTreeForFile, resolveUrl, describeHttpStatus } from '../src/core/hf.ts';
import { createStore } from '../src/core/store.ts';
import { hasGgufMagic } from '../src/core/gguf.ts';

// --------------------------------------------------------------------------- format
test('format: bytes/speed/duration/percent', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(999), '999 B');
  assert.equal(formatBytes(4_920_739_232), '4.92 GB');
  assert.equal(formatBytes(270_590_880), '271 MB');
  assert.equal(formatSpeed(12_500_000), '12.5 MB/s');
  assert.equal(formatSpeed(0), '-- MB/s');
  assert.equal(formatDuration(83), '1:23');
  assert.equal(formatDuration(3725), '1h 02m');
  assert.equal(formatDuration(Infinity), '--:--');
  assert.equal(formatPercent(0.456), '46%');
  assert.equal(formatPercent(7), '100%');
});

// --------------------------------------------------------------------------- catalog
test('catalog: ids and files are unique (no duplicate-file entries)', () => {
  const ids = new Set(MODEL_CATALOG.map((m) => m.id));
  const files = new Set(MODEL_CATALOG.map((m) => `${m.repo}/${m.filename}`));
  assert.equal(ids.size, MODEL_CATALOG.length);
  assert.equal(files.size, MODEL_CATALOG.length);
});

test('catalog: every entry is well-formed and truthful', () => {
  for (const m of MODEL_CATALOG) {
    assert.ok(m.repo.includes('/'), `${m.id}: repo`);
    assert.ok(m.filename.toLowerCase().endsWith('.gguf'), `${m.id}: filename`);
    assert.ok(!/mmproj/i.test(m.filename), `${m.id}: projector files are not models`);
    assert.ok(m.sizeBytes > 100_000_000, `${m.id}: size`);
    assert.ok(m.sha256 === '' || /^[0-9a-f]{64}$/.test(m.sha256), `${m.id}: sha256 format`);
    // The app is text-chat only: no capability the app cannot deliver.
    for (const c of m.capabilities) assert.ok(['Text', 'Code', 'Reasoning'].includes(c), `${m.id}: capability ${c}`);
    // Reasoning flag must agree with the capability badge.
    assert.equal(m.thinking !== 'none', m.capabilities.includes('Reasoning'), `${m.id}: thinking vs capability`);
    // Id must not contradict the name's family (the old catalog had gemma-4-12b = Gemma 2 9B).
    assert.ok(m.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(m.family.toLowerCase().replace(/[^a-z0-9]/g, '')), `${m.id}: name vs family`);
  }
});

test('catalog: grades match size, and uncensored entries exist honestly', () => {
  for (const m of MODEL_CATALOG) {
    if (m.grade === 'S') assert.ok(m.paramsB >= 7, m.id);
    if (m.grade === 'C') assert.ok(m.paramsB < 2.2, m.id);
  }
  assert.ok(MODEL_CATALOG.some((m) => m.contentPolicy === 'Uncensored'));
});

test('catalog: lookup and query (search / grade / AND-OR capability / sort)', () => {
  assert.equal(getModel('qwen3-4b')?.name, 'Qwen3 4B');
  assert.equal(getModel('nope'), undefined);
  assert.equal(getModel(null), undefined);

  const gemma = queryCatalog({ search: 'gemma' });
  assert.ok(gemma.length >= 2 && gemma.every((m) => /gemma/i.test(m.name)));

  const gradeS = queryCatalog({ grade: 'S' });
  assert.ok(gradeS.length > 0 && gradeS.every((m) => m.grade === 'S'));

  const any = queryCatalog({ capabilities: ['Reasoning', 'Code'], match: 'ANY' });
  const all = queryCatalog({ capabilities: ['Reasoning', 'Code'], match: 'ALL' });
  assert.ok(any.length >= all.length);
  assert.ok(all.every((m) => m.capabilities.includes('Reasoning') && m.capabilities.includes('Code')));

  const unc = queryCatalog({ onlyUncensored: true });
  assert.ok(unc.length >= 2 && unc.every((m) => m.contentPolicy === 'Uncensored'));

  const asc = queryCatalog({ sort: 'size_asc' });
  for (let i = 1; i < asc.length; i++) assert.ok(asc[i - 1].sizeBytes <= asc[i].sizeBytes);
  const desc = queryCatalog({ sort: 'size_desc' });
  assert.equal(desc[0].sizeBytes, Math.max(...MODEL_CATALOG.map((m) => m.sizeBytes)));
});

// --------------------------------------------------------------------------- fit (device-aware)
// Real totalMemory values Android reports are a bit below the marketing number.
const GB = 1e9;
const PHONES = { '4GB': 3.6 * GB, '6GB': 5.4 * GB, '8GB': 7.3 * GB, '12GB': 11.2 * GB, '16GB': 15.0 * GB };

test('fit: ratings scale with real RAM (broad devices, not one phone)', () => {
  const l8 = getModel('llama-3.1-8b')!;
  const q4 = getModel('qwen3-4b')!;
  const l1 = getModel('llama-3.2-1b')!;
  const g12 = getModel('gemma-4-12b')!;

  assert.equal(fitFor(l8, PHONES['4GB']), 'too_heavy');
  assert.equal(fitFor(l8, PHONES['8GB']), 'too_heavy');
  assert.ok(['ok', 'tight'].includes(fitFor(l8, PHONES['12GB'])));
  assert.equal(fitFor(g12, PHONES['12GB']), 'too_heavy');
  assert.notEqual(fitFor(g12, PHONES['16GB']), 'too_heavy');

  assert.equal(fitFor(l1, PHONES['4GB']), 'great');
  assert.ok(['great', 'ok'].includes(fitFor(q4, PHONES['8GB'])));
  assert.equal(fitFor(q4, PHONES['4GB']), 'too_heavy');
});

test('fit: unknown RAM never blocks, rating is "unknown"', () => {
  assert.equal(rateFit(5e9, null), 'unknown');
  assert.equal(rateFit(5e9, 0), 'unknown');
  assert.equal(defaultContext(null), 2048);
});

test('fit: context default grows with RAM; larger context costs more memory', () => {
  assert.equal(defaultContext(PHONES['4GB']), 1536);
  assert.equal(defaultContext(PHONES['6GB']), 2048);
  assert.equal(defaultContext(PHONES['8GB']), 3072);
  assert.equal(defaultContext(PHONES['12GB']), 4096);
  const m = getModel('llama-3.1-8b')!;
  assert.ok(estimateRamBytes(m, 8192) > estimateRamBytes(m, 2048));
  assert.ok(estimateRamBytes(m, 2048) > m.sizeBytes);
});

test('fit: recommendation fits the phone and is never uncensored or tiny', () => {
  for (const [label, ram] of Object.entries(PHONES)) {
    const rec = recommendModel(MODEL_CATALOG, ram)!;
    assert.ok(rec, label);
    assert.equal(rec.contentPolicy, 'Standard', label);
    assert.ok(['great', 'ok'].includes(fitFor(rec, ram)), `${label}: ${rec.id} -> ${fitFor(rec, ram)}`);
  }
  const small = recommendModel(MODEL_CATALOG, PHONES['4GB'])!;
  const big = recommendModel(MODEL_CATALOG, PHONES['12GB'])!;
  assert.ok(big.paramsB > small.paramsB, 'bigger phone => bigger recommendation');
  // Very tiny phone still gets *something*.
  assert.ok(recommendModel(MODEL_CATALOG, 1.5 * GB));
});

// --------------------------------------------------------------------------- paths / SAF
test('paths: SAF tree URI -> real path (primary, SD card, nested, encoded)', () => {
  const A = 'content://com.android.externalstorage.documents';
  assert.equal(safTreeUriToPath(`${A}/tree/primary%3AChiwiwi`), '/storage/emulated/0/Chiwiwi');
  assert.equal(safTreeUriToPath(`${A}/tree/primary%3A`), '/storage/emulated/0');
  assert.equal(safTreeUriToPath(`${A}/tree/primary%3ADocuments%2FAI%20Models`), '/storage/emulated/0/Documents/AI Models');
  assert.equal(safTreeUriToPath(`${A}/tree/1A2B-3C4D%3AModels%2FGGUF`), '/storage/1A2B-3C4D/Models/GGUF');
  assert.equal(safTreeUriToPath(`${A}/tree/primary%3AX/document/primary%3AX%2Fsub`), '/storage/emulated/0/X');
  assert.equal(safTreeUriToPath(`${A}/document/primary%3AX%2Fsub`), '/storage/emulated/0/X/sub');
});

test('paths: unmappable or hostile SAF URIs return null', () => {
  assert.equal(safTreeUriToPath('content://com.android.providers.downloads.documents/tree/downloads'), null);
  assert.equal(safTreeUriToPath('content://com.google.android.apps.docs.storage/tree/abc'), null);
  assert.equal(safTreeUriToPath('file:///storage/emulated/0/x'), null);
  assert.equal(safTreeUriToPath('not a uri'), null);
  assert.equal(safTreeUriToPath('content://com.android.externalstorage.documents/tree/nocolon'), null);
  assert.equal(safTreeUriToPath('content://com.android.externalstorage.documents/tree/primary%3A..%2F..%2Fetc'), null);
  assert.equal(safTreeUriToPath('content://com.android.externalstorage.documents/tree/%E0%A4%A'), null);
});

test('paths: file uri <-> path round-trips (spaces, #, ?, %)', () => {
  for (const p of ['/storage/emulated/0/My Models/a b.gguf', '/data/x/#1?/100%/z.gguf', '/plain/path']) {
    assert.equal(uriToPath(pathToUri(p)), p);
  }
  assert.equal(uriToPath('file:///a%20b/c'), '/a b/c');
  assert.equal(uriToPath('/already/plain'), '/already/plain');
  assert.equal(joinPath('/a/', 'b', '', 'c'), '/a/b/c');
  assert.equal(baseName('/storage/emulated/0/CHIWIWI/'), 'CHIWIWI');
});

// --------------------------------------------------------------------------- thinking parser
test('thinking: plain answer, no reasoning', () => {
  const p = parseThinking('Hello there!');
  assert.deepEqual([p.reasoning, p.answer, p.phase], ['', 'Hello there!', 'answering']);
  assert.equal(parseThinking('').phase, 'reading');
});

test('thinking: explicit <think> block, streamed char by char', () => {
  const full = '<think>\nLet me add 2 and 2.\n</think>\n\nThe answer is 4.';
  let sawThinking = false;
  let last = parseThinking('');
  for (let i = 1; i <= full.length; i++) {
    const p = parseThinking(full.slice(0, i));
    // Raw markup must never leak into either field at any prefix.
    assert.ok(!/<\/?thin?k?i?n?g?>?/.test(p.answer) || p.answer === '', `answer leaks tag at ${i}: ${JSON.stringify(p.answer)}`);
    assert.ok(!p.reasoning.includes('</think'), `reasoning leaks close tag at ${i}`);
    if (p.phase === 'thinking') sawThinking = true;
    last = p;
  }
  assert.ok(sawThinking);
  assert.equal(last.reasoning, 'Let me add 2 and 2.');
  assert.equal(last.answer, 'The answer is 4.');
  assert.equal(last.phase, 'answering');
  assert.ok(last.reasoningComplete);
});

test('thinking: template that opens <think> in the prompt (DeepSeek-R1) -> startInThinking', () => {
  const mid = parseThinking('Okay, the user wants', { startInThinking: true });
  assert.equal(mid.phase, 'thinking');
  assert.equal(mid.reasoning, 'Okay, the user wants');
  assert.equal(mid.answer, '');
  const done = parseThinking('Okay, so 2+2.\n</think>\n\n4', { startInThinking: true });
  assert.equal(done.reasoning, 'Okay, so 2+2.');
  assert.equal(done.answer, '4');
  assert.equal(done.phase, 'answering');
});

test('thinking: empty think block (thinking disabled) leaves a clean answer', () => {
  const p = parseThinking('<think>\n\n</think>\n\nHi!');
  assert.equal(p.reasoning, '');
  assert.equal(p.answer, 'Hi!');
});

test('thinking: strips leaked control tokens and hides half-received tags', () => {
  assert.equal(parseThinking('Sure.<|im_end|>').answer, 'Sure.');
  assert.equal(parseThinking('Done<end_of_turn>').answer, 'Done');
  // Only the half tag is hidden; the space stays because the next token may continue the sentence.
  assert.equal(parseThinking('Hello <thi').answer, 'Hello ');
  assert.equal(parseThinking('<think>abc</thi', {}).reasoning, 'abc');
  assert.equal(parseThinking('x < 5 and y > 3').answer, 'x < 5 and y > 3');
});

// --------------------------------------------------------------------------- chat prompt
test('prompt: system + history + new message, strict alternation', () => {
  const r = buildPrompt({
    system: 'You are helpful.',
    history: [
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello!' },
    ],
    userMessage: 'What is 2+2?',
    nCtx: 2048,
    replyBudget: 512,
  });
  assert.deepEqual(r.messages.map((m) => m.role), ['system', 'user', 'assistant', 'user']);
  assert.equal(r.droppedMessages, 0);
  assert.equal(r.messages.at(-1)!.content, 'What is 2+2?');
});

test('prompt: old turns are dropped (not the new one) when context is tight', () => {
  const long = 'word '.repeat(400); // ~2000 chars
  const history = Array.from({ length: 12 }, (_, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', content: `${i}: ${long}` })) as any[];
  const r = buildPrompt({ system: 'sys', history, userMessage: 'latest question', nCtx: 2048, replyBudget: 512 });
  assert.ok(r.droppedMessages > 0 && r.droppedMessages < 12);
  assert.equal(r.messages.at(-1)!.content, 'latest question');
  assert.equal(r.messages[1].role, 'user', 'must start with a user turn after trimming');
  assert.ok(r.estimatedPromptTokens <= 2048 - 512 + 20);
  // Newest history is kept, oldest dropped.
  assert.ok(r.messages.some((m) => m.content.startsWith('11:')) || r.messages.some((m) => m.content.startsWith('10:')));
  assert.ok(!r.messages.some((m) => m.content.startsWith('0:')));
});

test('prompt: oversized single message is shortened with a notice', () => {
  const r = buildPrompt({ system: '', history: [], userMessage: 'x'.repeat(50_000), nCtx: 1536, replyBudget: 512 });
  assert.ok(r.truncatedUserMessage);
  assert.ok(r.messages[0].content.length < 5000);
  assert.ok(r.messages[0].content.includes('shortened'));
});

test('prompt: consecutive same-role messages merge; empties and leading assistants vanish', () => {
  const h = normalizeHistory([
    { role: 'assistant', content: 'greeting' },
    { role: 'user', content: 'a' },
    { role: 'user', content: 'b' },
    { role: 'assistant', content: '   ' },
    { role: 'assistant', content: 'c' },
  ]);
  assert.deepEqual(h, [
    { role: 'user', content: 'a\n\nb' },
    { role: 'assistant', content: 'c' },
  ]);
  // A failed turn leaves a dangling user message: new message merges, alternation holds.
  const r = buildPrompt({ system: '', history: [{ role: 'user', content: 'first' }], userMessage: 'second', nCtx: 2048, replyBudget: 512 });
  assert.deepEqual(r.messages, [{ role: 'user', content: 'first\n\nsecond' }]);
  assert.ok(estimateTokens('abcdefgh') >= 2);
});

// --------------------------------------------------------------------------- hugging face parsing
test('hf: URL building and tree parsing (size + sha256 from LFS)', () => {
  assert.equal(
    resolveUrl('bartowski/Llama-3.2-1B-Instruct-GGUF', 'Llama-3.2-1B-Instruct-Q4_K_M.gguf'),
    'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf?download=true',
  );
  const sha = 'a'.repeat(64);
  const items = [
    { type: 'file', path: 'README.md', size: 100 },
    { type: 'file', path: 'm.gguf', size: 134, lfs: { oid: sha.toUpperCase(), size: 807694464 } },
  ];
  assert.deepEqual(parseTreeForFile(items, 'm.gguf'), { filename: 'm.gguf', size: 807694464, sha256: sha });
  assert.equal(parseTreeForFile(items, 'missing.gguf'), null);
  assert.equal(parseTreeForFile({ error: 'x' }, 'm.gguf'), null);
  assert.equal(parseTreeForFile([{ type: 'file', path: 'm.gguf', size: 0 }], 'm.gguf'), null);
  assert.equal(parseTreeForFile([{ type: 'file', path: 'm.gguf', lfs: { oid: 'short', size: 5 } }], 'm.gguf')!.sha256, null);
  assert.match(describeHttpStatus(404), /not found/i);
  assert.match(describeHttpStatus(429), /rate/i);
  assert.match(describeHttpStatus(503), /server problem/i);
});

test('gguf: magic bytes', () => {
  assert.ok(hasGgufMagic(new Uint8Array([0x47, 0x47, 0x55, 0x46, 3, 0])));
  assert.ok(!hasGgufMagic(new TextEncoder().encode('<!DOCTYPE html>')));
  assert.ok(!hasGgufMagic(new Uint8Array([0x47, 0x47])));
});

// --------------------------------------------------------------------------- store
test('store: immutable snapshots and unsubscribe', () => {
  const s = createStore({ n: 0, label: 'a' });
  const seen: number[] = [];
  const first = s.getState();
  const off = s.subscribe(() => seen.push(s.getState().n));
  s.setState({ n: 1 });
  s.setState((st) => ({ n: st.n + 1 }));
  assert.deepEqual(seen, [1, 2]);
  assert.notEqual(first, s.getState());
  assert.equal(first.n, 0, 'old snapshot untouched');
  off();
  s.setState({ n: 9 });
  assert.deepEqual(seen, [1, 2]);
  assert.equal(s.getState().label, 'a');
});

// --------------------------------------------------------------------------- markdown
import { parseMarkdown, parseInline } from '../src/core/markdown.ts';

test('markdown: inline bold / italic / code, literals left alone', () => {
  assert.deepEqual(parseInline('a **b** c *d* `e`'), [
    { kind: 'text', text: 'a ' }, { kind: 'bold', text: 'b' }, { kind: 'text', text: ' c ' },
    { kind: 'italic', text: 'd' }, { kind: 'text', text: ' ' }, { kind: 'code', text: 'e' },
  ]);
  assert.deepEqual(parseInline('2 * 3 * 4'), [{ kind: 'text', text: '2 * 3 * 4' }]);
  assert.deepEqual(parseInline('snake_case_name'), [{ kind: 'text', text: 'snake_case_name' }]);
  assert.deepEqual(parseInline('half **open'), [{ kind: 'text', text: 'half **open' }]);
  assert.deepEqual(parseInline('`unterminated'), [{ kind: 'text', text: '`unterminated' }]);
});

test('markdown: headings, lists, quotes, paragraphs merge soft line breaks', () => {
  const b = parseMarkdown('# Title\n\nFirst line\nsecond line\n\n- one\n- two\n\n1. a\n2) b\n\n> quoted\n> text\n\n---');
  assert.deepEqual(b.map((x) => x.kind), ['h', 'p', 'list', 'list', 'quote', 'hr']);
  assert.equal((b[1] as any).inlines[0].text, 'First line second line');
  assert.equal((b[2] as any).ordered, false);
  assert.equal((b[2] as any).items.length, 2);
  assert.equal((b[3] as any).ordered, true);
  assert.equal((b[4] as any).inlines[0].text, 'quoted text');
});

test('markdown: fenced code, including an unterminated fence while streaming', () => {
  const done = parseMarkdown('Here:\n```python\nprint(1)\n  x = 2\n```\nAfter');
  assert.deepEqual(done.map((x) => x.kind), ['p', 'code', 'p']);
  assert.deepEqual([(done[1] as any).lang, (done[1] as any).code, (done[1] as any).open], ['python', 'print(1)\n  x = 2', false]);
  const live = parseMarkdown('```js\nconst a =');
  assert.deepEqual([live[0].kind, (live[0] as any).open, (live[0] as any).code], ['code', true, 'const a =']);
  assert.deepEqual(parseMarkdown(''), []);
  // Markdown-looking text inside code stays verbatim.
  assert.equal((parseMarkdown('```\n# not a heading\n**x**\n```')[0] as any).code, '# not a heading\n**x**');
});
