/**
 * The services-facing engine API, tested through the real core objects with fakes:
 * deriveEngineStatus (single observable status), MemoryGuard (background / low-memory release),
 * runSelfTest ("Test model"), downloadAndLoad (first-run one-call path).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineManager, type EngineDeps } from '../src/core/engineManager.ts';
import { deriveEngineStatus, type EngineUiState } from '../src/core/engineStatus.ts';
import type { GenerateParams, GenerateResult, InferenceEngine } from '../src/core/engineTypes.ts';
import { DEFAULT_SETTINGS, type Settings } from '../src/core/settingsModel.ts';
import { MemoryGuard } from '../src/core/memoryGuard.ts';
import { SELF_TEST_PROMPT, runSelfTest } from '../src/core/selfTest.ts';
import { downloadAndLoad, type SetupStage } from '../src/core/setup.ts';
import { DownloadManager, type DownloadPlatform, type ModelFiles, type TransferTask } from '../src/core/downloadManager.ts';
import { getModel } from '../src/core/catalog.ts';
import { recommendModel } from '../src/core/fit.ts';
import { MODEL_CATALOG } from '../src/core/catalog.ts';
import type { RemoteFileInfo } from '../src/core/hf.ts';

const GB = 1e9;
const spec = getModel('qwen3.5-4b')!;

function gen(over: Partial<GenerateResult> = {}): GenerateResult {
  return { text: '4', promptTokens: 20, generatedTokens: 2, promptMs: 50, predictedMs: 100, tokensPerSecond: 12, interrupted: false, contextFull: false, thinkingForcedOpen: false, ttftMs: 300, ...over };
}

interface EngineWorldOpts {
  ram?: number | null;
  loadError?: Error;
  /** Result for every generate() call (warm-up included). */
  result?: Partial<GenerateResult>;
  genError?: Error;
}

function engineWorld(opts: EngineWorldOpts = {}) {
  let settings: Settings = { ...DEFAULT_SETTINGS, verified: {} };
  const prompts: GenerateParams[] = [];
  const calls: string[] = [];
  const fake: InferenceEngine = {
    async load(p) {
      calls.push('load');
      p.onProgress?.(0.5);
      if (opts.loadError) throw opts.loadError;
      return { description: 'x', backend: 'CPU', gpu: false, nCtx: p.nCtx, modelBytes: 1, architecture: 'qwen35' };
    },
    async generate(p) {
      prompts.push(p);
      calls.push('generate');
      if (opts.genError) throw opts.genError;
      p.onText(opts.result?.text ?? '4');
      return gen(opts.result);
    },
    async stop() { calls.push('stop'); },
    async release() { calls.push('release'); },
  };
  let clock = 0;
  const deps: EngineDeps = {
    engine: fake,
    getSettings: () => settings,
    updateSettingsNow: async (patch) => { settings = { ...settings, ...patch }; },
    verifyFile: () => ({ ok: true }),
    modelPath: (s) => `/vault/${s.filename}`,
    totalRamBytes: () => (opts.ram === undefined ? 11.2 * GB : opts.ram),
    now: () => (clock += 100),
  };
  return { manager: new EngineManager(deps), prompts, calls };
}

// ------------------------------------------------------------------ one observable status

test('status: idle -> loading(progress) -> warming -> ready -> generating -> back, with real numbers only', async () => {
  const w = engineWorld({ result: { tokensPerSecond: 11.5, generatedTokens: 3, ttftMs: 410 } });
  const idle = deriveEngineStatus(w.manager.state, 11.2 * GB);
  assert.equal(idle.state, 'idle');
  assert.deepEqual([idle.lastTokPerSec, idle.ttftMs, idle.backend, idle.modelId], [null, null, null, null], 'nothing is invented before a real generation');
  assert.equal(idle.ramTotalMb, 11200);

  const seen: EngineUiState[] = [];
  const loadingProgress: number[] = [];
  w.manager.store.subscribe(() => {
    const st = deriveEngineStatus(w.manager.state, 11.2 * GB);
    if (seen.at(-1) !== st.state) seen.push(st.state);
    if (st.state === 'loading') loadingProgress.push(st.progress);
  });
  await w.manager.mount(spec);
  assert.deepEqual(seen, ['loading', 'warming', 'ready']);
  assert.ok(loadingProgress.includes(0.5), 'load progress is exposed as 0..1');

  const ready = deriveEngineStatus(w.manager.state, 11.2 * GB);
  assert.equal(ready.state, 'ready');
  assert.deepEqual([ready.modelId, ready.modelName, ready.backend, ready.architecture, ready.nCtx], ['qwen3.5-4b', 'Qwen3.5 4B', 'CPU', 'qwen35', 4096]);
  assert.deepEqual([ready.lastTokPerSec, ready.lastTokens, ready.ttftMs], [11.5, 3, 410]);
  assert.ok(ready.loadMs! > 0);
  assert.ok(ready.ramEstimateMb! > 2700 && ready.ramEstimateMb! < 4500, `estimate ${ready.ramEstimateMb} MB is plausible for a 2.7 GB file`);
  assert.match(ready.headline, /^Ready - Qwen3\.5 4B · CPU · 4096 ctx · 11\.5 tok\/s$/);
});

test('status: error carries kind, message and fix; unloaded-for-memory is explained', async () => {
  const w = engineWorld({ loadError: new Error('Failed to load model') });
  await w.manager.mount(spec);
  const err = deriveEngineStatus(w.manager.state, null);
  assert.equal(err.state, 'error');
  assert.equal(err.errorKind, 'out_of_memory');
  assert.match(err.errorFix!, /smaller model/i);
  assert.equal(err.headline, err.error);
  assert.equal(err.ramTotalMb, null);

  const ok = engineWorld();
  await ok.manager.mount(spec);
  await ok.manager.releaseIdle('background');
  const gone = deriveEngineStatus(ok.manager.state, 11.2 * GB);
  assert.equal(gone.state, 'idle');
  assert.equal(gone.unloadedReason, 'background');
  assert.match(gone.headline, /unloaded to free memory/i);
});

// ------------------------------------------------------------------ memory guard

function guardWorld(over: { busy?: boolean; loaded?: boolean } = {}) {
  const state = { busy: over.busy ?? false, loaded: over.loaded ?? true };
  const released: string[] = [];
  const timers = new Map<number, { fn: () => void; ms: number }>();
  let next = 1;
  const guard = new MemoryGuard(
    {
      isBusy: () => state.busy,
      isLoaded: () => state.loaded,
      release: async (r) => { released.push(r); },
      setTimer: (fn, ms) => { timers.set(next, { fn, ms }); return next++; },
      clearTimer: (h) => { timers.delete(h as number); },
    },
    { backgroundDelayMs: 1000, retryMs: 100 },
  );
  const fire = () => { const [id, t] = [...timers.entries()][0]; timers.delete(id); t.fn(); };
  return { guard, state, released, timers, fire };
}

test('memory guard: backgrounded + idle -> released after the delay; coming back first cancels it', () => {
  const g = guardWorld();
  g.guard.onBackground();
  assert.equal(g.timers.size, 1);
  assert.equal([...g.timers.values()][0].ms, 1000);
  g.guard.onForeground();
  assert.equal(g.timers.size, 0, 'a quick app switch costs nothing');
  assert.deepEqual(g.released, []);

  g.guard.onBackground();
  g.fire();
  assert.deepEqual(g.released, ['background']);
});

test('memory guard: never releases mid-reply or mid-load; looks again later', () => {
  const g = guardWorld({ busy: true });
  g.guard.onBackground();
  g.fire();
  assert.deepEqual(g.released, []);
  assert.equal(g.timers.size, 1, 're-armed');
  assert.equal([...g.timers.values()][0].ms, 100);
  g.state.busy = false;
  g.fire();
  assert.deepEqual(g.released, ['background']);
});

test('memory guard: nothing loaded -> nothing to do; foreground memory warning while idle releases, while busy does not', () => {
  const none = guardWorld({ loaded: false });
  none.guard.onBackground();
  none.fire();
  none.guard.onMemoryWarning();
  assert.deepEqual(none.released, []);

  const idle = guardWorld();
  idle.guard.onMemoryWarning();
  assert.deepEqual(idle.released, ['memory']);

  const busy = guardWorld({ busy: true });
  busy.guard.onMemoryWarning();
  assert.deepEqual(busy.released, [], 'a running reply is never cut short; foreground so no re-arm');
  assert.equal(busy.timers.size, 0);
});

// ------------------------------------------------------------------ Test model

test('self-test: loads if needed, asks a fixed question, returns text + TTFT + tok/s and passes', async () => {
  const w = engineWorld({ result: { text: '4', tokensPerSecond: 13.04, ttftMs: 280, generatedTokens: 2 } });
  const r = await runSelfTest(spec, { engine: w.manager, now: () => Date.now() });
  assert.equal(r.ok, true);
  assert.equal(r.text, '4');
  assert.deepEqual([r.tokPerSec, r.ttftMs, r.tokens, r.backend], [13, 280, 2, 'CPU']);
  assert.ok(r.loadMs !== null && r.loadMs > 0, 'it had to load the model');
  assert.deepEqual(r.reasons, []);
  assert.deepEqual(r.warnings, []);
  assert.equal(w.prompts.at(-1)!.messages[0].content, SELF_TEST_PROMPT);
  // Second run: already loaded -> no reload.
  const loadsBefore = w.calls.filter((c) => c === 'load').length;
  const again = await runSelfTest(spec, { engine: w.manager, now: () => Date.now() });
  assert.equal(again.ok, true);
  assert.equal(again.loadMs, null);
  assert.equal(w.calls.filter((c) => c === 'load').length, loadsBefore);
});

test('self-test: a model that loads but says nothing FAILS with reasons (never a fake pass)', async () => {
  // Warm-up passes with 1 token, then the real test returns nothing readable.
  const w = engineWorld();
  await w.manager.mount(spec);
  const original = w.manager.generate.bind(w.manager);
  w.manager.generate = async (p) => { const r = await original(p); return { ...r, text: '', generatedTokens: 0 }; };
  const r = await runSelfTest(spec, { engine: w.manager, now: () => Date.now() });
  assert.equal(r.ok, false);
  assert.match(r.reasons.join(' '), /no tokens/i);
  assert.ok(r.fix);
});

test('self-test: load failure is reported as a failed test with the cause and the fix', async () => {
  const w = engineWorld({ loadError: new Error('Failed to load model') });
  const r = await runSelfTest(spec, { engine: w.manager, now: () => Date.now() });
  assert.equal(r.ok, false);
  assert.equal(r.errorKind, 'out_of_memory');
  assert.match(r.reasons[0], /memory|damaged/i);
  assert.match(r.fix!, /smaller model/i);
  assert.equal(r.tokPerSec, null);
});

test('self-test: slow or odd answers pass with warnings, not silently', async () => {
  const slow = engineWorld({ result: { text: '4', tokensPerSecond: 1.2 } });
  const a = await runSelfTest(spec, { engine: slow.manager, now: () => Date.now() });
  assert.equal(a.ok, true);
  assert.match(a.warnings.join(' '), /too slow/i);

  const odd = engineWorld({ result: { text: 'banana' } });
  const b = await runSelfTest(spec, { engine: odd.manager, now: () => Date.now() });
  assert.equal(b.ok, true, 'the engine works');
  assert.match(b.warnings.join(' '), /looked wrong/i);

  const thought = engineWorld({ result: { text: '<think>\nneed 2+2\n</think>\n\nFour.' } });
  assert.equal((await runSelfTest(spec, { engine: thought.manager, now: () => Date.now() })).text, 'Four.', 'reasoning markup is not shown as the answer');
});

// ------------------------------------------------------------------ one-call first run

function fakeDownloadWorld(over: { installed?: boolean; ending?: 'completed' | 'error' | 'paused' | 'cancel'; refuse?: boolean } = {}) {
  const GGUF = new Uint8Array([0x47, 0x47, 0x55, 0x46]);
  const total = 1000;
  const state: { part: number; dest: boolean } = { part: 0, dest: over.installed ?? false };
  const meta: RemoteFileInfo = { filename: spec.filename, size: total, sha256: null };
  let paused = false;
  const platform: DownloadPlatform = {
    isStorageReady: () => !over.refuse,
    freeSpaceBytes: () => null,
    files(): ModelFiles {
      return {
        destExists: () => state.dest,
        destSize: () => (state.dest ? total : 0),
        partExists: () => state.part > 0,
        partSize: () => state.part,
        deletePart: () => { state.part = 0; },
        deleteDest: () => { state.dest = false; },
        readHeader: () => GGUF,
        promotePart: () => { state.dest = true; state.part = 0; },
      };
    },
    fetchInfo: async () => meta,
    createTask({ onProgress }): TransferTask {
      return {
        isPaused: () => paused,
        pause: async () => { paused = true; },
        cancel: () => undefined,
        async run() {
          paused = false;
          for (let p = 100; p <= total; p += 100) {
            if (over.ending === 'error' && p === 400) throw new Error('HTTP 404');
            if (over.ending === 'paused' && p === 400) return 'paused';
            state.part = p;
            onProgress(p);
            await Promise.resolve();
          }
          return 'completed';
        },
      };
    },
    keepAwake: () => undefined,
    now: () => Date.now(),
    sleep: async () => undefined,
  };
  const downloads = new DownloadManager(platform, { spaceMarginBytes: 0, stallTimeoutMs: 0, stopGraceMs: 30, maxRetries: 0 });
  return { downloads, isInstalled: () => state.dest, state };
}

test('downloadAndLoad: not installed -> downloads, verifies, loads, proves it can answer; stages are reported in order', async () => {
  const dl = fakeDownloadWorld();
  const w = engineWorld({ result: { tokensPerSecond: 15, generatedTokens: 3 } });
  const stages: SetupStage[] = [];
  const r = await downloadAndLoad(spec, { downloads: dl.downloads, engine: w.manager, isInstalled: dl.isInstalled, onStage: (s) => { if (stages.at(-1) !== s) stages.push(s); } });
  assert.deepEqual(r, { ok: true, alreadyInstalled: false, tokensPerSecond: 15 });
  assert.deepEqual(stages, ['downloading', 'verifying', 'loading', 'done']);
  assert.equal(dl.downloads.stateOf(spec.id).status, 'completed');
  assert.equal(w.manager.isReady(spec.id), true);
});

test('downloadAndLoad: already installed skips the download; already loaded returns instantly', async () => {
  const dl = fakeDownloadWorld({ installed: true });
  const w = engineWorld();
  const r = await downloadAndLoad(spec, { downloads: dl.downloads, engine: w.manager, isInstalled: dl.isInstalled });
  assert.equal(r.ok, true);
  assert.equal((r as { alreadyInstalled: boolean }).alreadyInstalled, true);
  assert.equal(dl.downloads.stateOf(spec.id).status, 'idle', 'no download was started');
  const loads = w.calls.filter((c) => c === 'load').length;
  const again = await downloadAndLoad(spec, { downloads: dl.downloads, engine: w.manager, isInstalled: dl.isInstalled });
  assert.equal(again.ok, true);
  assert.equal(w.calls.filter((c) => c === 'load').length, loads, 'no second load');
});

test('downloadAndLoad: a failed download stops there with the reason; nothing is loaded', async () => {
  const dl = fakeDownloadWorld({ ending: 'error' });
  const w = engineWorld();
  const r = await downloadAndLoad(spec, { downloads: dl.downloads, engine: w.manager, isInstalled: dl.isInstalled });
  assert.equal(r.ok, false);
  const f = r as { stage: string; reason: string; message: string; retryable?: boolean };
  assert.deepEqual([f.stage, f.reason, f.retryable], ['download', 'error', false]);
  assert.match(f.message, /not found/i);
  assert.ok(!w.calls.includes('load'));
});

test('downloadAndLoad: paused is reported as paused (not an error, not "installed"); refusal is reported', async () => {
  const dl = fakeDownloadWorld({ ending: 'paused' });
  const w = engineWorld();
  const r = await downloadAndLoad(spec, { downloads: dl.downloads, engine: w.manager, isInstalled: dl.isInstalled });
  assert.equal(r.ok, false);
  assert.equal((r as { reason: string }).reason, 'paused');
  assert.equal(dl.isInstalled(), false);

  const refused = fakeDownloadWorld({ refuse: true });
  const r2 = await downloadAndLoad(spec, { downloads: refused.downloads, engine: w.manager, isInstalled: refused.isInstalled });
  assert.equal((r2 as { reason: string }).reason, 'refused');
  assert.match((r2 as { message: string }).message, /storage/i);
});

test('downloadAndLoad: a load failure after a good download is reported as stage "load" with cause + fix', async () => {
  const dl = fakeDownloadWorld();
  const w = engineWorld({ loadError: new Error('Failed to load model') });
  const r = await downloadAndLoad(spec, { downloads: dl.downloads, engine: w.manager, isInstalled: dl.isInstalled });
  assert.equal(r.ok, false);
  const f = r as { stage: string; reason: string; fix?: string };
  assert.deepEqual([f.stage, f.reason], ['load', 'engine']);
  assert.match(f.fix!, /smaller model/i);
  assert.equal(dl.isInstalled(), true, 'the download itself is kept');
});

// ------------------------------------------------------------------ first run picks the right model

test('first run: the model chosen for each RAM class, with the owner 12 GB phone getting the 4B default', () => {
  const pick = (gb: number | null) => recommendModel(MODEL_CATALOG, gb === null ? null : gb * GB)!.id;
  assert.equal(pick(11.2), 'qwen3.5-4b');
  assert.equal(pick(7.3), 'qwen3.5-4b');
  assert.equal(pick(5.4), 'qwen3.5-2b');
  assert.equal(pick(3.6), 'qwen3.5-2b');
  assert.equal(pick(1.5), 'qwen3.5-0.8b');
  assert.equal(pick(null), 'qwen3.5-2b');
});
