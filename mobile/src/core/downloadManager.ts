/**
 * Download state machine (platform independent).
 *
 * Everything that touches the phone (files, network transfer, free space,
 * keep-awake) goes through `DownloadPlatform`, so the hard parts - pause, resume,
 * retry, cancel, corrupt files, no space - are unit-tested with a fake platform
 * (test/downloadManager.test.ts). The real adapter is services/downloadPlatform.ts.
 *
 * Requirements: docs/REQUIREMENTS.md MD-2 .. MD-5.
 */
import type { ModelSpec } from './catalog.ts';
import { formatBytes } from './format.ts';
import { hasGgufMagic } from './gguf.ts';
import { RemoteError, describeHttpStatus, resolveUrl, type RemoteFileInfo } from './hf.ts';
import { SpeedMeter } from './speedMeter.ts';
import { createStore } from './store.ts';

export type DownloadStatus = 'idle' | 'resolving' | 'downloading' | 'paused' | 'finalizing' | 'completed' | 'error';

export interface DownloadState {
  status: DownloadStatus;
  bytesWritten: number;
  totalBytes: number;
  speedBps: number;
  etaSec: number;
  error?: string;
  /** For status 'error': does Resume make sense? */
  retryable: boolean;
  /** Transient info line, e.g. "Connection lost - retrying (1/4)". */
  note?: string;
}

export const IDLE_STATE: DownloadState = {
  status: 'idle',
  bytesWritten: 0,
  totalBytes: 0,
  speedBps: 0,
  etaSec: 0,
  retryable: false,
};

// -------------------------------------------------------------------- platform contract

export interface ModelFiles {
  destExists(): boolean;
  destSize(): number;
  partExists(): boolean;
  partSize(): number;
  deletePart(): void;
  deleteDest(): void;
  readHeader(which: 'part' | 'dest'): Uint8Array | null;
  /** Atomically replace dest with part. */
  promotePart(): void;
}

export interface TransferTask {
  /** Runs until the file is complete ('completed') or the user pauses ('paused'). Rejects on failure or cancel. */
  run(): Promise<'completed' | 'paused'>;
  pause(): Promise<void>;
  cancel(): void;
  /** True after pause() until run() is called again. */
  isPaused(): boolean;
}

export interface DownloadPlatform {
  isStorageReady(): boolean;
  /** Free bytes on the vault volume, or null if unknown. */
  freeSpaceBytes(): number | null;
  files(spec: ModelSpec): ModelFiles;
  fetchInfo(spec: ModelSpec): Promise<RemoteFileInfo>;
  createTask(args: { spec: ModelSpec; url: string; onProgress: (absoluteBytes: number) => void }): TransferTask;
  keepAwake(on: boolean): void;
  now(): number;
  sleep(ms: number): Promise<void>;
}

// -------------------------------------------------------------------- errors

export class DownloadFailure extends Error {
  retryable: boolean;
  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = 'DownloadFailure';
    this.retryable = retryable;
  }
}

/** Turn a raw native/network error into something a person can act on. */
export function toFailure(e: unknown): { message: string; retryable: boolean; rangeNotSatisfiable: boolean } {
  if (e instanceof DownloadFailure) return { message: e.message, retryable: e.retryable, rangeNotSatisfiable: false };
  if (e instanceof RemoteError) return { message: e.message, retryable: e.retryable, rangeNotSatisfiable: false };
  const raw = e instanceof Error ? e.message : String(e);
  const http = /HTTP\s+(\d{3})/i.exec(raw);
  if (http) {
    const status = Number(http[1]);
    if (status === 416) return { message: describeHttpStatus(416), retryable: true, rangeNotSatisfiable: true };
    const retryable = status === 408 || status === 429 || status >= 500;
    return { message: describeHttpStatus(status), retryable, rangeNotSatisfiable: false };
  }
  if (/ENOSPC|no space|not enough (free )?(space|storage)/i.test(raw)) {
    return { message: 'The phone ran out of free storage. Free some space, then tap Resume.', retryable: true, rangeNotSatisfiable: false };
  }
  if (/permission|EACCES|EPERM|denied/i.test(raw)) {
    return { message: 'CHIWIWI cannot write to the storage folder. Re-select it in Settings > Storage.', retryable: false, rangeNotSatisfiable: false };
  }
  return { message: 'The connection was interrupted. Check your internet, then tap Resume.', retryable: true, rangeNotSatisfiable: false };
}

// -------------------------------------------------------------------- manager

export type StartResult = { ok: true } | { ok: false; message: string };

interface Run {
  spec: ModelSpec;
  task: TransferTask | null;
  meta: RemoteFileInfo | null;
  active: boolean;
  pausing: boolean;
  cancelling: boolean;
  meter: SpeedMeter;
  lastEmit: number;
  done: Promise<void>;
}

export interface DownloadManagerOptions {
  maxRetries?: number;
  backoffMs?: number[];
  /** Headroom kept free on top of the file size. */
  spaceMarginBytes?: number;
}

export class DownloadManager {
  readonly store = createStore<{ items: Record<string, DownloadState> }>({ items: {} });
  private readonly platform: DownloadPlatform;
  private readonly runs = new Map<string, Run>();
  private readonly maxRetries: number;
  private readonly backoff: number[];
  private readonly margin: number;
  private awakeCount = 0;

  constructor(platform: DownloadPlatform, options: DownloadManagerOptions = {}) {
    this.platform = platform;
    this.maxRetries = options.maxRetries ?? 4;
    this.backoff = options.backoffMs ?? [2000, 5000, 10000, 20000];
    this.margin = options.spaceMarginBytes ?? 50_000_000;
  }

  // ---------------------------------------------------------------- queries

  stateOf(id: string): DownloadState {
    return this.store.getState().items[id] ?? IDLE_STATE;
  }

  /** Resolves when every started run has fully finished (state published AND resources released). */
  async settled(): Promise<void> {
    await Promise.all([...this.runs.values()].map((r) => r.done.catch(() => undefined)));
  }

  /** Id of the model that is currently transferring, if any. */
  busyId(): string | null {
    for (const [id, run] of this.runs) {
      if (!run.active) continue;
      const s = this.stateOf(id).status;
      if (s === 'resolving' || s === 'downloading' || s === 'finalizing') return id;
    }
    return null;
  }

  // ---------------------------------------------------------------- commands

  /** Start, resume after pause, or retry after an error. Safe to call repeatedly (idempotent while running). */
  async start(spec: ModelSpec): Promise<StartResult> {
    let existing = this.runs.get(spec.id);
    if (existing?.active) {
      const status = this.stateOf(spec.id).status;
      const settling = existing.pausing || existing.cancelling || status === 'error' || status === 'paused' || status === 'completed';
      if (!settling) return { ok: true }; // genuinely running: idempotent
      // Resume/Retry tapped while the previous run is still winding down (its terminal state is
      // published a moment before it is marked inactive): wait for it, then start cleanly.
      await existing.done.catch(() => undefined);
      existing = this.runs.get(spec.id);
    }
    if (!this.platform.isStorageReady()) {
      return { ok: false, message: 'Choose where CHIWIWI keeps its data first (Settings > Storage).' };
    }
    const busy = this.busyId();
    if (busy && busy !== spec.id) {
      return { ok: false, message: 'Another model is still downloading. Pause or cancel it first.' };
    }
    const run: Run = existing ?? {
      spec,
      task: null,
      meta: null,
      active: false,
      pausing: false,
      cancelling: false,
      meter: new SpeedMeter(),
      lastEmit: 0,
      done: Promise.resolve(),
    };
    run.pausing = false;
    run.cancelling = false;
    run.active = true;
    this.runs.set(spec.id, run);
    this.setAwake(+1);
    this.patch(spec.id, { status: 'resolving', error: undefined, retryable: false, note: undefined, speedBps: 0, etaSec: 0 });
    run.done = this.execute(run).finally(() => {
      run.active = false;
      this.setAwake(-1);
    });
    return { ok: true };
  }

  async pause(id: string): Promise<void> {
    const run = this.runs.get(id);
    if (!run || !run.active) return;
    run.pausing = true;
    try {
      await run.task?.pause();
    } catch {
      // The transfer promise settles on its own; execute() records the outcome.
    }
    this.patch(id, { status: 'paused', speedBps: 0, etaSec: 0, note: undefined });
  }

  /** Cancel; by default the partial file is deleted too. */
  async cancel(spec: ModelSpec, deletePartial = true): Promise<void> {
    const run = this.runs.get(spec.id);
    if (run) {
      run.cancelling = true;
      run.task?.cancel();
      await run.done.catch(() => undefined);
      this.runs.delete(spec.id);
    }
    if (deletePartial) {
      try {
        this.platform.files(spec).deletePart();
      } catch {
        // nothing to delete
      }
    }
    this.refresh([spec]);
  }

  /** Delete an installed (or partial) model. */
  async remove(spec: ModelSpec): Promise<void> {
    await this.cancel(spec, true);
    try {
      this.platform.files(spec).deleteDest();
    } catch {
      // surfaced by refresh() if the file is still there
    }
    this.refresh([spec]);
  }

  /** Re-read the disk: installed models, resumable partials. Does not touch running downloads. */
  refresh(specs: ModelSpec[]): void {
    if (!this.platform.isStorageReady()) return;
    for (const spec of specs) {
      const run = this.runs.get(spec.id);
      if (run?.active) continue;
      // Keep a visible error until the user acts on it (Resume / Cancel).
      if (run && this.stateOf(spec.id).status === 'error') continue;
      try {
        const files = this.platform.files(spec);
        if (files.destExists() && files.destSize() >= spec.sizeBytes * 0.9) {
          const size = files.destSize();
          this.set(spec.id, { ...IDLE_STATE, status: 'completed', bytesWritten: size, totalBytes: size });
        } else if (files.partExists() && files.partSize() > 0) {
          this.set(spec.id, {
            ...IDLE_STATE,
            status: 'paused',
            bytesWritten: files.partSize(),
            totalBytes: spec.sizeBytes,
            note: 'Partial download found - tap Resume to continue.',
          });
        } else {
          this.set(spec.id, { ...IDLE_STATE });
        }
      } catch {
        this.set(spec.id, { ...IDLE_STATE });
      }
    }
  }

  // ---------------------------------------------------------------- internals

  private patch(id: string, patch: Partial<DownloadState>): void {
    this.store.setState((s) => ({ items: { ...s.items, [id]: { ...(s.items[id] ?? IDLE_STATE), ...patch } } }));
  }

  private set(id: string, state: DownloadState): void {
    this.store.setState((s) => ({ items: { ...s.items, [id]: state } }));
  }

  private setAwake(delta: number): void {
    const before = this.awakeCount;
    this.awakeCount = Math.max(0, this.awakeCount + delta);
    if (before === 0 && this.awakeCount > 0) this.platform.keepAwake(true);
    if (before > 0 && this.awakeCount === 0) this.platform.keepAwake(false);
  }

  private stopped(run: Run): boolean {
    return run.pausing || run.cancelling;
  }

  private async execute(run: Run): Promise<void> {
    const { spec } = run;
    const p = this.platform;
    try {
      const meta = run.meta ?? (run.meta = await p.fetchInfo(spec));
      if (this.stopped(run)) return this.afterStop(run);

      const files = p.files(spec);

      // Already installed and intact?
      if (files.destExists()) {
        const head = files.readHeader('dest');
        if (files.destSize() === meta.size && head && hasGgufMagic(head)) {
          this.complete(spec.id, meta.size);
          return;
        }
        files.deleteDest();
      }

      let have = files.partExists() ? files.partSize() : 0;
      if (have > meta.size) {
        files.deletePart();
        have = 0;
      }

      const free = p.freeSpaceBytes();
      const need = meta.size - have + this.margin;
      if (free !== null && free < need) {
        throw new DownloadFailure(`Not enough free space: ${formatBytes(need)} needed, ${formatBytes(free)} available. Free some space and try again.`, true);
      }

      this.patch(spec.id, { status: 'downloading', bytesWritten: have, totalBytes: meta.size, note: undefined });
      run.meter.reset(have, p.now());

      if (have < meta.size) {
        const outcome = await this.transfer(run, meta);
        if (outcome === 'cancelled') return;
        if (outcome === 'paused') return this.afterStop(run);
      }
      if (this.stopped(run)) return this.afterStop(run);
      await this.finalize(run, meta);
    } catch (e) {
      if (this.stopped(run)) return this.afterStop(run);
      const f = toFailure(e);
      this.patch(spec.id, { status: 'error', error: f.message, retryable: f.retryable, speedBps: 0, etaSec: 0, note: undefined });
    }
  }

  private afterStop(run: Run): void {
    if (run.cancelling) return;
    let bytes = 0;
    try {
      const files = this.platform.files(run.spec);
      bytes = files.partExists() ? files.partSize() : 0;
    } catch {
      bytes = 0;
    }
    this.patch(run.spec.id, { status: 'paused', bytesWritten: bytes, speedBps: 0, etaSec: 0, note: undefined });
  }

  private async transfer(run: Run, meta: RemoteFileInfo): Promise<'completed' | 'paused' | 'cancelled'> {
    const { spec } = run;
    const p = this.platform;
    let attempt = 0;
    for (;;) {
      if (!run.task || !run.task.isPaused()) {
        run.task = p.createTask({
          spec,
          url: resolveUrl(spec.repo, spec.filename),
          onProgress: (bytes) => this.onProgress(run, bytes, meta.size),
        });
      }
      try {
        const result = await run.task.run();
        if (run.cancelling) return 'cancelled';
        return result;
      } catch (e) {
        if (run.cancelling) return 'cancelled';
        if (run.pausing) return 'paused';
        const f = toFailure(e);
        const files = p.files(spec);

        if (f.rangeNotSatisfiable) {
          // The server rejected our resume offset: either we already have everything, or the partial is stale.
          if (files.partExists() && files.partSize() >= meta.size) return 'completed';
          files.deletePart();
          run.task = null;
          run.meter.reset(0, p.now());
          this.patch(spec.id, { bytesWritten: 0 });
          if (attempt++ < this.maxRetries) continue;
          throw new DownloadFailure(f.message, true);
        }

        if (f.retryable && attempt < this.maxRetries) {
          attempt++;
          this.patch(spec.id, { note: `Connection lost - retrying (${attempt}/${this.maxRetries})...`, speedBps: 0, etaSec: 0 });
          await p.sleep(this.backoff[Math.min(attempt - 1, this.backoff.length - 1)]);
          if (run.cancelling) return 'cancelled';
          if (run.pausing) return 'paused';
          run.task = null; // a failed native task cannot be reused; resume from the partial file
          continue;
        }
        throw new DownloadFailure(f.message, f.retryable);
      }
    }
  }

  private onProgress(run: Run, bytes: number, total: number): void {
    if (this.stopped(run)) return;
    const now = this.platform.now();
    const bps = run.meter.push(bytes, now);
    if (now - run.lastEmit < 250 && bytes < total) return;
    run.lastEmit = now;
    this.patch(run.spec.id, {
      status: 'downloading',
      bytesWritten: bytes,
      totalBytes: total,
      speedBps: bps,
      etaSec: run.meter.etaSeconds(total - bytes),
      note: undefined,
    });
  }

  private async finalize(run: Run, meta: RemoteFileInfo): Promise<void> {
    const { spec } = run;
    const files = this.platform.files(spec);
    this.patch(spec.id, { status: 'finalizing', bytesWritten: meta.size, speedBps: 0, etaSec: 0, note: 'Checking the file...' });

    const size = files.partExists() ? files.partSize() : 0;
    if (size > meta.size) {
      files.deletePart();
      throw new DownloadFailure('The file came out larger than expected and was discarded. Please download it again.', true);
    }
    if (size < meta.size) {
      throw new DownloadFailure(`The download ended early (${formatBytes(size)} of ${formatBytes(meta.size)}). Tap Resume to continue.`, true);
    }
    const head = files.readHeader('part');
    if (!head || !hasGgufMagic(head)) {
      files.deletePart();
      throw new DownloadFailure('The downloaded file is not a valid model (it was probably an error page). It was removed. Please try again.', true);
    }
    files.promotePart();
    this.complete(spec.id, meta.size);
  }

  private complete(id: string, size: number): void {
    this.set(id, { ...IDLE_STATE, status: 'completed', bytesWritten: size, totalBytes: size });
  }
}
