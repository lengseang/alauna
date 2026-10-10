import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KOKORO_STYLES,
  KOKORO_REPO,
  getKokoroStyle,
  listKokoroStyles,
  kokoroStyleUrl,
  DEFAULT_KOKORO_STYLE_ID,
  type KokoroStyleSpec,
} from '../src/core/voice/kokoroStyles.ts';
import {
  EMOTION_PROFILES,
  STYLE_VECTOR_DIM,
  blendStyleVectors,
  computeAcousticModulation,
  createSyntheticStyleVector,
  interpolateMultiStyles,
  normalizeStyleVector,
  vectorNorm,
  type EmotionType,
} from '../src/core/voice/emotionMixer.ts';
import {
  VOICE_PERSONAS,
  getVoicePersona,
} from '../src/core/voicePersonas.ts';
import {
  DEFAULT_VOICE_PREFS,
  KOKORO_MODEL,
  getSpeechModel,
  sanitizeVoicePrefs,
} from '../src/core/voiceModels.ts';

test('kokoro styles catalog: all styles are valid with real Hugging Face metadata', () => {
  assert.ok(KOKORO_STYLES.length >= 20, `Expected at least 20 Kokoro styles, found ${KOKORO_STYLES.length}`);
  const ids = new Set<string>();

  for (const s of KOKORO_STYLES) {
    assert.ok(s.id && s.id.length > 0, 'Style ID must not be empty');
    assert.ok(!ids.has(s.id), `Duplicate Kokoro style ID: ${s.id}`);
    ids.add(s.id);

    assert.ok(s.name && s.name.length > 0, `Style ${s.id} missing name`);
    assert.ok(['female', 'male'].includes(s.gender), `Invalid gender: ${s.gender}`);
    assert.ok(['american', 'british'].includes(s.accent), `Invalid accent: ${s.accent}`);
    assert.ok(['normal', 'companion', 'nsfw_adult'].includes(s.category), `Invalid category: ${s.category}`);
    assert.match(s.filename, /^voices\/[a-z_]+\.bin$/, `Filename must follow voices/*.bin structure`);
    assert.equal(s.bytes, 522_240, `Kokoro style vector file size must be exactly 522,240 bytes`);
    assert.match(s.sha256, /^[0-9a-f]{64}$/, `Style ${s.id} sha256 must be a 64-character hex hash`);
    assert.ok(s.pitch >= 0.5 && s.pitch <= 2.0, `Pitch out of range for ${s.id}`);
    assert.ok(s.speed >= 0.5 && s.speed <= 2.0, `Speed out of range for ${s.id}`);
    assert.ok(Array.isArray(s.characteristics) && s.characteristics.length > 0);

    const url = kokoroStyleUrl(s);
    assert.equal(url, `https://huggingface.co/${KOKORO_REPO}/resolve/main/${s.filename}`);
  }

  assert.ok(getKokoroStyle('af_heart'), 'Default af_heart style must exist');
  assert.ok(getKokoroStyle('af_nicole'), 'Companion af_nicole must exist');
  assert.ok(getKokoroStyle('af_kore'), '18+ pillow talk af_kore must exist');
  assert.ok(getKokoroStyle('am_fenrir'), 'Alpha am_fenrir must exist');
  assert.equal(getKokoroStyle('nonexistent_style'), null);
});

test('kokoro styles: filtering by category works as expected', () => {
  const normal = listKokoroStyles('normal');
  const companion = listKokoroStyles('companion');
  const adult = listKokoroStyles('nsfw_adult');

  assert.ok(normal.length >= 10, 'Expected at least 10 normal styles');
  assert.ok(companion.length >= 3, 'Expected at least 3 companion styles');
  assert.ok(adult.length >= 3, 'Expected at least 3 adult styles');

  for (const s of adult) {
    assert.equal(s.category, 'nsfw_adult');
  }
});

test('kokoro emotion mixing: vector normalization and Euclidean norm', () => {
  const v = new Float32Array(STYLE_VECTOR_DIM);
  for (let i = 0; i < STYLE_VECTOR_DIM; i++) v[i] = 1.0;

  const norm = vectorNorm(v);
  const expectedNorm = Math.sqrt(STYLE_VECTOR_DIM);
  assert.ok(Math.abs(norm - expectedNorm) < 1e-4, `Norm must be sqrt(512)`);

  const normalized = normalizeStyleVector(v, 10.0);
  assert.ok(Math.abs(vectorNorm(normalized) - 10.0) < 1e-4, 'Normalized vector must match target norm');
});

test('kokoro emotion mixing: linear vector interpolation preserves energy', () => {
  const styleA = createSyntheticStyleVector(42);
  const styleB = createSyntheticStyleVector(99);

  assert.equal(styleA.length, STYLE_VECTOR_DIM);
  assert.equal(styleB.length, STYLE_VECTOR_DIM);

  // Weight = 0 should return vector equivalent to A
  const blendZero = blendStyleVectors(styleA, styleB, 0.0);
  assert.ok(Math.abs(blendZero[0] - styleA[0]) < 1e-5);

  // Weight = 1 should return vector equivalent to B
  const blendOne = blendStyleVectors(styleA, styleB, 1.0);
  assert.ok(Math.abs(blendOne[0] - styleB[0]) < 1e-5);

  // Weight = 0.5 should interpolate
  const blendHalf = blendStyleVectors(styleA, styleB, 0.5);
  const normHalf = vectorNorm(blendHalf);
  const normA = vectorNorm(styleA);
  assert.ok(Math.abs(normHalf - normA) < 1e-3, 'Blended vector energy should be preserved');
});

test('kokoro emotion mixing: multi-style convex combination', () => {
  const s1 = createSyntheticStyleVector(1);
  const s2 = createSyntheticStyleVector(2);
  const s3 = createSyntheticStyleVector(3);

  const combined = interpolateMultiStyles([
    { vec: s1, weight: 0.5 },
    { vec: s2, weight: 0.3 },
    { vec: s3, weight: 0.2 },
  ]);

  assert.equal(combined.length, STYLE_VECTOR_DIM);
  assert.ok(vectorNorm(combined) > 0, 'Combined norm must be positive');
});

test('kokoro emotion mixing: acoustic modulation computation', () => {
  const basePitch = 1.0;
  const baseRate = 1.0;

  // Neutral should have no change
  const neutral = computeAcousticModulation(basePitch, baseRate, 'neutral', 1.0);
  assert.equal(neutral.pitch, 1.0);
  assert.equal(neutral.rate, 1.0);

  // Excited should raise pitch and rate
  const excited = computeAcousticModulation(basePitch, baseRate, 'excited', 1.0);
  assert.ok(excited.pitch > basePitch, 'Excited should increase pitch');
  assert.ok(excited.rate > baseRate, 'Excited should increase rate');

  // Whisper / pillow talk should slow down rate
  const whisper = computeAcousticModulation(basePitch, baseRate, 'whisper', 1.0);
  assert.ok(whisper.rate < baseRate, 'Whisper should slow down speech');

  // Dominant should lower pitch
  const dominant = computeAcousticModulation(basePitch, baseRate, 'dominant', 1.0);
  assert.ok(dominant.pitch < basePitch, 'Dominant should deepen pitch');

  // Intensity scaling: 0 intensity produces no change
  const zeroIntensity = computeAcousticModulation(basePitch, baseRate, 'excited', 0.0);
  assert.equal(zeroIntensity.pitch, basePitch);
  assert.equal(zeroIntensity.rate, baseRate);
});

test('kokoro persona bindings: every persona links to valid Kokoro styles and emotion profiles', () => {
  for (const p of VOICE_PERSONAS) {
    const primaryStyle = getKokoroStyle(p.kokoroStyleId);
    assert.ok(primaryStyle, `Persona ${p.id} has invalid kokoroStyleId: ${p.kokoroStyleId}`);

    if (p.kokoroSecondaryStyleId) {
      const secondaryStyle = getKokoroStyle(p.kokoroSecondaryStyleId);
      assert.ok(secondaryStyle, `Persona ${p.id} has invalid secondary style: ${p.kokoroSecondaryStyleId}`);
      assert.ok(
        typeof p.kokoroBlendWeight === 'number' && p.kokoroBlendWeight >= 0 && p.kokoroBlendWeight <= 1,
        `Persona ${p.id} has invalid kokoroBlendWeight: ${p.kokoroBlendWeight}`
      );
    }

    assert.ok(p.kokoroEmotion in EMOTION_PROFILES, `Persona ${p.id} has invalid emotion: ${p.kokoroEmotion}`);
    assert.ok(p.kokoroEmotionIntensity >= 0 && p.kokoroEmotionIntensity <= 1);
  }
});

test('kokoro prefs sanitization: engine switching, style ID, and emotion intensity persistence', () => {
  const defaults = sanitizeVoicePrefs(null);
  assert.equal(defaults.ttsEngine, 'system');
  assert.equal(defaults.kokoroStyleId, DEFAULT_KOKORO_STYLE_ID);
  assert.equal(defaults.kokoroEmotion, 'neutral');
  assert.equal(defaults.kokoroEmotionIntensity, 0.5);

  const custom = sanitizeVoicePrefs({
    ttsEngine: 'kokoro',
    kokoroStyleId: 'af_nicole',
    kokoroEmotion: 'affectionate',
    kokoroEmotionIntensity: 0.85,
  });
  assert.equal(custom.ttsEngine, 'kokoro');
  assert.equal(custom.kokoroStyleId, 'af_nicole');
  assert.equal(custom.kokoroEmotion, 'affectionate');
  assert.equal(custom.kokoroEmotionIntensity, 0.85);

  // Fallbacks for invalid inputs
  const corrupt = sanitizeVoicePrefs({
    ttsEngine: 'invalid_engine',
    kokoroStyleId: 'garbage_style',
    kokoroEmotion: 'bogus_emotion',
    kokoroEmotionIntensity: 999,
  });
  assert.equal(corrupt.ttsEngine, 'system');
  assert.equal(corrupt.kokoroStyleId, DEFAULT_KOKORO_STYLE_ID);
  assert.equal(corrupt.kokoroEmotion, 'neutral');
  assert.equal(corrupt.kokoroEmotionIntensity, 1.0); // clamped to 1
});
