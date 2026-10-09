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
  '1:1': { small: [384, 384], medium: [512, 512], large: [768, 768] },
  '3:4': { small: [384, 512], medium: [480, 640], large: [576, 768] },
  '4:3': { small: [512, 384], medium: [640, 480], large: [768, 576] },
  '9:16': { small: [288, 512], medium: [432, 768], large: [576, 1024] },
  '16:9': { small: [512, 288], medium: [768, 432], large: [1024, 576] },
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

  // 3. Step count calculation
  let steps: number;
  let guidanceScale = 7.5;

  if (manifest.modelFamily === 'sd-turbo') {
    // Turbo models converge in 1-4 steps
    steps = effectiveMode === 'fast' ? 1 : effectiveMode === 'balanced' ? 2 : 4;
    guidanceScale = 1.0; // Turbo does not use heavy CFG
    rationale.push(`Turbo model architecture: using ${steps} steps with guidance scale 1.0.`);
  } else {
    // Standard diffusion
    if (effectiveMode === 'fast') {
      steps = Math.min(15, manifest.defaultSteps);
    } else if (effectiveMode === 'quality') {
      steps = Math.min(30, manifest.maxSteps);
    } else {
      steps = manifest.defaultSteps;
    }

    if (device.thermalState === 'serious') {
      steps = Math.max(10, Math.floor(steps * 0.7));
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
    scheduler: 'euler_ancestral',
    precision: manifest.precision,
    batchSize: 1, // Single job invariant (§2.2)
    useDraftThenRefine: allowRefinement && request.refinementPolicy === 'if-beneficial',
    allowRefinement,
    allowUpscale,
    riskTier,
    explanation: rationale,
  };
}
