import test from 'node:test';
import assert from 'node:assert/strict';
import { SpeculativeHarness } from '../mobile/src/engine/speculativeHarness.ts';
import { S23_MODEL_DATABASE } from '../mobile/src/types/settings.ts';

test('Speculative Harness has calibrated S23 Ultra model pairings', () => {
  const pairs = SpeculativeHarness.getAvailablePairs();
  assert.ok(pairs.length >= 4, 'Should have at least 4 pre-configured speculative pairs');

  const llamaSmol = pairs.find(p => p.id === 'llama-smol');
  assert.ok(llamaSmol, 'Should include Llama 3.1 8B + SmolLM3 1.7B pair');
  assert.strictEqual(llamaSmol?.targetModelId, 'llama-3.1-8b');
  assert.strictEqual(llamaSmol?.draftModelId, 'smollm3-1.7b');
  assert.ok(llamaSmol && llamaSmol.totalRamGb <= 7.5, 'Paired RAM must stay well below 12GB S23 Ultra limit');
});

test('Speculative Decoding simulation executes draft validation and reports metrics', async () => {
  const pair = SpeculativeHarness.getPairById('llama-smol');
  assert.ok(pair);

  const stepResult = await SpeculativeHarness.executeSpeculativeStep(pair, ['Hello', 'world'], 4, 0.75);
  assert.strictEqual(stepResult.k, 4);
  assert.ok(stepResult.acceptedDraftCount >= 0);
  assert.ok(stepResult.effectiveTokPerSec > 0);
  assert.ok(stepResult.totalStepTokens.length >= 1);
});

test('Speculative Benchmark runs complete prompt and measures acceleration ratio', async () => {
  const report = await SpeculativeHarness.runSpeculativeBenchmark(
    'llama-smol',
    'Write a concise summary of sovereign on-device AI.',
    16
  );

  assert.strictEqual(report.pairId, 'llama-smol');
  assert.ok(report.tokensGenerated >= 16);
  assert.ok(report.summary.includes('acceleration'));
  assert.ok(report.summary.includes('speedup'));
});

test('S23 Model Database aligns with Hugging Face repos and RAM budgets', () => {
  assert.strictEqual(S23_MODEL_DATABASE.length, 22);
  for (const model of S23_MODEL_DATABASE) {
    assert.ok(model.repo.includes('/'), `Model ${model.id} must specify valid HF repo`);
    assert.ok(model.filename.endsWith('.gguf'), `Model ${model.id} must be a GGUF file`);
    assert.ok(model.ramRequiredGb <= 8.5, `Model ${model.id} RAM must fit within S23 Ultra limits`);
  }
});
