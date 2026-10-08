import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineManager, EngineNotReadyError, WARMUP_MAX_TOKENS, type EngineDeps } from '../src/core/engineManager.ts';
import { EngineLoadError, EngineUnavailableError, diagnoseEngineError, friendlyEngineError, type GenerateParams, type GenerateResult, type InferenceEngine, type LoadParams } from '../src/core/engineTypes.ts';
import { DEFAULT_SETTINGS, type Settings } from '../src/core/settingsModel.ts';
import { getModel } from '../src/core/catalog.ts';

const GB = 1e9;
const small = getModel('qwen3.5-0.8b')!;
const big = getModel('qwen3.5-9b')!;
const other = getModel('qwen3.5-2b')!;

function result(over: Partial<GenerateResult> = {}): GenerateResult {
  return { text: 'ready', promptTokens: 12, generatedTokens: 2, promptMs: 40, predictedMs: 100, tokensPerSecond: 20, interrupted: false, contextFull: false, thinkingForcedOpen: false, ...over };
}

function world(opts: { ram?: number | null; fileOk?: boolean; loadError?: Error; genError?: Error; testResult?: Partial<GenerateResult>; settings?: Partial<Settings> } = {}) {
  let settings: Settings = { ...DEFAULT_SETTINGS, verified: {}, ...opts.settings };
  const calls: string[] = [];
  const persisted: Array<Partial<Settings>> = [];
  let clock = 0;
  let releaseGate: (() => void) | null = null;
  const engineImpl: InferenceEngine & { loads: LoadParams[]; gens: GenerateParams[]; holdGeneration: boolean } = {
    loads: [], gens: [], holdGeneration: false,
    async load(p) {
      calls.push('load'); this.loads.push(p);
      p.onProgress?.(0.5);
      if (opts.loadError) throw opts.loadError;
      return { description: 'test model', backend: 'CPU', gpu: false, nCtx: p.nCtx, modelBytes: 1 };
    },
    async generate(p) {
      calls.push('generate'); this.gens.push(p);
      if (opts.genError) throw opts.genError;
      const isTest = p.maxTokens === 5;
      if (isTest) return result(opts.testResult);
      p.onStart?.({ thinkingForcedOpen: false });
      p.onText('Hello');
      if (this.holdGeneration) await new Promise<void>((r) => { releaseGate = r; });
      p.onText('Hello world');
      return result({ text: 'Hello world', generatedTokens: 2 });
    },
    async stop() { calls.push('stop'); releaseGate?.(); },
    async release() { calls.push('release'); },
  };
  const deps: EngineDeps = {
    engine: engineImpl,
    getSettings: () => settings,
    updateSettingsNow: async (patch) => { settings = { ...settings, ...patch }; persisted.push(patch); },
    verifyFile: () => (opts.fileOk === false ? { ok: false, reason: 'The model file is incomplete.' } : { ok: true }),
    modelPath: (s) => `/vault/models/${s.filename}`,
    totalRamBytes: () => (opts.ram === undefined ? 11 * GB : opts.ram),
    now: () => (clock += 50),
  };
  const manager = new EngineManager(deps);
  return { manager, calls, persisted, engineImpl, getSettings: () => settings };
}

test('mount: verify -> load -> test reply -> Active, and records Verified (MV-1, MV-2)', async () => {
  const w = world();
  const stages: Array<string | null> = [];
  w.manager.store.subscribe(() => { const s = w.manager.state.stage; if (stages.at(-1) !== s) stages.push(s); });
  const r = await w.manager.mount(small);
  assert.equal(r.ok, true);
  assert.deepEqual(stages.filter(Boolean), ['checking', 'loading', 'warming']);
  assert.equal(w.manager.state.status, 'ready');
  assert.equal(w.manager.state.modelId, 'qwen3.5-0.8b');
  assert.equal(w.manager.isReady('qwen3.5-0.8b'), true);
  assert.equal(w.manager.isReady('other'), false);
  assert.equal(w.getSettings().activeModelId, 'qwen3.5-0.8b');
  assert.ok(w.getSettings().verified['qwen3.5-0.8b'].tokensPerSecond > 0);
  assert.equal(w.getSettings().pendingMountModelId, null, 'crash marker cleared on success');
  assert.equal(w.engineImpl.loads[0].path, '/vault/models/Qwen3.5-0.8B-Q4_K_M.gguf');
  assert.ok(w.engineImpl.loads[0].nCtx >= 1536);
  // The test generation is a real engine call, not a stub.
  assert.equal(w.engineImpl.gens.length, 1);
  assert.ok(w.calls.indexOf('release') < w.calls.indexOf('load'), 'previous model freed before loading');
});

test('mount: a damaged/incomplete file is rejected without ever touching the engine', async () => {
  const w = world({ fileOk: false });
  const r = await w.manager.mount(small);
  assert.deepEqual([r.ok, (r as any).code], [false, 'file']);
  assert.equal(w.manager.state.status, 'error');
  assert.match(w.manager.state.error!, /incomplete/);
  assert.ok(!w.calls.includes('load'));
});

test('mount: a model too big for this phone is refused with an explanation, unless forced', async () => {
  const w = world({ ram: 5.4 * GB });
  const r = await w.manager.mount(big);
  assert.deepEqual([r.ok, (r as any).code], [false, 'too_heavy']);
  assert.match((r as any).message, /memory/i);
  assert.ok(!w.calls.includes('load'));
  const forced = await w.manager.mount(big, { force: true });
  assert.equal(forced.ok, true);
});

test('mount: load failure surfaces a friendly reason and clears the crash marker', async () => {
  const w = world({ loadError: new Error('std::bad_alloc: out of memory') });
  const r = await w.manager.mount(small);
  assert.equal(r.ok, false);
  assert.match((r as any).message, /not enough free memory/i);
  assert.equal(w.manager.state.status, 'error');
  assert.equal(w.getSettings().pendingMountModelId, null);
  assert.equal(w.getSettings().activeModelId, null, 'a failed model never becomes active');
  assert.ok(w.calls.filter((c: string) => c === 'release').length >= 2, 'partially loaded engine is released');
});

test('mount: a model that loads but says nothing is NOT marked verified (MV-2)', async () => {
  const w = world({ testResult: { text: '   ', generatedTokens: 0 } });
  const r = await w.manager.mount(small);
  assert.deepEqual([r.ok, (r as any).code], [false, 'no_output']);
  assert.equal(w.getSettings().verified['qwen3.5-0.8b'], undefined);
  assert.equal(w.manager.isReady(), false);
});

test('mount: engine missing (Expo Go) says so instead of pretending', async () => {
  const w = world({ loadError: new EngineUnavailableError('TurboModule RNLlama not found') });
  const r = await w.manager.mount(small);
  assert.equal(r.ok, false);
  assert.match((r as any).message, /not available in this build/i);
});

test('mount: crash marker is written BEFORE the risky load, so an OOM kill is detectable', async () => {
  const w = world();
  await w.manager.mount(small);
  assert.deepEqual(w.persisted[0], { pendingMountModelId: 'qwen3.5-0.8b' });
  // Simulate: process died mid-load, settings still say pending.
  const w2 = world({ settings: { pendingMountModelId: 'qwen3.5-9b', activeModelId: 'qwen3.5-9b' } });
  await w2.manager.noteStartup();
  assert.equal(w2.manager.state.crashedModelId, 'qwen3.5-9b');
  assert.equal(w2.getSettings().pendingMountModelId, null);
  assert.equal(w2.getSettings().activeModelId, null, 'do not auto-load the model that just crashed us');
  w2.manager.dismissCrashNotice();
  assert.equal(w2.manager.state.crashedModelId, null);
});

test('mount: concurrent calls are deduplicated / refused, never double-load', async () => {
  const w = world();
  const [a, b] = await Promise.all([w.manager.mount(small), w.manager.mount(small)]);
  assert.equal(a, b);
  assert.equal(w.engineImpl.loads.length, 1);
  const w2 = world();
  const p1 = w2.manager.mount(small);
  const p2 = await w2.manager.mount(other);
  assert.equal(p2.ok, false);
  assert.match((p2 as any).message, /still loading/i);
  await p1;
});

test('generate: refuses to run without a loaded model - never fabricates (MV-3)', async () => {
  const w = world();
  await assert.rejects(() => w.manager.generate({ messages: [], maxTokens: 8, temperature: 0, enableThinking: false, onText: () => undefined }), EngineNotReadyError);
});

test('generate: streams raw text, flips status to generating and back', async () => {
  const w = world();
  await w.manager.mount(small);
  const seen: string[] = [];
  const statuses: string[] = [];
  w.manager.store.subscribe(() => { const s = w.manager.state.status; if (statuses.at(-1) !== s) statuses.push(s); });
  const res = await w.manager.generate({ messages: [{ role: 'user', content: 'hi' }], maxTokens: 100, temperature: 0.7, enableThinking: true, onText: (t) => seen.push(t) });
  assert.deepEqual(seen, ['Hello', 'Hello world']);
  assert.equal(res.text, 'Hello world');
  assert.deepEqual(statuses, ['generating', 'ready']);
});

test('generate: engine errors still return the manager to ready (no stuck spinner)', async () => {
  const w = world();
  await w.manager.mount(small);
  w.engineImpl.generate = async () => { throw new Error('boom'); };
  await assert.rejects(() => w.manager.generate({ messages: [], maxTokens: 8, temperature: 0, enableThinking: false, onText: () => undefined }), /boom/);
  assert.equal(w.manager.state.status, 'ready');
});

test('stop: interrupts an in-flight generation; second generate while busy is refused; unmount frees RAM', async () => {
  const w = world();
  await w.manager.mount(small);
  w.engineImpl.holdGeneration = true;
  const running = w.manager.generate({ messages: [], maxTokens: 100, temperature: 0, enableThinking: false, onText: () => undefined });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(w.manager.state.status, 'generating');
  await assert.rejects(() => w.manager.generate({ messages: [], maxTokens: 1, temperature: 0, enableThinking: false, onText: () => undefined }), EngineNotReadyError);
  const refused = await w.manager.mount(other);
  assert.equal(refused.ok, false, 'cannot switch models mid-reply');
  await w.manager.stop();
  await running;
  assert.equal(w.manager.state.status, 'ready');
  await w.manager.unmount();
  assert.equal(w.manager.state.status, 'unmounted');
  assert.equal(w.manager.state.modelId, null);
});

test('context size: user override beats RAM default', async () => {
  assert.equal(world({ ram: 11 * GB }).manager.contextSize(), 4096);
  assert.equal(world({ ram: 3.6 * GB }).manager.contextSize(), 1536);
  assert.equal(world({ ram: 11 * GB, settings: { contextOverride: 8192 } }).manager.contextSize(), 8192);
});

test('friendly engine errors are actionable', () => {
  assert.match(friendlyEngineError(new Error('failed to allocate buffer: out of memory')), /smaller model/i);
  assert.match(friendlyEngineError(new Error('unknown model architecture: qwen99')), /does not know this model type/i);
  assert.match(friendlyEngineError(new Error('open failed: ENOENT')), /storage/i);
  assert.match(friendlyEngineError(new Error('weird')), /engine reported: weird/);
});

// ---------------------------------------------------------------- "ready" means PROVEN

test('warm-up: ready is only reported after a real 1-5 token generation; its numbers are published', async () => {
  const w = world({ testResult: { generatedTokens: 3, tokensPerSecond: 14.26, ttftMs: 220 } });
  const statesSeenReady: Array<{ lastTokens: number | null; ttft: number | null }> = [];
  w.manager.store.subscribe(() => {
    if (w.manager.state.status === 'ready') statesSeenReady.push({ lastTokens: w.manager.state.lastTokens, ttft: w.manager.state.ttftMs });
  });
  const r = await w.manager.mount(small);
  assert.equal(r.ok, true);
  assert.ok(w.engineImpl.gens[0].maxTokens >= 1 && w.engineImpl.gens[0].maxTokens <= WARMUP_MAX_TOKENS, 'tiny warm-up, not a full reply');
  assert.equal(w.engineImpl.gens[0].enableThinking, false);
  assert.ok(statesSeenReady.length > 0 && statesSeenReady.every((s) => s.lastTokens === 3 && s.ttft === 220), 'never "ready" without measured numbers');
  const s = w.manager.state;
  assert.deepEqual([s.lastTokPerSec, s.lastTokens, s.ttftMs], [14.3, 3, 220]);
  assert.ok(s.loadMs !== null && s.loadMs > 0 && s.warmupMs !== null && s.warmupMs > 0);
  assert.equal((r as { ttftMs: number }).ttftMs, 220);
});

test('warm-up failure (engine throws on the first reply) is NOT ready: cause + fix, RAM freed, marker cleared', async () => {
  const w = world({ genError: new Error('failed to allocate compute buffer: out of memory') });
  const r = await w.manager.mount(small);
  assert.equal(r.ok, false);
  assert.match((r as { message: string }).message, /first reply/i);
  assert.equal(w.manager.state.status, 'error');
  assert.equal(w.manager.state.errorKind, 'out_of_memory');
  assert.match(w.manager.state.errorFix!, /smaller model|context/i);
  assert.equal(w.manager.isReady(), false);
  assert.equal(w.getSettings().pendingMountModelId, null);
  assert.equal(w.getSettings().verified['qwen3.5-0.8b'], undefined);
  assert.ok(w.calls.filter((c: string) => c === 'release').length >= 2);
});

test('failures carry a machine-readable kind and a next step for the UI', async () => {
  const bad = world({ fileOk: false });
  await bad.manager.mount(small);
  assert.deepEqual([bad.manager.state.errorKind, /download it again/i.test(bad.manager.state.errorFix!)], ['bad_file', true]);

  const heavy = world({ ram: 5.4 * GB });
  const r = await heavy.manager.mount(big);
  assert.equal((r as { kind?: string }).kind, 'out_of_memory');
  assert.match(heavy.manager.state.errorFix!, /smaller model/i);

  const silent = world({ testResult: { text: '', generatedTokens: 0 } });
  await silent.manager.mount(small);
  assert.equal(silent.manager.state.errorKind, 'no_output');
});

test('unmount waits for a load in flight (no zombie model after "Unload")', async () => {
  const w = world();
  const mounting = w.manager.mount(small);
  const unmounted = w.manager.unmount();
  await Promise.all([mounting, unmounted]);
  assert.equal(w.manager.state.status, 'unmounted');
  assert.equal(w.manager.state.modelId, null);
  assert.equal(w.calls.at(-1), 'release', 'released after the load finished');
});

test('generate publishes last tok/s, tokens and TTFT for the status chip', async () => {
  const w = world();
  await w.manager.mount(small);
  w.engineImpl.generate = async (p) => { p.onText('x'); return result({ text: 'x', generatedTokens: 40, tokensPerSecond: 9.04, ttftMs: 640 }); };
  await w.manager.generate({ messages: [], maxTokens: 50, temperature: 0.7, enableThinking: false, onText: () => undefined });
  assert.deepEqual([w.manager.state.lastTokPerSec, w.manager.state.lastTokens, w.manager.state.ttftMs], [9, 40, 640]);
});

test('releaseIdle frees RAM only when idle; state flips first; the next mount clears the reason', async () => {
  const w = world();
  assert.equal(await w.manager.releaseIdle('background'), false, 'nothing loaded');
  await w.manager.mount(small);
  w.engineImpl.holdGeneration = true;
  const running = w.manager.generate({ messages: [], maxTokens: 100, temperature: 0, enableThinking: false, onText: () => undefined });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(await w.manager.releaseIdle('memory'), false, 'never cut a reply short');
  await w.manager.stop();
  await running;

  const before = w.calls.filter((c: string) => c === 'release').length;
  const freed = w.manager.releaseIdle('background');
  assert.equal(w.manager.state.status, 'unmounted', 'flipped synchronously, before the native release finishes');
  assert.equal(w.manager.state.unloadedReason, 'background');
  assert.equal(await freed, true);
  assert.equal(w.calls.filter((c: string) => c === 'release').length, before + 1);
  assert.equal(w.manager.isReady(), false);
  await assert.rejects(() => w.manager.generate({ messages: [], maxTokens: 1, temperature: 0, enableThinking: false, onText: () => undefined }), EngineNotReadyError);

  await w.manager.mount(small);
  assert.equal(w.manager.state.unloadedReason, null);
  assert.equal(w.manager.state.status, 'ready');
});

test('countPromptTokens: null when the engine cannot count or nothing is loaded; exact when it can', async () => {
  const w = world();
  assert.equal(await w.manager.countPromptTokens([{ role: 'user', content: 'x' }], false), null, 'not loaded');
  await w.manager.mount(small);
  assert.equal(await w.manager.countPromptTokens([{ role: 'user', content: 'x' }], false), null, 'engine without counting');
  w.engineImpl.countPromptTokens = async (m) => m.length * 10;
  assert.equal(await w.manager.countPromptTokens([{ role: 'user', content: 'x' }], false), 10);
  w.engineImpl.countPromptTokens = async () => { throw new Error('boom'); };
  assert.equal(await w.manager.countPromptTokens([{ role: 'user', content: 'x' }], false), null, 'a counting failure never breaks chat');
});

// ---------------------------------------------------------------- diagnosing llama.rn failures

test('diagnoseEngineError: real llama.cpp messages become cause + fix (llama.rn itself only says "Failed to load model")', () => {
  const d = (e: unknown) => diagnoseEngineError(e);
  assert.equal(d(new EngineLoadError('Failed to load model', "llama_model_load: error loading model: unknown model architecture: 'qwen99'")).kind, 'unsupported_model');
  assert.equal(d(new EngineLoadError('Failed to load model', "llama_model_load: error loading model: tensor 'blk.3.ffn_up.weight' data is not within the file bounds, model is corrupted or incomplete")).kind, 'bad_file');
  assert.equal(d(new EngineLoadError('Failed to load model', 'ggml_backend_cpu_buffer_type_alloc_buffer: failed to allocate buffer of size 2748779264')).kind, 'out_of_memory');
  assert.equal(d(new EngineLoadError('Failed to load model', 'llama_model_load: error loading model: failed to open /storage/x.gguf: Permission denied')).kind, 'file_access');
  assert.equal(d(new EngineLoadError('Failed to load model', '')).kind, 'out_of_memory', 'unexplained load failure on a phone: most likely memory');
  assert.match(d(new EngineLoadError('Failed to load model', '')).fix, /smaller model/i);
  assert.equal(d(new Error('Context is full')).kind, 'context_full');
  assert.equal(d(new Error('Context is busy')).kind, 'busy');
  assert.equal(d(new Error('something else entirely')).kind, 'unknown');
  assert.equal(d(new EngineUnavailableError('JSI')).kind, 'unavailable');
  for (const e of ['unknown model architecture', 'bad_alloc', 'ENOENT', 'Context is full']) {
    const x = d(new Error(e));
    assert.ok(x.message.length > 10 && x.fix.length > 10, `${e}: both cause and fix are non-empty`);
  }
});
