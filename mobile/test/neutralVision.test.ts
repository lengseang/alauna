import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ARCHETYPES, ARCHETYPE_KEYS, buildSystemPrompt, describePad, padToSampling } from '../src/core/persona.ts';
import { getBuiltInSoul, BUILT_IN_SOULS } from '../src/core/builtInSouls.ts';
import { compileSoulPrompt } from '../src/core/soulCompiler.ts';
import { DEFAULT_MODEL_FREEDOM } from '../src/core/modelFreedom.ts';
import { applySettingsPatch, sanitizeSettings, DEFAULT_SAMPLING } from '../src/core/settingsModel.ts';
import { MODEL_CATALOG, getModel } from '../src/core/catalog.ts';
import { buildPrompt } from '../src/core/chatPrompt.ts';
import { runAssistantTurn } from '../src/core/chatTurn.ts';
import type { GenerateParams, GenerateResult } from '../src/core/engineTypes.ts';
import {
  VISION_GROUNDING_LINE,
  autoImageBudget,
  groundSampling,
  imageTokenAllowance,
  pruneHistoryImages,
  resolveImageBudget,
  visionQuality,
} from '../src/core/visionProfile.ts';

// ------------------------------------------------------------------ Neutral soul

test('neutral: is the default soul for new installs, old saved souls are kept', () => {
  const fresh = sanitizeSettings({});
  assert.equal(fresh.archetype, 'neutral');
  assert.equal(fresh.activeSoulId, 'soul_neutral');
  const old = sanitizeSettings({ archetype: 'mentor', activeSoulId: 'soul_sage' });
  assert.equal(old.archetype, 'mentor');
  assert.equal(old.activeSoulId, 'soul_sage');
  // picking it in the Soul screen (archetype patch) selects the matching built-in soul
  assert.equal(applySettingsPatch(old, { archetype: 'neutral' }).activeSoulId, 'soul_neutral');
  assert.equal(ARCHETYPE_KEYS[0], 'neutral');
  assert.deepEqual(ARCHETYPE_KEYS.slice(1), ['empath', 'mentor', 'tactical', 'spark', 'cynic', 'visionary'], 'the six old archetypes stay');
});

test('neutral: PAD is the scale midpoint, so tone is neutral and sampling is exactly the user\'s Settings', () => {
  const pad = ARCHETYPES.neutral.defaultPAD;
  assert.deepEqual(pad, { pleasure: 0, arousal: 0.5, dominance: 0.5 });
  assert.match(describePad(pad)[0], /neutral/);
  assert.deepEqual(padToSampling(pad, 1, DEFAULT_SAMPLING), DEFAULT_SAMPLING);
  assert.match(buildSystemPrompt({ archetype: 'neutral', pad }), /no persona/i);
});

test('neutral: compiled prompt has rules but no character, builds on Model Freedom instead of duplicating it', () => {
  const soul = getBuiltInSoul('soul_neutral')!;
  assert.equal(soul.type, 'builtin');
  assert.equal(BUILT_IN_SOULS[0].id, 'soul_neutral');
  const { systemPrompt } = compileSoulPrompt({ soul, freedom: DEFAULT_MODEL_FREEDOM });
  assert.match(systemPrompt, /no persona/i);
  assert.match(systemPrompt, /do not lecture or moralise/i);
  assert.match(systemPrompt, /do not role-play unless asked/i);
  assert.match(systemPrompt, /Do not add generic disclaimers/);
  assert.match(systemPrompt, /play a character, stay fully in it/);
  assert.doesNotMatch(systemPrompt, /embodying|Character background|Speech and voice|Relationship stance|Stay entirely in character/);
  const sage = compileSoulPrompt({ soul: getBuiltInSoul('soul_sage')!, freedom: DEFAULT_MODEL_FREEDOM }).systemPrompt;
  assert.match(sage, /embodying/, 'character souls keep the full prompt');
  assert.match(sage, /Stay entirely in character/);
});

// ------------------------------------------------------------------ Vision budget

test('vision budget: Auto is per family, a number overrides, fixed projectors keep their own default', () => {
  const qwen = { min: 256, max: 1280 };
  assert.deepEqual(autoImageBudget(getModel('qwen3-vl-4b')!), qwen);
  assert.deepEqual(autoImageBudget(getModel('qwen3.5-4b')!), qwen);
  assert.deepEqual(autoImageBudget(getModel('qwen2.5-vl-7b')!), qwen);
  assert.deepEqual(autoImageBudget(getModel('gemma-4-e4b')!), { min: 140, max: 560 });
  assert.deepEqual(autoImageBudget(getModel('gemma-3-4b')!), { min: -1, max: -1 });
  assert.deepEqual(autoImageBudget(getModel('smolvlm2-2.2b')!), { min: -1, max: -1 });
  assert.deepEqual(autoImageBudget({ id: 'x', family: 'Other', chatTemplate: 'chatml' }), { min: 64, max: 512 });
  const spec = getModel('qwen3-vl-4b')!;
  assert.deepEqual(resolveImageBudget(spec, 0), qwen);
  assert.deepEqual(resolveImageBudget(spec, undefined), qwen);
  assert.deepEqual(resolveImageBudget(spec, 768), { min: 256, max: 768 });
  assert.deepEqual(resolveImageBudget(spec, 128), { min: 128, max: 128 });
  assert.equal(imageTokenAllowance(spec, 0), 1280);
  assert.equal(imageTokenAllowance(getModel('gemma-3-4b')!, 0), 256);
});

test('vision settings: the old flat 512 default migrates to Auto, an explicit v3 choice stays', () => {
  assert.equal(sanitizeSettings({}).compute.imageMaxTokens, 0);
  assert.equal(sanitizeSettings({ version: 2, compute: { imageMaxTokens: 512 } }).compute.imageMaxTokens, 0);
  assert.equal(sanitizeSettings({ version: 2, compute: { imageMaxTokens: 768 } }).compute.imageMaxTokens, 768);
  assert.equal(sanitizeSettings({ version: 3, compute: { imageMaxTokens: 512 } }).compute.imageMaxTokens, 512);
});

// ------------------------------------------------------------------ Vision quality hint

test('vision quality: every image model has an honest class, text-only models have none', () => {
  const cls = (id: string) => visionQuality(getModel(id)!)?.quality;
  for (const m of MODEL_CATALOG) {
    const v = visionQuality(m);
    if (m.capabilities.includes('Image')) assert.ok(v && v.label.startsWith('Vision: '), m.id);
    else assert.equal(v, null, m.id);
  }
  assert.equal(cls('qwen2.5-vl-7b'), 'best');
  assert.equal(cls('gemma-4-e4b'), 'best');
  assert.equal(cls('gemma-4-12b'), 'best');
  assert.equal(cls('qwen3-vl-4b'), 'fair');
  assert.equal(cls('moondream2'), 'weak');
  assert.equal(cls('smolvlm2-2.2b'), 'weak');
  assert.equal(cls('qwen2.5-vl-3b-abliterated'), 'weak');
  assert.equal(cls('qwen3-1.7b'), undefined);
});

// ------------------------------------------------------------------ Grounded image turns

test('vision sampling: low temperature and top_k 20, never raises the user\'s values', () => {
  assert.deepEqual(
    groundSampling({ ...DEFAULT_SAMPLING, temperature: 0.9, topK: 40, repeatPenalty: 1.1 }),
    { ...DEFAULT_SAMPLING, temperature: 0.2, topK: 20, repeatPenalty: 1.05 },
  );
  const low = groundSampling({ ...DEFAULT_SAMPLING, temperature: 0.1, topK: 0 });
  assert.equal(low.temperature, 0.1);
  assert.equal(low.topK, 20);
});

test('vision history: a new image drops older images; a text follow-up keeps only the newest', () => {
  const h = [
    { role: 'user' as const, content: 'first', images: ['/a.jpg'] },
    { role: 'assistant' as const, content: 'ok' },
    { role: 'user' as const, content: 'second', images: ['/b.jpg'] },
    { role: 'assistant' as const, content: 'ok2' },
  ];
  const withNew = pruneHistoryImages(h, true);
  assert.deepEqual(withNew.map((m) => m.images), [undefined, undefined, undefined, undefined]);
  assert.match(withNew[0].content, /no longer in context/);
  const followUp = pruneHistoryImages(h, false);
  assert.equal(followUp[0].images, undefined);
  assert.deepEqual(followUp[2].images, ['/b.jpg']);
  assert.equal(h[0].images?.length, 1, 'input is not mutated');
});

test('vision prompt: the per-image allowance drives history trimming, the new image stays', () => {
  const history = [{ role: 'user' as const, content: 'x'.repeat(40), images: ['/old.jpg'] }, { role: 'assistant' as const, content: 'y' }];
  const big = buildPrompt({ system: 's', history, userMessage: 'what is this', userImages: ['/new.jpg'], nCtx: 2048, replyBudget: 512, imageTokens: 1280 });
  assert.equal(big.droppedMessages, 2, 'a 1280-token old image does not fit next to the new one in 1536 tokens');
  assert.deepEqual(big.messages.at(-1)?.images, ['/new.jpg']);
  const small = buildPrompt({ system: 's', history: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'yo' }], userMessage: 'what is this', userImages: ['/new.jpg'], nCtx: 2048, replyBudget: 512, imageTokens: 256 });
  assert.equal(small.droppedMessages, 0);
});

test('vision turn: grounding line and low-temperature sampling only on image turns, only this turn\'s images', async () => {
  const spec = getModel('qwen3-vl-4b')!;
  const seen: GenerateParams[] = [];
  const generate = async (p: GenerateParams): Promise<GenerateResult> => {
    seen.push(p);
    return { text: 'a cat', promptTokens: 10, generatedTokens: 2, promptMs: 1, predictedMs: 1, tokensPerSecond: 1, interrupted: false, contextFull: false, thinkingForcedOpen: false };
  };
  const common = {
    history: [{ role: 'user' as const, content: 'earlier', images: ['/old.jpg'] }, { role: 'assistant' as const, content: 'a dog' }],
    spec,
    nCtx: 4096,
    system: 'SYS',
    thinkingEnabled: false,
    sampling: { ...DEFAULT_SAMPLING },
    generate,
    now: () => 0,
    onUpdate: () => undefined,
    imageTokens: 1280,
  };
  await runAssistantTurn({ ...common, userText: 'what is this?', attachments: [{ kind: 'image', name: 'p.jpg', content: '', truncated: false, path: '/new.jpg', mime: 'image/jpeg' }] });
  const img = seen[0];
  assert.ok(img.messages[0].content.includes(VISION_GROUNDING_LINE));
  assert.equal(img.temperature, 0.2);
  assert.equal(img.sampling?.topK, 20);
  assert.deepEqual(img.messages.flatMap((m) => m.images ?? []), ['/new.jpg'], 'the older image is not re-sent');
  const last = img.messages.at(-1)!;
  assert.equal(last.images?.length, 1, 'the image travels with the user turn (llama.rn puts it before the text)');

  await runAssistantTurn({ ...common, userText: 'and now?', attachments: [] });
  const text = seen[1];
  assert.ok(!text.messages[0].content.includes(VISION_GROUNDING_LINE));
  assert.equal(text.temperature, DEFAULT_SAMPLING.temperature);
  assert.deepEqual(text.messages.flatMap((m) => m.images ?? []), ['/old.jpg'], 'a text follow-up keeps the newest image');
});

// ------------------------------------------------------------------ Image Studio honesty

test('image studio: no fabricated generation path, UI says the engine is missing', () => {
  const ui = readFileSync(new URL('../src/ui/imageGen/ImageStudioScreen.tsx', import.meta.url), 'utf8');
  assert.match(ui, /Engine not in this build/);
});
