import test from 'node:test';
import assert from 'node:assert/strict';
import { runAssistantTurn, replyBudgetFor, wantsThinking, type TurnInput } from '../src/core/chatTurn.ts';
import type { GenerateParams, GenerateResult } from '../src/core/engineTypes.ts';
import { getModel } from '../src/core/catalog.ts';
import { makeAttachment, toHistory, titleFrom, newThread, type ChatMessage } from '../src/core/chatTypes.ts';
import { buildSystemPrompt, ARCHETYPES, describePad, clampPad } from '../src/core/persona.ts';

const plain = getModel('qwen3-4b-instruct-2507')!;
const hybrid = getModel('qwen3.5-4b')!;
// No catalog model is "always thinks" any more, but the app still supports that mode (DeepSeek-R1 style).
const always = { ...getModel('qwen3.5-2b')!, id: 'always-thinks', thinking: 'always' as const };

function res(over: Partial<GenerateResult> = {}): GenerateResult {
  return { text: '', promptTokens: 20, generatedTokens: 5, promptMs: 100, predictedMs: 500, tokensPerSecond: 10, interrupted: false, contextFull: false, thinkingForcedOpen: false, ...over };
}

/** Streams `chunks` through onText like the engine does (accumulated raw text). */
function streamer(chunks: string[], over: Partial<GenerateResult> = {}, forcedOpen = false) {
  const seen: GenerateParams[] = [];
  const generate = async (p: GenerateParams): Promise<GenerateResult> => {
    seen.push(p);
    p.onStart?.({ thinkingForcedOpen: forcedOpen });
    let acc = '';
    for (const c of chunks) { acc += c; p.onText(acc); }
    return res({ text: acc, thinkingForcedOpen: forcedOpen, ...over });
  };
  return { generate, seen };
}

function input(spec = plain, gen = streamer(['Hi']).generate, over: Partial<TurnInput> = {}) {
  const updates: Array<Partial<ChatMessage>> = [];
  let t = 0;
  const base: TurnInput = {
    history: [], userText: 'hello', attachments: [], spec, nCtx: 2048, system: 'SYS', thinkingEnabled: true,
    generate: gen, now: () => (t += 1000), onUpdate: (p) => updates.push(p),
  };
  return { inp: { ...base, ...over }, updates };
}

test('turn: plain model streams a clean answer; phases go reading -> answering; stats are real numbers', async () => {
  const s = streamer(['Hel', 'lo ', 'there!'], { generatedTokens: 3, tokensPerSecond: 12.5, promptTokens: 18 });
  const { inp, updates } = input(plain, s.generate);
  const out = await runAssistantTurn(inp);
  assert.equal(out.text, 'Hello there!');
  assert.equal(out.status, 'done');
  assert.equal(out.reasoning, undefined);
  assert.equal(out.stats!.generatedTokens, 3);
  assert.equal(out.stats!.tokensPerSecond, 12.5);
  assert.equal(out.stats!.promptTokens, 18);
  assert.equal(out.stats!.modelId, 'qwen3-4b-instruct-2507');
  assert.equal(updates[0].phase, 'reading');
  assert.ok(updates[0].promptTokensEst! > 0);
  assert.deepEqual(updates.slice(1).map((u) => u.phase), ['answering', 'answering', 'answering']);
  assert.deepEqual(updates.slice(1).map((u) => u.text), ['Hel', 'Hello ', 'Hello there!']);
  // The prompt actually sent: system + the user message, template handled by the engine.
  assert.deepEqual(s.seen[0].messages, [{ role: 'system', content: 'SYS' }, { role: 'user', content: 'hello' }]);
});

test('turn: <think> block is separated from the answer, with real thinking time (CH-2, CH-3)', async () => {
  const s = streamer(['<think>', '\nadd 2+2', '\n</think>', '\n\nIt is 4.']);
  const { inp, updates } = input(hybrid, s.generate);
  const out = await runAssistantTurn(inp);
  assert.equal(out.reasoning, 'add 2+2');
  assert.equal(out.text, 'It is 4.');
  assert.deepEqual([...new Set(updates.map((u) => u.phase))], ['reading', 'thinking', 'answering']);
  assert.ok(out.thinkSeconds! > 0);
  for (const u of updates) assert.ok(!/<\/?think>/.test(u.text ?? ''), 'no raw tags in the visible answer');
  // While thinking, the answer area stays empty and reasoning grows.
  const mid = updates.find((u) => u.phase === 'thinking' && u.reasoning);
  assert.equal(mid!.text, '');
});

test('turn: template that pre-opens <think> (reported via onStart) is handled from token one', async () => {
  const s = streamer(['Okay, 2 plus 2', ' is 4.\n</think>\n\n4'], {}, true);
  const { inp, updates } = input(hybrid, s.generate);
  const out = await runAssistantTurn(inp);
  assert.equal(out.reasoning, 'Okay, 2 plus 2 is 4.');
  assert.equal(out.text, '4');
  assert.equal(updates[1].phase, 'thinking');
  assert.equal(updates[1].text, '');
});

test('turn: DeepSeek-style "always thinks" model starts in thinking even before the engine says so', async () => {
  const s = streamer(['hmm let me see', '</think>', 'Done.']);
  const { inp } = input(always, s.generate);
  const out = await runAssistantTurn(inp);
  assert.equal(out.reasoning, 'hmm let me see');
  assert.equal(out.text, 'Done.');
});

test('turn: Thinking toggle only matters for hybrid models', () => {
  assert.equal(wantsThinking(plain, true), false);
  assert.equal(wantsThinking(hybrid, true), true);
  assert.equal(wantsThinking(hybrid, false), false);
  assert.equal(wantsThinking(always, false), true);
  assert.ok(replyBudgetFor(hybrid, 4096, true) > replyBudgetFor(hybrid, 4096, false));
  assert.equal(replyBudgetFor(plain, 4096, true), replyBudgetFor(plain, 4096, false));
});

test('turn: enable_thinking is passed to the engine according to model + toggle', async () => {
  const a = streamer(['ok']); const b = streamer(['ok']);
  await runAssistantTurn(input(hybrid, a.generate, { thinkingEnabled: false }).inp);
  await runAssistantTurn(input(hybrid, b.generate, { thinkingEnabled: true }).inp);
  assert.equal(a.seen[0].enableThinking, false);
  assert.equal(b.seen[0].enableThinking, true);
});

test('turn: Stop keeps the partial answer and marks the message stopped (CH-4)', async () => {
  const s = streamer(['Part one', ' and two'], { interrupted: true });
  const out = await runAssistantTurn(input(plain, s.generate).inp);
  assert.equal(out.status, 'stopped');
  assert.equal(out.text, 'Part one and two');
  assert.equal(out.error, undefined);
});

test('turn: empty reply is an error with advice; reasoning-only becomes a notice, not an error', async () => {
  const empty = await runAssistantTurn(input(plain, streamer(['  ']).generate).inp);
  assert.equal(empty.status, 'error');
  assert.match(empty.error!, /empty reply/i);

  const thinkOnly = await runAssistantTurn(input(hybrid, streamer(['<think>', 'still thinking...']).generate).inp);
  assert.equal(thinkOnly.status, 'done');
  assert.match(thinkOnly.notice!, /thinking/i);
  assert.equal(thinkOnly.reasoning, 'still thinking...');
});

test('turn: engine failure becomes a friendly inline error (CH-7)', async () => {
  const out = await runAssistantTurn(input(plain, async () => { throw new Error('std::bad_alloc'); }).inp);
  assert.equal(out.status, 'error');
  assert.match(out.error!, /memory/i);
  assert.equal(out.text, '');
});

test('turn: AI sees conversation history (CH-5) and is told when old messages were dropped', async () => {
  const history = [
    { role: 'user' as const, content: 'My name is Sam.' },
    { role: 'assistant' as const, content: 'Nice to meet you, Sam.' },
  ];
  const s = streamer(['Sam!']);
  await runAssistantTurn(input(plain, s.generate, { history, userText: 'What is my name?' }).inp);
  assert.deepEqual(s.seen[0].messages.map((m) => m.role), ['system', 'user', 'assistant', 'user']);
  assert.equal(s.seen[0].messages[1].content, 'My name is Sam.');

  const long = 'word '.repeat(600);
  const big = Array.from({ length: 10 }, (_, i) => ({ role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant', content: long }));
  const { inp, updates } = input(plain, streamer(['ok']).generate, { history: big, nCtx: 2048 });
  const out = await runAssistantTurn(inp);
  assert.match(out.notice!, /older messages? did not fit/i);
  assert.match(updates[0].notice!, /did not fit/i);
});

test('turn: attached text files are included in the prompt', async () => {
  const s = streamer(['ok']);
  const att = makeAttachment('notes.txt', 'buy milk');
  await runAssistantTurn(input(plain, s.generate, { attachments: [att], userText: 'summarize' }).inp);
  const last = s.seen[0].messages.at(-1)!.content;
  assert.match(last, /\[Attached file: notes\.txt\]/);
  assert.match(last, /buy milk/);
  assert.match(last, /summarize$/);
  const huge = makeAttachment('big.txt', 'x'.repeat(50_000));
  assert.ok(huge.truncated && huge.content.length === 8000);
});

test('chat types: history only includes finished turns; titles; new threads', () => {
  const m = (role: 'user' | 'assistant', text: string, status: ChatMessage['status'] = 'done'): ChatMessage => ({ id: text, role, text, createdAt: 1, status });
  const h = toHistory([m('user', 'a'), m('assistant', 'b'), m('user', 'c'), m('assistant', '', 'error'), m('assistant', 'partial', 'stopped'), m('assistant', 'live', 'streaming')]);
  assert.deepEqual(h.map((x) => x.content), ['a', 'b', 'c', 'partial']);
  assert.equal(titleFrom('  Explain quantum computing in simple words, please\nsecond line'), 'Explain quantum computing in simple wor…');
  assert.equal(titleFrom('   '), 'New chat');
  const t = newThread('mentor', ARCHETYPES.mentor.defaultPAD, { incognito: true });
  assert.equal(t.incognito, true);
  assert.equal(t.soul.archetype, 'mentor');
  assert.notEqual(t.soul.pad, ARCHETYPES.mentor.defaultPAD, 'PAD is copied, not shared');
});

test('persona: PAD really changes the system prompt; backstory and memories are included and bounded', () => {
  const warm = buildSystemPrompt({ archetype: 'empath', pad: { pleasure: 0.9, arousal: 0.8, dominance: 0.9 } });
  const cold = buildSystemPrompt({ archetype: 'empath', pad: { pleasure: -0.5, arousal: 0.1, dominance: 0.1 } });
  assert.notEqual(warm, cold);
  assert.match(warm, /warm and friendly/);
  assert.match(warm, /lively/);
  assert.match(cold, /blunt/);
  assert.match(cold, /calm and unhurried/);
  assert.match(cold, /clarifying question/);
  const full = buildSystemPrompt({ archetype: 'tactical', pad: ARCHETYPES.tactical.defaultPAD, backstory: 'Answer in French.', memories: ['I live in Phnom Penh', 'I like Rust'], toneIntensity: 1 });
  assert.match(full, /Answer in French\./);
  assert.match(full, /- I live in Phnom Penh/);
  assert.match(full, /Lean fully/);
  const many = buildSystemPrompt({ archetype: 'spark', pad: ARCHETYPES.spark.defaultPAD, memories: Array.from({ length: 200 }, (_, i) => `fact number ${i} `.repeat(3)) });
  assert.ok(many.length < 2500, 'memories are capped so they cannot eat the context window');
  assert.deepEqual(clampPad({ pleasure: 9, arousal: -3, dominance: NaN }), { pleasure: 1, arousal: 0, dominance: 0 });
  assert.equal(describePad(ARCHETYPES.mentor.defaultPAD).length, 3);
});

// ---------------------------------------------------------------- persistence + memory
import { sanitizeThread, toPersistable, isSafeThreadId } from '../src/core/chatTypes.ts';
import { addFact, removeFact, sanitizeFacts, parseRememberCommand, MAX_FACTS } from '../src/core/memory.ts';

test('persistence: a thread that was streaming when the app died reloads as "stopped", never spins forever', () => {
  const thread = newThread('empath', ARCHETYPES.empath.defaultPAD);
  thread.messages = [
    { id: 'u1', role: 'user', text: 'hi', createdAt: 1, status: 'done' },
    { id: 'a1', role: 'assistant', text: 'par', createdAt: 2, status: 'streaming', phase: 'answering', promptTokensEst: 50 },
  ];
  const saved = toPersistable(thread);
  assert.equal(saved.messages[1].status, 'stopped');
  assert.ok(!('phase' in saved.messages[1]) && !('promptTokensEst' in saved.messages[1]));
  assert.equal(thread.messages[1].status, 'streaming', 'original is not mutated');
  const back = sanitizeThread(JSON.parse(JSON.stringify({ ...thread, messages: thread.messages })))!;
  assert.equal(back.messages[1].status, 'stopped');
  assert.equal(back.messages[1].phase, undefined);
});

test('persistence: corrupt or hostile JSON never crashes the app', () => {
  assert.equal(sanitizeThread(null), null);
  assert.equal(sanitizeThread('x'), null);
  assert.equal(sanitizeThread({ messages: [] }), null);
  const t = sanitizeThread({ id: 'thread_abc', messages: [null, 5, { id: 1 }, { id: 'm', role: 'system', text: 'x' }, { id: 'ok', role: 'user', text: 'hello', status: 'weird' }], soul: { archetype: 'nope', pad: { pleasure: 'x' }, toneIntensity: 99 } })!;
  assert.equal(t.messages.length, 1);
  assert.equal(t.messages[0].status, 'done');
  assert.equal(t.soul.archetype, 'empath');
  assert.equal(t.soul.toneIntensity, 1);
  assert.equal(t.title, 'New chat');
  assert.equal(t.incognito, false);
  assert.ok(isSafeThreadId('thread_lk3j2_a1b2') && !isSafeThreadId('../../etc/passwd') && !isSafeThreadId('a'));
});

test('memory: add / dedupe / limits / remove / sanitize / slash command', () => {
  const a = addFact([], '  I live   in Phnom Penh ', 1, 'f1');
  assert.ok(a.ok && a.fact.text === 'I live in Phnom Penh');
  const dup = addFact((a as any).facts, 'i LIVE in phnom penh', 2, 'f2');
  assert.deepEqual([dup.ok, (dup as any).reason], [false, 'I already remember that.']);
  assert.equal(addFact([], '   ', 1, 'x').ok, false);
  assert.equal(addFact([], 'x'.repeat(500), 1, 'x').ok, false);
  const full = Array.from({ length: MAX_FACTS }, (_, i) => ({ id: `${i}`, text: `fact ${i}`, createdAt: 0 }));
  assert.match((addFact(full, 'one more', 1, 'z') as any).reason, /full/i);
  assert.equal(removeFact(full, '3').length, MAX_FACTS - 1);
  assert.deepEqual(sanitizeFacts([{ id: 'a', text: 'ok' }, { id: 1 }, null, { id: 'b', text: '  ' }]).map((f) => f.id), ['a']);
  assert.equal(sanitizeFacts('nope').length, 0);
  assert.equal(parseRememberCommand('/remember I like tea'), 'I like tea');
  assert.equal(parseRememberCommand('/REMEMBER   x '), 'x');
  assert.equal(parseRememberCommand('remember this'), null);
  assert.equal(parseRememberCommand('/remember'), null);
});

test('turn: when the engine can count tokens, the prompt is re-trimmed until it REALLY fits (Khmer/CJK/digits)', async () => {
  const history = Array.from({ length: 12 }, (_, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', content: 'abcdefgh '.repeat(45) })) as any[];
  const counted: number[] = [];
  // Worst case tokenizer: one token per character. The character-based estimate is 3x too low for this.
  const countPromptTokens = async (msgs: Array<{ content: string }>) => {
    const n = msgs.reduce((sum, m) => sum + m.content.length, 0);
    counted.push(n);
    return n;
  };
  const s = streamer(['ok']);
  const { inp } = input(plain, s.generate, { history, nCtx: 2048, countPromptTokens });
  const out = await runAssistantTurn(inp);
  assert.equal(out.status, 'done');
  const allowance = 2048 - replyBudgetFor(plain, 2048, false);
  assert.ok(counted.length >= 2, 'it measured, trimmed and measured again');
  assert.ok(counted.length <= 4, 'bounded number of rounds');
  assert.ok(counted[0] > allowance, 'the first build overflowed by the real count');
  const sent = s.seen[0].messages.reduce((sum, m) => sum + m.content.length, 0);
  assert.ok(sent <= allowance, `what was sent (${sent} real tokens) fits the allowance ${allowance}`);
  assert.match(out.notice ?? '', /older message/);
});

test('turn: a counting failure or an engine that cannot count never blocks the reply', async () => {
  const s = streamer(['fine']);
  const { inp } = input(plain, s.generate, { countPromptTokens: async () => { throw new Error('tokenizer exploded'); } });
  assert.equal((await runAssistantTurn(inp)).text, 'fine');
  const s2 = streamer(['fine']);
  const { inp: inp2 } = input(plain, s2.generate, { countPromptTokens: async () => null });
  assert.equal((await runAssistantTurn(inp2)).text, 'fine');
});
