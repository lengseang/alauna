/**
 * Image Model Hardware Benchmark Service (service).
 *
 * Feature ID: CHIWIWI-IMG-ARCH-001 §5.9 (Task T11)
 * Records and persists hardware benchmark results on disk.
 * Connects real measured seconds/step from actual diffusion jobs to the adaptive planner.
 */

import { useSyncExternalStore } from 'react';
import { readWithFallback, writeAtomic } from '../core/atomicFile.ts';
import {
  sanitizeBenchmarks,
  type ImageModelBenchmarkRecord,
  type ModelBenchmarkMap,
} from '../core/imageGen/benchmarkStorage.ts';
import { createStore } from '../core/store.ts';
import { directoryIO } from './atomicIo.ts';
import { galleryDir, isStorageReady } from './storage.ts';

const BENCHMARK_FILE = 'chiwiwi_image_benchmarks.json';

interface BenchmarkStoreState {
  benchmarks: ModelBenchmarkMap;
  loaded: boolean;
}

const benchmarkStore = createStore<BenchmarkStoreState>({
  benchmarks: {},
  loaded: false,
});

const benchmarkIO = () => directoryIO(galleryDir);

export async function initImageBenchmarks(force = false): Promise<void> {
  if (!isStorageReady()) return;
  if (!force && benchmarkStore.getState().loaded) return;
  try {
    const data = await readWithFallback(
      benchmarkIO(),
      BENCHMARK_FILE,
      (text) => sanitizeBenchmarks(JSON.parse(text)),
    );
    benchmarkStore.setState({ benchmarks: data ?? {}, loaded: true });
  } catch {
    benchmarkStore.setState({ benchmarks: {}, loaded: true });
  }
}

export function useImageBenchmarks(): ModelBenchmarkMap {
  const state = useSyncExternalStore(benchmarkStore.subscribe, benchmarkStore.getState);
  return state.benchmarks;
}

export function getBenchmarkForModel(modelId: string): ImageModelBenchmarkRecord | null {
  return benchmarkStore.getState().benchmarks[modelId] ?? null;
}

export async function recordGenerationBenchmark(
  modelId: string,
  resolution: { width: number; height: number },
  steps: number,
  durationMs: number,
  backend: 'cpu' | 'gpu' = 'cpu',
): Promise<void> {
  if (!isStorageReady() || steps <= 0 || durationMs <= 0) return;

  const msPerStep = Math.round(durationMs / steps);
  const record: ImageModelBenchmarkRecord = {
    modelId,
    backend,
    resolution,
    steps,
    durationMs,
    msPerStep,
    measuredAt: Date.now(),
  };

  const current = { ...benchmarkStore.getState().benchmarks, [modelId]: record };
  benchmarkStore.setState({ benchmarks: current });

  try {
    await writeAtomic(benchmarkIO(), BENCHMARK_FILE, JSON.stringify(current, null, 2));
  } catch {
    // Non-fatal persistence error
  }
}
