/**
 * Image Generation Coordinator & Job State Machine (pure core).
 *
 * Feature ID: CHIWIWI-IMG-ARCH-001 §5.2
 * Orchestrates the single-job queue, validation, planning, execution events,
 * cancellation transitions, and typed error mapping.
 */

import type {
  DeviceResourceState,
  GenerationJob,
  GenerationPlan,
  GenerationRequest,
  GenerationStatus,
  ImageGenerationError,
  ImageGenerationErrorCode,
  ImageModelManifest,
} from './types.ts';
import { planScene } from './scenePlanner.ts';
import { planGeneration } from './adaptivePlanner.ts';
import { getImageModelManifest } from './modelRegistry.ts';

export type JobEventListener = (job: GenerationJob) => void;

export class ImageGenerationCoordinator {
  private activeJob: GenerationJob | null = null;
  private listeners: Set<JobEventListener> = new Set();
  private cancellationRequested = false;

  public subscribe(listener: JobEventListener): () => void {
    this.listeners.add(listener);
    if (this.activeJob) listener(this.activeJob);
    return () => this.listeners.delete(listener);
  }

  public getActiveJob(): GenerationJob | null {
    return this.activeJob ? { ...this.activeJob } : null;
  }

  private notify(job: GenerationJob) {
    this.activeJob = { ...job };
    for (const listener of this.listeners) {
      try {
        listener(this.activeJob);
      } catch {
        // Safe listener execution
      }
    }
  }

  /**
   * Submits a new generation request. Rejects if a job is already actively running (§7.1 single job invariant).
   */
  public async submitRequest(
    request: GenerationRequest,
    device: DeviceResourceState,
    executor: (plan: GenerationPlan, onProgress: (pct: number, stage: string) => void) => Promise<{ imageId: string; imagePath: string }>,
  ): Promise<GenerationJob> {
    if (this.activeJob && !['completed', 'cancelled', 'failed', 'interrupted'].includes(this.activeJob.status)) {
      throw this.createError('RESOURCE_BUDGET_EXCEEDED', 'A generation job is already active. Chiwiwi runs one image job at a time to preserve device memory.');
    }

    const jobId = `img_job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    this.cancellationRequested = false;

    const job: GenerationJob = {
      jobId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'queued',
      request,
    };
    this.notify(job);

    try {
      // 1. Validating
      this.transition(job, 'validating', 'Validating prompt and model compatibility...');
      const modelId = request.modelId ?? 'sd-turbo-q4';
      const manifest = getImageModelManifest(modelId);
      if (!manifest) {
        throw this.createError('MODEL_NOT_INSTALLED', `Requested model ${modelId} is not installed.`);
      }
      job.modelId = manifest.modelId;
      job.modelVersion = manifest.version;

      // 2. Planning
      this.transition(job, 'planning', 'Synthesizing scene composition and hardware budget...');
      const scene = planScene(request);
      const plan = planGeneration(request, manifest, device);
      job.planSummary = {
        selectedResolution: `${plan.resolution.width}x${plan.resolution.height}`,
        selectedSteps: plan.steps,
        selectedProfile: request.qualityMode,
        refinementEnabled: plan.allowRefinement,
        upscaleEnabled: plan.allowUpscale,
        rationale: plan.explanation,
      };
      this.notify(job);

      if (this.checkCancelled(job)) return job;

      // 3. Loading Model
      this.transition(job, 'loading_model', `Preparing ${manifest.displayName}...`);
      if (this.checkCancelled(job)) return job;

      // 4. Generating Draft
      this.transition(job, 'generating_draft', `Synthesizing image (${plan.resolution.width}x${plan.resolution.height}, ${plan.steps} steps)...`);
      const result = await executor(plan, (pct, stage) => {
        job.progressPercent = pct;
        job.currentStageDescription = stage;
        job.updatedAt = Date.now();
        this.notify(job);
      });

      if (this.checkCancelled(job)) return job;

      // 5. Saving
      this.transition(job, 'saving', 'Committing image asset to local gallery...');
      job.outputImageId = result.imageId;
      job.outputImagePath = result.imagePath;

      // 6. Completed
      job.status = 'completed';
      job.progressPercent = 100;
      job.currentStageDescription = 'Image generation complete.';
      job.updatedAt = Date.now();
      this.notify(job);
      return job;
    } catch (e) {
      if (this.cancellationRequested || job.status === 'cancel_pending') {
        job.status = 'cancelled';
        job.currentStageDescription = 'Generation cancelled by user.';
      } else {
        job.status = 'failed';
        const err = e as Partial<ImageGenerationError>;
        job.errorCode = err.code ?? 'UNKNOWN_RUNTIME_ERROR';
        job.errorMessage = err.message ?? (e instanceof Error ? e.message : String(e));
        job.recoveryAction = err.recoveryAction ?? 'Try again with Fast Draft mode or restart the app.';
      }
      job.updatedAt = Date.now();
      this.notify(job);
      return job;
    }
  }

  public requestCancellation() {
    this.cancellationRequested = true;
    if (this.activeJob && !['completed', 'cancelled', 'failed', 'interrupted'].includes(this.activeJob.status)) {
      this.activeJob.status = 'cancel_pending';
      this.activeJob.currentStageDescription = 'Cancellation requested. Releasing resources...';
      this.activeJob.updatedAt = Date.now();
      this.notify(this.activeJob);
    }
  }

  private checkCancelled(job: GenerationJob): boolean {
    if (this.cancellationRequested || job.status === 'cancel_pending') {
      job.status = 'cancelled';
      job.currentStageDescription = 'Generation cancelled by user.';
      job.updatedAt = Date.now();
      this.notify(job);
      return true;
    }
    return false;
  }

  private transition(job: GenerationJob, status: GenerationStatus, desc: string) {
    job.status = status;
    job.currentStageDescription = desc;
    job.updatedAt = Date.now();
    this.notify(job);
  }

  private createError(code: ImageGenerationErrorCode, message: string): ImageGenerationError {
    const recoveryMap: Record<ImageGenerationErrorCode, string> = {
      MODEL_NOT_INSTALLED: 'Download a compatible image generation model first.',
      MODEL_INCOMPATIBLE: 'This model is not supported on this phone architecture.',
      MODEL_VERIFICATION_FAILED: 'Model file integrity check failed. Re-download the model.',
      MODEL_LOAD_FAILED: 'Could not allocate native memory for the model. Close other apps.',
      INSUFFICIENT_STORAGE: 'Free up phone storage to save generated images.',
      RESOURCE_BUDGET_EXCEEDED: 'Wait for the current image job to finish before starting another.',
      THERMAL_LIMIT: 'Phone is warm. Let the device cool down or use Fast Draft mode.',
      CANCELLED: 'Generation was cancelled.',
      RUNTIME_UNSUPPORTED_FEATURE: 'Requested feature is not supported by the active model.',
      OUTPUT_DECODE_FAILED: 'Image output could not be decoded. Try another seed.',
      OUTPUT_SAVE_FAILED: 'Could not write image to storage slot.',
      PERMISSION_DENIED: 'Storage or photo permission was denied.',
      INTERRUPTED: 'Job was interrupted by app backgrounding.',
      UNKNOWN_RUNTIME_ERROR: 'An unknown runtime error occurred. Check app diagnostics.',
    };

    return {
      code,
      message,
      recoveryAction: recoveryMap[code],
      recoverable: code !== 'MODEL_INCOMPATIBLE',
    };
  }
}

// Global coordinator singleton
export const imageCoordinator = new ImageGenerationCoordinator();
