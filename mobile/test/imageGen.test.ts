import test from 'node:test';
import assert from 'node:assert/strict';
import { planScene, serializePromptForModel } from '../src/core/imageGen/scenePlanner.ts';
import { planGeneration } from '../src/core/imageGen/adaptivePlanner.ts';
import {
  IMAGE_MODEL_MANIFESTS,
  getImageModelManifest,
  getStandaloneImageModels,
  getUncensoredImageModels,
  isStandaloneModel,
  verifyModelIntegrity,
} from '../src/core/imageGen/modelRegistry.ts';
import { ImageGenerationCoordinator } from '../src/core/imageGen/coordinator.ts';
import { readFileSync } from 'node:fs';
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
  assert.ok(uncensored.length >= 10, 'Must provide at least 10 verified uncensored diffusion models');

  const modelIds = uncensored.map((m) => m.modelId);
  // Medium-tier
  assert.ok(modelIds.includes('cyberrealistic-pony-v12-q4'));
  assert.ok(modelIds.includes('realvisxl-v5-q4'));
  assert.ok(modelIds.includes('pony-diffusion-v6-xl-q8'));
  assert.ok(modelIds.includes('cyberrealistic-xl-v4-q4'));
  assert.ok(modelIds.includes('illustrious-xl-q4'));
  assert.ok(modelIds.includes('flux1-schnell-q2'));

  // Low-tier & fast LCM
  assert.ok(modelIds.includes('dreamshaper-7-lcm-f16'));
  assert.ok(modelIds.includes('dreamshaper-v8'));
  assert.ok(modelIds.includes('absolutereality-v1.8'));
  assert.ok(modelIds.includes('cyberrealistic-v5-sd15'));

  for (const m of uncensored) {
    assert.equal(m.contentPolicy, 'uncensored');
    assert.ok(m.hfRepo, `Model ${m.modelId} must specify hfRepo`);
    assert.ok(m.hfFile, `Model ${m.modelId} must specify hfFile`);
    assert.ok(m.sha256.length === 64, `Model ${m.modelId} must have 64-char sha256`);
    assert.ok(m.downloadSizeBytes > 0, `Model ${m.modelId} must have non-zero size`);
  }
});

test('imageGen runtime: no fabricated generation path (no synthesizer, no simulated denoising loop)', () => {
  const src = readFileSync(new URL('../src/services/imageRuntime.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /pngSynthesizer|synthesizeScene|setTimeout|delay\(/);
  assert.match(src, /LocalDiffusionEngine/);
  assert.match(src, /return linkedEngine !== null/, 'availability is whether a real engine is registered');
});

test('imageGen modelRegistry: classifies All-in-One vs Modular UNet models honestly', () => {
  const standalone = getStandaloneImageModels();
  assert.ok(standalone.length >= 8, 'Must have at least 8 All-in-One standalone diffusion models');

  // Verify Anything V5 and MeinaHentai All-in-One models
  const anythingV5 = getImageModelManifest('anything-v5-q4');
  assert.ok(anythingV5, 'anything-v5-q4 must be registered');
  assert.equal(anythingV5.packageFormat, 'all-in-one');
  assert.equal(anythingV5.downloadSizeBytes, 1_570_410_496);
  assert.equal(anythingV5.sha256, '9f2facb57132e1c0714262d1d562e334d1f05da259a2a424c3c5b2ee0ae108f2');

  const meinaHentai = getImageModelManifest('meina-hentai-sd15');
  assert.ok(meinaHentai, 'meina-hentai-sd15 must be registered');
  assert.equal(meinaHentai.packageFormat, 'all-in-one');
  assert.equal(meinaHentai.downloadSizeBytes, 2_132_651_163);
  assert.equal(meinaHentai.sha256, 'bb81be7c6f006b2511fb548d18912f759c659cd82d88040fc78bbe4cc65b965c');

  // Verify standalone status helper
  assert.equal(isStandaloneModel('anything-v5-q4'), true);
  assert.equal(isStandaloneModel('dreamshaper-7-lcm-f16'), true);
  assert.equal(isStandaloneModel('sd-turbo-q4'), true);
  assert.equal(isStandaloneModel('pony-diffusion-v6-xl-q8'), false);
  assert.equal(isStandaloneModel('realvisxl-v5-q4'), false);
  assert.equal(isStandaloneModel('cyberrealistic-xl-v4-q4'), false);

  // Integrity checks on new models
  assert.equal(verifyModelIntegrity(anythingV5, anythingV5.downloadSizeBytes, anythingV5.sha256).valid, true);
  assert.equal(verifyModelIntegrity(meinaHentai, meinaHentai.downloadSizeBytes, meinaHentai.sha256).valid, true);
});

test('imageGen adaptivePlanner: configures DPM++ 2M Karras as default and LCM for fast models', () => {
  const sd15 = getImageModelManifest('stable-diffusion-v1.5-q4')!;
  const lcm = getImageModelManifest('dreamshaper-7-lcm-f16')!;
  const nominalDevice: DeviceResourceState = {
    totalRamBytes: 12 * 1024 * 1024 * 1024,
    thermalState: 'nominal',
  };

  // Case 1: Standard model defaults to DPM++ 2M Karras with accelerated 14-18 step convergence
  const reqStandard: GenerationRequest = {
    requestVersion: 1,
    prompt: 'Portrait of a warrior',
    goal: 'character',
    qualityMode: 'quality',
    aspectRatio: '1:1',
    refinementPolicy: 'never',
  };
  const planStandard = planGeneration(reqStandard, sd15, nominalDevice);
  assert.equal(planStandard.scheduler, 'dpmpp2m_karras');
  assert.equal(planStandard.steps, 18, 'Quality mode with DPM++ 2M should cap at 18 steps');
  assert.equal(planStandard.resolution.width, 512, '1:1 large should be 512x512 to prevent O(N^2) memory paging');
  assert.equal(planStandard.resolution.height, 512);

  // Case 2: Fast LCM model automatically selects LCM scheduler with 4 steps
  const reqLcm: GenerationRequest = {
    requestVersion: 1,
    prompt: 'Ethereal dragon flying over mountains',
    goal: 'illustration',
    qualityMode: 'balanced',
    aspectRatio: '1:1',
    refinementPolicy: 'never',
  };
  const planLcm = planGeneration(reqLcm, lcm, nominalDevice);
  assert.equal(planLcm.scheduler, 'lcm');
  assert.equal(planLcm.steps, 4, 'LCM model in balanced mode should use 4 steps');
  assert.equal(planLcm.guidanceScale, 1.5, 'LCM model should use low guidance scale 1.5');

  // Case 3: Explicit sampler override for classic Euler Ancestral
  const reqEuler: GenerationRequest = {
    ...reqStandard,
    sampler: 'euler_a',
  };
  const planEuler = planGeneration(reqEuler, sd15, nominalDevice);
  assert.equal(planEuler.scheduler, 'euler_ancestral');
  assert.equal(planEuler.steps, 25);
});

test('imageGen adaptivePlanner: all resolution tiers are divisible by 8 for VAE / UNet alignment', () => {
  const sd15 = getImageModelManifest('stable-diffusion-v1.5-q4')!;
  const nominalDevice: DeviceResourceState = {
    totalRamBytes: 12 * 1024 * 1024 * 1024,
    thermalState: 'nominal',
  };
  const ratios: ('1:1' | '3:4' | '4:3' | '9:16' | '16:9')[] = ['1:1', '3:4', '4:3', '9:16', '16:9'];
  const modes: ('fast' | 'balanced' | 'quality')[] = ['fast', 'balanced', 'quality'];

  for (const aspectRatio of ratios) {
    for (const qualityMode of modes) {
      const plan = planGeneration(
        {
          requestVersion: 1,
          prompt: 'test',
          goal: 'general',
          qualityMode,
          aspectRatio,
          refinementPolicy: 'never',
        },
        sd15,
        nominalDevice,
      );
      assert.equal(plan.resolution.width % 8, 0, `${aspectRatio} ${qualityMode} width must be divisible by 8`);
      assert.equal(plan.resolution.height % 8, 0, `${aspectRatio} ${qualityMode} height must be divisible by 8`);
      // Ensure maximum pixel area never exceeds 512*768 = 393,216 to protect on-device RAM
      const pixelArea = plan.resolution.width * plan.resolution.height;
      assert.ok(pixelArea <= 400_000, `Pixel area ${pixelArea} should remain bounded for mobile CPU`);
    }
  }
});

