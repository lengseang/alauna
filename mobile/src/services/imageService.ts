/**
 * Background Image Generation Service (pure service).
 *
 * Feature ID: CHIWIWI-IMG-ARCH-001
 * App-wide singleton that executes image generation in the background,
 * maintaining live progress, stage telemetry, elapsed timers, and
 * cancellation across view navigation and screen unmounts.
 */

import { useSyncExternalStore } from 'react';
import { createStore } from '../core/store.ts';
import type {
  DeviceResourceState,
  GenerationJob,
  GenerationRequest,
} from '../core/imageGen/types.ts';
import { imageCoordinator } from '../core/imageGen/coordinator.ts';
import { nativeImageRuntime } from './imageRuntime.ts';
import { showToast } from './toast.ts';

export interface ImageServiceState {
  activeJob: GenerationJob | null;
  isGenerating: boolean;
  elapsedSeconds: number;
  latestGeneratedImageId?: string;
  error?: string;
}

const serviceStore = createStore<ImageServiceState>({
  activeJob: imageCoordinator.getActiveJob(),
  isGenerating: false,
  elapsedSeconds: 0,
});

let timerHandle: ReturnType<typeof setInterval> | null = null;
let startTimestamp = 0;

// Subscribe to pure coordinator state machine
imageCoordinator.subscribe((job) => {
  const isBusy = ['queued', 'validating', 'planning', 'loading_model', 'generating_draft', 'refining', 'upscaling', 'saving'].includes(job.status);

  if (isBusy && !timerHandle) {
    startTimestamp = Date.now();
    timerHandle = setInterval(() => {
      const elapsed = Math.round((Date.now() - startTimestamp) / 1000);
      serviceStore.setState({ elapsedSeconds: elapsed });
    }, 500);
  } else if (!isBusy && timerHandle) {
    clearInterval(timerHandle);
    timerHandle = null;
  }

  serviceStore.setState({
    activeJob: { ...job },
    isGenerating: isBusy,
    latestGeneratedImageId: job.outputImageId ?? serviceStore.getState().latestGeneratedImageId,
    error: job.status === 'failed' ? job.errorMessage : undefined,
  });
});

/**
 * Initiates an image generation job in the background.
 * Safe to call from any component without losing state on unmount.
 */
export async function startImageGeneration(
  request: GenerationRequest,
  deviceState: DeviceResourceState = {
    totalRamBytes: 12 * 1024 * 1024 * 1024,
    thermalState: 'nominal',
  },
): Promise<GenerationJob | null> {
  if (serviceStore.getState().isGenerating) {
    showToast('An image generation job is already running in the background.');
    return serviceStore.getState().activeJob;
  }

  serviceStore.setState({ elapsedSeconds: 0, error: undefined });

  try {
    const job = await imageCoordinator.submitRequest(request, deviceState, async (plan, onProgress) => {
      return await nativeImageRuntime.generate(plan, onProgress);
    });
    return job;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    showToast(message, 5000);
    serviceStore.setState({ error: message, isGenerating: false });
    return null;
  }
}

/** Cancel active background generation. */
export function cancelImageGeneration(): void {
  nativeImageRuntime.cancel();
  imageCoordinator.requestCancellation();
  if (timerHandle) {
    clearInterval(timerHandle);
    timerHandle = null;
  }
  serviceStore.setState({ isGenerating: false });
}

/** React hook for subscribing to the background image service. */
export function useImageService(): ImageServiceState & {
  startGeneration: typeof startImageGeneration;
  cancelGeneration: typeof cancelImageGeneration;
} {
  const state = useSyncExternalStore(
    serviceStore.subscribe,
    serviceStore.getState,
    serviceStore.getState,
  );

  return {
    ...state,
    startGeneration: startImageGeneration,
    cancelGeneration: cancelImageGeneration,
  };
}
