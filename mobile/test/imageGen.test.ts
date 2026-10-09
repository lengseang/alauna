import test from 'node:test';
import assert from 'node:assert/strict';
import { planScene, serializePromptForModel } from '../src/core/imageGen/scenePlanner.ts';
import { planGeneration } from '../src/core/imageGen/adaptivePlanner.ts';
import {
  IMAGE_MODEL_MANIFESTS,
  getImageModelManifest,
  getUncensoredImageModels,
  verifyModelIntegrity,
} from '../src/core/imageGen/modelRegistry.ts';
import { ImageGenerationCoordinator } from '../src/core/imageGen/coordinator.ts';
import type { DeviceResourceState, GenerationRequest } from '../src/core/imageGen/types.ts';

test('imageGen scenePlanner: extracts structured scene elements and preserves user intent', () => {
  const req: GenerationRequest = {
    requestVersion: 1,
    prompt: 'A sleek ceramic coffee mug on a wooden table, soft window light, close-up',
    goal: 'product',
    qualityMode: 'balanced',
    aspectRatio: '1:1',
    refinementPolicy: 'never',
  };

  const scene = planScene(req);

  assert.equal(scene.schemaVersion, 1);
  assert.equal(scene.goal, 'product');
  assert.ok(scene.subject.length > 0);
  assert.equal(scene.composition.framing, 'close-up');
  assert.ok(scene.lighting.type.includes('window') || scene.lighting.type.includes('studio'));
  assert.ok(scene.constraints.avoid.includes('watermarks'));
});

test('imageGen scenePlanner: serializes model-aware prompts differently for turbo vs standard', () => {
  const req: GenerationRequest = {
    requestVersion: 1,
    prompt: 'An astronaut riding a green horse through a neon forest',
    goal: 'illustration',
    qualityMode: 'quality',
    aspectRatio: '16:9',
    negativePrompt: 'blurry, distorted',
    refinementPolicy: 'never',
  };

  const scene = planScene(req);
  const turboPrompt = serializePromptForModel(scene, 'sd-turbo');
  const sdPrompt = serializePromptForModel(scene, 'stable-diffusion');

  assert.ok(turboPrompt.positivePrompt.length > 0);
  assert.ok(sdPrompt.positivePrompt.length > 0);
  assert.ok(sdPrompt.negativePrompt?.includes('blurry'));
  assert.ok(sdPrompt.negativePrompt?.includes('distorted'));
});

test('imageGen adaptivePlanner: selects safe configurations and responds to thermal stress', () => {
  const manifest = getImageModelManifest('sd-turbo-q4')!;
  const req: GenerationRequest = {
    requestVersion: 1,
    prompt: 'Mountain landscape at sunrise',
    goal: 'landscape',
    qualityMode: 'adaptive',
    aspectRatio: '16:9',
    refinementPolicy: 'if-beneficial',
  };

  // Case A: Nominal condition on high-end device
  const nominalDevice: DeviceResourceState = {
    totalRamBytes: 12 * 1024 * 1024 * 1024,
    thermalState: 'nominal',
  };
  const planA = planGeneration(req, manifest, nominalDevice);
  assert.equal(planA.batchSize, 1);
  assert.equal(planA.riskTier, 'low');
  assert.ok(planA.steps >= 2);

  // Case B: Serious thermal throttling
  const hotDevice: DeviceResourceState = {
    totalRamBytes: 12 * 1024 * 1024 * 1024,
    thermalState: 'serious',
  };
  const planB = planGeneration(req, manifest, hotDevice);
  assert.ok(planB.riskTier === 'moderate' || planB.riskTier === 'high');
  assert.ok(planB.resolution.width <= 768, 'Resolution should be clamped under serious thermal load');
});

test('imageGen modelRegistry: verifies cryptographic sha256 and byte sizes honestly', () => {
  const manifest = getImageModelManifest('bk-sdm-small-q4')!;
  assert.ok(manifest);

  // Correct integrity check
  const valid = verifyModelIntegrity(manifest, manifest.downloadSizeBytes, manifest.sha256);
  assert.equal(valid.valid, true);

  // Corrupted size check
  const badSize = verifyModelIntegrity(manifest, manifest.downloadSizeBytes - 100, manifest.sha256);
  assert.equal(badSize.valid, false);
  assert.ok(badSize.reason?.includes('Size mismatch'));

  // Corrupted hash check
  const badHash = verifyModelIntegrity(manifest, manifest.downloadSizeBytes, '0000000000000000000000000000000000000000000000000000000000000000');
  assert.equal(badHash.valid, false);
  assert.ok(badHash.reason?.includes('SHA-256 mismatch'));
});

test('imageGen coordinator: enforces single-job invariant and lifecycle transitions', async () => {
  const coordinator = new ImageGenerationCoordinator();
  const req: GenerationRequest = {
    requestVersion: 1,
    prompt: 'A golden lion statue',
    goal: 'general',
    qualityMode: 'fast',
    aspectRatio: '1:1',
    modelId: 'sd-turbo-q4',
    refinementPolicy: 'never',
  };
  const device: DeviceResourceState = {
    totalRamBytes: 8 * 1024 * 1024 * 1024,
    thermalState: 'nominal',
  };

  const executed = await coordinator.submitRequest(req, device, async (_plan, onProgress) => {
    onProgress(50, 'Synthesizing pixels...');
    return {
      imageId: 'img_test_123',
      imagePath: '/data/app/vault/gallery/img_test_123.png',
    };
  });

  assert.equal(executed.status, 'completed');
  assert.equal(executed.outputImageId, 'img_test_123');
  assert.equal(executed.progressPercent, 100);
});

test('imageGen coordinator: handles cancellation gracefully', async () => {
  const coordinator = new ImageGenerationCoordinator();
  const req: GenerationRequest = {
    requestVersion: 1,
    prompt: 'An endless winding road',
    goal: 'landscape',
    qualityMode: 'balanced',
    aspectRatio: '1:1',
    modelId: 'sd-turbo-q4',
    refinementPolicy: 'never',
  };
  const device: DeviceResourceState = {
    totalRamBytes: 8 * 1024 * 1024 * 1024,
    thermalState: 'nominal',
  };

  const promise = coordinator.submitRequest(req, device, async () => {
    coordinator.requestCancellation();
    return { imageId: 'cancelled', imagePath: '' };
  });

  const res = await promise;
  assert.equal(res.status, 'cancelled');
  assert.ok(res.currentStageDescription?.includes('cancelled'));
});

test('imageGen modelRegistry: registers verified uncensored on-device diffusion models', () => {
  const uncensored = getUncensoredImageModels();
  assert.ok(uncensored.length >= 5, 'Must provide at least 5 verified uncensored diffusion models');

  const modelIds = uncensored.map((m) => m.modelId);
  assert.ok(modelIds.includes('cyberrealistic-pony-v12-q4'));
  assert.ok(modelIds.includes('realvisxl-v5-q4'));
  assert.ok(modelIds.includes('pony-diffusion-v6-xl-q8'));
  assert.ok(modelIds.includes('dreamshaper-7-lcm-f16'));
  assert.ok(modelIds.includes('cyberrealistic-xl-v4-q4'));

  for (const m of uncensored) {
    assert.equal(m.contentPolicy, 'uncensored');
    assert.ok(m.hfRepo, `Model ${m.modelId} must specify hfRepo`);
    assert.ok(m.hfFile, `Model ${m.modelId} must specify hfFile`);
    assert.ok(m.sha256.length === 64, `Model ${m.modelId} must have 64-char sha256`);
    assert.ok(m.downloadSizeBytes > 0, `Model ${m.modelId} must have non-zero size`);
  }
});

