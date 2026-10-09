import test from 'node:test';
import assert from 'node:assert/strict';
import { getBuiltInSoul } from '../src/core/builtInSouls.ts';
import {
  initThreadEmotionalState,
  stepEmotionalDecay,
  evaluateTriggers,
  describeActiveEmotions,
} from '../src/core/soulRuntime.ts';

test('soulRuntime: initializes thread emotions from character baseline', () => {
  const soul = getBuiltInSoul('soul_sage')!;
  const state = initThreadEmotionalState('thread_1', soul);

  assert.equal(state.threadId, 'thread_1');
  assert.equal(state.soulId, soul.id);
  assert.equal(state.activeEmotions['calm'], 85);
  assert.equal(state.activeEmotions['curiosity'], 75);
});

test('soulRuntime: emotional decay deterministically returns toward baseline', () => {
  const soul = getBuiltInSoul('soul_sage')!;
  const state = initThreadEmotionalState('thread_1', soul);

  // Spike frustration to 90 (baseline is 5)
  state.activeEmotions['frustration'] = 90;

  const nextState1 = stepEmotionalDecay(state, soul);
  assert.ok(nextState1.activeEmotions['frustration'] < 90, 'Frustration should decrease');
  assert.ok(nextState1.activeEmotions['frustration'] > 5, 'Frustration decays gradually');

  // Multi-step decay
  let current = nextState1;
  for (let i = 0; i < 10; i++) {
    current = stepEmotionalDecay(current, soul);
  }
  assert.equal(current.activeEmotions['frustration'], 5, 'Snaps back to baseline 5');
});

test('soulRuntime: trigger matching applies emotional deltas and behavioral responses', () => {
  const soul = getBuiltInSoul('soul_rebel')!;
  soul.psychology.emotions.push({
    emotion: 'anger',
    baseline: 10,
    reactivity: 80,
    expressiveness: 70,
    persistence: 60,
    recoverySpeed: 40,
  });
  soul.psychology.triggers.push({
    id: 'trig_dogma',
    name: 'Dogma Detection',
    category: 'intellectual',
    conditionRegex: 'everyone knows that',
    conditionDescription: 'Dogmatic consensus claims',
    effects: [{ emotion: 'anger', delta: 40 }],
    behavioralResponse: 'Expose the uncritical dogma with sharp skepticism',
    priority: 8,
    enabled: true,
  });

  const state = initThreadEmotionalState('thread_2', soul);
  const baselineAnger = state.activeEmotions['anger'];

  const res = evaluateTriggers(state, soul, 'Well, everyone knows that React is the only way to build apps.');
  assert.equal(res.firedTriggers.length, 1);
  assert.equal(res.behavioralPrompts[0], 'Expose the uncritical dogma with sharp skepticism');
  assert.equal(res.updatedState.activeEmotions['anger'], baselineAnger + 40);

  const desc = describeActiveEmotions(res.updatedState, soul);
  assert.ok(desc?.includes('anger'), 'Noticeable spike must be described');
});
