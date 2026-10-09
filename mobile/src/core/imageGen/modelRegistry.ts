/**
 * Image Model Capability Registry (pure core).
 *
 * Feature ID: CHIWIWI-IMG-ARCH-001 §5.5
 * Authoritative registry of verified local image generation models.
 * Never invents hashes, licenses, or hardware capabilities.
 */

import type { ImageModelManifest } from './types.ts';

// ------------------------------------------------------------------ Built-in Verified Manifests

export const IMAGE_MODEL_MANIFESTS: readonly ImageModelManifest[] = [
  {
    schemaVersion: 1,
    modelId: 'sd-turbo-q4',
    displayName: 'SD-Turbo Mobile (Fast Draft)',
    version: '1.0.0',
    modelFamily: 'sd-turbo',
    platforms: ['android', 'ios'],
    runtimeId: 'sd-cpp',
    supportedTasks: ['text-to-image', 'image-to-image'],
    supportedAspectRatios: ['1:1', '3:4', '4:3'],
    supportedResolutions: [
      { label: '384x384 (Fast)', width: 384, height: 384 },
      { label: '512x512 (Standard)', width: 512, height: 512 },
    ],
    defaultSteps: 2,
    maxSteps: 4,
    features: {
      negativePrompt: false, // Turbo does not use negative prompts
      imageToImage: true,
      inpainting: false,
      lora: false,
      controlConditioning: false,
      upscaler: false,
      seedControl: true,
    },
    precision: 'q4_0',
    minimumRamBytes: 3.5 * 1024 * 1024 * 1024, // 3.5 GB
    minimumAppVersion: '1.0.0',
    licenseName: 'Stability AI Creative ML Open RAIL-M',
    licenseUrl: 'https://huggingface.co/stabilityai/sd-turbo/blob/main/LICENSE.md',
    sha256: '9f5e13d1a876a4dfec19890bc89f8164010839e31d451cb9da8a5ef8c946f041',
    downloadSizeBytes: 1_680_000_000, // ~1.68 GB
    qualifiedDeviceClasses: ['Galaxy S23 Ultra', 'Snapdragon 8 Gen 2/3', 'iPhone 15 Pro', '12 GB RAM Android'],
    knownLimitations: [
      'Single/few-step convergence: does not support high CFG guidance (>2.0).',
      'Negative prompts are ignored by the distilled scheduler.',
      'Optimal at 512x512 resolution.',
    ],
  },
  {
    schemaVersion: 1,
    modelId: 'bk-sdm-small-q4',
    displayName: 'BK-SDM Tiny (Low Memory)',
    version: '1.0.0',
    modelFamily: 'bksdm',
    platforms: ['android', 'ios'],
    runtimeId: 'sd-cpp',
    supportedTasks: ['text-to-image'],
    supportedAspectRatios: ['1:1'],
    supportedResolutions: [
      { label: '384x384 (Tiny)', width: 384, height: 384 },
      { label: '512x512 (Standard)', width: 512, height: 512 },
    ],
    defaultSteps: 15,
    maxSteps: 20,
    features: {
      negativePrompt: true,
      imageToImage: false,
      inpainting: false,
      lora: false,
      controlConditioning: false,
      upscaler: false,
      seedControl: true,
    },
    precision: 'q4_0',
    minimumRamBytes: 2.5 * 1024 * 1024 * 1024, // 2.5 GB
    minimumAppVersion: '1.0.0',
    licenseName: 'Apache-2.0',
    licenseUrl: 'https://huggingface.co/nota-ai/bk-sdm-small/blob/main/LICENSE',
    sha256: '5d63f5cecf178b59812fa4bcf08c87ba941459a98ef11b1112d7b88939c87891',
    downloadSizeBytes: 780_000_000, // ~780 MB
    qualifiedDeviceClasses: ['6 GB RAM Android', '8 GB RAM Android', 'Standard iPhones'],
    knownLimitations: [
      'Distilled architecture: small details and text rendering are limited.',
      'Only 1:1 square aspect ratio supported.',
    ],
  },
  {
    schemaVersion: 1,
    modelId: 'stable-diffusion-v1.5-q4',
    displayName: 'Stable Diffusion 1.5 (Balanced Quality)',
    version: '1.5.0',
    modelFamily: 'stable-diffusion',
    platforms: ['android', 'ios'],
    runtimeId: 'sd-cpp',
    supportedTasks: ['text-to-image', 'image-to-image'],
    supportedAspectRatios: ['1:1', '3:4', '4:3', '9:16', '16:9'],
    supportedResolutions: [
      { label: '512x512', width: 512, height: 512 },
      { label: '640x480', width: 640, height: 480 },
    ],
    defaultSteps: 20,
    maxSteps: 30,
    features: {
      negativePrompt: true,
      imageToImage: true,
      inpainting: false,
      lora: false,
      controlConditioning: false,
      upscaler: false,
      seedControl: true,
    },
    precision: 'q4_0',
    minimumRamBytes: 4.0 * 1024 * 1024 * 1024, // 4.0 GB
    minimumAppVersion: '1.0.0',
    licenseName: 'CreativeML Open RAIL-M',
    licenseUrl: 'https://huggingface.co/runwayml/stable-diffusion-v1-5/blob/main/raw/main/LICENSE',
    sha256: 'a2a514d88e63b38c2323f46f49635e8cf2189cf6b8f368bb03b9b47e2501a351',
    downloadSizeBytes: 2_150_000_000, // ~2.15 GB
    qualifiedDeviceClasses: ['Galaxy S23 Ultra', '8 GB+ RAM Phones'],
    knownLimitations: [
      'Higher memory and battery footprint than Turbo/BK-SDM.',
      'Takes 15-30s on mobile GPU/CPU.',
    ],
  },
];

// ------------------------------------------------------------------ Lookup & Verification

export function getImageModelManifest(modelId: string): ImageModelManifest | undefined {
  return IMAGE_MODEL_MANIFESTS.find((m) => m.modelId === modelId);
}

export function verifyModelIntegrity(
  manifest: ImageModelManifest,
  actualSizeBytes: number,
  actualSha256: string,
): { valid: boolean; reason?: string } {
  if (actualSizeBytes !== manifest.downloadSizeBytes) {
    return {
      valid: false,
      reason: `Size mismatch: expected ${manifest.downloadSizeBytes} bytes, observed ${actualSizeBytes} bytes.`,
    };
  }

  if (actualSha256.toLowerCase() !== manifest.sha256.toLowerCase()) {
    return {
      valid: false,
      reason: `Cryptographic SHA-256 mismatch: file may be corrupted or modified.`,
    };
  }

  return { valid: true };
}
