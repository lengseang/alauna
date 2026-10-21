import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePcmRms,
  classifySemanticTurn,
  getDynamicSilenceTimeoutMs,
  SemanticVadSession,
} from '../src/core/voice/semanticVad.ts';

test('calculatePcmRms computes zero on silence and positive on audio', () => {
  const silence = new Uint8Array(320).fill(0);
  assert.equal(calculatePcmRms(silence), 0);

  // Generate sine wave burst in 16-bit PCM
  const wave = new Uint8Array(320);
  for (let i = 0; i < 160; i++) {
    const val = Math.floor(Math.sin(i / 5) * 8000);
    wave[i * 2] = val & 0xff;
    wave[i * 2 + 1] = (val >> 8) & 0xff;
  }
  const rms = calculatePcmRms(wave);
  assert.ok(rms > 0.4 && rms <= 1.0, `Expected RMS ~0.7, got ${rms}`);
});

test('classifySemanticTurn recognizes complete sentences with punctuation', () => {
  assert.equal(classifySemanticTurn('How are you doing today?'), 'complete');
  assert.equal(classifySemanticTurn('I love talking with you.'), 'complete');
  assert.equal(classifySemanticTurn('That was amazing!'), 'complete');
});

test('classifySemanticTurn recognizes conversational closures', () => {
  assert.equal(classifySemanticTurn('yes'), 'complete');
  assert.equal(classifySemanticTurn('okay'), 'complete');
  assert.equal(classifySemanticTurn('sounds good'), 'complete');
  assert.equal(classifySemanticTurn('thanks'), 'complete');
  assert.equal(classifySemanticTurn('goodbye'), 'complete');
});

test('classifySemanticTurn detects hesitation and trailing connectors', () => {
  assert.equal(classifySemanticTurn('I was thinking and'), 'hesitating');
  assert.equal(classifySemanticTurn('We should go to the store because'), 'hesitating');
  assert.equal(classifySemanticTurn('Maybe you could like'), 'hesitating');
  assert.equal(classifySemanticTurn('I want to see uh'), 'hesitating');
});

test('classifySemanticTurn classifies questions and full thoughts without punctuation', () => {
  assert.equal(classifySemanticTurn('what is the capital of France'), 'complete');
  assert.equal(classifySemanticTurn('can you tell me a story'), 'complete');
  assert.equal(classifySemanticTurn('the weather today is really warm and sunny outside'), 'complete');
});

test('getDynamicSilenceTimeoutMs yields fast path for complete turns and patient path for hesitation', () => {
  const completeTimeout = getDynamicSilenceTimeoutMs('complete', 700);
  const hesitatingTimeout = getDynamicSilenceTimeoutMs('hesitating', 700);
  const neutralTimeout = getDynamicSilenceTimeoutMs('neutral', 700);

  assert.equal(completeTimeout, 380, 'Complete turn should trigger fast 380ms silence');
  assert.equal(hesitatingTimeout, 1400, 'Hesitating turn should give 1400ms buffer');
  assert.equal(neutralTimeout, 700, 'Neutral turn should use base 700ms');
});

test('SemanticVadSession state machine transitions cleanly', () => {
  const session = new SemanticVadSession({ energyThreshold: 0.1, baseSilenceMs: 700, minSpeechDurationMs: 100 });
  const silence = new Uint8Array(320).fill(0);
  const loud = new Uint8Array(320);
  for (let i = 0; i < 160; i++) {
    const val = 12000;
    loud[i * 2] = val & 0xff;
    loud[i * 2 + 1] = (val >> 8) & 0xff;
  }

  const t0 = 1000;
  // 1. Silent feed: no speech
  const r1 = session.feedAudio(silence, t0);
  assert.equal(r1.speechStarted, false);
  assert.equal(session.isActive(), false);

  // 2. Loud feed: speech starts
  const r2 = session.feedAudio(loud, t0 + 50);
  assert.equal(r2.speechStarted, true);
  assert.equal(session.isActive(), true);

  // 3. User speaks complete thought
  session.updateTranscript('I am ready now.');

  // 4. Silence under 380ms does not end turn
  const r3 = session.feedAudio(silence, t0 + 200);
  assert.equal(r3.speechEnded, false);
  assert.equal(session.isActive(), true);

  // 5. Silence reaching 400ms ends complete turn instantly!
  const r4 = session.feedAudio(silence, t0 + 460);
  assert.equal(r4.speechEnded, true);
  assert.equal(session.isActive(), false);
});
