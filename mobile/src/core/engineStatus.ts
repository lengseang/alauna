/**
 * ONE observable status for the whole AI engine, for the UI.
 *
 * `EngineState` (core/engineManager.ts) is the raw machine; this turns it into the flat shape a status chip,
 * a Model Hub card or a "Test model" button needs. Every number is either measured by llama.cpp or clearly an
 * estimate (`ramEstimateMb`). Nothing is invented: before the first real generation the speed fields are null.
 */
import { getModel } from './catalog.ts';
import type { EngineState } from './engineManager.ts';
import type { EngineErrorKind } from './engineTypes.ts';
import { estimateRamBytes } from './fit.ts';

export type EngineUiState = 'idle' | 'loading' | 'warming' | 'ready' | 'generating' | 'error';

export interface EngineStatus {
  state: EngineUiState;
  /** 0..1 while state === 'loading'; 1 once loaded; 0 otherwise. */
  progress: number;
  modelId: string | null;
  modelName: string | null;
  /** "CPU" or "GPU (...)" - what llama.cpp actually reports, null until a model is loaded. */
  backend: string | null;
  /** GGUF architecture, e.g. "qwen35". */
  architecture: string | null;
  nCtx: number;
  /** Speed of the most recent generation (warm-up or chat), tokens per second. */
  lastTokPerSec: number | null;
  /** Tokens produced by the most recent generation. */
  lastTokens: number | null;
  /** Time from request to first token of the most recent generation, ms. */
  ttftMs: number | null;
  loadMs: number | null;
  warmupMs: number | null;
  /** ESTIMATE of the memory this model needs (file + context + overhead). Not a measurement. */
  ramEstimateMb: number | null;
  /** What the OS says the phone has. */
  ramTotalMb: number | null;
  /** Plain-language failure, with a fix. */
  error: string | null;
  errorKind: EngineErrorKind | null;
  errorFix: string | null;
  /** The previous run died while loading this model (almost always out of memory). */
  crashedModelId: string | null;
  /** The model was unloaded on purpose to free memory; it reloads on the next message. */
  unloadedReason: 'memory' | 'background' | null;
  /** One honest sentence for a status chip. */
  headline: string;
}

export function deriveEngineStatus(s: EngineState, totalRamBytes: number | null): EngineStatus {
  const spec = getModel(s.modelId);
  let state: EngineUiState;
  switch (s.status) {
    case 'mounting':
      state = s.stage === 'warming' ? 'warming' : 'loading';
      break;
    case 'ready':
      state = 'ready';
      break;
    case 'generating':
      state = 'generating';
      break;
    case 'error':
      state = 'error';
      break;
    default:
      state = 'idle';
  }
  const loaded = state === 'ready' || state === 'generating';
  const name = spec?.name ?? null;
  const tps = s.lastTokPerSec;
  const speed = tps ? ` · ${tps.toFixed(1)} tok/s` : '';

  let headline: string;
  switch (state) {
    case 'loading':
      headline = `Loading ${name ?? 'model'}${s.stage === 'checking' ? '...' : ` ${Math.round(s.loadProgress * 100)}%`}`;
      break;
    case 'warming':
      headline = `Testing ${name ?? 'model'} (first words)...`;
      break;
    case 'ready':
      headline = `Ready - ${name ?? 'model'} · ${s.info?.backend ?? 'CPU'} · ${s.nCtx} ctx${speed}`;
      break;
    case 'generating':
      headline = `Writing - ${name ?? 'model'}${speed}`;
      break;
    case 'error':
      headline = s.error ?? 'The model could not start.';
      break;
    default:
      headline = s.unloadedReason ? 'Model unloaded to free memory - it loads again when you send a message.' : 'No model loaded';
  }

  return {
    state,
    progress: state === 'loading' ? s.loadProgress : loaded || state === 'warming' ? 1 : 0,
    modelId: s.modelId,
    modelName: name,
    backend: loaded || state === 'warming' ? (s.info?.backend ?? null) : null,
    architecture: s.info?.architecture ?? null,
    nCtx: s.nCtx,
    lastTokPerSec: s.lastTokPerSec,
    lastTokens: s.lastTokens,
    ttftMs: s.ttftMs,
    loadMs: s.loadMs,
    warmupMs: s.warmupMs,
    ramEstimateMb: spec && s.nCtx > 0 ? Math.round(estimateRamBytes(spec, s.nCtx) / 1e6) : null,
    ramTotalMb: totalRamBytes ? Math.round(totalRamBytes / 1e6) : null,
    error: s.error,
    errorKind: s.errorKind,
    errorFix: s.errorFix,
    crashedModelId: s.crashedModelId,
    unloadedReason: s.unloadedReason,
    headline,
  };
}
