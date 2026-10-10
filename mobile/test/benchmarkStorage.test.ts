import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCalibratedSteps,
  sanitizeBenchmarks,
  type ModelBenchmarkMap,
} from '../src/core/imageGen/benchmarkStorage.ts';
import { planGeneration } from '../src/core/imageGen/adaptivePlanner.ts';
import { getImageModelManifest } from '../src/core/imageGen/modelRegistry.ts';
import type { DeviceResourceState, GenerationRequest } from '../src/core/imageGen/types.ts';

test('benchmarkStorage calculateCalibratedSteps: falls back honestly when unmeasured', () => {
  const emptyBenchmarks: ModelBenchmarkMap = {};
  const res = calculateCalibratedSteps('stable-diffusion-v1.5-q4', 45, emptyBenchmarks, 14, 25);
  assert.equal(res.calibrated, false);
  assert.equal(res.msPerStep, null);
  assert.equal(res.steps, 14);
});

test('benchmarkStorage calculateCalibratedSteps: calibrates step count to match time targets with real data', () => {
  const benchmarks: ModelBenchmarkMap = {
    'stable-diffusion-v1.5-q4': {
      modelId: 'stable-diffusion-v1.5-q4',
      backend: 'cpu',
      resolution: { width: 512, height: 512 },
      steps: 10,
      durationMs: 25000,
      msPerStep: 2500, // 2.5s per step
      measuredAt: Date.now(),
    },
  };

  // Fast draft target: 25s => 25000 / 2500 = 10 steps
  const fast = calculateCalibratedSteps('stable-diffusion-v1.5-q4', 25, benchmarks, 14, 30);
  assert.equal(fast.calibrated, true);
  assert.equal(fast.msPerStep, 2500);
  assert.equal(fast.steps, 10);

  // Balanced target: 45s => 45000 / 2500 = 18 steps
  const balanced = calculateCalibratedSteps('stable-diffusion-v1.5-q4', 45, benchmarks, 14, 30);
  assert.equal(balanced.calibrated, true);
  assert.equal(balanced.steps, 18);

  // Quality target: 75s => 75000 / 2500 = 30 steps (clamped to maxSteps 25)
  const quality = calculateCalibratedSteps('stable-diffusion-v1.5-q4', 75, benchmarks, 14, 25);
  assert.equal(quality.calibrated, true);
  assert.equal(quality.steps, 25);

  // Extreme slow device clamp to minSteps (default 4)
  const verySlowBenchmarks: ModelBenchmarkMap = {
    'stable-diffusion-v1.5-q4': {
      modelId: 'stable-diffusion-v1.5-q4',
      backend: 'cpu',
      resolution: { width: 512, height: 512 },
      steps: 5,
      durationMs: 50000,
      msPerStep: 10000, // 10s per step
      measuredAt: Date.now(),
    },
  };
  const clampedMin = calculateCalibratedSteps('stable-diffusion-v1.5-q4', 15, verySlowBenchmarks, 14, 30);
  assert.equal(clampedMin.steps, 4, 'Should clamp to minSteps of 4');
});

test('benchmarkStorage sanitizeBenchmarks: validates and cleans corrupted records safely', () => {
  assert.deepEqual(sanitizeBenchmarks(null), {});
  assert.deepEqual(sanitizeBenchmarks([]), {});
  assert.deepEqual(sanitizeBenchmarks('invalid'), {});

  const raw = {
    validModel: {
      modelId: 'validModel',
      backend: 'cpu',
      resolution: { width: 512, height: 512 },
      steps: 12,
      durationMs: 24000,
      msPerStep: 2000,
      measuredAt: 1234567,
    },
    invalidModel: {
      modelId: 'invalidModel',
      msPerStep: -5, // non-positive
    },
  };

  const sanitized = sanitizeBenchmarks(raw);
  assert.ok(sanitized.validModel);
  assert.equal(sanitized.validModel.msPerStep, 2000);
  assert.equal(sanitized.invalidModel, undefined);
});

test('adaptivePlanner integration: uses benchmarkMsPerStep when available on device state', () => {
  const sd15 = getImageModelManifest('stable-diffusion-v1.5-q4')!;
  const req: GenerationRequest = {
    requestVersion: 1,
    prompt: 'A tranquil zen garden with bonsai trees',
    goal: 'landscape',
    qualityMode: 'balanced',
    aspectRatio: '1:1',
    refinementPolicy: 'never',
  };

  // Device with real measured hardware latency (3.0s per step)
  const deviceWithBenchmark: DeviceResourceState = {
    totalRamBytes: 12 * 1024 * 1024 * 1024,
    thermalState: 'nominal',
    benchmarkMsPerStep: 3000,
  };

  const plan = planGeneration(req, sd15, deviceWithBenchmark);
  // Balanced mode target 45s: 45000 / 3000 = 15 steps
  assert.equal(plan.steps, 15);
  assert.ok(plan.explanation.some((e) => e.includes('Hardware benchmark calibrated')));
});
