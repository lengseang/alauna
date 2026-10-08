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
  /** True when the finished file was checked against the official SHA-256 (set on 'completed' by a download made in this app). */
  verified?: boolean;
  /** 0..1 while the SHA-256 check runs (status 'finalizing'). */
  verifyFraction?: number;
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
  /**
   * Full SHA-256 of the partial file, in small time slices so the UI stays alive. Must poll `shouldStop()` often and
   * return `stopped: true` as soon as it says so. Optional: a platform without it skips verification.
   */
  verifySha256?(
    spec: ModelSpec,
    expected: string,
    onProgress: (fraction: number) => void,
    shouldStop: () => boolean,
  ): Promise<{ ok: boolean; actual: string; stopped: boolean }>;
  /** Remember which downloads are in flight so the next app launch can continue them (process kill / swipe-away). */
  saveIntent?(modelIds: string[]): void;
  loadIntent?(): string[];
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

// -------------------------------------------------------------------- helpers

/** `promise`, or give up waiting after `ms` (never rejects because of the timeout; the timer is always cleared). */
async function withTimeout(promise: Promise<unknown> | undefined, ms: number): Promise<void> {
  if (!promise) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  try {
    await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
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
  /** Absolute bytes seen so far and when they last increased (stall watchdog). */
  lastBytes: number;
  lastProgressAt: number;
  /** Force-settles the transfer promise (set only while a transfer is in flight). */
  abandon: (() => void) | null;
  done: Promise<void>;
}

export interface DownloadManagerOptions {
  maxRetries?: number;
  backoffMs?: number[];
  /** Headroom kept free on top of the file size. */
  spaceMarginBytes?: number;
  /**
   * A transfer that reports no new bytes for this long is treated as a lost connection (the phone can
   * freeze a backgrounded download without any error). 0 disables the watchdog.
   */
  stallTimeoutMs?: number;
  /** How often the watchdog looks. */
  stallCheckMs?: number;
  /** If a retry made at least this many new bytes, the retry budget starts over (long downloads on flaky networks). */
  retryResetBytes?: number;
  /**
   * 'always' (default): a file is only installed after its SHA-256 matches the Hub's (or the catalog's) hash.
   * 'off': size + GGUF header only. Exists because the check is pure JavaScript and may be slow on a phone.
   */
  verifyMode?: 'always' | 'off';
  /** How long pause/cancel wait for the native transfer to report back before the run is abandoned (native cancel can hang). */
  stopGraceMs?: number;
}

export class DownloadManager {
  readonly store = createStore<{ items: Record<string, DownloadState> }>({ items: {} });
  private readonly platform: DownloadPlatform;
  private readonly runs = new Map<string, Run>();
  private readonly maxRetries: number;
  private readonly backoff: number[];
  private readonly margin: number;
  private readonly stallMs: number;
  private readonly stallCheckMs: number;
  private readonly retryResetBytes: number;
  private readonly verifyMode: 'always' | 'off';
  private readonly stopGraceMs: number;
  private awakeCount = 0;

  constructor(platform: DownloadPlatform, options: DownloadManagerOptions = {}) {
    this.platform = platform;
    this.maxRetries = options.maxRetries ?? 4;
    this.backoff = options.backoffMs ?? [2000, 5000, 10000, 20000];
    this.margin = options.spaceMarginBytes ?? 50_000_000;
    this.stallMs = options.stallTimeoutMs ?? 45_000;
    this.stallCheckMs = options.stallCheckMs ?? 5_000;
    this.retryResetBytes = options.retryResetBytes ?? 8 * 1024 * 1024;
    this.verifyMode = options.verifyMode ?? 'always';
    this.stopGraceMs = options.stopGraceMs ?? 4000;
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
      lastBytes: 0,
      lastProgressAt: 0,
      abandon: null,
      done: Promise.resolve(),
    };
    run.pausing = false;
    run.cancelling = false;
    run.active = true;
    this.runs.set(spec.id, run);
    this.setAwake(+1);
    this.syncIntent();
    this.patch(spec.id, { status: 'resolving', error: undefined, retryable: false, note: undefined, speedBps: 0, etaSec: 0, verified: undefined, verifyFraction: undefined });
    run.done = this.execute(run).finally(() => {
      run.active = false;
      this.setAwake(-1);
      this.syncIntent();
    });
    return { ok: true };
  }

  async pause(id: string): Promise<void> {
    const run = this.runs.get(id);
    if (!run || !run.active) return;
    run.pausing = true;
    this.syncIntent();
    try {
      await withTimeout(run.task?.pause(), this.stopGraceMs);
    } catch {
      // The transfer promise settles on its own; execute() records the outcome.
    }
    this.patch(id, { status: 'paused', speedBps: 0, etaSec: 0, note: undefined, verifyFraction: undefined });
    // The native layer is supposed to report back after a pause. If it never does, Resume would wait on it forever.
    const timer = setTimeout(() => {
      if (run.active && run.pausing) run.abandon?.();
    }, this.stopGraceMs);
    void run.done.finally(() => clearTimeout(timer));
  }

  /** Cancel; by default the partial file is deleted too. */
  async cancel(spec: ModelSpec, deletePartial = true): Promise<void> {
    const run = this.runs.get(spec.id);
    if (run) {
      run.cancelling = true;
      this.syncIntent();
      try {
        run.task?.cancel();
      } catch {
        // already gone
      }
      // expo-file-system's Android cancel can return without ever settling the transfer promise (it returns
      // from its read loop without resuming the coroutine): never let "Cancel" wait on it forever.
      await withTimeout(run.done.catch(() => undefined), this.stopGraceMs);
      if (run.active) {
        run.abandon?.();
        await run.done.catch(() => undefined);
      }
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

  /**
   * Call once after `refresh()` at startup: downloads that were running when the app was killed continue from their
   * partial file. Only runs the user never paused or cancelled, and only one at a time.
   */
  resumeInterrupted(specs: ModelSpec[]): void {
    let ids: string[] = [];
    try {
      ids = this.platform.loadIntent?.() ?? [];
    } catch {
      ids = [];
    }
    for (const spec of specs) {
      if (!ids.includes(spec.id)) continue;
      if (this.stateOf(spec.id).status !== 'paused') continue; // refresh() found a partial file
      void this.start(spec);
      return;
    }
    if (ids.length > 0) this.syncIntent();
  }

  // ---------------------------------------------------------------- internals

  private syncIntent(): void {
    try {
      const ids = [...this.runs.entries()].filter(([, r]) => r.active && !r.pausing && !r.cancelling).map(([id]) => id);
      this.platform.saveIntent?.(ids);
    } catch {
      // best effort
    }
  }

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
      if ((await this.finalize(run, meta)) === 'stopped') return this.afterStop(run);
    } catch (e) {
      if (this.stopped(run)) return this.afterStop(run);
      const f = toFailure(e);
      this.patch(spec.id, { status: 'error', error: f.message, retryable: f.retryable, speedBps: 0, etaSec: 0, note: undefined, verifyFraction: undefined });
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
    this.patch(run.spec.id, { status: 'paused', bytesWritten: bytes, speedBps: 0, etaSec: 0, note: undefined, verifyFraction: undefined });
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
      // Re-seed from the partial file: a resumed native task restarts at the on-disk length, which can be a
      // little below the last value we saw, and that must not look like "no progress".
      const startFiles = p.files(spec);
      run.lastBytes = startFiles.partExists() ? startFiles.partSize() : 0;
      const bytesAtStart = run.lastBytes;
      run.lastProgressAt = p.now();
      try {
        const result = await this.runWatched(run, run.task);
        if (run.cancelling) return 'cancelled';
        return result;
      } catch (e) {
        if (run.cancelling) return 'cancelled';
        if (run.pausing) return 'paused';
        const f = toFailure(e);
        const files = p.files(spec);
        // A retry that moved the file forward is not "the same failure again": refill the budget.
        if (run.lastBytes - bytesAtStart >= this.retryResetBytes) attempt = 0;

        if (f.rangeNotSatisfiable) {
          // The server rejected our resume offset: either we already have everything, or the partial is stale.
          if (files.partExists() && files.partSize() >= meta.size) return 'completed';
          files.deletePart();
          run.task = null;
          run.lastBytes = 0;
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

  /**
   * task.run() plus a watchdog: if no new bytes arrive for `stallMs` (and the user has not paused),
   * the transfer is cancelled and reported as a retryable failure so transfer() resumes from the partial file.
   * `run.abandon` lets pause()/cancel() force-settle the promise when the native layer never answers.
   */
  private runWatched(run: Run, task: TransferTask): Promise<'completed' | 'paused'> {
    const p = this.platform;
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        run.abandon = null;
        fn();
      };
      run.abandon = () => finish(() => reject(new DownloadFailure('The transfer was stopped.', false)));
      task.run().then(
        (r) => finish(() => resolve(r)),
        (e) => finish(() => reject(e)),
      );
      if (this.stallMs <= 0) return;
      void (async () => {
        while (!settled) {
          await p.sleep(this.stallCheckMs);
          if (settled) return;
          if (run.pausing || run.cancelling) continue;
          if (p.now() - run.lastProgressAt >= this.stallMs) {
            finish(() => reject(new DownloadFailure('The download stopped receiving data. Check your internet, then tap Resume.', true)));
            try {
              task.cancel(); // frees the stuck connection; the partial file stays on disk
            } catch {
              // already gone
            }
            return;
          }
        }
      })();
    });
  }

  private onProgress(run: Run, bytes: number, total: number): void {
    if (this.stopped(run)) return;
    const now = this.platform.now();
    if (bytes > run.lastBytes) {
      run.lastBytes = bytes;
      run.lastProgressAt = now;
    }
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

  private async finalize(run: Run, meta: RemoteFileInfo): Promise<'done' | 'stopped'> {
    const { spec } = run;
    const p = this.platform;
    const files = p.files(spec);
    this.patch(spec.id, { status: 'finalizing', bytesWritten: meta.size, speedBps: 0, etaSec: 0, note: 'Checking the file...', verifyFraction: undefined });

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

    // Mandatory integrity check: the Hub's hash is for the file that was actually served, so it wins over the catalog copy.
    const expected = (meta.sha256 || run.spec.sha256 || '').toLowerCase();
    let verified = false;
    if (expected && this.verifyMode === 'always' && p.verifySha256) {
      const t0 = p.now();
      const r = await p.verifySha256(
        spec,
        expected,
        (fraction) => {
          const elapsed = Math.max(1, p.now() - t0);
          const f = Math.min(1, Math.max(0, fraction));
          this.patch(spec.id, {
            status: 'finalizing',
            verifyFraction: f,
            speedBps: f > 0 ? (meta.size * f * 1000) / elapsed : 0,
            etaSec: f > 0.01 ? Math.round((elapsed / f - elapsed) / 1000) : 0,
            note: `Verifying the download (one time) ${Math.round(f * 100)}%`,
          });
        },
        () => this.stopped(run),
      );
      if (r.stopped || this.stopped(run)) return 'stopped';
      if (!r.ok) {
        files.deletePart();
        throw new DownloadFailure(
          'The downloaded file does not match the official checksum (it is damaged), so it was deleted. Tap Try again to download it fresh.',
          true,
        );
      }
      verified = true;
    }
    files.promotePart();
    this.complete(spec.id, meta.size, verified);
    return 'done';
  }

  private complete(id: string, size: number, verified?: boolean): void {
    this.set(id, { ...IDLE_STATE, status: 'completed', bytesWritten: size, totalBytes: size, ...(verified ? { verified: true } : {}) });
  }
}
