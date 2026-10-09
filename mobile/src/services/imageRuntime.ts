/**
 * Native Local Image Inference Runtime Adapter (pure service).
 *
 * Feature ID: CHIWIWI-IMG-ARCH-001 §5.6
 * Bridges between the ImageGenerationCoordinator and the platform-specific
 * native diffusion engine (e.g., stable-diffusion.cpp / MediaPipe on Android, CoreML on iOS).
 *
 * Invariant (GEMINI.md Rule 2 & Specification §16.6):
 * Never fakes progress or output. If the native diffusion engine is not compiled
 * or the model file is not present in storage, reports an honest typed error.
 */

import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import type {
  GenerationPlan,
  ImageGenerationError,
  ImageModelManifest,
} from '../core/imageGen/types.ts';
import { getImageModelManifest } from '../core/imageGen/modelRegistry.ts';
import { modelsDir, isStorageReady } from './storage.ts';

export interface RuntimeGenerateResult {
  imageId: string;
  imagePath: string;
  width: number;
  height: number;
  format: 'png' | 'webp';
  durationMs: number;
}

export interface LocalImageRuntimeAdapter {
  isAvailable(): boolean;
  getManifest(modelId: string): ImageModelManifest | undefined;
  generate(
    plan: GenerationPlan,
    onProgress: (pct: number, stage: string) => void,
  ): Promise<RuntimeGenerateResult>;
}

class MobileImageRuntimeAdapter implements LocalImageRuntimeAdapter {
  public isAvailable(): boolean {
    // True when a native on-device diffusion runtime is registered on the device
    return false; // Honest check: native SD C++ runtime bridge is in Phase 1-2 native registration
  }

  public getManifest(modelId: string): ImageModelManifest | undefined {
    return getImageModelManifest(modelId);
  }

  public async generate(
    plan: GenerationPlan,
    onProgress: (pct: number, stage: string) => void,
  ): Promise<RuntimeGenerateResult> {
    const manifest = this.getManifest(plan.modelId);
    if (!manifest) {
      throw this.error('MODEL_NOT_INSTALLED', `Model '${plan.modelId}' is not registered in the catalog.`);
    }

    if (!isStorageReady()) {
      throw this.error('INSUFFICIENT_STORAGE', 'Vault storage is not ready. Set up storage in Settings first.');
    }

    // Check if real model weights file exists in vault/models/
    const expectedFile = new File(modelsDir(), `${manifest.modelId}.gguf`);
    const modelInstalled = expectedFile.exists;

    if (!modelInstalled) {
      throw this.error(
        'MODEL_NOT_INSTALLED',
        `Model weights for '${manifest.displayName}' are not downloaded yet. Please download the model (${(manifest.downloadSizeBytes / 1e9).toFixed(2)} GB) to your storage vault.`,
      );
    }

    if (!this.isAvailable()) {
      throw this.error(
        'RUNTIME_UNSUPPORTED_FEATURE',
        `On-device diffusion runtime (${manifest.runtimeId} on ${Platform.OS}) is undergoing native qualification for this APK build. Local CPU/GPU adapter not initialized.`,
      );
    }

    // When native bridge is compiled and loaded:
    throw this.error('UNKNOWN_RUNTIME_ERROR', 'Unexpected native execution state.');
  }

  private error(code: ImageGenerationError['code'], message: string): ImageGenerationError {
    return {
      code,
      message,
      recoveryAction: code === 'MODEL_NOT_INSTALLED' ? 'Download a compatible model from the Model Library.' : 'Check device compatibility.',
      recoverable: true,
    };
  }
}

export const nativeImageRuntime = new MobileImageRuntimeAdapter();
