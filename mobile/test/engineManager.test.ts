import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineManager, EngineNotReadyError, type EngineDeps } from '../src/core/engineManager.ts';
import { EngineUnavailableError, friendlyEngineError, type GenerateParams, type GenerateResult, type InferenceEngine, type LoadParams } from '../src/core/engineTypes.ts';
import { DEFAULT_SETTINGS, type Settings } from '../src/core/settingsModel.ts';
import { getModel } from '../src/core/catalog.ts';

const GB = 1e9;
const small = getModel('llama-3.2-1b')!;
const big = getModel('llama-3.1-8b')!;

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
      const isTest = p.maxTokens === 24;
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
  assert.deepEqual(stages.filter(Boolean), ['checking', 'loading', 'testing']);
  assert.equal(w.manager.state.status, 'ready');
  assert.equal(w.manager.state.modelId, 'llama-3.2-1b');
  assert.equal(w.manager.isReady('llama-3.2-1b'), true);
  assert.equal(w.manager.isReady('other'), false);
  assert.equal(w.getSettings().activeModelId, 'llama-3.2-1b');
  assert.ok(w.getSettings().verified['llama-3.2-1b'].tokensPerSecond > 0);
  assert.equal(w.getSettings().pendingMountModelId, null, 'crash marker cleared on success');
  assert.equal(w.engineImpl.loads[0].path, '/vault/models/Llama-3.2-1B-Instruct-Q4_K_M.gguf');
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
  const w = world({ ram: 7.3 * GB });
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
  assert.match((r as any).message, /not enough memory/i);
  assert.equal(w.manager.state.status, 'error');
  assert.equal(w.getSettings().pendingMountModelId, null);
  assert.equal(w.getSettings().activeModelId, null, 'a failed model never becomes active');
  assert.ok(w.calls.filter((c) => c === 'release').length >= 2, 'partially loaded engine is released');
});

test('mount: a model that loads but says nothing is NOT marked verified (MV-2)', async () => {
  const w = world({ testResult: { text: '   ', generatedTokens: 0 } });
  const r = await w.manager.mount(small);
  assert.deepEqual([r.ok, (r as any).code], [false, 'no_output']);
  assert.equal(w.getSettings().verified['llama-3.2-1b'], undefined);
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
  assert.deepEqual(w.persisted[0], { pendingMountModelId: 'llama-3.2-1b' });
  // Simulate: process died mid-load, settings still say pending.
  const w2 = world({ settings: { pendingMountModelId: 'llama-3.1-8b', activeModelId: 'llama-3.1-8b' } });
  await w2.manager.noteStartup();
  assert.equal(w2.manager.state.crashedModelId, 'llama-3.1-8b');
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
  const p2 = await w2.manager.mount(getModel('qwen2.5-1.5b')!);
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
  const refused = await w.manager.mount(getModel('qwen2.5-1.5b')!);
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
  assert.match(friendlyEngineError(new Error('unknown model architecture: qwen99')), /could not read/i);
  assert.match(friendlyEngineError(new Error('open failed: ENOENT')), /storage folder/i);
  assert.match(friendlyEngineError(new Error('weird')), /engine failed: weird/);
});
