/**
 * Model lifecycle: verify file -> fit check -> load into RAM -> test generation -> Active.
 *
 * Requirements MV-1..MV-3: "Mount" really loads the model, a model is "Verified"
 * only if it produced a reply, and nothing is ever fabricated. All side effects
 * (engine, settings, files) are injected so this is unit-tested with a fake engine.
 */
import type { ModelSpec } from './catalog.ts';
import { defaultContext, estimateRamBytes, fitFor } from './fit.ts';
import { formatBytes } from './format.ts';
import type { PromptMessage } from './chatPrompt.ts';
import { friendlyEngineError, type GenerateParams, type GenerateResult, type InferenceEngine, type LoadedModelInfo } from './engineTypes.ts';
import type { Settings } from './settingsModel.ts';
import { createStore } from './store.ts';

export type EngineStatus = 'unmounted' | 'mounting' | 'ready' | 'generating' | 'error';
export type MountStage = 'checking' | 'loading' | 'testing';

export interface EngineState {
  status: EngineStatus;
  modelId: string | null;
  stage: MountStage | null;
  /** 0..1 while stage === 'loading' */
  loadProgress: number;
  error: string | null;
  info: LoadedModelInfo | null;
  nCtx: number;
  /** Set at startup if the previous run died while loading this model (almost always out of memory). */
  crashedModelId: string | null;
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
  | { ok: true; loadMs: number; tokensPerSecond: number }
  | { ok: false; code: 'file' | 'too_heavy' | 'engine' | 'no_output'; message: string };

export class EngineNotReadyError extends Error {
  constructor() {
    super('No model is loaded. Download a model and load it from the Model Hub first.');
    this.name = 'EngineNotReadyError';
  }
}

const TEST_PROMPT: PromptMessage[] = [{ role: 'user', content: 'Reply with the single word: ready' }];

export class EngineManager {
  readonly store = createStore<EngineState>({
    status: 'unmounted',
    modelId: null,
    stage: null,
    loadProgress: 0,
    error: null,
    info: null,
    nCtx: 0,
    crashedModelId: null,
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

  private fail(spec: ModelSpec, code: Extract<MountResult, { ok: false }>['code'], message: string): MountResult {
    this.store.setState({ status: 'error', modelId: spec.id, stage: null, loadProgress: 0, error: message, info: null });
    return { ok: false, code, message };
  }

  private async doMount(spec: ModelSpec, force: boolean): Promise<MountResult> {
    const d = this.deps;
    const nCtx = this.contextSize();
    this.store.setState({ status: 'mounting', modelId: spec.id, stage: 'checking', loadProgress: 0, error: null, info: null, nCtx });

    // 1. The file must be real.
    const check = d.verifyFile(spec);
    if (!check.ok) return this.fail(spec, 'file', check.reason ?? 'The model file failed its integrity check.');

    // 2. It must plausibly fit in this phone's memory.
    const ram = d.totalRamBytes();
    if (fitFor(spec, ram, nCtx) === 'too_heavy' && !force) {
      const need = formatBytes(estimateRamBytes(spec, nCtx));
      return this.fail(
        spec,
        'too_heavy',
        `${spec.name} needs about ${need} of memory but this phone reports ${ram ? formatBytes(ram) : 'unknown'}. Android would probably close the app. Choose a smaller model.`,
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
      return this.fail(spec, 'engine', friendlyEngineError(e));
    }
    const loadMs = d.now() - t0;

    // 4. It must actually answer.
    this.store.setState({ stage: 'testing', loadProgress: 1 });
    let test: GenerateResult;
    try {
      test = await d.engine.generate({
        messages: TEST_PROMPT,
        maxTokens: 24,
        temperature: 0,
        enableThinking: false,
        onText: () => undefined,
      });
    } catch (e) {
      await this.safeRelease();
      await d.updateSettingsNow({ pendingMountModelId: null });
      return this.fail(spec, 'engine', friendlyEngineError(e));
    }
    if (!test.text.trim() && test.generatedTokens === 0) {
      await this.safeRelease();
      await d.updateSettingsNow({ pendingMountModelId: null });
      return this.fail(spec, 'no_output', 'The model loaded but produced no output, so it was not marked verified. Try another model or download it again.');
    }

    const tps = test.tokensPerSecond || (test.predictedMs > 0 ? (test.generatedTokens * 1000) / test.predictedMs : 0);
    await d.updateSettingsNow({
      pendingMountModelId: null,
      activeModelId: spec.id,
      verified: { ...d.getSettings().verified, [spec.id]: { at: d.now(), tokensPerSecond: Number(tps.toFixed(1)), loadMs } },
    });
    this.store.setState({ status: 'ready', modelId: spec.id, stage: null, loadProgress: 1, error: null, info, nCtx });
    return { ok: true, loadMs, tokensPerSecond: tps };
  }

  private async safeRelease(): Promise<void> {
    try {
      await this.deps.engine.release();
    } catch {
      // ignore
    }
  }

  async unmount(): Promise<void> {
    if (this.state.status === 'generating') await this.stop();
    await this.safeRelease();
    this.store.setState({ status: 'unmounted', modelId: null, stage: null, loadProgress: 0, error: null, info: null });
  }

  async generate(params: GenerateParams): Promise<GenerateResult> {
    if (this.state.status !== 'ready') throw new EngineNotReadyError();
    this.store.setState({ status: 'generating' });
    try {
      return await this.deps.engine.generate(params);
    } finally {
      // Re-read: the state may have changed (e.g. unmount) while the engine was busy.
      if (this.currentStatus() === 'generating') this.store.setState({ status: 'ready' });
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
