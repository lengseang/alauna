/**
 * Adaptive Generation Planner (pure core).
 *
 * Feature ID: CHIWIWI-IMG-ARCH-001 §5.4
 * Chooses the safest and highest-quality configuration within the phone's
 * real hardware, thermal, and memory budgets.
 */

import type {
  AspectRatio,
  DeviceResourceState,
  GenerationPlan,
  GenerationRequest,
  ImageModelManifest,
  QualityMode,
} from './types.ts';

// ------------------------------------------------------------------ Resolution Resolution Table

const ASPECT_RATIO_DIMENSIONS: Record<AspectRatio, { small: [number, number]; medium: [number, number]; large: [number, number] }> = {
  '1:1': { small: [384, 384], medium: [512, 512], large: [512, 512] },
  '3:4': { small: [384, 512], medium: [448, 576], large: [480, 640] },
  '4:3': { small: [512, 384], medium: [576, 448], large: [640, 480] },
  '9:16': { small: [288, 512], medium: [360, 640], large: [384, 672] },
  '16:9': { small: [512, 288], medium: [640, 360], large: [672, 384] },
};

// ------------------------------------------------------------------ Adaptive Planner Function

export function planGeneration(
  request: GenerationRequest,
  manifest: ImageModelManifest,
  device: DeviceResourceState,
): GenerationPlan {
  const rationale: string[] = [];

  // 1. Determine effective quality mode (Adaptive chooses based on device conditions)
  let effectiveMode: QualityMode = request.qualityMode;
  if (effectiveMode === 'adaptive') {
    if (device.thermalState === 'serious' || device.thermalState === 'critical' || device.isLowPowerMode) {
      effectiveMode = 'fast';
      rationale.push('Thermal throttling or low-power mode active: selected Fast Draft for device protection.');
    } else if (device.totalRamBytes >= 10 * 1024 * 1024 * 1024) {
      effectiveMode = 'quality';
      rationale.push('High-RAM device with nominal thermals: selected Quality mode.');
    } else {
      effectiveMode = 'balanced';
      rationale.push('Standard phone budget: selected Balanced mode.');
    }
  }

  // 2. Select resolution based on mode, thermal budget, and manifest
  const sizeTier = request.outputSize ?? (effectiveMode === 'fast' ? 'small' : effectiveMode === 'quality' ? 'large' : 'medium');
  const [targetWidth, targetHeight] = ASPECT_RATIO_DIMENSIONS[request.aspectRatio][sizeTier];

  let width = targetWidth;
  let height = targetHeight;

  // Thermal clamp: Never exceed medium resolution if thermal state is non-nominal
  if (device.thermalState === 'serious' || device.thermalState === 'critical') {
    const [mediumW, mediumH] = ASPECT_RATIO_DIMENSIONS[request.aspectRatio].medium;
    if (width > mediumW) {
      width = mediumW;
      height = mediumH;
      rationale.push(`Clamped output to ${width}x${height} due to elevated device temperature.`);
    }
  }

  // 3. Step count and sampler calculation
  let steps: number;
  let guidanceScale = 7.0;
  let scheduler = 'dpmpp2m_karras';

  const isFastModel = manifest.modelFamily === 'sd-turbo' || (manifest.tags && manifest.tags.includes('fast-lcm'));

  if (isFastModel) {
    // Turbo and LCM models converge in 2-4 steps
    steps = effectiveMode === 'fast' ? 2 : effectiveMode === 'balanced' ? 4 : Math.min(6, manifest.maxSteps);
    guidanceScale = 1.5;
    scheduler = 'lcm';
    rationale.push(`Few-step distilled model architecture: using ${steps} steps with LCM solver.`);
  } else {
    // Standard diffusion models
    if (request.sampler === 'euler_a') {
      scheduler = 'euler_ancestral';
      if (effectiveMode === 'fast') {
        steps = Math.min(15, manifest.defaultSteps);
      } else if (effectiveMode === 'quality') {
        steps = Math.min(25, manifest.maxSteps);
      } else {
        steps = Math.min(20, manifest.defaultSteps);
      }
      guidanceScale = 7.5;
      rationale.push(`Euler Ancestral sampler: using ${steps} steps.`);
    } else if (request.sampler === 'lcm') {
      scheduler = 'lcm';
      steps = effectiveMode === 'fast' ? 4 : effectiveMode === 'balanced' ? 6 : 8;
      guidanceScale = 2.0;
      rationale.push(`LCM solver selected: using ${steps} steps.`);
    } else {
      // DPM++ 2M Karras (default high-speed / high-fidelity solver): converges in 10-18 steps
      scheduler = 'dpmpp2m_karras';
      if (effectiveMode === 'fast') {
        steps = 10;
      } else if (effectiveMode === 'quality') {
        steps = Math.min(18, manifest.maxSteps);
      } else {
        steps = 14;
      }
      guidanceScale = 7.0;
      rationale.push(`DPM++ 2M Karras solver: using ${steps} steps for accelerated high-fidelity convergence.`);
    }

    if (device.benchmarkMsPerStep && device.benchmarkMsPerStep > 0) {
      const targetTimeSec = effectiveMode === 'fast' ? 25 : effectiveMode === 'quality' ? 75 : 45;
      const budgetSteps = Math.round((targetTimeSec * 1000) / device.benchmarkMsPerStep);
      steps = Math.min(manifest.maxSteps, Math.max(4, budgetSteps));
      rationale.push(
        `Hardware benchmark calibrated: ${steps} steps budgeted for ~${targetTimeSec}s at ${(device.benchmarkMsPerStep / 1000).toFixed(2)}s/step.`,
      );
    }

    if (device.thermalState === 'serious') {
      steps = Math.max(4, Math.floor(steps * 0.7));
      rationale.push('Reduced inference steps by 30% due to device thermal conditions.');
    }
  }

  // 4. Refinement & Upscale feasibility
  const hasRefinementSupport = manifest.features.imageToImage && request.refinementPolicy !== 'never';
  const hasUpscalerSupport = manifest.features.upscaler;
  const isHealthyBudget = device.thermalState === 'nominal' && !device.isLowPowerMode;

  const allowRefinement = hasRefinementSupport && isHealthyBudget && effectiveMode !== 'fast';
  const allowUpscale = hasUpscalerSupport && isHealthyBudget && effectiveMode === 'quality';

  // 5. Risk Tier Assessment
  let riskTier: GenerationPlan['riskTier'] = 'low';
  if (device.thermalState === 'critical') {
    riskTier = 'high';
    rationale.push('High thermal risk tier: generation might trigger OS thermal pause.');
  } else if (device.thermalState === 'serious' || (device.availableRamBytes && device.availableRamBytes < 2 * 1024 * 1024 * 1024)) {
    riskTier = 'moderate';
    rationale.push('Moderate memory/thermal pressure.');
  }

  return {
    modelId: manifest.modelId,
    runtimeId: manifest.runtimeId,
    resolution: { width, height },
    aspectRatio: request.aspectRatio,
    steps,
    guidanceScale,
    scheduler,
    precision: manifest.precision,
    batchSize: 1, // Single job invariant (§2.2)
    useDraftThenRefine: allowRefinement && request.refinementPolicy === 'if-beneficial',
    allowRefinement,
    allowUpscale,
    riskTier,
    explanation: rationale,
    prompt: request.prompt,
    seed: request.seed,
    goal: request.goal,
    qualityMode: request.qualityMode,
  };
}
