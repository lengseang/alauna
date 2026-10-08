/**
 * Model lifecycle: verify file -> fit check -> load into RAM -> WARM-UP generation -> ready.
 *
 * Requirements MV-1..MV-3: "Mount" really loads the model, a model is "Verified"
 * only if it produced real tokens, and nothing is ever fabricated. All side effects
 * (engine, settings, files) are injected so this is unit-tested with a fake engine.
 *
 * "Ready" therefore means PROVEN: the model was loaded AND generated at least one token
 * in this session. Every failure carries a cause and a next step (`errorKind`, `error`, `errorFix`).
 */
import type { ModelSpec } from './catalog.ts';
import { defaultContext, estimateRamBytes, fitFor } from './fit.ts';
import { formatBytes } from './format.ts';
import type { PromptMessage } from './chatPrompt.ts';
import {
  diagnoseEngineError,
  type EngineErrorKind,
  type GenerateParams,
  type GenerateResult,
  type InferenceEngine,
  type LoadedModelInfo,
} from './engineTypes.ts';
import type { Settings } from './settingsModel.ts';
import { createStore } from './store.ts';

export type EngineStatus = 'unmounted' | 'mounting' | 'ready' | 'generating' | 'error';
export type MountStage = 'checking' | 'loading' | 'warming';

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
  });
  private readonly deps: EngineDeps;
  private mounting: Promise<MountResult> | null = null;
  private mountingId: string | null = null;

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

  /** Call once at launch: detects a crash that happened while a model was loading last time. */
  async noteStartup(): Promise<void> {
    const s = this.deps.getSettings();
    if (s.pendingMountModelId) {
      this.store.setState({ crashedModelId: s.pendingMountModelId });
      await this.deps.updateSettingsNow({
        pendingMountModelId: null,
        activeModelId: s.activeModelId === s.pendingMountModelId ? null : s.activeModelId,
      });
    }
  }

  dismissCrashNotice(): void {
    this.store.setState({ crashedModelId: null });
  }

  /** Context size actually used: user override or RAM-based default. */
  contextSize(): number {
    return this.deps.getSettings().contextOverride ?? defaultContext(this.deps.totalRamBytes());
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

  private async doMount(spec: ModelSpec, force: boolean): Promise<MountResult> {
    const d = this.deps;
    const nCtx = this.contextSize();
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

    // 3. Free whatever is loaded, then load. Mark "pending" first so a crash is detectable next launch.
    try {
      await d.engine.release();
    } catch {
      // nothing loaded
    }
    const settings = d.getSettings();
    await d.updateSettingsNow({ pendingMountModelId: spec.id });
    this.store.setState({ stage: 'loading', loadProgress: 0 });

    const t0 = d.now();
    let info: LoadedModelInfo;
    try {
      info = await d.engine.load({
        path: d.modelPath(spec),
        nCtx,
        threads: settings.threads,
        useGpu: settings.useGpu,
        onProgress: (p) => this.store.setState({ loadProgress: Math.max(0, Math.min(1, p)) }),
      });
    } catch (e) {
      await this.safeRelease();
      await d.updateSettingsNow({ pendingMountModelId: null });
      const diag = diagnoseEngineError(e);
      return this.fail(spec, 'engine', diag.message, diag.kind, diag.fix);
    }
    const loadMs = d.now() - t0;

    // 4. WARM-UP: it must actually produce tokens before anything may call it "ready".
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
      await d.updateSettingsNow({ pendingMountModelId: null });
      const diag = diagnoseEngineError(e);
      return this.fail(spec, 'engine', `The model loaded but failed its first reply. ${diag.message}`, diag.kind, diag.fix);
    }
    const warmupMs = d.now() - w0;
    if (!warm.text.trim() && warm.generatedTokens === 0) {
      await this.safeRelease();
      await d.updateSettingsNow({ pendingMountModelId: null });
      return this.fail(
        spec,
        'no_output',
        'The model loaded but produced no output, so it was not marked verified.',
        'no_output',
        'Try another model, or delete this one and download it again.',
      );
    }

    const tps = warm.tokensPerSecond || (warm.predictedMs > 0 ? (warm.generatedTokens * 1000) / warm.predictedMs : 0);
    const ttftMs = warm.ttftMs ?? warmupMs;
    await d.updateSettingsNow({
      pendingMountModelId: null,
      activeModelId: spec.id,
      verified: { ...d.getSettings().verified, [spec.id]: { at: d.now(), tokensPerSecond: Number(tps.toFixed(1)), loadMs } },
    });
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
    });
    return { ok: true, loadMs, tokensPerSecond: tps, ttftMs, warmupMs };
  }

  private async safeRelease(): Promise<void> {
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

  async generate(params: GenerateParams): Promise<GenerateResult> {
    if (this.state.status !== 'ready') throw new EngineNotReadyError();
    this.store.setState({ status: 'generating' });
    try {
      const res = await this.deps.engine.generate(params);
      if (res.generatedTokens > 0) {
        const tps = res.tokensPerSecond || (res.predictedMs > 0 ? (res.generatedTokens * 1000) / res.predictedMs : 0);
        this.store.setState({ lastTokPerSec: Number(tps.toFixed(1)), lastTokens: res.generatedTokens, ttftMs: res.ttftMs ?? null });
      }
      return res;
    } finally {
      // Re-read: the state may have changed (e.g. unmount) while the engine was busy.
      if (this.currentStatus() === 'generating') this.store.setState({ status: 'ready' });
    }
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
