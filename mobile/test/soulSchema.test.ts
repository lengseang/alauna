import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeSoul,
  SOUL_CATEGORIES,
  DEFAULT_TEMPERAMENT,
  duplicateSoulDef,
  exportSoulDefJson,
  importSoulDefJson,
} from '../src/core/soulSchema.ts';
import { BUILT_IN_SOULS, BUILT_IN_SOUL_MAP, getBuiltInSoul } from '../src/core/builtInSouls.ts';

test('soulSchema: sanitizes garbage and returns a complete 9-chapter document', () => {
  const s = sanitizeSoul(null, 'test_fallback');
  assert.equal(s.id, 'test_fallback');
  assert.equal(s.version, 1);
  assert.equal(s.category, 'sage');
  assert.equal(s.identity.name, 'Unnamed Soul');
  assert.equal(s.identity.avatar.type, 'glyph');
  assert.equal(s.identity.avatar.glyph, 'persona');
  assert.deepEqual(s.psychology.temperament, DEFAULT_TEMPERAMENT);
  assert.ok(s.psychology.emotions.length > 0);
  assert.equal(s.speech.formality, 'moderate');
  assert.equal(s.relationships.defaultType, 'friend');
  assert.equal(s.behavior.answeringStyle, 'Clear and helpful');
  assert.equal(s.memoryPolicy.allowAutoMemoryExtraction, true);
  assert.equal(s.intimacy, undefined);
});

test('soulSchema: clamps temperament and emotion values within 0..100', () => {
  const s = sanitizeSoul({
    id: 'soul_test',
    psychology: {
      temperament: { sociability: 9999, stability: -500 },
      expressionThreshold: 150,
      emotions: [{ emotion: 'joy', baseline: -10, reactivity: 200 }],
    },
  });
  assert.equal(s.psychology.temperament.sociability, 100);
  assert.equal(s.psychology.temperament.stability, 0);
  assert.equal(s.psychology.expressionThreshold, 100);
  assert.equal(s.psychology.emotions[0].baseline, 0);
  assert.equal(s.psychology.emotions[0].reactivity, 100);
});

test('soulSchema: built-in library contains all 11 canonical categories', () => {
  assert.equal(BUILT_IN_SOULS.length, 11);
  const categoriesPresent = new Set(BUILT_IN_SOULS.map((s) => s.category));
  for (const cat of SOUL_CATEGORIES) {
    assert.ok(categoriesPresent.has(cat), `Category ${cat} must be present`);
  }
  for (const soul of BUILT_IN_SOULS) {
    assert.ok(soul.identity.name.length > 0);
    assert.ok(soul.identity.avatar.glyph || soul.identity.avatar.presetId);
    assert.ok(soul.psychology.emotions.length > 0);
    assert.ok(soul.speech.examplePhrases.length > 0);
  }
});

test('soulSchema: legacy archetypes map directly to valid built-in souls', () => {
  for (const legacyKey of ['empath', 'mentor', 'tactical', 'spark', 'cynic', 'visionary']) {
    const soul = getBuiltInSoul(legacyKey);
    assert.ok(soul, `Legacy key ${legacyKey} must resolve`);
    assert.equal(soul.type, 'builtin');
  }
});

test('soulSchema: duplicates, exports, and imports souls safely', () => {
  const sage = getBuiltInSoul('soul_sage')!;
  const copy = duplicateSoulDef(sage, 'Cloned Sage');
  assert.equal(copy.name, 'Cloned Sage');
  assert.equal(copy.type, 'custom');
  assert.notEqual(copy.id, sage.id);
  assert.equal(copy.parentSoulId, sage.id);

  const exported = exportSoulDefJson(sage);
  assert.ok(exported.includes('"name": "Sovereign Sage"'));

  const imported = importSoulDefJson(exported);
  assert.ok(imported);
  assert.equal(imported.name, 'Sovereign Sage');
  assert.equal(imported.type, 'imported');
  assert.notEqual(imported.id, sage.id);
});
