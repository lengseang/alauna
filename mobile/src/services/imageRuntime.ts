/**
 * Native Local Image Inference Runtime Adapter (service).
 *
 * Feature ID: CHIWIWI-IMG-ARCH-001 §5.6
 * Bridges the ImageGenerationCoordinator to a real on-device diffusion engine (`LocalDiffusionEngine`).
 *
 * Invariant (GEMINI.md Rule 2 & Specification §16.6): no engine, no image. No diffusion engine is linked in this build,
 * so generation reports an honest typed error; there is no simulated progress and no synthesized picture. A real engine
 * is dropped in with `registerLocalDiffusionEngine()`; every progress number then comes from that engine.
 */

import type {
  GenerationPlan,
  ImageGenerationError,
  ImageModelManifest,
  LocalDiffusionEngine,
} from '../core/imageGen/types.ts';
import { getImageModelManifest } from '../core/imageGen/modelRegistry.ts';
import { isStorageReady } from './storage.ts';
import { getInstalledModelPath, isImageModelInstalled } from './imageModelManager.ts';
import { importGalleryImage } from './imageGallery.ts';

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

/** The linked engine. Null until a real native diffusion engine is registered (none is in this build). */
let linkedEngine: LocalDiffusionEngine | null = null;

export function registerLocalDiffusionEngine(engine: LocalDiffusionEngine | null): void {
  linkedEngine = engine;
}

export function isNativeDiffusionEngineAvailable(): boolean {
  return linkedEngine !== null;
}

class MobileImageRuntimeAdapter implements LocalImageRuntimeAdapter {
  private abort: AbortController | null = null;

  public isAvailable(): boolean {
    return isNativeDiffusionEngineAvailable();
  }

  public getManifest(modelId: string): ImageModelManifest | undefined {
    return getImageModelManifest(modelId);
  }

  /** Cancels the running generation (the engine receives the abort signal). */
  public cancel(): void {
    this.abort?.abort();
  }

  public async generate(
    plan: GenerationPlan,
    onProgress: (pct: number, stage: string) => void,
  ): Promise<RuntimeGenerateResult> {
    const startTime = Date.now();
    const manifest = this.getManifest(plan.modelId);
    if (!manifest) {
      throw this.error('MODEL_NOT_INSTALLED', `Model '${plan.modelId}' is not registered in the catalog.`);
    }

    if (!isStorageReady()) {
      throw this.error('INSUFFICIENT_STORAGE', 'Vault storage is not ready. Set up storage in Settings first.');
    }

    // Verify model is downloaded and installed on device
    const installed = isImageModelInstalled(manifest);
    if (!installed) {
      throw this.error(
        'MODEL_NOT_INSTALLED',
        `Model weights for '${manifest.displayName}' are not downloaded yet. Please tap 'Download' in the Models tab to install it (${(manifest.downloadSizeBytes / 1e9).toFixed(2)} GB).`,
      );
    }

    const engine = linkedEngine;
    if (!engine) {
      throw this.error(
        'RUNTIME_UNSUPPORTED_FEATURE',
        `The on-device diffusion engine (stable-diffusion.cpp / ONNX) is not in this build. Model weights for '${manifest.displayName}' (${(manifest.downloadSizeBytes / 1e9).toFixed(2)} GB) stay in your Vault, but no image can be generated until the engine is linked.`,
      );
    }

    const modelPath = getInstalledModelPath(manifest);
    if (!modelPath) throw this.error('MODEL_NOT_INSTALLED', `Model file for '${manifest.displayName}' was not found on disk.`);

    this.abort = new AbortController();
    const steps = Math.max(1, plan.steps || manifest.defaultSteps);
    let outPath: string;
    try {
      onProgress(0, `Loading ${manifest.displayName}...`);
      try {
        await engine.load(modelPath);
      } catch (e) {
        throw this.error('MODEL_LOAD_FAILED', e instanceof Error ? e.message : String(e));
      }
      outPath = await engine.generate(
        {
          prompt: plan.prompt ?? '',
          steps,
          width: plan.resolution.width,
          height: plan.resolution.height,
          seed: plan.seed,
          cfg: plan.guidanceScale,
        },
        (step, total) => onProgress(Math.min(99, Math.round((step / Math.max(1, total)) * 100)), `Denoising step ${step}/${total}`),
        this.abort.signal,
      );
    } catch (e) {
      if (this.abort.signal.aborted) throw this.error('CANCELLED', 'Generation cancelled.');
      if (isImageGenerationError(e)) throw e;
      throw this.error('UNKNOWN_RUNTIME_ERROR', e instanceof Error ? e.message : String(e));
    } finally {
      this.abort = null;
    }

    const imageId = `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    let saved;
    try {
      saved = await importGalleryImage(
        {
          imageId,
          format: 'png',
          width: plan.resolution.width,
          height: plan.resolution.height,
          modelId: manifest.modelId,
          modelVersion: manifest.version,
          prompt: plan.prompt ?? '',
          qualityMode: plan.qualityMode ?? 'balanced',
          goal: plan.goal ?? 'general',
          favorite: false,
          createdAt: Date.now(),
        },
        outPath,
      );
    } catch (e) {
      throw this.error('OUTPUT_SAVE_FAILED', e instanceof Error ? e.message : String(e));
    }

    const durationMs = Date.now() - startTime;
    onProgress(100, `Complete in ${(durationMs / 1000).toFixed(1)}s.`);

    return {
      imageId: saved.imageId,
      imagePath: saved.absolutePath,
      width: saved.width,
      height: saved.height,
      format: 'png',
      durationMs,
    };
  }

  private error(code: ImageGenerationError['code'], message: string): ImageGenerationError {
    return {
      code,
      message,
      recoveryAction: code === 'MODEL_NOT_INSTALLED' ? 'Go to the Models tab to download and install this model.' : 'Check device compatibility.',
      recoverable: true,
    };
  }
}

function isImageGenerationError(e: unknown): e is ImageGenerationError {
  return !!e && typeof e === 'object' && 'code' in e && 'recoveryAction' in e;
}

export const nativeImageRuntime = new MobileImageRuntimeAdapter();
