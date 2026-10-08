/**
 * CONTRACT TEST for services/llamaEngine.ts against the REAL installed llama.rn JavaScript (node_modules/llama.rn/lib/commonjs).
 *
 * Only the native side is faked (test/stubs/fakeNative.ts): the ~40 `global.llama*` JSI functions that the native module installs on
 * a phone, and the `react-native` package. So the real llama.rn code (parameter munging, template formatting, progress wrapping,
 * device filtering, result shapes) runs exactly as it will in the app, and these tests prove what our adapter actually sends to
 * and reads from llama.cpp. What this cannot prove: that the native llama.cpp accepts the model (device test).
 * Needs Node >= 22.15 (module.registerHooks); CI uses Node 22 latest.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { behavior, callsOf, resetNative } from './stubs/fakeNative.ts';

const { LlamaEngine } = await import('../src/services/llamaEngine.ts');
const { EngineLoadError, EngineUnavailableError, diagnoseEngineError } = await import('../src/core/engineTypes.ts');

const reset = resetNative;
const baseLoad = { path: 'file:///data/user/0/app/files/vault/models/m.gguf', nCtx: 4096, threads: null as number | null, useGpu: false };
const msgs = [{ role: 'system' as const, content: 'sys' }, { role: 'user' as const, content: 'hi' }];

test('contract: load sends the real llama.rn parameter names; CPU-only on Android; progress is 0..100 -> 0..1', async () => {
  reset();
  const progress: number[] = [];
  const e = new LlamaEngine();
  const info = await e.load({ ...baseLoad, onProgress: (f) => progress.push(f) });
  const [, p] = callsOf('llamaInitContext')[0] as [number, Record<string, unknown>];
  assert.equal(p.model, '/data/user/0/app/files/vault/models/m.gguf', 'llama.rn strips file://');
  assert.deepEqual([p.n_ctx, p.n_batch, p.n_ubatch, p.use_mlock], [4096, 512, 512, false]);
  assert.deepEqual(p.devices, ['CPU'], 'CPU backend by default on Android');
  assert.equal(p.n_gpu_layers, undefined, 'no GPU offload unless the user opts in');
  assert.equal(p.n_threads, undefined, 'threads left to the engine unless the user sets them');
  assert.equal(p.use_progress_callback, true);
  assert.deepEqual(progress, [0, 0, 0.4, 1], 'llama.rn emits 0 first and the native percentages after; we divide by 100');
  assert.deepEqual([info.backend, info.gpu, info.nCtx, info.architecture, info.modelBytes], ['CPU', false, 4096, 'qwen35', 2_740_937_888]);
  // Native logging is only on while loading, then restored.
  assert.deepEqual(callsOf('llamaToggleNativeLog').map((c) => c[0]), [true, false]);
});

test('contract: user options map to n_threads / n_gpu_layers; GPU path does not force devices', async () => {
  reset();
  await new LlamaEngine().load({ ...baseLoad, threads: 6, useGpu: true });
  const [, p] = callsOf('llamaInitContext')[0] as [number, Record<string, unknown>];
  assert.equal(p.n_threads, 6);
  assert.equal(p.n_gpu_layers, 99);
  assert.equal(p.devices, undefined);
});

test('contract: a failed load becomes EngineLoadError carrying llama.cpp\'s own warnings, which the diagnosis understands', async () => {
  reset();
  behavior.initError = new Error('Failed to load model');
  behavior.initLogLines = [['info', 'ignored info line'], ['error', "llama_model_load: error loading model: unknown model architecture: 'qwen99'"]];
  await assert.rejects(() => new LlamaEngine().load(baseLoad), (err: Error) => {
    assert.ok(err instanceof EngineLoadError);
    assert.match((err as InstanceType<typeof EngineLoadError>).nativeLog, /unknown model architecture/);
    assert.ok(!/ignored info/.test((err as InstanceType<typeof EngineLoadError>).nativeLog), 'only warnings/errors are kept');
    assert.equal(diagnoseEngineError(err).kind, 'unsupported_model');
    return true;
  });
  assert.deepEqual(callsOf('llamaToggleNativeLog').map((c) => c[0]), [true, false], 'logging is switched off again after a failure');

  reset();
  behavior.initError = new Error('Failed to load model');
  await assert.rejects(() => new LlamaEngine().load(baseLoad), (err: Error) => diagnoseEngineError(err).kind === 'out_of_memory');
});

test('contract: missing native module is reported as "engine not available", not as a model problem', async () => {
  reset();
  behavior.initError = new Error('[RNLlama] Missing JSI bindings: llamaInitContext');
  await assert.rejects(() => new LlamaEngine().load(baseLoad), EngineUnavailableError);
});

test('contract: generate formats with the model\'s own jinja template and streams tokens', async () => {
  reset();
  const e = new LlamaEngine();
  await e.load(baseLoad);
  const seen: string[] = [];
  let started: unknown = null;
  const r = await e.generate({ messages: msgs, maxTokens: 300, temperature: 0.7, enableThinking: true, onText: (t) => seen.push(t), onStart: (i) => { started = i; } });

  const fmt = callsOf('llamaGetFormattedChat');
  assert.equal(fmt.length, 2, 'once for thinking_forced_open, once inside completion()');
  for (const c of fmt) {
    const [, messages, tmpl, params] = c as [number, unknown, unknown, Record<string, unknown>];
    assert.deepEqual(messages, msgs);
    assert.equal(tmpl, undefined, 'no template override: the model\'s own template is used');
    assert.deepEqual([params.jinja, params.enable_thinking, params.reasoning_format], [true, true, 'none']);
  }
  const [, cp] = callsOf('llamaCompletion')[0] as [number, Record<string, unknown>];
  assert.equal(cp.prompt, '<|im_start|>user\nhi<|im_end|>\n<|im_start|>assistant\n');
  assert.deepEqual([cp.n_predict, cp.temperature, cp.top_k, cp.top_p, cp.min_p, cp.penalty_repeat], [300, 0.7, 40, 0.9, 0.05, 1.1]);
  assert.deepEqual([cp.jinja, cp.enable_thinking, cp.reasoning_format, cp.emit_partial_completion], [true, true, 'none', true]);

  assert.deepEqual(seen, ['Hel', 'Hello'], 'onText receives the accumulated raw text');
  assert.deepEqual(started, { thinkingForcedOpen: false });
  assert.deepEqual(
    [r.text, r.promptTokens, r.generatedTokens, r.promptMs, r.predictedMs, r.tokensPerSecond, r.interrupted, r.contextFull],
    ['Hello', 12, 2, 80, 200, 9.5, false, false],
  );
  assert.ok((r.ttftMs ?? 0) >= 1, 'time to first token is measured');
});

test('contract: thinking_forced_open from the template reaches onStart (Qwen3.5 pre-opens <think>)', async () => {
  reset();
  const e = new LlamaEngine();
  await e.load(baseLoad);
  behavior.formatted = { thinking_forced_open: true };
  let started: unknown = null;
  const r = await e.generate({ messages: msgs, maxTokens: 10, temperature: 0, enableThinking: true, onText: () => undefined, onStart: (i) => { started = i; } });
  assert.deepEqual(started, { thinkingForcedOpen: true });
  assert.equal(r.thinkingForcedOpen, true);
});

test('contract: template stops are NOT leaked between calls or models (llama.rn pushes into the array it is given)', async () => {
  reset();
  const e = new LlamaEngine();
  await e.load(baseLoad);
  behavior.formatted = { additional_stops: ['<|special_stop|>'] };
  await e.generate({ messages: msgs, maxTokens: 10, temperature: 0, enableThinking: false, onText: () => undefined });
  await e.generate({ messages: msgs, maxTokens: 10, temperature: 0, enableThinking: false, onText: () => undefined });
  behavior.formatted = {};
  await e.generate({ messages: msgs, maxTokens: 10, temperature: 0, enableThinking: false, onText: () => undefined });
  const stops = callsOf('llamaCompletion').map((c) => (c[2] as { stopSnapshot: string[] }).stopSnapshot);
  assert.equal(stops[0].filter((s) => s === '<|special_stop|>').length, 1);
  assert.equal(stops[1].filter((s) => s === '<|special_stop|>').length, 1, 'second call has it once, not twice');
  assert.equal(stops[2].filter((s) => s === '<|special_stop|>').length, 0, 'a later model without extra stops gets none');
  assert.ok(stops[2].includes('<|im_end|>'), 'the base stop words are still there');
});

test('contract: stop() and release() hit the right context; release is idempotent; generate before load is refused', async () => {
  reset();
  const e = new LlamaEngine();
  await assert.rejects(() => e.generate({ messages: msgs, maxTokens: 1, temperature: 0, enableThinking: false, onText: () => undefined }), EngineUnavailableError);
  await e.load(baseLoad);
  const id = (callsOf('llamaInitContext')[0] as [number])[0];
  await e.stop();
  assert.deepEqual(callsOf('llamaStopCompletion'), [[id]]);
  await e.release();
  await e.release();
  assert.deepEqual(callsOf('llamaReleaseContext'), [[id]], 'released exactly once');
  // Loading again releases nothing stale and gets a NEW context id.
  await e.load(baseLoad);
  const ids = callsOf('llamaInitContext').map((c) => (c[0] as number));
  assert.notEqual(ids[0], ids[1]);
});

test('contract: countPromptTokens = tokens of the template-rendered prompt', async () => {
  reset();
  const e = new LlamaEngine();
  await e.load(baseLoad);
  behavior.tokenCount = 321;
  assert.equal(await e.countPromptTokens(msgs, false), 321);
  assert.equal(callsOf('llamaTokenize').length, 1);
  assert.match(String(callsOf('llamaTokenize')[0][0]), /im_start\|>assistant/, 'the rendered prompt (with template tokens) is what gets counted');
});
