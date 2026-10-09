/** v2 settings schema, Soul (PAD -> prompt + sampling), memory vault budget. Pure core, no phone. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { applySettingsPatch, DEFAULT_SAMPLING, DEFAULT_SETTINGS, importLegacyDownloads, MAX_AUTO_PURGE_DAYS, sanitizeSettings } from '../src/core/settingsModel.ts';
import { ARCHETYPE_KEYS, ARCHETYPES, buildSystemPrompt, padToSampling } from '../src/core/persona.ts';
import { addFact, editFact, MAX_MEMORY_CHARS, memoryBudget, sanitizeFacts, setFactPaused, activeFactTexts, type MemoryFact } from '../src/core/memory.ts';
import { effectiveSoul, newThread, sanitizeThread, staleThreadIds, threadMatch, toHistory, makeImageAttachment, withAttachments } from '../src/core/chatTypes.ts';
import { buildPrompt } from '../src/core/chatPrompt.ts';

test('settings v2: a v1 file migrates (threads / GPU / context move into compute, mirrors stay readable)', () => {
  const v1 = { archetype: 'mentor', threads: 6, useGpu: true, contextOverride: 8192, thinkingEnabled: false, activeModelId: 'qwen3.5-4b' };
  const s = sanitizeSettings(v1);
  assert.equal(s.version, 2);
  assert.deepEqual([s.compute.threads, s.compute.backend, s.compute.nCtx], [6, 'gpu', 8192]);
  assert.deepEqual([s.threads, s.useGpu, s.contextOverride], [6, true, 8192], 'v1 mirrors');
  assert.equal(s.archetype, 'mentor');
  assert.equal(s.thinkingEnabled, false);
  // every v2 section gets defaults
  assert.deepEqual(s.sampling, DEFAULT_SAMPLING);
  assert.equal(s.offlineStrict, true);
  assert.equal(s.autoPurgeDays, 0, 'auto-delete of chats is never on by default');
  assert.equal(s.compute.kvSessionCache, true);
  assert.deepEqual(s.downloads, { parallel: 1 });
});

test('settings v2: every field is validated and clamped on its own', () => {
  const s = sanitizeSettings({
    compute: { backend: 'npu', nGpuLayers: -4, threads: 99, nCtx: 1e9, nBatch: 99999, flashAttn: 'maybe', cacheTypeK: 'q8_0', cacheTypeV: 'q2', useMmap: 'yes', useMlock: true },
    sampling: { temperature: -5, topP: 7, topK: 9999, minP: 'x', repeatPenalty: 0.2 },
    speculative: { enabled: true, draftModelId: '', nDraft: 100, pMin: 2 },
    stt: { model: '', vadThreshold: 3 },
    tts: { enabled: false, voiceId: 'en-us-x', rate: 9, pitch: 0 },
    autoPurgeDays: 1e9,
    appearance: { theme: 'neon', textScale: 9, haptics: false, reducedMotion: true },
    storage: { modelSlotId: 42 },
    downloads: { parallel: 99 },
    pad: { pleasure: 5, arousal: -1, dominance: 0.5 },
    toneIntensity: 0,
    activePresetIndex: -3,
  });
  assert.deepEqual(s.compute, {
    backend: 'cpu', nGpuLayers: 0, threads: null, nCtx: 32768, nBatch: 2048, flashAttn: 'auto',
    cacheTypeK: 'q8_0', cacheTypeV: 'f16', useMmap: true, useMlock: true, kvSessionCache: true,
  });
  assert.deepEqual(s.sampling, { temperature: 0, topP: 1, topK: 200, minP: DEFAULT_SAMPLING.minP, repeatPenalty: 1 });
  assert.deepEqual(s.speculative, { enabled: true, draftModelId: null, nDraft: 16, pMin: 1 });
  assert.deepEqual(s.stt, { model: 'whisper-tiny', vadThreshold: 1 });
  assert.deepEqual(s.tts, { enabled: false, voiceId: 'en-us-x', rate: 2, pitch: 0.5 });
  assert.equal(s.autoPurgeDays, MAX_AUTO_PURGE_DAYS);
  assert.deepEqual(s.appearance, { theme: 'system', textScale: 1.5, haptics: false, reducedMotion: true });
  assert.deepEqual(s.storage, { modelSlotId: null });
  assert.deepEqual(s.downloads, { parallel: 4 });
  assert.deepEqual(s.pad, { pleasure: 1, arousal: 0, dominance: 0.5 }, 'PAD clamped to its ranges');
  assert.equal(s.toneIntensity, 0.1);
  assert.equal(s.activePresetIndex, 0);
  assert.deepEqual(sanitizeSettings({ downloads: { parallel: -5 } }).downloads, { parallel: 1 });
});

test('settings v2: full round-trip is lossless; defaults are fresh objects', () => {
  const custom = applySettingsPatch(DEFAULT_SETTINGS, {
    compute: { ...DEFAULT_SETTINGS.compute, backend: 'gpu', nGpuLayers: 20, flashAttn: 'on', cacheTypeK: 'q8_0', cacheTypeV: 'q8_0', useMmap: false, kvSessionCache: false, nBatch: 256, threads: 4, nCtx: 6144 },
    sampling: { temperature: 0.4, topP: 0.8, topK: 20, minP: 0.1, repeatPenalty: 1.2 },
    speculative: { enabled: true, draftModelId: 'mtp', nDraft: 3, pMin: 0.5 },
    tts: { enabled: false, voiceId: 'v1', rate: 1.2, pitch: 0.9 },
    offlineStrict: false, incognitoDefault: true, biometricLock: true, autoPurgeDays: 30,
    appearance: { theme: 'nyx', textScale: 1.15, haptics: false, reducedMotion: true },
    storage: { modelSlotId: 'folder-x' },
    downloads: { parallel: 3 },
    customBackstory: 'Call me Leng.',
  });
  assert.deepEqual(sanitizeSettings(JSON.parse(JSON.stringify(custom))), custom);
  const a = sanitizeSettings(null);
  a.compute.threads = 3;
  a.sampling.temperature = 2;
  assert.equal(DEFAULT_SETTINGS.compute.threads, null);
  assert.equal(DEFAULT_SETTINGS.sampling.temperature, 0.7);
});

test('settings v2: legacy chiwiwi_downloads.json migrates into downloads.parallel', () => {
  assert.deepEqual(importLegacyDownloads({ concurrency: 3 }), { parallel: 3 });
  assert.deepEqual(importLegacyDownloads({ concurrency: 1 }), { parallel: 1 });
  assert.equal(importLegacyDownloads({ concurrency: 0 }), null);
  assert.equal(importLegacyDownloads({ concurrency: 5 }), null);
  assert.equal(importLegacyDownloads(null), null);
  assert.equal(importLegacyDownloads('garbage'), null);
});

test('settings v2: v1 setters write through to compute; compute writes update the v1 mirrors', () => {
  let s = applySettingsPatch(DEFAULT_SETTINGS, { threads: 8, useGpu: true, contextOverride: 2048 });
  assert.deepEqual([s.compute.threads, s.compute.backend, s.compute.nCtx], [8, 'gpu', 2048]);
  s = applySettingsPatch(s, { compute: { ...s.compute, backend: 'cpu', threads: null, nCtx: null } });
  assert.deepEqual([s.threads, s.useGpu, s.contextOverride], [null, false, null]);
  s = applySettingsPatch(s, { contextOverride: 10_000_000 });
  assert.equal(s.compute.nCtx, 32768, 'patches are clamped too');
});

test('soul: the six archetypes of the old app are back with their PAD defaults', () => {
  assert.deepEqual(ARCHETYPE_KEYS, ['empath', 'mentor', 'tactical', 'spark', 'cynic', 'visionary']);
  assert.deepEqual(ARCHETYPES.cynic.defaultPAD, { pleasure: -0.35, arousal: 0.6, dominance: 0.9 });
  assert.deepEqual(ARCHETYPES.visionary.defaultPAD, { pleasure: 0.5, arousal: 0.65, dominance: 0.85 });
  assert.match(buildSystemPrompt({ archetype: 'cynic', pad: ARCHETYPES.cynic.defaultPAD }), /red-team/);
  assert.match(buildSystemPrompt({ archetype: 'cynic', pad: ARCHETYPES.cynic.defaultPAD }), /Tone: blunt/);
});

test('soul: PAD -> sampling is deterministic, documented and bounded', () => {
  const base = DEFAULT_SAMPLING;
  // neutral arousal/dominance = the user's defaults, whatever the pleasure (warmth is prompt-only)
  for (const pleasure of [-1, 0, 1]) assert.deepEqual(padToSampling({ pleasure, arousal: 0.5, dominance: 0.5 }, 1, base), base);
  const hot = padToSampling({ pleasure: 0, arousal: 1, dominance: 1 }, 1, base);
  assert.deepEqual(hot, { temperature: 0.9, topP: 0.95, topK: 50, minP: 0.05, repeatPenalty: 1.15 });
  const calm = padToSampling({ pleasure: 0, arousal: 0, dominance: 0 }, 1, base);
  assert.deepEqual(calm, { temperature: 0.5, topP: 0.85, topK: 30, minP: 0.05, repeatPenalty: 1.05 });
  // intensity scales the effect; same input -> same output
  const half = padToSampling({ pleasure: 0, arousal: 1, dominance: 1 }, 0.5, base);
  assert.deepEqual(half, { temperature: 0.8, topP: 0.925, topK: 45, minP: 0.05, repeatPenalty: 1.125 });
  assert.deepEqual(padToSampling({ pleasure: 0, arousal: 1, dominance: 1 }, 0.5, base), half);
  // bounds hold for extreme bases
  const wild = padToSampling({ pleasure: 0, arousal: 1, dominance: 1 }, 1, { temperature: 1.9, topP: 1, topK: 200, minP: 0, repeatPenalty: 1.49 });
  assert.ok(wild.temperature <= 1.5 && wild.topP <= 1 && wild.topK <= 200 && wild.repeatPenalty <= 1.5);
  assert.equal(padToSampling({ pleasure: 0, arousal: 1, dominance: 1 }, 1, { ...base, topK: 0 }).topK, 0, 'top_k 0 (off) stays off');
});

test('soul: a chat follows the global soul unless it overrides it; v1 chat files keep their own soul', () => {
  const global = { archetype: 'spark' as const, pad: ARCHETYPES.spark.defaultPAD, toneIntensity: 0.8 };
  const t = newThread('empath', ARCHETYPES.empath.defaultPAD);
  assert.equal(t.soulOverride, false);
  assert.equal(effectiveSoul(t, global).archetype, 'spark');
  assert.equal(effectiveSoul({ ...t, soulOverride: true }, global).archetype, 'empath');
  const v1 = sanitizeThread({ id: 'thread_abc', soul: { archetype: 'mentor' }, messages: [] })!;
  assert.equal(v1.soulOverride, true);
  assert.equal(v1.pinned, false);
});

test('memory vault: edit, pause, and the EXACT budget that reaches the prompt', () => {
  let facts: MemoryFact[] = [];
  const add = (text: string, id: string) => {
    const r = addFact(facts, text, 2, id);
    assert.ok(r.ok);
    facts = r.facts;
  };
  add('I live in Phnom Penh', 'a');
  add('My name is Leng', 'b');
  add('I prefer short answers', 'c');
  const e = editFact(facts, 'b', '  My name is   Leng Seang ', 3);
  assert.ok(e.ok);
  facts = e.facts;
  assert.equal(facts[1].text, 'My name is Leng Seang');
  assert.equal(editFact(facts, 'b', 'I live in Phnom Penh', 4).ok, false, 'duplicate of another fact refused');
  facts = setFactPaused(facts, 'a', true);
  assert.deepEqual(activeFactTexts(facts), ['My name is Leng Seang', 'I prefer short answers']);

  const budget = memoryBudget(facts);
  assert.deepEqual(budget.included.map((f) => f.id), ['b', 'c']);
  assert.deepEqual(budget.paused.map((f) => f.id), ['a']);
  assert.equal(budget.usedChars, 'My name is Leng Seang'.length + 'I prefer short answers'.length);
  assert.ok(budget.estimatedTokens > 0);
  const prompt = buildSystemPrompt({ archetype: 'empath', pad: ARCHETYPES.empath.defaultPAD, memories: activeFactTexts(facts) });
  assert.ok(prompt.includes(budget.promptBlock), 'the budget block is byte-for-byte what the system prompt contains');
  assert.ok(!prompt.includes('Phnom Penh'), 'paused fact never reaches the model');
  assert.deepEqual(sanitizeFacts(JSON.parse(JSON.stringify(facts))), facts, 'paused/updatedAt survive a save');

  // over budget: the first fact that does not fit ends the list
  const long = Array.from({ length: 6 }, (_, i) => ({ id: `l${i}`, text: `${i}`.repeat(190), createdAt: 0 }));
  const b2 = memoryBudget(long);
  assert.equal(b2.included.length, 3);
  assert.equal(b2.overBudget.length, 3);
  assert.ok(b2.usedChars <= MAX_MEMORY_CHARS);
});

test('threads: search, auto-purge rule, image attachments travel as images (not text)', () => {
  const t = { title: 'Trip plan', messages: [{ id: 'm', role: 'user' as const, text: 'Book the train to Kampot on Friday', createdAt: 0, status: 'done' as const }] };
  assert.equal(threadMatch(t, 'kampot')?.snippet.includes('Kampot'), true);
  assert.equal(threadMatch(t, 'trip')?.snippet, 'Trip plan');
  assert.equal(threadMatch(t, 'zebra'), null);

  const day = 86_400_000;
  const now = 100 * day;
  const metas = [
    { id: 'old', updatedAt: now - 40 * day },
    { id: 'pinned-old', updatedAt: now - 400 * day, pinned: true },
    { id: 'new', updatedAt: now - 2 * day },
  ];
  assert.deepEqual(staleThreadIds(metas, 30, now), ['old']);
  assert.deepEqual(staleThreadIds(metas, 0, now), [], '0 = off');

  const img = makeImageAttachment('cat.jpg', 'file:///data/vault/media/cat.jpg', 'image/jpeg');
  assert.equal(img.path, '/data/vault/media/cat.jpg');
  assert.equal(withAttachments('what is this?', [img]), 'what is this?', 'image is not pasted into the text');
  const hist = toHistory([{ id: 'u', role: 'user', text: 'what is this?', attachments: [img], createdAt: 0, status: 'done' }]);
  assert.deepEqual(hist, [{ role: 'user', content: 'what is this?', images: ['/data/vault/media/cat.jpg'] }]);
  const built = buildPrompt({ system: 'sys', history: hist, userMessage: 'and this?', userImages: ['/x/dog.png'], nCtx: 4096, replyBudget: 1000 });
  assert.deepEqual(built.messages.at(-1), { role: 'user', content: 'what is this?\n\nand this?', images: ['/data/vault/media/cat.jpg', '/x/dog.png'] });
  assert.ok(built.estimatedPromptTokens >= 2 * 768, 'images are counted in the prompt budget');
});

test('model card: a queued download says Queued (not "Not downloaded") and can be cancelled', async () => {
  const { deriveModelStatus, actionsFor } = await import('../src/core/modelStatus.ts');
  const { IDLE_STATE } = await import('../src/core/downloadManager.ts');
  const s = deriveModelStatus({ modelId: 'x', download: { ...IDLE_STATE, status: 'queued' }, engine: { status: 'unmounted', modelId: null, stage: null, loadProgress: 0 }, verified: false });
  assert.equal(s.kind, 'queued');
  assert.deepEqual(actionsFor(s.kind, false), ['cancel']);
});
