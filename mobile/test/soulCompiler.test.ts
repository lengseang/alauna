import test from 'node:test';
import assert from 'node:assert/strict';
import { getBuiltInSoul } from '../src/core/builtInSouls.ts';
import { mergeSoul, compileSoulPrompt } from '../src/core/soulCompiler.ts';
import type { TraitPack } from '../src/core/soulSchema.ts';
import { initThreadEmotionalState } from '../src/core/soulRuntime.ts';

test('soulCompiler: merges modular packs and thread overrides deterministically', () => {
  const base = getBuiltInSoul('soul_analyst')!;
  const speechPack: TraitPack = {
    id: 'pack_poetic',
    name: 'Poetic Speech',
    kind: 'speech',
    description: 'Poetic sentence rhythm',
    createdAt: Date.now(),
    data: { sentenceRhythm: 'poetic', humor: 'sarcastic' },
  };

  const merged = mergeSoul(base, [speechPack], {
    identity: { ...base.identity, name: 'Custom Analyst' },
  });

  assert.equal(merged.identity.name, 'Custom Analyst');
  assert.equal(merged.speech.sentenceRhythm, 'poetic');
  assert.equal(merged.speech.humor, 'sarcastic');
  assert.equal(merged.speech.formality, 'formal', 'Retained original formality');
});

test('soulCompiler: synthesizes 9 chapters, freedom directives, emotions and graph triples within token budget', () => {
  const soul = getBuiltInSoul('soul_sage')!;
  const runtime = initThreadEmotionalState('t_1', soul);
  runtime.activeEmotions['curiosity'] = 95; // High spike

  const res = compileSoulPrompt({
    soul,
    runtimeState: runtime,
    knowledgeTriples: [
      { sourceLabel: 'User', relation: 'develops', targetLabel: 'CHIWIWI', weight: 0.9 },
      { sourceLabel: 'CHIWIWI', relation: 'runs_on', targetLabel: 'Galaxy S23', weight: 0.8 },
    ],
    userMemories: ['User prefers concise code'],
    tokenBudget: 900,
  });

  assert.ok(res.estimatedTokens <= 900, `Estimated tokens ${res.estimatedTokens} must fit within 900`);
  assert.ok(res.systemPrompt.includes('Sovereign Sage'));
  assert.ok(res.systemPrompt.includes('Stay entirely in character'));
  assert.ok(res.systemPrompt.includes('curiosity'));
  assert.ok(res.systemPrompt.includes('User (develops) CHIWIWI'));
  assert.ok(res.systemPrompt.includes('User prefers concise code'));
  assert.equal(res.knowledgeTriplesIncluded, 2);
});
