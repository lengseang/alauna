/**
 * v2 against the REAL llama.rn JavaScript (fake native layer) and the real services (in-memory file system):
 * compute/speculative/vision/KV-session parameters, privacy (incognito, purge, integrity, network gate),
 * threads (rename/pin/search), memory vault, storage slots (add/limit/move with verify).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { behavior, callsOf, resetNative } from './stubs/fakeNative.ts';

const g = globalThis as unknown as Record<string, unknown>;
// llama.rn captures (and deletes) the JSI globals on first use: install switchable handlers before that happens.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fn = (...a: any[]) => unknown;
const hooks: Record<string, Fn | undefined> = {};
for (const k of ['llamaModelInfo', 'llamaInitMultimodal', 'llamaGetMultimodalSupport', 'llamaSaveSession', 'llamaLoadSession']) {
  const orig = g[k] as Fn;
  g[k] = (...a: unknown[]) => (hooks[k] ?? orig)(...a);
}
const { LlamaEngine } = await import('../src/services/llamaEngine.ts');
const { SpeculativeUnsupportedError } = await import('../src/core/engineTypes.ts');
const settings = await import('../src/services/settings.ts');
const storage = await import('../src/services/storage.ts');
const chat = await import('../src/services/chat.ts');
const memory = await import('../src/services/memory.ts');
const privacy = await import('../src/services/privacy.ts');
const gate = await import('../src/services/networkGate.ts');
const slots = await import('../src/services/storageSlots.ts');
const { engine } = await import('../src/services/engine.ts');
const { getModel } = await import('../src/core/catalog.ts');
const { makeImageAttachment } = await import('../src/core/chatTypes.ts');

interface FakeFs { store: Map<string, { type: string; content?: string; size?: number }>; putModel(path: string, size: number): void; read(path: string): string | null }
const fs = (globalThis as unknown as { __fakeFs: FakeFs }).__fakeFs;
const load = { path: '/v/models/t.gguf', nCtx: 4096, threads: null, useGpu: false };
const initParams = () => callsOf('llamaInitContext').at(-1)![1] as Record<string, unknown>;

test('contract: compute settings map to llama.rn init params', async () => {
  resetNative();
  await new LlamaEngine().load({ ...load, nBatch: 256, flashAttn: 'on', cacheTypeK: 'q8_0', cacheTypeV: 'q4_0', useMmap: false, useMlock: true, threads: 4 });
  const p = initParams();
  assert.deepEqual([p.n_batch, p.n_ubatch, p.flash_attn_type, p.cache_type_k, p.cache_type_v, p.use_mmap, p.use_mlock, p.n_threads], [256, 256, 'on', 'q8_0', 'q4_0', false, true, 4]);
  resetNative();
  await new LlamaEngine().load({ ...load, useGpu: true, nGpuLayers: 24 });
  assert.equal(initParams().n_gpu_layers, 24);
});

test('contract: speculative = MTP; a mismatched draft is refused from the GGUF headers BEFORE initLlama (no native abort)', async () => {
  const headers: Record<string, Record<string, string>> = {
    '/v/models/t.gguf': { 'general.architecture': 'qwen35', 'qwen35.embedding_length': '2560' },
    '/v/models/small.gguf': { 'general.architecture': 'qwen35', 'qwen35.embedding_length': '1024' },
    '/v/models/head.gguf': { 'general.architecture': 'gemma4-assistant', 'gemma4-assistant.embedding_length': '256', 'gemma4-assistant.embedding_length_out': '2560', 'gemma4-assistant.nextn_predict_layers': '4' },
    '/v/models/mtp.gguf': { 'general.architecture': 'qwen35', 'qwen35.embedding_length': '2560', 'qwen35.nextn_predict_layers': '1' },
  };
  hooks.llamaModelInfo = async (path: string) => headers[path];
  resetNative();
  await assert.rejects(() => new LlamaEngine().load({ ...load, speculative: { mode: 'draft', draftPath: '/v/models/small.gguf', nMax: 4, pMin: 0.75 } }), (e: Error) => e instanceof SpeculativeUnsupportedError && /1024 vs 2560/.test(e.message));
  await assert.rejects(() => new LlamaEngine().load({ ...load, speculative: { mode: 'mtp', nMax: 4, pMin: 0.75 } }), /no built-in MTP/);
  assert.equal(callsOf('llamaInitContext').length, 0, 'never reached llama.cpp');

  const info = await new LlamaEngine().load({ ...load, speculative: { mode: 'draft', draftPath: '/v/models/head.gguf', nMax: 3, pMin: 0.6 } });
  const p = initParams();
  assert.deepEqual([p.spec_type, p.spec_draft_n_max, p.spec_draft_p_min, p.model_draft], ['draft-mtp', 3, 0.6, '/v/models/head.gguf']);
  assert.equal(info.speculative, 'draft');
  await new LlamaEngine().load({ ...load, path: '/v/models/mtp.gguf', speculative: { mode: 'mtp', nMax: 2, pMin: 0.5 } });
  assert.deepEqual([initParams().spec_type, initParams().model_draft], ['draft-mtp', undefined], 'built-in MTP layers: no separate file');
});

test('contract: vision projector + image messages + draft counters + sampling', async () => {
  resetNative();
  hooks.llamaInitMultimodal = async (_id: number, p: Record<string, unknown>) => { (g.__mm as unknown[]).push(p); return true; };
  g.__mm = [];
  hooks.llamaGetMultimodalSupport = async () => ({ vision: true, audio: false });
  const e = new LlamaEngine();
  const info = await e.load({ ...load, mmprojPath: '/v/models/mm.gguf' });
  assert.deepEqual(g.__mm, [{ path: '/v/models/mm.gguf', use_gpu: false, image_min_tokens: undefined, image_max_tokens: undefined }]);
  assert.deepEqual(info.multimodal, { vision: true, audio: false });

  behavior.result = { draft_tokens: 12, draft_tokens_accepted: 9, tokens_cached: 30 };
  const r = await e.generate({
    messages: [{ role: 'user', content: 'what is this?', images: ['/v/media/cat.jpg'] }],
    maxTokens: 64, temperature: 0.5, sampling: { topP: 0.8, topK: 20, minP: 0.1, repeatPenalty: 1.2 }, enableThinking: false, onText: () => undefined,
  });
  const fmt = callsOf('llamaGetFormattedChat').at(-1)![1] as Array<{ content: unknown }>;
  assert.deepEqual(fmt[0].content, [{ type: 'text', text: '<__media__>' }, { type: 'text', text: 'what is this?' }], 'llama.rn turned the image_url part into its media marker');
  const cp = callsOf('llamaCompletion').at(-1)![1] as Record<string, unknown>;
  assert.deepEqual(cp.media_paths, ['/v/media/cat.jpg']);
  assert.deepEqual([cp.temperature, cp.top_p, cp.top_k, cp.min_p, cp.penalty_repeat], [0.5, 0.8, 20, 0.1, 1.2]);
  assert.deepEqual([r.draftTokens, r.draftAccepted, r.cachedTokens], [12, 9, 30]);

  hooks.llamaInitMultimodal = async () => false;
  const info2 = await new LlamaEngine().load({ ...load, mmprojPath: '/v/models/mm.gguf' });
  assert.equal(info2.multimodal, null);
  assert.match(info2.multimodalError!, /did not initialise/);
});

test('contract: KV prefix = template text up to the first user message, evaluated with n_predict 0; save/load sessions', async () => {
  resetNative();
  const e = new LlamaEngine();
  await e.load(load);
  behavior.formatted = { prompt: '<|im_start|>system\nSYS<|im_end|>\n<|im_start|>user\nCHIWIWI_PREFIX_SENTINEL_7f3a9c<|im_end|>\n<|im_start|>assistant\n' };
  await e.evalPrefix('SYS', false);
  const cp = callsOf('llamaCompletion').at(-1)![1] as Record<string, unknown>;
  assert.equal(cp.prompt, '<|im_start|>system\nSYS<|im_end|>\n<|im_start|>user\n');
  assert.equal(cp.n_predict, 0);
  hooks.llamaSaveSession = async (_id: number, path: string, size: number) => { (g.__sess as unknown[]).push(['save', path, size]); return 21; };
  hooks.llamaLoadSession = async (_id: number, path: string) => { (g.__sess as unknown[]).push(['load', path]); return { tokens_loaded: 21, prompt: '' }; };
  g.__sess = [];
  assert.equal(await e.saveSession('file:///data/kv/a.kv'), 21);
  assert.equal(await e.loadSession('/data/kv/a.kv'), 21);
  assert.deepEqual(g.__sess, [['save', '/data/kv/a.kv', -1], ['load', '/data/kv/a.kv']]);
});

// ------------------------------------------------------------------ services on the in-memory phone

let vault = '';
const spec = getModel('qwen3.5-0.8b')!;

test('setup vault + model', async () => {
  resetNative();
  await settings.initSettings();
  vault = (await storage.useInternalStorage()).rootPath;
  fs.putModel(`${vault}/models/${spec.filename}`, spec.sizeBytes);
  settings.updateSettings({ activeModelId: spec.id });
  await chat.initChat();
});

test('incognito: never written to disk, also when it is the default', async () => {
  resetNative();
  settings.updateSettings({ incognitoDefault: true });
  chat.newChat();
  assert.equal(chat.chatStore.getState().thread.incognito, true);
  const r = await chat.sendMessage('secret');
  assert.deepEqual(r, { ok: true });
  assert.equal(fs.read(`${vault}/chats/${chat.chatStore.getState().thread.id}.json`), null);
  settings.updateSettings({ incognitoDefault: false });
  chat.newChat();
  assert.equal(chat.chatStore.getState().thread.incognito, false);
});

test('chat uses the soul (global or override), soul sampling, memory without paused facts; KV prefix prepared', async () => {
  resetNative();
  behavior.formatted = {};
  memory.addMemory('My name is Leng');
  const hidden = memory.addMemory('I live in Phnom Penh');
  assert.ok(hidden.ok);
  memory.setMemoryPaused(hidden.ok ? hidden.fact.id : '', true);
  settings.updateSettings({ archetype: 'tactical', pad: { pleasure: 0.1, arousal: 0.85, dominance: 0.95 } });
  await chat.sendMessage('hello');
  const sys = (callsOf('llamaGetFormattedChat').at(-1)![1] as Array<{ content: string }>)[0].content;
  assert.match(sys, /elite staff engineer/, 'global soul applied');
  assert.match(sys, /My name is Leng/);
  assert.ok(!sys.includes('Phnom Penh'), 'paused fact not sent');
  const cp = callsOf('llamaCompletion').at(-1)![1] as Record<string, unknown>;
  assert.ok(Number(cp.temperature) > 0.7 && Number(cp.penalty_repeat) > 1.1, 'energetic, direct soul -> hotter sampling, higher repeat penalty');
  assert.ok(['saved', 'error'].includes(engine.state.kvCache.status), 'prefix step ran (the fake template has no sentinel -> honest error, chat unaffected)');
  assert.equal(chat.chatStore.getState().thread.messages.at(-1)!.stats?.backend, 'CPU');

  chat.updateThreadSoul({ archetype: 'empath', pad: { pleasure: 0.65, arousal: 0.4, dominance: 0.5 }, toneIntensity: 0.8 });
  await chat.sendMessage('again');
  assert.match((callsOf('llamaGetFormattedChat').at(-1)![1] as Array<{ content: string }>)[0].content, /empathetic/);
  chat.clearThreadSoul();
  assert.equal(chat.currentSoul().archetype, 'tactical');
});

test('images: refused with a clear reason when the model has no vision', async () => {
  const r = await chat.sendMessage('what is this?', [makeImageAttachment('cat.jpg', `${vault}/media/cat.jpg`)]);
  assert.deepEqual([r.ok, !r.ok && r.reason], [false, 'no_vision']);
});

test('threads: rename, pin (sorts first), search across messages', async () => {
  const first = chat.chatStore.getState().thread.id;
  chat.newChat();
  await chat.sendMessage('Book the train to Kampot');
  const second = chat.chatStore.getState().thread.id;
  assert.ok(await chat.renameThread(first, '  Soul   tests '));
  assert.ok(await chat.setThreadPinned(first, true));
  await chat.refreshThreadList();
  const list = chat.chatStore.getState().threads;
  assert.deepEqual([list[0].id, list[0].title, list[0].pinned], [first, 'Soul tests', true]);
  const hits = await chat.searchChats('kampot');
  assert.deepEqual(hits.map((h) => h.id), [second]);
  assert.match(hits[0].snippet!, /Kampot/);
});

test('threads: real deleteMessage, truncateFrom, and restoreMessages for undo', async () => {
  chat.newChat();
  const threadId = chat.chatStore.getState().thread.id;
  await chat.sendMessage('First turn');
  await chat.sendMessage('Second turn');
  await chat.sendMessage('Third turn');
  const ms = chat.chatStore.getState().thread.messages;
  assert.ok(ms.length >= 3);
  const midId = ms[1].id;

  // 1. Delete middle message
  const delOk = await chat.deleteMessage(threadId, midId);
  assert.equal(delOk, true);
  const afterDel = chat.chatStore.getState().thread.messages;
  assert.equal(afterDel.some((m) => m.id === midId), false);

  // 2. Undo delete
  const restoreOk = await chat.restoreMessages(threadId, ms);
  assert.equal(restoreOk, true);
  assert.equal(chat.chatStore.getState().thread.messages.length, ms.length);

  // 3. Truncate from middle message
  const removed = await chat.truncateFrom(threadId, midId);
  assert.ok(removed.length >= 2);
  assert.equal(removed[0].id, midId);
  const afterTrunc = chat.chatStore.getState().thread.messages;
  assert.equal(afterTrunc.length, 1);
  assert.equal(afterTrunc[0].id, ms[0].id);

  // 4. Undo truncate
  await chat.restoreMessages(threadId, ms);
  assert.equal(chat.chatStore.getState().thread.messages.length, ms.length);
});

test('auto-purge at launch removes old chats, keeps pinned and the open one', async () => {
  const old = { id: 'thread_old1', title: 'Old', createdAt: 0, updatedAt: Date.now() - 90 * 86_400_000, soul: { archetype: 'empath', pad: { pleasure: 0, arousal: 0.5, dominance: 0.5 }, toneIntensity: 0.8 }, messages: [{ id: 'u', role: 'user', text: 'x', createdAt: 0, status: 'done' }] };
  fs.store.set(`${vault}/chats/thread_old1.json`, { type: 'file', content: JSON.stringify(old) });
  fs.store.set(`${vault}/chats/thread_old2.json`, { type: 'file', content: JSON.stringify({ ...old, id: 'thread_old2', pinned: true }) });
  settings.updateSettings({ autoPurgeDays: 30 });
  assert.equal(await privacy.autoPurgeOldChats(), 1);
  assert.equal(fs.read(`${vault}/chats/thread_old1.json`), null);
  assert.ok(fs.read(`${vault}/chats/thread_old2.json`));
  settings.updateSettings({ autoPurgeDays: 0 });
});

test('integrity check finds a corrupt chat; purge actions really delete', async () => {
  fs.store.set(`${vault}/chats/thread_bad99.json`, { type: 'file', content: '{"id": "thread_bad99", "messages": [' });
  const report = await privacy.runIntegrityCheck();
  assert.deepEqual(report.chats.corrupt, ['thread_bad99']);
  assert.ok(report.chats.ok >= 2);
  assert.equal(report.memory, 'ok');
  assert.match(report.summary, /1 chat file\(s\) cannot be read/);

  fs.store.set('/data/user/0/com.chiwiwi.sovereign/files/kvcache/x.kv', { type: 'file', content: 'kv' });
  const purged = await privacy.purgeAll();
  assert.ok(purged.chats >= 3 && purged.memory === 2 && purged.kvCache === 1);
  assert.equal([...fs.store.keys()].filter((k) => k.startsWith(`${vault}/chats/`)).length, 0);
  assert.equal(memory.memoryStore.getState().facts.length, 0);
});

test('offline-strict: only user-started downloads may use the network', async () => {
  assert.equal(gate.isNetworkAllowed(true, 'user-download'), true);
  assert.equal(gate.isNetworkAllowed(true, 'metadata'), false);
  assert.equal(gate.isNetworkAllowed(false, 'other'), true);
  settings.updateSettings({ offlineStrict: true });
  await assert.rejects(() => gate.networkGate.fetch('https://example.com', undefined, 'other'), gate.NetworkBlockedError);
  assert.equal(gate.networkGateStore.getState().blockedCount, 1);
});

test('storage slots: add (max 5), measure, move a model with verification, refuse removing a slot with models', async () => {
  const added = await storage.addFolderSlot('file:///storage/1A2B-3C4D/Models');
  assert.ok(added.ok);
  const id = added.ok ? added.slot.id : '';
  const roots = storage.listSlotRoots();
  assert.equal(roots.length, 2);
  for (let i = 0; i < 3; i++) assert.ok((await storage.addFolderSlot(`file:///storage/emulated/0/F${i}`)).ok);
  const full = await storage.addFolderSlot('file:///storage/emulated/0/F9');
  assert.deepEqual([full.ok, !full.ok && full.reason], [false, 'limit']);

  const info = slots.refreshSlots();
  assert.equal(info[0].isPrimary && info[0].isDownloadTarget, true);
  assert.equal(info[0].modelFiles, 1);
  assert.equal(info[1].freeBytes, null, 'SD card: no free-space number without native code (honest null)');
  assert.equal(info[2].freeBytes, 50e9, 'internal volume: real number from the OS');

  const busy = await slots.moveModel(spec, id, { verify: 'size' });
  assert.deepEqual([busy.ok, !busy.ok && busy.reason], [false, 'loaded'], 'a loaded model is never moved under the engine');
  await engine.unmount();
  // size-only verification (the in-memory model has no real SHA-256)
  const moved = await slots.moveModel(spec, id, { verify: 'size' });
  assert.deepEqual([moved.ok, moved.ok && moved.verified], [true, 'size']);
  assert.equal(fs.read(`${vault}/models/${spec.filename}`), null, 'source deleted after verification');
  assert.equal(storage.locateModelFile(spec.filename)?.slotId, id);
  const sha = await slots.moveModel(spec, storage.PRIMARY_SLOT_ID);
  assert.deepEqual([sha.ok, !sha.ok && sha.reason], [false, 'verify_failed'], 'checksum mismatch: original kept');
  assert.equal(storage.locateModelFile(spec.filename)?.slotId, id);
  assert.equal([...fs.store.keys()].some((k) => k.endsWith('.moving')), false, 'partial copy cleaned');
  assert.equal(storage.removeSlot(id).ok, false);
  assert.ok(storage.setDownloadSlot(id).ok);
  assert.equal(settings.settingsStore.getState().storage.modelSlotId, id);
  assert.ok(slots.vaultUsage().models >= spec.sizeBytes);
});
