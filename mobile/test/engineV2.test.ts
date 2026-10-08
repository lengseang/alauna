/**
 * v2 engine: compute settings reach the load, experimental features fall back with a recorded reason, speculative
 * validation + real counters, KV session prefix (saved -> restored, cold vs warm TTFT), vision flag. Fake engine.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineManager, hashKey, planSpeculative, type EngineDeps } from '../src/core/engineManager.ts';
import { SpeculativeUnsupportedError, type GenerateParams, type GenerateResult, type InferenceEngine, type LoadParams, type LoadedModelInfo } from '../src/core/engineTypes.ts';
import { applySettingsPatch, DEFAULT_SETTINGS, type Settings } from '../src/core/settingsModel.ts';
import { getModel, type ModelSpec } from '../src/core/catalog.ts';
import { runSoulPreview } from '../src/core/soulPreview.ts';
import { ARCHETYPES } from '../src/core/persona.ts';

const base = getModel('qwen3.5-0.8b')!;
const target: ModelSpec = { ...base, id: 't', name: 'Target', draftKey: 'qwen', draft: undefined } as ModelSpec;
const draftModel: ModelSpec = { ...base, id: 'd', name: 'Draft', draftKey: 'qwen' } as ModelSpec;
const otherFamily: ModelSpec = { ...base, id: 'o', name: 'Other', draftKey: 'gemma' } as ModelSpec;
const specs: Record<string, ModelSpec> = { t: target, d: draftModel, o: otherFamily };

function result(over: Partial<GenerateResult> = {}): GenerateResult {
  return { text: 'ok', promptTokens: 10, generatedTokens: 3, promptMs: 5, predictedMs: 100, tokensPerSecond: 30, interrupted: false, contextFull: false, thinkingForcedOpen: false, ttftMs: 50, ...over };
}

function world(patch: Partial<Settings> = {}, opts: { failLoad?: (p: LoadParams) => Error | null; info?: Partial<LoadedModelInfo>; installed?: string[] } = {}) {
  let settings = applySettingsPatch(DEFAULT_SETTINGS, patch);
  const loads: LoadParams[] = [];
  const gens: GenerateParams[] = [];
  const files = new Set<string>();
  const ops: string[] = [];
  let next: Partial<GenerateResult> = {};
  const engine: InferenceEngine = {
    async load(p) {
      loads.push(p);
      const err = opts.failLoad?.(p);
      if (err) throw err;
      return { description: 'm', backend: p.useGpu ? 'GPU (OpenCL)' : 'CPU', gpu: p.useGpu, nCtx: p.nCtx, modelBytes: 1, speculative: p.speculative?.mode, multimodal: p.mmprojPath ? { vision: true, audio: false } : null, ...opts.info };
    },
    async generate(p) {
      gens.push(p);
      p.onText('ok');
      return result(p.maxTokens === 5 ? {} : next);
    },
    async stop() {},
    async release() {},
    async evalPrefix(system) { ops.push(`eval:${system}`); return { tokens: 42 }; },
    async saveSession(path) { ops.push(`save:${path}`); files.add(path); return 42; },
    async loadSession(path) { ops.push(`load:${path}`); return 42; },
  };
  let clock = 0;
  const deps: EngineDeps = {
    engine,
    getSettings: () => settings,
    updateSettingsNow: async (p) => { settings = applySettingsPatch(settings, p); },
    verifyFile: (s) => ({ ok: (opts.installed ?? ['t', 'd', 'o']).includes(s.id) }),
    modelPath: (s) => `/m/${s.id}.gguf`,
    totalRamBytes: () => 11e9,
    now: () => (clock += 10),
    getModel: (id) => specs[id],
    companionPath: (s, kind) => (kind === 'mmproj' && s.id === 't' ? '/m/t.mmproj.gguf' : null),
    kvCache: { pathFor: (k) => `/kv/${k}.kv`, exists: (p) => files.has(p), remove: (p) => { files.delete(p); } },
  };
  const m = new EngineManager(deps);
  return { m, loads, gens, ops, files, deps, getSettings: () => settings, setNext: (r: Partial<GenerateResult>) => { next = r; } };
}

test('compute settings reach the engine load exactly', async () => {
  const w = world({ compute: { ...DEFAULT_SETTINGS.compute, threads: 6, nCtx: 3072, nBatch: 256, flashAttn: 'on', cacheTypeK: 'q8_0', cacheTypeV: 'q8_0', useMmap: false, useMlock: true } });
  assert.equal((await w.m.mount(target)).ok, true);
  const p = w.loads[0];
  assert.deepEqual(
    [p.threads, p.nCtx, p.nBatch, p.flashAttn, p.cacheTypeK, p.cacheTypeV, p.useMmap, p.useMlock, p.useGpu, p.mmprojPath],
    [6, 3072, 256, 'on', 'q8_0', 'q8_0', false, true, false, '/m/t.mmproj.gguf'],
  );
  assert.equal(w.m.supportsVision(), true, 'projector initialised -> vision');
});

test('GPU is experimental: a failed GPU load falls back to CPU, says why, and later loads skip the GPU', async () => {
  const w = world({ compute: { ...DEFAULT_SETTINGS.compute, backend: 'gpu' } }, { failLoad: (p) => (p.useGpu ? new Error('Failed to load model') : null) });
  const r = await w.m.mount(target);
  assert.equal(r.ok, true);
  assert.deepEqual(w.loads.map((l) => l.useGpu), [true, false]);
  assert.match(w.m.state.fallbacks.join(' '), /GPU failed .*using CPU/);
  assert.equal(w.m.state.info?.gpu, false);
  assert.equal(w.getSettings().pendingMountGpu, false, 'crash marker cleared');
  await w.m.mount({ ...target, id: 't' });
  assert.deepEqual(w.loads.map((l) => l.useGpu), [true, false, false], 'no second GPU attempt this session');
  assert.match(w.m.state.fallbacks.join(' '), /GPU skipped/);
});

test('a broken file is never retried on another backend (only experimental features are relaxed)', async () => {
  const w = world({ compute: { ...DEFAULT_SETTINGS.compute, backend: 'gpu' } }, { failLoad: () => new Error('unknown model architecture: qwen99') });
  const r = await w.m.mount(target);
  assert.equal(r.ok, false);
  assert.equal(w.loads.length, 1);
  assert.equal(w.m.state.errorKind, 'unsupported_model');
});

test('the GPU crashing the whole app is remembered: next launch switches to CPU and explains it', async () => {
  const w = world({ pendingMountModelId: 't', pendingMountGpu: true, activeModelId: 't', compute: { ...DEFAULT_SETTINGS.compute, backend: 'gpu' } });
  await w.m.noteStartup();
  const s = w.getSettings();
  assert.deepEqual([s.compute.backend, s.pendingMountGpu, s.pendingMountModelId, s.activeModelId], ['cpu', false, null, null]);
  assert.match(s.computeNotice ?? '', /GPU was switched off/);
});

test('speculative: pair validation before anything is loaded', () => {
  const plan = (sp: Partial<Settings['speculative']>, installed = ['t', 'd', 'o']) =>
    planSpeculative(target, applySettingsPatch(DEFAULT_SETTINGS, { speculative: { ...DEFAULT_SETTINGS.speculative, enabled: true, ...sp } }), {
      getModel: (id) => specs[id],
      isInstalled: (s) => installed.includes(s.id),
      modelPath: (s) => `/m/${s.id}.gguf`,
    });
  assert.deepEqual(plan({ draftModelId: 'd', nDraft: 3 }).load, { mode: 'draft', draftPath: '/m/d.gguf', nMax: 3, pMin: 0.75 });
  assert.match(plan({ draftModelId: 'o' }).reason!, /do not share a tokenizer/);
  assert.match(plan({ draftModelId: 'd' }, ['t']).reason!, /not downloaded/);
  assert.match(plan({ draftModelId: 't' }).reason!, /cannot draft for itself/);
  assert.match(plan({ draftModelId: 'zzz' }).reason!, /not in the catalog/);
  assert.deepEqual(plan({ draftModelId: null }).load, { mode: 'mtp', nMax: 4, pMin: 0.75 });
  const withHead = planSpeculative({ ...target, draft: { repo: 'r/x', filename: 'mtp.gguf', sizeBytes: 1, sha256: 'a' } } as ModelSpec, applySettingsPatch(DEFAULT_SETTINGS, { speculative: { ...DEFAULT_SETTINGS.speculative, enabled: true } }), {
    getModel: (id) => specs[id], isInstalled: () => true, modelPath: (s) => `/m/${s.id}.gguf`, companionPath: () => null,
  });
  assert.match(withHead.reason!, /draft head is not downloaded/);
  assert.deepEqual(planSpeculative(target, DEFAULT_SETTINGS, { getModel: () => undefined, isInstalled: () => true, modelPath: () => '' }), { requested: 'off', draftModelId: null });
});

test('speculative: engine refusal -> loads without it, reason recorded; when active, acceptance comes from llama.cpp counters', async () => {
  const refused = world({ speculative: { enabled: true, draftModelId: 'd', nDraft: 4, pMin: 0.75 } }, {
    failLoad: (p) => (p.speculative ? new SpeculativeUnsupportedError('standalone draft (hidden size 1024 vs 2560)') : null),
  });
  assert.equal((await refused.m.mount(target)).ok, true);
  assert.equal(refused.m.state.speculative.active, false);
  assert.match(refused.m.state.speculative.reason!, /hidden size 1024 vs 2560/);
  assert.equal(refused.loads.length, 2);

  const w = world({ speculative: { enabled: true, draftModelId: null, nDraft: 4, pMin: 0.75 }, verified: { t: { at: 1, tokensPerSecond: 5, loadMs: 1, chatTokPerSec: 10 } } });
  await w.m.mount(target);
  assert.equal(w.m.state.speculative.active, true);
  w.setNext({ generatedTokens: 40, tokensPerSecond: 15, draftTokens: 30, draftAccepted: 24 });
  await w.m.generate({ messages: [{ role: 'user', content: 'x' }], maxTokens: 100, temperature: 0.7, enableThinking: false, onText: () => undefined });
  w.setNext({ generatedTokens: 40, tokensPerSecond: 15, draftTokens: 10, draftAccepted: 2 });
  await w.m.generate({ messages: [{ role: 'user', content: 'x' }], maxTokens: 100, temperature: 0.7, enableThinking: false, onText: () => undefined });
  const sp = w.m.state.speculative;
  assert.deepEqual([sp.draftTokens, sp.acceptedTokens, sp.acceptanceRate], [40, 26, 0.65]);
  assert.deepEqual([sp.specTokPerSec, sp.baselineTokPerSec, sp.speedup], [15, 10, 1.5], 'speed-up = measured with / measured without');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(w.getSettings().verified.t.specTokPerSec, 15, 'persisted for the next session');
});

test('KV session cache: first load evaluates + saves the prefix (cold), next load restores it (warm); both TTFTs measured', async () => {
  const w = world();
  await w.m.mount(target);
  const sys = 'You are CHIWIWI.';
  const r1 = await w.m.preparePrefix(sys, false);
  assert.equal(r1.status, 'saved');
  assert.equal(r1.tokens, 42);
  assert.match(w.ops.join(' '), /eval:You are CHIWIWI\. save:\/kv\/t-[0-9a-f]{8}\.kv/);
  await w.m.generate({ messages: [{ role: 'system', content: sys }, { role: 'user', content: 'hi' }], maxTokens: 50, temperature: 0.7, enableThinking: false, onText: () => undefined });
  assert.equal(w.m.state.kvCache.coldTtftMs, r1.ms! + 50);
  assert.equal((await w.m.preparePrefix(sys, false)).status, 'saved', 'same prefix already in the context: no work');
  assert.equal(w.ops.length, 2);

  // reload (new session): the file exists -> restored instead of evaluated
  await w.m.unmount();
  await w.m.mount(target);
  const r2 = await w.m.preparePrefix(sys, false);
  assert.equal(r2.status, 'loaded');
  assert.match(w.ops.at(-1)!, /^load:\/kv\/t-/);
  await w.m.generate({ messages: [{ role: 'system', content: sys }, { role: 'user', content: 'hi' }], maxTokens: 50, temperature: 0.7, enableThinking: false, onText: () => undefined });
  assert.equal(w.m.state.kvCache.warmTtftMs, r2.ms! + 50);
  assert.equal(w.m.state.status, 'ready');

  // a different system prompt is a different file; a failing save never breaks chat
  w.deps.engine.saveSession = async () => { throw new Error('disk full'); };
  const r3 = await w.m.preparePrefix('Another persona', false);
  assert.equal(r3.status, 'error');
  assert.match(r3.reason!, /disk full/);
  assert.equal(w.m.state.status, 'ready');
  assert.notEqual(hashKey('a'), hashKey('b'));
});

test('KV session cache is off when the setting is off', async () => {
  const w = world({ compute: { ...DEFAULT_SETTINGS.compute, kvSessionCache: false } });
  await w.m.mount(target);
  assert.equal((await w.m.preparePrefix('sys', false)).status, 'off');
  assert.equal(w.ops.length, 0);
});

test('soul preview: real generation with the soul\'s prompt + sampling; honest error without a model', async () => {
  const soul = { archetype: 'tactical' as const, pad: ARCHETYPES.tactical.defaultPAD, toneIntensity: 1 };
  const w = world();
  const none = await runSoulPreview(w.m, soul, DEFAULT_SETTINGS.sampling);
  assert.deepEqual([none.ok, !none.ok && none.reason], [false, 'no_model']);
  await w.m.mount(target);
  const r = await runSoulPreview(w.m, soul, DEFAULT_SETTINGS.sampling);
  assert.equal(r.ok, true);
  const g = w.gens.at(-1)!;
  assert.match(g.messages[0].content, /elite staff engineer/);
  assert.equal(g.temperature, r.ok ? r.sampling.temperature : -1);
  assert.ok(g.temperature > DEFAULT_SETTINGS.sampling.temperature, 'high-arousal soul samples hotter');
  assert.equal(r.ok && r.text, 'ok');
});
