/**
 * FULL-STACK flow under Node, no phone: the real src/services/* (chat, engine, settings, storage, chatStore, downloads, lifecycle)
 * on top of the REAL llama.rn JavaScript, with only the native layer and the phone packages faked
 * (test/stubs: in-memory expo-file-system, a Galaxy S23 Ultra as expo-device, fake llama.cpp).
 *
 * This is the closest thing to "install the APK, load a model, chat, kill the app" that can run on a PC. It proves the wiring
 * between the layers; it cannot prove that real llama.cpp loads a real model on Hermes (see docs/audit/04-validation-core.md).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { behavior, callsOf, resetNative } from './stubs/fakeNative.ts';

interface FakeFs {
  store: Map<string, { type: string; content?: string; size?: number }>;
  putModel(path: string, size: number): void;
  read(path: string): string | null;
  list(prefix: string): string[];
}
const storage = await import('../src/services/storage.ts');
const settings = await import('../src/services/settings.ts');
const chat = await import('../src/services/chat.ts');
const { engine } = await import('../src/services/engine.ts');
const life = await import('../src/services/lifecycle.ts');
const { downloads } = await import('../src/services/downloads.ts');
const { getModel } = await import('../src/core/catalog.ts');
const { listThreads } = await import('../src/services/chatStore.ts');

const fs = (globalThis as unknown as { __fakeFs: FakeFs }).__fakeFs;
const appState = (globalThis as unknown as { __appStateListeners: Record<string, Array<(arg?: string) => void>> }).__appStateListeners;

const spec = getModel('qwen3.5-0.8b')!;
let vault = '';

const threadPath = () => `${vault}/chats/${chat.chatStore.getState().thread.id}.json`;
const onDisk = (path: string) => JSON.parse(fs.read(path) ?? 'null');
/** A real chat completion (the warm-up uses n_predict 5). */
const isChatCompletion = (p: Record<string, unknown>) => Number(p.n_predict) > 5;

test('setup: first launch -> settings load, vault created in app storage, model "downloaded"', async () => {
  await settings.initSettings();
  const cfg = await storage.useInternalStorage();
  vault = cfg.rootPath;
  assert.ok(storage.isStorageReady());
  assert.match(vault, /\/files\/vault$/);
  fs.putModel(`${vault}/models/${spec.filename}`, spec.sizeBytes);
  settings.updateSettings({ activeModelId: spec.id });
  await chat.initChat();
  assert.equal(chat.chatStore.getState().thread.messages.length, 0);
});

test('golden path: send -> auto-load -> warm-up proof -> streamed reply; the question is on disk BEFORE the answer arrives', async () => {
  resetNative();
  const seen: { atStart?: ReturnType<typeof onDisk>; midStream?: ReturnType<typeof onDisk> } = {};
  behavior.onCompletionStart = (p) => { if (isChatCompletion(p)) seen.atStart = onDisk(threadPath()); };
  behavior.midStream = () => { if (!seen.midStream) seen.midStream = onDisk(threadPath()); };

  assert.equal(engine.state.status, 'unmounted');
  const r = await chat.sendMessage('hello');
  assert.deepEqual(r, { ok: true });

  // engine: loaded, warmed up with a real generation, numbers published
  assert.equal(engine.state.status, 'ready');
  assert.equal(engine.state.modelId, spec.id);
  assert.equal(callsOf('llamaInitContext').length, 1);
  const completions = callsOf('llamaCompletion').map((c) => c[1] as Record<string, unknown>);
  assert.equal(completions.length, 2, 'warm-up + the real reply');
  assert.equal(completions[0].n_predict, 5);
  assert.equal(completions[1].enable_thinking, false, 'Qwen3.5 0.8B entry is a no-thinking model');
  assert.equal(engine.state.nCtx, 4096, 'context chosen from the 12 GB phone');
  assert.ok(engine.state.lastTokPerSec && engine.state.ttftMs);
  assert.ok(settings.settingsStore.getState().verified[spec.id], 'recorded as verified on this phone');
  assert.equal(settings.settingsStore.getState().pendingMountModelId, null);

  // conversation state
  const { messages } = chat.chatStore.getState().thread;
  assert.deepEqual(messages.map((m) => [m.role, m.status, m.text]), [['user', 'done', 'hello'], ['assistant', 'done', 'Hello']]);
  assert.equal(messages[1].stats?.tokensPerSecond, 9.5);

  // the prompt that reached the model: system persona + the user turn, rendered by the model's own template
  const fmt = callsOf('llamaGetFormattedChat').at(-1)!;
  const sent = fmt[1] as Array<{ role: string; content: string }>;
  assert.equal(sent[0].role, 'system');
  assert.match(sent[0].content, /CHIWIWI/);
  assert.deepEqual(sent.at(-1), { role: 'user', content: 'hello' });
  assert.ok(callsOf('llamaTokenize').length >= 1, 'the prompt was measured with the model\'s tokenizer');

  // G-5: kill-safety. At the moment the reply started, and while it streamed, the question was already saved.
  assert.deepEqual(seen.atStart.messages.map((m: { role: string }) => m.role), ['user', 'assistant']);
  assert.equal(seen.atStart.messages[0].text, 'hello');
  assert.equal(seen.atStart.messages[1].status, 'stopped', 'a half-done answer reloads as Stopped, not as a spinner');
  assert.equal(seen.midStream.messages[0].text, 'hello');
  // final file
  assert.deepEqual(onDisk(threadPath()).messages.map((m: { status: string }) => m.status), ['done', 'done']);
  assert.equal(fs.list(`${vault}/chats/`).filter((p) => p.endsWith('.tmp')).length, 0, 'no temp files left behind');
});

test('second message carries the conversation so far', async () => {
  resetNative();
  behavior.tokens = ['Fine', '.'];
  await chat.sendMessage('how are you?');
  const sent = callsOf('llamaGetFormattedChat').at(-1)![1] as Array<{ role: string; content: string }>;
  assert.deepEqual(sent.map((m) => m.role), ['system', 'user', 'assistant', 'user']);
  assert.deepEqual([sent[1].content, sent[2].content, sent[3].content], ['hello', 'Hello', 'how are you?']);
  assert.equal(callsOf('llamaInitContext').length, 0, 'model stayed loaded');
});

test('background release: the guard frees RAM when idle; the next message reloads it by itself', async () => {
  resetNative();
  await life.bootstrap(); // installs the memory guard (also runs startup order against the fake storage)
  assert.equal(downloads.stateOf(spec.id).status, 'completed', 'startup refresh found the installed model');
  assert.ok(appState.memoryWarning.length >= 1 && appState.change.length >= 1);

  appState.memoryWarning.forEach((cb) => cb());
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(engine.state.status, 'unmounted');
  assert.equal(engine.state.unloadedReason, 'memory');
  assert.equal(callsOf('llamaReleaseContext').length, 1);

  const r = await chat.sendMessage('are you back?');
  assert.deepEqual(r, { ok: true });
  assert.equal(callsOf('llamaInitContext').length, 1, 'reloaded automatically');
  assert.equal(engine.state.status, 'ready');
  assert.equal(engine.state.unloadedReason, null);
  appState.change.forEach((cb) => cb('active')); // disarm any pending timer
});

test('load failure: no fabricated reply, plain cause + fix, and Try again works once the cause is gone', async () => {
  resetNative();
  await engine.unmount();
  behavior.initError = new Error('Failed to load model');
  behavior.initLogLines = [['error', 'ggml_backend_cpu_buffer_type_alloc_buffer: failed to allocate buffer of size 4294967296']];
  const before = chat.chatStore.getState().thread.messages.length;
  const r = await chat.sendMessage('this will fail');
  assert.equal(r.ok, false);
  assert.match((r as { message: string }).message, /not enough free memory/i);
  assert.match((r as { message: string }).message, /smaller model/i);
  const msgs = chat.chatStore.getState().thread.messages;
  assert.equal(msgs.length, before + 2);
  assert.deepEqual([msgs.at(-1)!.role, msgs.at(-1)!.status, msgs.at(-1)!.text], ['assistant', 'error', '']);
  assert.equal(engine.state.status, 'error');
  assert.equal(engine.state.errorKind, 'out_of_memory');
  assert.equal(settings.settingsStore.getState().pendingMountModelId, null, 'crash marker cleared after a handled failure');
  assert.equal(chat.chatStore.getState().sending, false, 'no stuck spinner');

  behavior.initError = undefined;
  behavior.initLogLines = undefined;
  const again = await chat.regenerate();
  assert.deepEqual(again, { ok: true });
  assert.equal(chat.chatStore.getState().thread.messages.at(-1)!.text, 'Hello');
  assert.equal(chat.chatStore.getState().thread.messages.filter((m) => m.text === 'this will fail').length, 1, 'retry replaced the failed turn, no duplicate question');
});

test('refusals before touching the engine: no model chosen, model not downloaded', async () => {
  resetNative();
  settings.updateSettings({ activeModelId: null });
  assert.equal(((await chat.sendMessage('x')) as { reason: string }).reason, 'no_model');
  settings.updateSettings({ activeModelId: 'qwen3.5-2b' }); // catalog model whose file is not on the phone
  const r = await chat.sendMessage('x');
  assert.equal((r as { reason: string }).reason, 'not_installed');
  assert.match((r as { message: string }).message, /not downloaded/i);
  assert.equal(callsOf('llamaInitContext').length, 0);
  assert.equal(chat.chatStore.getState().sending, false);
  settings.updateSettings({ activeModelId: spec.id });
});

test('app killed mid-answer: after a restart the saved chat opens, the question is there, the half answer is "Stopped"', async () => {
  resetNative();
  let snapshot = '';
  behavior.midStream = () => { if (!snapshot) snapshot = fs.read(threadPath()) ?? ''; };
  await chat.sendMessage('long question');
  const id = chat.chatStore.getState().thread.id;
  assert.ok(snapshot, 'a snapshot of the file was taken while streaming');

  // "Kill": the disk keeps the mid-stream snapshot; all in-memory state is lost (new chat shown, file restored to the snapshot).
  fs.store.set(`${vault}/chats/${id}.json`, { type: 'file', content: snapshot });
  chat.newChat();
  const opened = await chat.openThread(id);
  assert.ok(opened);
  const msgs = chat.chatStore.getState().thread.messages;
  assert.equal(msgs.at(-2)!.text, 'long question');
  assert.equal(msgs.at(-1)!.status, 'stopped');
});

test('app killed in the middle of replacing the chat file: the complete temp copy is found and used', async () => {
  const t = chat.chatStore.getState().thread;
  const path = `${vault}/chats/${t.id}.json`;
  const tmpPath = `${path}.tmp`;
  const content = fs.read(path)!;
  fs.store.delete(path);
  fs.store.set(tmpPath, { type: 'file', content }); // exactly what a kill between "delete old" and "rename tmp" leaves
  assert.ok((await listThreads()).some((x) => x.id === t.id), 'listed even though only the .tmp exists');
  chat.newChat();
  assert.ok(await chat.openThread(t.id));
  assert.equal(chat.chatStore.getState().thread.messages.length, t.messages.length);
});

test('kill while a model was loading is remembered, and that model is not reloaded by itself', async () => {
  await engine.unmount();
  await settings.updateSettingsNow({ pendingMountModelId: spec.id, activeModelId: spec.id });
  await engine.noteStartup();
  assert.equal(engine.state.crashedModelId, spec.id);
  assert.equal(settings.settingsStore.getState().activeModelId, null);
  assert.equal(settings.settingsStore.getState().pendingMountModelId, null);
});
