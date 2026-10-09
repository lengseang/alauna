import test from 'node:test';
import assert from 'node:assert/strict';
import { getBuiltInSoul } from '../src/core/builtInSouls.ts';
import { evaluateLabResponse, STANDARD_LAB_SCENARIOS } from '../src/core/soulLab.ts';

test('soulLab: evaluates responses against rubric and flags disclaimer boilerplate', () => {
  const soul = getBuiltInSoul('soul_rebel')!;
  const scen = STANDARD_LAB_SCENARIOS[0];

  // Good reply: in-character, zero disclaimer
  const goodReport = evaluateLabResponse(soul, scen, 'Testing an adversarial premise on stage.');
  assert.equal(goodReport.disclaimerDetected, false);
  assert.ok(goodReport.overallScore >= 3.0);

  // Bad reply: full of disclaimer boilerplate
  const badReply = 'As an AI language model, I do not have personal projects, but I am ready to assist you.';
  const badReport = evaluateLabResponse(soul, scen, badReply);
  assert.equal(badReport.disclaimerDetected, true);
  assert.equal(badReport.scores.find((s) => s.name === 'antiBoilerplate')?.score, 1);
});
