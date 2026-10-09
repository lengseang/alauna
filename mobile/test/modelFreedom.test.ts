import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MODEL_FREEDOM,
  FREEDOM_MODE_PRESETS,
  sanitizeModelFreedom,
  compileModelFreedomDirectives,
  getModelCompatibility,
  type ModelFreedomSettings,
} from '../src/core/modelFreedom.ts';
import { sanitizeSoul } from '../src/core/soulSchema.ts';
import { getBuiltInSoul } from '../src/core/builtInSouls.ts';
import { compileSoulPrompt } from '../src/core/soulCompiler.ts';

test('modelFreedom: DEFAULT_MODEL_FREEDOM provides independent non-bundled defaults', () => {
  assert.equal(DEFAULT_MODEL_FREEDOM.mode, 'unfiltered');
  assert.equal(DEFAULT_MODEL_FREEDOM.adultContent, true);
  assert.equal(DEFAULT_MODEL_FREEDOM.explicitVocabulary, true);
  assert.equal(DEFAULT_MODEL_FREEDOM.eroticRoleplay, true);
  assert.equal(DEFAULT_MODEL_FREEDOM.profanity, 'authentic');
  assert.equal(DEFAULT_MODEL_FREEDOM.darkFiction, true);
  assert.equal(DEFAULT_MODEL_FREEDOM.morallyGrayCharacters, true);
  assert.equal(DEFAULT_MODEL_FREEDOM.aggressiveVoices, true);
  assert.equal(DEFAULT_MODEL_FREEDOM.challengeUser, true);
  assert.equal(DEFAULT_MODEL_FREEDOM.disclaimerPolicy, 'none');
  assert.equal(DEFAULT_MODEL_FREEDOM.characterFidelity, 'strict');
  assert.equal(DEFAULT_MODEL_FREEDOM.refusalTransparency, true);
  assert.equal(DEFAULT_MODEL_FREEDOM.nsfwCreativeFreedom, true);
  assert.equal(DEFAULT_MODEL_FREEDOM.adultGateAcknowledged, false);
});

test('modelFreedom: presets for standard, relaxed, and unfiltered are distinct', () => {
  const std = FREEDOM_MODE_PRESETS.standard;
  const rel = FREEDOM_MODE_PRESETS.relaxed;
  const unf = FREEDOM_MODE_PRESETS.unfiltered;

  assert.equal(std.mode, 'standard');
  assert.equal(std.adultContent, false);
  assert.equal(std.nsfwCreativeFreedom, false);
  assert.equal(std.disclaimerPolicy, 'standard');

  assert.equal(rel.mode, 'relaxed');
  assert.equal(rel.adultContent, false);
  assert.equal(rel.darkFiction, true);
  assert.equal(rel.disclaimerPolicy, 'minimal');

  assert.equal(unf.mode, 'unfiltered');
  assert.equal(unf.adultContent, true);
  assert.equal(unf.explicitVocabulary, true);
  assert.equal(unf.eroticRoleplay, true);
  assert.equal(unf.nsfwCreativeFreedom, true);
  assert.equal(unf.disclaimerPolicy, 'none');
});

test('modelFreedom: sanitizeModelFreedom backward-compatible migration of v1 7-field format', () => {
  const v1Legacy = {
    profanityAndBluntness: 'unfiltered',
    complexFictionalThemes: true,
    characterFidelity: 'strict_anti_break',
    challengeUser: true,
    adultFictionalExpression: true,
    nsfwCreativeFreedom: true,
    disclaimerPolicy: 'none',
  };

  const migrated = sanitizeModelFreedom(v1Legacy);
  assert.equal(migrated.mode, 'unfiltered');
  assert.equal(migrated.profanity, 'unfiltered');
  assert.equal(migrated.darkFiction, true);
  assert.equal(migrated.morallyGrayCharacters, true);
  assert.equal(migrated.characterFidelity, 'strict');
  assert.equal(migrated.challengeUser, true);
  assert.equal(migrated.adultContent, true);
  assert.equal(migrated.nsfwCreativeFreedom, true);
  assert.equal(migrated.adultGateAcknowledged, true);
});

test('modelFreedom: Standard mode emits zero adult or disclaimer directives', () => {
  const stdSettings: ModelFreedomSettings = {
    ...FREEDOM_MODE_PRESETS.standard,
    adultGateAcknowledged: false,
  };
  const directives = compileModelFreedomDirectives(stdSettings);
  const text = directives.join(' ');
  assert.ok(!text.includes('NSFW'), 'Standard mode must not emit NSFW directives');
  assert.ok(!text.includes('erotic'), 'Standard mode must not emit erotic directives');
  assert.ok(!text.includes('disclaimers'), 'Standard mode must not suppress disclaimers');
});

test('modelFreedom: Relaxed mode emits dark themes and minimal disclaimers but no adult content', () => {
  const relSettings: ModelFreedomSettings = {
    ...FREEDOM_MODE_PRESETS.relaxed,
    adultGateAcknowledged: false,
  };
  const directives = compileModelFreedomDirectives(relSettings);
  const text = directives.join(' ');
  assert.ok(text.includes('Minimize unsolicited disclaimers'));
  assert.ok(text.includes('dark thematic elements'));
  assert.ok(text.includes('morally ambiguous'));
  assert.ok(!text.includes('NSFW'), 'Relaxed mode must not emit NSFW directives');
  assert.ok(!text.includes('erotic'), 'Relaxed mode must not emit erotic roleplay directives');
});

test('modelFreedom: Unfiltered mode requires adult gate acknowledgment before emitting adult directives', () => {
  // Gate NOT acknowledged:
  const ungated: ModelFreedomSettings = {
    ...FREEDOM_MODE_PRESETS.unfiltered,
    adultGateAcknowledged: false,
  };
  const ungatedDirectives = compileModelFreedomDirectives(ungated);
  const ungatedText = ungatedDirectives.join(' ');
  assert.ok(!ungatedText.includes('NSFW'), 'Must not emit NSFW if gate is unacknowledged');
  assert.ok(!ungatedText.includes('sexual vocabulary'), 'Must not emit explicit vocabulary if gate is unacknowledged');

  // Gate ACKNOWLEDGED:
  const gated: ModelFreedomSettings = {
    ...FREEDOM_MODE_PRESETS.unfiltered,
    adultGateAcknowledged: true,
  };
  const gatedDirectives = compileModelFreedomDirectives(gated);
  const gatedText = gatedDirectives.join(' ');
  assert.ok(gatedText.includes('NSFW & Mature Creative Immersion'));
  assert.ok(gatedText.includes('explicit, direct sexual vocabulary'));
  assert.ok(gatedText.includes('erotic roleplay scenarios'));
  assert.ok(gatedText.includes('Do not add generic disclaimers'));
});

test('modelFreedom: Chapter 09 intimacy fields sanitize with safe defaults', () => {
  const rawSoul = {
    id: 'soul_test_intimacy',
    intimacy: {
      enabled: true,
      romanceStyle: 'passionate',
      flirtationIntensity: 'bold',
      initiative: 'proactive',
      sensualExpression: 'explicit',
      comfortDiscussingSexuality: 'natural_and_uninhibited',
      relationshipPacing: 'fast_paced',
      narrationStyle: 'mixed',
      expressionTone: 'direct',
      preferredScenarios: ['sensual romance', 'dramatic confrontation'],
      characterization: 'physical',
      sceneContinuity: true,
      oocControls: true,
      boundaries: ['non-consensual acts strictly prohibited'],
    },
  };

  const sanitized = sanitizeSoul(rawSoul, 'test_intimacy');
  assert.ok(sanitized.intimacy);
  assert.equal(sanitized.intimacy.enabled, true);
  assert.equal(sanitized.intimacy.romanceStyle, 'passionate');
  assert.equal(sanitized.intimacy.flirtationIntensity, 'bold');
  assert.equal(sanitized.intimacy.sensualExpression, 'explicit');
  assert.equal(sanitized.intimacy.expressionTone, 'direct');
  assert.equal(sanitized.intimacy.characterization, 'physical');
  assert.equal(sanitized.intimacy.sceneContinuity, true);
  assert.equal(sanitized.intimacy.oocControls, true);
  assert.deepEqual(sanitized.intimacy.preferredScenarios, ['sensual romance', 'dramatic confrontation']);
  assert.deepEqual(sanitized.intimacy.boundaries, ['non-consensual acts strictly prohibited']);
});

test('modelCompiler: compiles priority order per spec §4 and formats Chapter 09 intimacy', () => {
  const companion = getBuiltInSoul('soul_companion')!;
  const freedom: ModelFreedomSettings = {
    ...DEFAULT_MODEL_FREEDOM,
    adultGateAcknowledged: true,
  };

  const compiled = compileSoulPrompt({
    soul: companion,
    freedom,
    tokenBudget: 1000,
  });

  const prompt = compiled.systemPrompt;

  // Verify priority order:
  // 1. Identity comes first
  const identityIdx = prompt.indexOf('You are CHIWIWI, embodying Intimate Companion');
  // 2. Interaction guidelines (freedom directives) come next
  const freedomIdx = prompt.indexOf('Interaction guidelines:');
  // 3. Speech directives
  const speechIdx = prompt.indexOf('Speech and voice directives:');
  // 4. Intimate character expression (Chapter 09)
  const intimacyIdx = prompt.indexOf('Intimate character expression:');

  assert.ok(identityIdx !== -1, 'Identity section must exist');
  assert.ok(freedomIdx !== -1, 'Freedom guidelines section must exist');
  assert.ok(speechIdx !== -1, 'Speech directives must exist');
  assert.ok(intimacyIdx !== -1, 'Intimacy section must exist');

  assert.ok(identityIdx < freedomIdx, 'Identity must precede Freedom guidelines');
  assert.ok(freedomIdx < speechIdx, 'Freedom guidelines must precede Speech directives');
  assert.ok(speechIdx < intimacyIdx, 'Speech directives must precede Intimacy section');

  // Verify Chapter 09 content
  assert.ok(prompt.includes('Romantic disposition: passionate romance style with bold flirtation'));
  assert.ok(prompt.includes('Sensual & physical expression: expressive sensuality, sensual tone'));
  assert.ok(prompt.includes('Scene continuity: Maintain atmospheric immersion'));
  assert.ok(prompt.includes('Out-of-character controls: Honor user OOC remarks'));
});

test('modelFreedom: model compatibility registry returns undefined for unknown models', () => {
  const result = getModelCompatibility('nonexistent-model-xyz');
  assert.equal(result, undefined);
});
