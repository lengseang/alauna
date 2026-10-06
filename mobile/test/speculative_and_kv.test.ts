import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KVCacheManager,
  type SaveKVCacheParams,
  type RestoreResult,
} from '../src/engine/kvCacheManager.ts';
import {
  SpeculativeHarness,
  SPECULATIVE_PAIRS,
  type SpeculativePair,
} from '../src/engine/speculativeHarness.ts';
import type { PADVector } from '../src/types/soul.ts';

test('KVCacheManager - computePromptHash determinism and sensitivity', () => {
  const padA: PADVector = { pleasure: 0.65, arousal: 0.40, dominance: 0.50 };
  const padB: PADVector = { pleasure: 0.65, arousal: 0.41, dominance: 0.50 };

  const prompt = 'You are an empathetic companion.';
  const hash1 = KVCacheManager.computePromptHash(prompt, padA, 'llama-3.1-8b');
  const hash2 = KVCacheManager.computePromptHash(prompt, padA, 'llama-3.1-8b');
  const hashDiffPAD = KVCacheManager.computePromptHash(prompt, padB, 'llama-3.1-8b');
  const hashDiffModel = KVCacheManager.computePromptHash(prompt, padA, 'qwen3-8b');

  assert.strictEqual(hash1, hash2, 'Identical prompt + PAD + model must produce identical hash');
  assert.strictEqual(typeof hash1, 'string');
  assert.strictEqual(hash1.length, 64, 'Prompt hash must be 64 hexadecimal characters');
  assert.notStrictEqual(hash1, hashDiffPAD, 'Different PAD vector must produce different hash');
  assert.notStrictEqual(hash1, hashDiffModel, 'Different model ID must produce different hash');
});

test('KVCacheManager - saveSnapshot and sub-15ms restoreSnapshot', async () => {
  KVCacheManager.clearMemoryCache();
  const pad: PADVector = { pleasure: 0.4, arousal: 0.2, dominance: 0.8 };
  const systemPrompt = 'You are a sovereign mentor with deep episodic relationship memory.';

  const params: SaveKVCacheParams = {
    systemPrompt,
    padVector: pad,
    modelId: 'llama-3.1-8b',
    tokenCount: 512,
    layersCount: 32,
    headDim: 128,
  };

  const promptHash = await KVCacheManager.saveSnapshot(params);
  assert.ok(promptHash);

  // Restore performance check
  const restoreResult: RestoreResult = await KVCacheManager.restoreSnapshot(promptHash);
  assert.strictEqual(restoreResult.hit, true, 'Cache restore should be a hit');
  assert.strictEqual(restoreResult.restoredTokens, 512);
  assert.ok(
    restoreResult.latencyMs < 15,
    `Restore latency must be < 15ms, actual: ${restoreResult.latencyMs.toFixed(3)}ms`
  );
  assert.strictEqual(restoreResult.snapshot?.header.magic, 'CHIWIWI_KV');
});

test('KVCacheManager - cleanupStaleCaches prunes expired entries', async () => {
  KVCacheManager.clearMemoryCache();
  const pad: PADVector = { pleasure: 0.1, arousal: 0.85, dominance: 0.95 };

  // 1. Save an entry with 1ms TTL (already expired)
  const expiredHash = await KVCacheManager.saveSnapshot({
    systemPrompt: 'Ephemeral temporary instruction',
    padVector: pad,
    modelId: 'test-model',
    tokenCount: 64,
    ttlMs: 1,
  });

  // Wait 10ms for expiration
  await new Promise((r) => setTimeout(r, 15));

  // 2. Save a fresh entry with 1 day TTL
  const freshHash = await KVCacheManager.saveSnapshot({
    systemPrompt: 'Persistent mentor instruction',
    padVector: pad,
    modelId: 'test-model',
    tokenCount: 128,
    ttlMs: 86400000,
  });

  // Run cleanup
  const cleanup = await KVCacheManager.cleanupStaleCaches(86400000, 10);
  assert.ok(cleanup.prunedCount >= 1, 'Should prune at least the expired entry');

  // Verify expired entry is gone
  const expiredCheck = await KVCacheManager.restoreSnapshot(expiredHash);
  assert.strictEqual(expiredCheck.hit, false, 'Expired entry should not be restored');

  // Verify fresh entry remains accessible
  const freshCheck = await KVCacheManager.restoreSnapshot(freshHash);
  assert.strictEqual(freshCheck.hit, true, 'Fresh entry should remain accessible');
});

test('SpeculativeHarness - pair definitions and RAM constraints', () => {
  const pairs = SpeculativeHarness.getAvailablePairs();
  assert.ok(pairs.length >= 4, 'Should define at least 4 speculative pairs');

  for (const pair of pairs) {
    assert.ok(pair.targetRamGb > 0);
    assert.ok(pair.draftRamGb > 0);
    assert.ok(pair.totalRamGb <= 9.0, `${pair.name} must fit safely in 12GB S23 Ultra RAM`);
    assert.ok(pair.defaultK >= 3 && pair.defaultK <= 5, 'K must be between 3 and 5');
    assert.ok(pair.draftBaseTokPerSec > pair.targetBaseTokPerSec, 'Draft must be faster than target');
  }

  const llamaSmol = SpeculativeHarness.getPairById('llama-smol');
  assert.ok(llamaSmol);
  assert.strictEqual(llamaSmol.targetModelId, 'llama-3.1-8b');
  assert.strictEqual(llamaSmol.draftModelId, 'smollm3-1.7b');
});

test('SpeculativeHarness - single step orchestration and verification', async () => {
  const pair: SpeculativePair = SPECULATIVE_PAIRS['llama-smol'];
  const step = await SpeculativeHarness.executeSpeculativeStep(pair, ['user', 'hello'], 4, 0.65);

  assert.strictEqual(step.k, 4);
  assert.strictEqual(step.draftTokens.length, 4);
  assert.ok(step.acceptedDraftCount >= 0 && step.acceptedDraftCount <= 4);
  assert.ok(step.totalStepTokens.length >= 1, 'Must emit at least corrective or bonus token');
  assert.ok(step.totalStepLatencyMs > 0);
  assert.ok(step.effectiveTokPerSec > 0);
});

test('SpeculativeHarness - full run produces effective tokens/sec acceleration', async () => {
  const result = await SpeculativeHarness.runSpeculativeGeneration({
    pairId: 'llama-smol',
    systemPrompt: 'You are an on-device sovereign agent.',
    userPrompt: 'Explain how local inference operates without cloud latency.',
    maxTokens: 24,
    k: 4,
    acceptanceThreshold: 0.65,
  });

  const m = result.metrics;
  assert.ok(m.totalTokensGenerated >= 24, 'Should satisfy maxTokens quota');
  assert.ok(m.speculativeCycles > 0);
  assert.ok(m.draftTokensProposed > 0);
  assert.ok(m.globalAcceptanceRate > 0 && m.globalAcceptanceRate <= 1.0);
  assert.ok(m.effectiveTokensPerSec > m.baselineTokensPerSec, 'Effective tok/s should exceed baseline');
  assert.ok(m.accelerationRatio > 1.2, `Acceleration ratio should be > 1.2x, got ${m.accelerationRatio}x`);
});

test('SpeculativeHarness - benchmark reporting', async () => {
  const report = await SpeculativeHarness.runSpeculativeBenchmark('llama-speed', 'Run quick benchmark', 20);
  assert.strictEqual(report.pairId, 'llama-speed');
  assert.ok(report.accelerationRatioFormatted.includes('x'));
  assert.ok(report.timeSavedMs >= 0);
  assert.ok(report.summary.includes('Speculative Decoding acceleration test complete'));
});
