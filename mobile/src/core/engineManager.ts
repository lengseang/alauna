/**
 * Model lifecycle: verify file -> fit check -> load into RAM -> WARM-UP generation -> ready.
 *
 * Requirements MV-1..MV-3: "Mount" really loads the model, a model is "Verified"
 * only if it produced real tokens, and nothing is ever fabricated. All side effects
 * (engine, settings, files) are injected so this is unit-tested with a fake engine.
 *
 * "Ready" therefore means PROVEN: the model was loaded AND generated at least one token
 * in this session. Every failure carries a cause and a next step (`errorKind`, `error`, `errorFix`).
 *
 * v2: the load uses Settings.compute (threads, context, batch, flash attention, KV types, mmap/mlock, GPU), optional
 * speculative decoding (llama.rn MTP drafting) and an optional vision projector. Experimental features are relaxed
 * one by one when a load or warm-up fails (speculative -> quantized KV -> GPU), and every relaxation is recorded in
 * `fallbacks` with the reason, so the UI can say "GPU failed (...): using CPU" instead of silently changing behaviour.
 */
import { getModel as catalogModel, type ModelSpec } from './catalog.ts';
import { defaultContext, estimateRamBytes, fitFor } from './fit.ts';
import { formatBytes } from './format.ts';
import type { PromptMessage } from './chatPrompt.ts';
import {
  diagnoseEngineError,
  SpeculativeUnsupportedError,
  type EngineDiagnosis,
  type EngineErrorKind,
  type GenerateParams,
  type GenerateResult,
  type InferenceEngine,
  type LoadedModelInfo,
  type SpeculativeLoad,
} from './engineTypes.ts';
import type { KvCacheType, Settings } from './settingsModel.ts';
import { createStore } from './store.ts';

export type EngineStatus = 'unmounted' | 'mounting' | 'ready' | 'generating' | 'error';
export type MountStage = 'checking' | 'loading' | 'warming';

export interface SpeculativeState {
  /** What Settings asked for. */
  requested: 'off' | 'mtp' | 'draft';
  draftModelId: string | null;
  /** Speculative decoding is configured on the loaded context. */
  active: boolean;
  /** Why it is not active (validation or load failure), plain words. */
  reason: string | null;
  /** Totals since the model was loaded, from llama.cpp's own counters. */
  draftTokens: number;
  acceptedTokens: number;
  /** accepted / drafted, 0..1; null until something was drafted. */
  acceptanceRate: number | null;
  /** Last measured chat speed with speculative on, and the baseline without it (tok/s, this phone). */
  specTokPerSec: number | null;
  baselineTokPerSec: number | null;
  /** specTokPerSec / baselineTokPerSec, null until both were measured. */
  speedup: number | null;
}

export interface KvCacheState {
  /** Settings.compute.kvSessionCache */
  enabled: boolean;
  /** off = disabled or engine cannot; idle = nothing prepared yet; saved = prefix evaluated now and written; loaded = restored from disk. */
  status: 'off' | 'idle' | 'saved' | 'loaded' | 'error';
  /** Tokens in the prefix that was saved/restored. */
  tokens: number;
  /** Time to evaluate + save, or to restore (ms). */
  ms: number | null;
  reason: string | null;
  /** First reply after a load, send -> first token INCLUDING the prefix work: evaluated now (cold) vs restored (warm). */
  coldTtftMs: number | null;
  warmTtftMs: number | null;
}

export interface EngineState {
  status: EngineStatus;
  modelId: string | null;
  stage: MountStage | null;
  /** 0..1 while stage === 'loading' */
  loadProgress: number;
  error: string | null;
  /** Machine-readable cause of `error`. */
  errorKind: EngineErrorKind | null;
  /** What the user can do about `error`. */
  errorFix: string | null;
  info: LoadedModelInfo | null;
  nCtx: number;
  /** Set at startup if the previous run died while loading this model (almost always out of memory). */
  crashedModelId: string | null;
  /** Set when the model was unloaded on purpose to free memory (app in background / memory warning); cleared by the next load. */
  unloadedReason: 'memory' | 'background' | null;
  /** Wall time of the last successful load / warm-up (ms), null until proven. */
  loadMs: number | null;
  warmupMs: number | null;
  /** Numbers from the most recent generation (warm-up or chat) - all measured, never invented. */
  lastTokPerSec: number | null;
  lastTokens: number | null;
  ttftMs: number | null;
  /** Prompt tokens of the most recent generation, prompt + generated (context used), tokens reused from the KV cache. */
  lastPromptTokens: number | null;
  lastCtxUsed: number | null;
  lastCachedTokens: number | null;
  /** Features that were switched off automatically during the last load, each with its reason. */
  fallbacks: string[];
  speculative: SpeculativeState;
  kvCache: KvCacheState;
}

export interface KvCacheDeps {
  /** Real file path for a session file with this key (no file://). */
  pathFor(key: string): string;
  exists(path: string): boolean;
  remove(path: string): void;
}

export interface EngineDeps {
  engine: InferenceEngine;
  getSettings(): Settings;
  /** Must persist before resolving (used right before risky native work). */
  updateSettingsNow(patch: Partial<Settings>): Promise<void>;
  verifyFile(spec: ModelSpec): { ok: boolean; reason?: string };
  modelPath(spec: ModelSpec): string;
  totalRamBytes(): number | null;
  now(): number;
  /** Catalog lookup for draft models (default: core/catalog getModel). */
  getModel?(id: string): ModelSpec | undefined;
  /** Real path of a DOWNLOADED companion file (vision projector / MTP draft head), or null. */
  companionPath?(spec: ModelSpec, kind: 'mmproj' | 'draft'): string | null;
  /** KV session files (absent = feature off). */
  kvCache?: KvCacheDeps;
}

export type MountResult =
  | { ok: true; loadMs: number; tokensPerSecond: number; ttftMs: number; warmupMs: number }
  | { ok: false; code: 'file' | 'too_heavy' | 'engine' | 'no_output'; message: string; kind?: EngineErrorKind; fix?: string };

export class EngineNotReadyError extends Error {
  constructor() {
    super('No model is loaded. Download a model and load it from the Model Hub first.');
    this.name = 'EngineNotReadyError';
  }
}

const WARMUP_PROMPT: PromptMessage[] = [{ role: 'user', content: 'Reply with the single word: ready' }];
/** The warm-up only has to prove that tokens come out (1-5 tokens). */
export const WARMUP_MAX_TOKENS = 5;
/** Only replies at least this long update the stored chat speeds (short ones are dominated by prompt time). */
const SPEED_SAMPLE_MIN_TOKENS = 16;

/** Tokenizer-compatibility key from the catalog (`draftCompatible`); null when the entry has none. */
export function draftKeyOf(spec: ModelSpec): string | null {
  const r = spec as unknown as { draftCompatible?: unknown; draftKey?: unknown };
  const k = r.draftCompatible ?? r.draftKey;
  return typeof k === 'string' && k ? k : null;
}

export interface SpeculativePlan {
  requested: SpeculativeState['requested'];
  draftModelId: string | null;
  load?: SpeculativeLoad;
  /** Why it will not be used, when it cannot be. */
  reason?: string;
}

/** Turn Settings.speculative into what to load, validating the target/draft pair first (never load a mismatched draft). */
export function planSpeculative(
  spec: ModelSpec,
  settings: Settings,
  deps: {
    getModel(id: string): ModelSpec | undefined;
    isInstalled(spec: ModelSpec): boolean;
    modelPath(spec: ModelSpec): string;
    companionPath?(spec: ModelSpec, kind: 'draft'): string | null;
  },
): SpeculativePlan {
  const sp = settings.speculative;
  if (!sp.enabled) return { requested: 'off', draftModelId: null };
  const draftId = sp.draftModelId && sp.draftModelId !== 'mtp' ? sp.draftModelId : null;
  if (!draftId) {
    // "Built-in": the model's dedicated MTP draft head (catalog `draft`, e.g. Gemma 4) if downloaded, else its own nextn layers.
    if (spec.draft) {
      const head = deps.companionPath?.(spec, 'draft') ?? null;
      if (!head) return { requested: 'mtp', draftModelId: null, reason: `${spec.name}'s speed-up draft head is not downloaded. Get it in the Model Vault.` };
      return { requested: 'mtp', draftModelId: null, load: { mode: 'draft', draftPath: head, nMax: sp.nDraft, pMin: sp.pMin } };
    }
    return { requested: 'mtp', draftModelId: null, load: { mode: 'mtp', nMax: sp.nDraft, pMin: sp.pMin } };
  }
  const base = { requested: 'draft' as const, draftModelId: draftId };
  const draft = deps.getModel(draftId);
  if (!draft) return { ...base, reason: `The draft model "${draftId}" is not in the catalog.` };
  if (draft.id === spec.id) return { ...base, reason: 'A model cannot draft for itself. Choose "Built-in (MTP)" instead.' };
  const kt = draftKeyOf(spec);
  const kd = draftKeyOf(draft);
  if (!kt || !kd || kt !== kd) {
    return { ...base, reason: `${draft.name} cannot draft for ${spec.name}: they do not share a tokenizer.` };
  }
  if (!deps.isInstalled(draft)) return { ...base, reason: `${draft.name} (draft) is not downloaded.` };
  return { ...base, load: { mode: 'draft', draftPath: deps.modelPath(draft), nMax: sp.nDraft, pMin: sp.pMin } };
}

/** FNV-1a 32-bit, hex. Names KV session files; collisions only cost a cache miss (the file is then re-made). */
export function hashKey(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Failures where switching an experimental feature off can help (not a damaged file / unknown architecture / no engine). */
const RELAXABLE: ReadonlySet<EngineErrorKind> = new Set(['out_of_memory', 'unknown', 'no_output', 'busy']);

interface Attempt {
  gpu: boolean;
  speculative?: SpeculativeLoad;
  cacheTypeK: KvCacheType;
  cacheTypeV: KvCacheType;
}

type AttemptResult =
  | { ok: true; info: LoadedModelInfo; warm: GenerateResult; loadMs: number; warmupMs: number }
  | { ok: false; stage: 'load' | 'warmup' | 'no_output'; diag: EngineDiagnosis; speculativeRejected: boolean };

const IDLE_SPECULATIVE: SpeculativeState = {
  requested: 'off',
  draftModelId: null,
  active: false,
  reason: null,
  draftTokens: 0,
  acceptedTokens: 0,
  acceptanceRate: null,
  specTokPerSec: null,
  baselineTokPerSec: null,
  speedup: null,
};
const IDLE_KV: KvCacheState = { enabled: false, status: 'off', tokens: 0, ms: null, reason: null, coldTtftMs: null, warmTtftMs: null };

export class EngineManager {
  readonly store = createStore<EngineState>({
    status: 'unmounted',
    modelId: null,
    stage: null,
    loadProgress: 0,
    error: null,
    errorKind: null,
    errorFix: null,
    info: null,
    nCtx: 0,
    crashedModelId: null,
    unloadedReason: null,
    loadMs: null,
    warmupMs: null,
    lastTokPerSec: null,
    lastTokens: null,
    ttftMs: null,
    lastPromptTokens: null,
    lastCtxUsed: null,
    lastCachedTokens: null,
    fallbacks: [],
    speculative: { ...IDLE_SPECULATIVE },
    kvCache: { ...IDLE_KV },
  });
  private readonly deps: EngineDeps;
  private mounting: Promise<MountResult> | null = null;
  private mountingId: string | null = null;
  /** Models whose GPU load failed in this session: later loads go straight to CPU. */
  private readonly gpuFailed = new Map<string, string>();
  /** KV prefix currently in the context (key), and the first-turn measurement pending after preparing it. */
  private primedKey: string | null = null;
  private firstTurn: { status: 'saved' | 'loaded'; ms: number } | null = null;

  constructor(deps: EngineDeps) {
    this.deps = deps;
  }

  get state(): EngineState {
    return this.store.getState();
  }

  private currentStatus(): EngineStatus {
    return this.store.getState().status;
  }

  isReady(modelId?: string): boolean {
    const s = this.state;
    return (s.status === 'ready' || s.status === 'generating') && (modelId === undefined || s.modelId === modelId);
  }

  /** The loaded model can see images (a projector was initialised and reports vision). */
  supportsVision(): boolean {
    return this.isReady() && !!this.state.info?.multimodal?.vision;
  }

  /** Call once at launch: detects a crash that happened while a model was loading last time. */
  async noteStartup(): Promise<void> {
    const s = this.deps.getSettings();
    if (s.pendingMountModelId) {
      this.store.setState({ crashedModelId: s.pendingMountModelId });
      const patch: Partial<Settings> = {
        pendingMountModelId: null,
        activeModelId: s.activeModelId === s.pendingMountModelId ? null : s.activeModelId,
      };
      if (s.pendingMountGpu) {
        // The experimental GPU path took the whole app down: do not try it again by itself.
        patch.pendingMountGpu = false;
        patch.compute = { ...s.compute, backend: 'cpu' };
        patch.computeNotice = 'The app closed while loading a model on the GPU, so the GPU was switched off. Models now load on the CPU.';
      }
      await this.deps.updateSettingsNow(patch);
    }
  }

  dismissCrashNotice(): void {
    this.store.setState({ crashedModelId: null });
  }

  /** Context size actually used: user setting or RAM-based default. */
  contextSize(): number {
    const s = this.deps.getSettings();
    return s.compute?.nCtx ?? s.contextOverride ?? defaultContext(this.deps.totalRamBytes());
  }

  mount(spec: ModelSpec, opts: { force?: boolean } = {}): Promise<MountResult> {
    if (this.mounting && this.mountingId === spec.id) return this.mounting;
    if (this.mounting) {
      return Promise.resolve({ ok: false, code: 'engine', message: 'Another model is still loading. Wait for it to finish.' });
    }
    if (this.state.status === 'generating') {
      return Promise.resolve({ ok: false, code: 'engine', message: 'Wait for the current reply to finish (or press Stop) before switching models.' });
    }
    this.mountingId = spec.id;
    this.mounting = this.doMount(spec, !!opts.force).finally(() => {
      this.mounting = null;
      this.mountingId = null;
    });
    return this.mounting;
  }

  private fail(spec: ModelSpec, code: Extract<MountResult, { ok: false }>['code'], message: string, kind: EngineErrorKind, fix: string): MountResult {
    this.store.setState({
      status: 'error',
      modelId: spec.id,
      stage: null,
      loadProgress: 0,
      error: message,
      errorKind: kind,
      errorFix: fix,
      info: null,
      loadMs: null,
      warmupMs: null,
    });
    return { ok: false, code, message: `${message} ${fix}`.trim(), kind, fix };
  }

  /** Persist the crash marker right before risky native work. Records whether this attempt uses the GPU. */
  private async markPending(spec: ModelSpec, gpu: boolean): Promise<void> {
    const patch: Partial<Settings> = { pendingMountModelId: spec.id };
    if (gpu || this.deps.getSettings().pendingMountGpu) patch.pendingMountGpu = gpu;
    await this.deps.updateSettingsNow(patch);
  }

  private async clearPending(extra: Partial<Settings> = {}): Promise<void> {
    await this.deps.updateSettingsNow({ pendingMountModelId: null, pendingMountGpu: false, ...extra });
  }

  /** One load + warm-up with a fixed configuration. Releases the engine on any failure. */
  private async attempt(spec: ModelSpec, a: Attempt, nCtx: number, mmprojPath: string | undefined): Promise<AttemptResult> {
    const d = this.deps;
    const c = d.getSettings().compute;
    await this.markPending(spec, a.gpu);
    this.store.setState({ stage: 'loading', loadProgress: 0 });
    const t0 = d.now();
    let info: LoadedModelInfo;
    try {
      info = await d.engine.load({
        path: d.modelPath(spec),
        nCtx,
        threads: c?.threads ?? d.getSettings().threads,
        useGpu: a.gpu,
        nGpuLayers: c?.nGpuLayers,
        nBatch: c?.nBatch,
        flashAttn: c?.flashAttn,
        cacheTypeK: a.cacheTypeK,
        cacheTypeV: a.cacheTypeV,
        useMmap: c?.useMmap,
        useMlock: c?.useMlock,
        speculative: a.speculative,
        mmprojPath,
        onProgress: (p) => this.store.setState({ loadProgress: Math.max(0, Math.min(1, p)) }),
      });
    } catch (e) {
      await this.safeRelease();
      return { ok: false, stage: 'load', diag: diagnoseEngineError(e), speculativeRejected: e instanceof SpeculativeUnsupportedError };
    }
    const loadMs = d.now() - t0;

    // WARM-UP: it must actually produce tokens before anything may call it "ready".
    this.store.setState({ stage: 'warming', loadProgress: 1 });
    const w0 = d.now();
    let warm: GenerateResult;
    try {
      warm = await d.engine.generate({
        messages: WARMUP_PROMPT,
        maxTokens: WARMUP_MAX_TOKENS,
        temperature: 0,
        enableThinking: false,
        onText: () => undefined,
      });
    } catch (e) {
      await this.safeRelease();
      return { ok: false, stage: 'warmup', diag: diagnoseEngineError(e), speculativeRejected: false };
    }
    const warmupMs = d.now() - w0;
    if (!warm.text.trim() && warm.generatedTokens === 0) {
      await this.safeRelease();
      return {
        ok: false,
        stage: 'no_output',
        diag: { kind: 'no_output', message: 'The model loaded but produced no output, so it was not marked verified.', fix: 'Try another model, or delete this one and download it again.' },
        speculativeRejected: false,
      };
    }
    return { ok: true, info, warm, loadMs, warmupMs };
  }

  private async doMount(spec: ModelSpec, force: boolean): Promise<MountResult> {
    const d = this.deps;
    const nCtx = this.contextSize();
    const settings = d.getSettings();
    const getModel = d.getModel ?? catalogModel;
    const plan = planSpeculative(spec, settings, {
      getModel,
      isInstalled: (s) => d.verifyFile(s).ok,
      modelPath: d.modelPath,
      companionPath: d.companionPath ? (s, k) => d.companionPath!(s, k) : undefined,
    });
    const verified = settings.verified[spec.id];
    this.primedKey = null;
    this.firstTurn = null;
    this.store.setState({
      status: 'mounting',
      modelId: spec.id,
      stage: 'checking',
      loadProgress: 0,
      error: null,
      errorKind: null,
      errorFix: null,
      info: null,
      nCtx,
      unloadedReason: null,
      loadMs: null,
      warmupMs: null,
      fallbacks: [],
      speculative: {
        ...IDLE_SPECULATIVE,
        requested: plan.requested,
        draftModelId: plan.draftModelId,
        reason: plan.reason ?? null,
        specTokPerSec: verified?.specTokPerSec ?? null,
        baselineTokPerSec: verified?.chatTokPerSec ?? null,
      },
      kvCache: { ...IDLE_KV, enabled: !!settings.compute?.kvSessionCache, status: settings.compute?.kvSessionCache && d.kvCache ? 'idle' : 'off' },
    });

    // 1. The file must be real.
    const check = d.verifyFile(spec);
    if (!check.ok) {
      return this.fail(spec, 'file', check.reason ?? 'The model file failed its integrity check.', 'bad_file', 'Delete the model and download it again.');
    }

    // 2. It must plausibly fit in this phone's memory.
    const ram = d.totalRamBytes();
    if (fitFor(spec, ram, nCtx) === 'too_heavy' && !force) {
      const need = formatBytes(estimateRamBytes(spec, nCtx));
      return this.fail(
        spec,
        'too_heavy',
        `${spec.name} needs about ${need} of memory but this phone reports ${ram ? formatBytes(ram) : 'unknown'}. Android would probably close the app.`,
        'out_of_memory',
        'Choose a smaller model, or lower the context size in Settings > Advanced.',
      );
    }

    // 3. Free whatever is loaded, then load (crash marker first, see markPending), relaxing experimental features on failure.
    await this.safeRelease();
    const c = settings.compute;
    const fallbacks: string[] = [];
    const a: Attempt = {
      gpu: c?.backend === 'gpu' || (!c && settings.useGpu),
      speculative: plan.load,
      cacheTypeK: c?.cacheTypeK ?? 'f16',
      cacheTypeV: c?.cacheTypeV ?? 'f16',
    };
    if (a.cacheTypeV !== 'f16' && c?.flashAttn === 'off') {
      a.cacheTypeV = 'f16';
      fallbacks.push('A quantized V cache needs flash attention, which is off: the V cache uses f16.');
    }
    const earlierGpuFailure = this.gpuFailed.get(spec.id);
    if (a.gpu && earlierGpuFailure) {
      a.gpu = false;
      fallbacks.push(`GPU skipped: it failed earlier in this session (${earlierGpuFailure}). Using CPU.`);
    }
    let specReason: string | null = plan.reason ?? null;
    const mmprojPath = d.companionPath?.(spec, 'mmproj') ?? undefined;

    let r: AttemptResult;
    for (;;) {
      r = await this.attempt(spec, a, nCtx, mmprojPath);
      if (r.ok) break;
      const relaxable = RELAXABLE.has(r.diag.kind);
      if (a.speculative && (r.speculativeRejected || relaxable)) {
        specReason = r.speculativeRejected ? r.diag.message : `Loading with speculative decoding failed (${r.diag.message})`;
        fallbacks.push(`Speculative decoding off: ${specReason}`);
        a.speculative = undefined;
        continue;
      }
      if (relaxable && (a.cacheTypeK !== 'f16' || a.cacheTypeV !== 'f16')) {
        fallbacks.push(`Quantized KV cache (${a.cacheTypeK}/${a.cacheTypeV}) failed (${r.diag.message}): using f16.`);
        a.cacheTypeK = 'f16';
        a.cacheTypeV = 'f16';
        continue;
      }
      if (relaxable && a.gpu) {
        this.gpuFailed.set(spec.id, r.diag.message);
        fallbacks.push(`GPU failed (${r.diag.message}): using CPU.`);
        a.gpu = false;
        continue;
      }
      break;
    }

    if (!r.ok) {
      await this.clearPending();
      this.store.setState({ fallbacks });
      if (r.stage === 'no_output') return this.fail(spec, 'no_output', r.diag.message, 'no_output', r.diag.fix);
      const msg = r.stage === 'warmup' ? `The model loaded but failed its first reply. ${r.diag.message}` : r.diag.message;
      return this.fail(spec, 'engine', msg, r.diag.kind, r.diag.fix);
    }

    const { info, warm, loadMs, warmupMs } = r;
    if (a.gpu && !info.gpu) fallbacks.push(`GPU requested but not used: ${info.reasonNoGPU || 'llama.cpp kept the model on the CPU'}.`);
    if (mmprojPath && info.multimodalError) fallbacks.push(`Vision projector not used: ${info.multimodalError}`);
    const tps = warm.tokensPerSecond || (warm.predictedMs > 0 ? (warm.generatedTokens * 1000) / warm.predictedMs : 0);
    const ttftMs = warm.ttftMs ?? warmupMs;
    const prev = d.getSettings().verified[spec.id];
    await this.clearPending({
      activeModelId: spec.id,
      verified: { ...d.getSettings().verified, [spec.id]: { ...prev, at: d.now(), tokensPerSecond: Number(tps.toFixed(1)), loadMs } },
    });
    const sp = this.state.speculative;
    this.store.setState({
      status: 'ready',
      modelId: spec.id,
      stage: null,
      loadProgress: 1,
      error: null,
      errorKind: null,
      errorFix: null,
      info,
      nCtx,
      loadMs,
      warmupMs,
      lastTokPerSec: Number(tps.toFixed(1)),
      lastTokens: warm.generatedTokens,
      ttftMs,
      lastPromptTokens: warm.promptTokens || null,
      lastCtxUsed: warm.promptTokens + warm.generatedTokens || null,
      lastCachedTokens: warm.cachedTokens ?? null,
      fallbacks,
      speculative: { ...sp, active: !!a.speculative, reason: a.speculative ? null : specReason },
    });
    return { ok: true, loadMs, tokensPerSecond: tps, ttftMs, warmupMs };
  }

  private async safeRelease(): Promise<void> {
    this.primedKey = null;
    try {
      await this.deps.engine.release();
    } catch {
      // ignore
    }
  }

  /**
   * Free the model's RAM while the app is idle (backgrounded / memory warning). Never interrupts a reply or a load.
   * The next message loads it again automatically (services/chat.ts), so this is invisible except for a short wait.
   */
  async releaseIdle(reason: 'memory' | 'background'): Promise<boolean> {
    if (this.mounting || this.state.status !== 'ready') return false;
    // Flip the state FIRST (synchronously): a message sent right now sees "not loaded" and reloads, instead of
    // reaching a context that is being released underneath it.
    this.store.setState({
      status: 'unmounted',
      modelId: null,
      stage: null,
      loadProgress: 0,
      error: null,
      errorKind: null,
      errorFix: null,
      info: null,
      unloadedReason: reason,
      loadMs: null,
      warmupMs: null,
    });
    await this.safeRelease();
    return true;
  }

  async unmount(): Promise<void> {
    // A load in flight would otherwise finish AFTER this and silently resurrect the model.
    if (this.mounting) await this.mounting.catch(() => undefined);
    if (this.state.status === 'generating') await this.stop();
    await this.safeRelease();
    this.store.setState({
      status: 'unmounted',
      modelId: null,
      stage: null,
      loadProgress: 0,
      error: null,
      errorKind: null,
      errorFix: null,
      info: null,
      loadMs: null,
      warmupMs: null,
    });
  }

  private prefixKey(system: string): string | null {
    const s = this.state;
    if (!s.modelId) return null;
    const c = this.deps.getSettings().compute;
    return hashKey([s.modelId, s.nCtx, c?.cacheTypeK, c?.cacheTypeV, s.info?.speculative ?? 'none', s.info?.gpu ? 'gpu' : 'cpu', system].join('\u0001'));
  }

  /**
   * KV session cache ("attention freezing"): make sure the context already holds the system-prompt prefix.
   * First time for this model + prefix: evaluate it (n_predict 0) and save the state to disk. Next load: restore it from
   * disk instead of re-reading it. The first reply's TTFT (prefix work included) is then recorded as cold vs warm.
   * Never throws and never blocks chat: any failure is reported in `kvCache.reason` and the reply proceeds normally.
   */
  async preparePrefix(system: string, enableThinking: boolean): Promise<KvCacheState> {
    const d = this.deps;
    const e = d.engine;
    const enabled = !!d.getSettings().compute?.kvSessionCache;
    const kv = d.kvCache;
    if (!enabled || !kv || !e.evalPrefix || !e.saveSession || !e.loadSession) {
      this.store.setState({ kvCache: { ...this.state.kvCache, enabled, status: 'off' } });
      return this.state.kvCache;
    }
    const key = system.trim() ? this.prefixKey(system) : null;
    if (!key || this.state.status !== 'ready' || this.primedKey === key) return this.state.kvCache;

    const path = kv.pathFor(`${this.state.modelId}-${key}`);
    this.store.setState({ status: 'generating' });
    const t0 = d.now();
    let next: KvCacheState = { ...this.state.kvCache, enabled: true };
    try {
      let restored: number | null = null;
      if (kv.exists(path)) {
        try {
          restored = await e.loadSession(path);
        } catch (err) {
          next.reason = `The saved prefix could not be restored (${err instanceof Error ? err.message : String(err)}); it was rebuilt.`;
          try {
            kv.remove(path);
          } catch {
            // best effort
          }
        }
      }
      if (restored !== null && restored > 0) {
        next = { ...next, status: 'loaded', tokens: restored, ms: d.now() - t0, reason: null };
      } else {
        const evaluated = await e.evalPrefix(system, enableThinking);
        await e.saveSession(path);
        next = { ...next, status: 'saved', tokens: evaluated.tokens, ms: d.now() - t0 };
      }
      this.primedKey = key;
      this.firstTurn = { status: next.status as 'saved' | 'loaded', ms: next.ms ?? 0 };
    } catch (err) {
      this.primedKey = null;
      this.firstTurn = null;
      next = { ...next, status: 'error', ms: null, reason: `KV cache not used: ${err instanceof Error ? err.message : String(err)}` };
    } finally {
      if (this.currentStatus() === 'generating') this.store.setState({ status: 'ready' });
    }
    this.store.setState({ kvCache: next });
    return next;
  }

  async generate(params: GenerateParams): Promise<GenerateResult> {
    if (this.state.status !== 'ready') throw new EngineNotReadyError();
    // A generation with a different system prompt replaces what the KV cache holds.
    const first = params.messages[0];
    if (this.primedKey && (first?.role !== 'system' || this.prefixKey(first.content) !== this.primedKey)) {
      this.primedKey = null;
      this.firstTurn = null;
    }
    this.store.setState({ status: 'generating' });
    try {
      const res = await this.deps.engine.generate(params);
      if (res.generatedTokens > 0) this.recordGeneration(res);
      return res;
    } finally {
      // Re-read: the state may have changed (e.g. unmount) while the engine was busy.
      if (this.currentStatus() === 'generating') this.store.setState({ status: 'ready' });
    }
  }

  private recordGeneration(res: GenerateResult): void {
    const s = this.state;
    const tps = res.tokensPerSecond || (res.predictedMs > 0 ? (res.generatedTokens * 1000) / res.predictedMs : 0);
    const patch: Partial<EngineState> = {
      lastTokPerSec: Number(tps.toFixed(1)),
      lastTokens: res.generatedTokens,
      ttftMs: res.ttftMs ?? null,
      lastPromptTokens: res.promptTokens || null,
      lastCtxUsed: res.promptTokens + res.generatedTokens,
      lastCachedTokens: res.cachedTokens ?? null,
    };
    if (this.firstTurn && res.ttftMs) {
      const total = this.firstTurn.ms + res.ttftMs;
      patch.kvCache = { ...s.kvCache, ...(this.firstTurn.status === 'loaded' ? { warmTtftMs: total } : { coldTtftMs: total }) };
      this.firstTurn = null;
    }
    const sp = { ...s.speculative };
    if (res.draftTokens && res.draftTokens > 0) {
      sp.draftTokens += res.draftTokens;
      sp.acceptedTokens += res.draftAccepted ?? 0;
      sp.acceptanceRate = Number((sp.acceptedTokens / sp.draftTokens).toFixed(3));
    }
    if (res.generatedTokens >= SPEED_SAMPLE_MIN_TOKENS && tps > 0 && s.modelId) {
      const speed = Number(tps.toFixed(1));
      const field = sp.active ? 'specTokPerSec' : 'chatTokPerSec';
      if (sp.active) sp.specTokPerSec = speed;
      else sp.baselineTokPerSec = speed;
      const verified = this.deps.getSettings().verified;
      const entry = verified[s.modelId];
      if (entry) void this.deps.updateSettingsNow({ verified: { ...verified, [s.modelId]: { ...entry, [field]: speed } } }).catch(() => undefined);
    }
    sp.speedup = sp.specTokPerSec && sp.baselineTokPerSec ? Number((sp.specTokPerSec / sp.baselineTokPerSec).toFixed(2)) : null;
    patch.speculative = sp;
    this.store.setState(patch);
  }

  /** Exact prompt size for these messages, or null when the engine cannot count (callers then estimate). */
  async countPromptTokens(messages: PromptMessage[], enableThinking: boolean): Promise<number | null> {
    const count = this.deps.engine.countPromptTokens;
    if (!count || !this.isReady()) return null;
    try {
      return await count.call(this.deps.engine, messages, enableThinking);
    } catch {
      return null;
    }
  }

  async stop(): Promise<void> {
    try {
      await this.deps.engine.stop();
    } catch {
      // generation may already be over
    }
  }
}
