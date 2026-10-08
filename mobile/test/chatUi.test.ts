import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ChatMessage } from '../src/core/chatTypes.ts';
import { bootSteps, eclipseFor, statsParts, truncateAt, withoutMessage } from '../src/ui/chatLogic.ts';

const msg = (id: string, role: 'user' | 'assistant' = 'user'): ChatMessage => ({ id, role, text: id, createdAt: 0, status: 'done' });

test('stats line shows only measured numbers', () => {
  const base = { modelId: 'm', promptTokens: 40, generatedTokens: 12, tokensPerSecond: 9.04, promptMs: 1, totalMs: 2 };
  assert.deepEqual(statsParts(base), ['9.0 tok/s', '12 tokens']);
  assert.deepEqual(statsParts({ ...base, ttftMs: 850, backend: 'GPU (Adreno)', cachedTokens: 30, draftTokens: 20, draftAccepted: 13 }), [
    '9.0 tok/s',
    '12 tokens',
    'first token 0.8s',
    'GPU',
    '30/40 cached',
    'draft 65% accepted',
  ]);
  assert.deepEqual(statsParts({ ...base, tokensPerSecond: 0, cachedTokens: 0, draftTokens: 0, backend: 'CPU' }), ['12 tokens', 'CPU']);
});

test('delete one message / truncate for edit & resend', () => {
  const ms = [msg('u1'), msg('a1', 'assistant'), msg('u2'), msg('a2', 'assistant')];
  assert.deepEqual(withoutMessage(ms, 'a1').map((m) => m.id), ['u1', 'u2', 'a2']);
  const t = truncateAt(ms, 'u2');
  assert.deepEqual(t.kept.map((m) => m.id), ['u1', 'a1']);
  assert.deepEqual(t.removed.map((m) => m.id), ['u2', 'a2']);
  assert.deepEqual(truncateAt(ms, 'nope').removed, []);
});

test('eclipse follows the engine line', () => {
  assert.equal(eclipseFor('generating'), 'busy');
  assert.equal(eclipseFor('loading'), 'loading');
  assert.equal(eclipseFor('not_downloaded'), 'idle');
  assert.equal(eclipseFor('error'), 'error');
});

test('boot steps count real progress, never time', () => {
  const start = bootSteps({ stage: null, security: false, voice: false, model: null });
  assert.equal(start.steps.find((s) => s.key === 'settings')?.state, 'active');
  assert.equal(start.fraction, 1 / 6); // fonts only
  assert.equal(start.finished, false);

  const mid = bootSteps({ stage: 'library', security: true, voice: true, model: { name: 'Q', done: false, progress: 0.5 } });
  assert.deepEqual(
    mid.steps.map((s) => s.state),
    ['done', 'done', 'done', 'done', 'active', 'done', 'pending'],
  );
  assert.equal(mid.fraction, 5 / 7); // model progress only counts once its step runs

  const loading = bootSteps({ stage: 'done', security: true, voice: true, model: { name: 'Q', done: false, progress: 0.5 } });
  assert.equal(loading.fraction, 6.5 / 7);
  assert.equal(loading.steps[6].label, 'Loading Q');

  const done = bootSteps({ stage: 'done', security: true, voice: true, model: { name: 'Q', done: true, progress: 1 } });
  assert.equal(done.finished, true);
  assert.equal(done.fraction, 1);
});
