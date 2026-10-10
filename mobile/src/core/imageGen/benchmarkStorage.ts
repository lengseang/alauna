/**
 * Local Image Model Hardware Benchmark & Calibrator (pure core).
 *
 * Feature ID: CHIWIWI-IMG-ARCH-001 §5.9 (Task T11)
 * Tracks real on-device milliseconds-per-step per model and backend.
 * Calibrates the adaptive planner so user time targets (Fast <= 25s, Balanced <= 45s, Quality <= 75s)
 * are achieved using real measured device speeds, never fabricated constants.
 */

export interface ImageModelBenchmarkRecord {
  modelId: string;
  backend: 'cpu' | 'gpu';
  resolution: { width: number; height: number };
  steps: number;
  durationMs: number;
  msPerStep: number;
  measuredAt: number;
}

export interface ModelBenchmarkMap {
  [modelId: string]: ImageModelBenchmarkRecord;
}

/**
 * Calculates dynamically calibrated step count based on real phone measurements.
 * If no benchmark exists yet, returns fallback steps and reports 'not measured yet'.
 */
export function calculateCalibratedSteps(
  modelId: string,
  targetTimeSec: number,
  benchmarks: ModelBenchmarkMap,
  fallbackSteps: number,
  maxSteps: number,
  minSteps = 4,
): { steps: number; calibrated: boolean; msPerStep: number | null } {
  const record = benchmarks[modelId];
  if (!record || record.msPerStep <= 0) {
    return {
      steps: Math.min(maxSteps, Math.max(minSteps, fallbackSteps)),
      calibrated: false,
      msPerStep: null,
    };
  }

  // Real measured latency budgeting:
  const budgetSteps = Math.round((targetTimeSec * 1000) / record.msPerStep);
  const clampedSteps = Math.min(maxSteps, Math.max(minSteps, budgetSteps));

  return {
    steps: clampedSteps,
    calibrated: true,
    msPerStep: record.msPerStep,
  };
}

export function sanitizeBenchmarks(raw: unknown): ModelBenchmarkMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const map: ModelBenchmarkMap = {};
  for (const [key, val] of Object.entries(raw as Record<string, any>)) {
    if (
      val &&
      typeof val === 'object' &&
      typeof val.modelId === 'string' &&
      typeof val.msPerStep === 'number' &&
      val.msPerStep > 0
    ) {
      map[key] = {
        modelId: val.modelId,
        backend: val.backend === 'gpu' ? 'gpu' : 'cpu',
        resolution: {
          width: typeof val.resolution?.width === 'number' ? val.resolution.width : 512,
          height: typeof val.resolution?.height === 'number' ? val.resolution.height : 512,
        },
        steps: typeof val.steps === 'number' ? val.steps : 14,
        durationMs: typeof val.durationMs === 'number' ? val.durationMs : 0,
        msPerStep: val.msPerStep,
        measuredAt: typeof val.measuredAt === 'number' ? val.measuredAt : Date.now(),
      };
    }
  }
  return map;
}
