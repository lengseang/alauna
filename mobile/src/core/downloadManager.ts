/**
 * Download state machine + queue (platform independent).
 *
 * One "install" = the model file plus its companions (image/audio projector `mmproj`, optional draft head), tracked
 * as ONE logical download under the model id: one progress bar, one pause/resume/cancel, one SHA-256 verified install.
 * Installs run through a queue (N at a time, default 1; reorder, pause all, resume all).
 *
 * Everything that touches the phone (files, network transfer, free space, keep-awake) goes through `DownloadPlatform`,
 * so the hard parts - pause, resume, retry, cancel, corrupt files, no space, process kill - are unit-tested with a fake
 * platform (test/downloadManager.test.ts, test/downloadQueue.test.ts). The real adapter is services/downloadPlatform.ts.
 *
 * Requirements: docs/REQUIREMENTS.md MD-2 .. MD-5.
 */
import type { HubFile, ModelSpec } from './catalog.ts';
import { formatBytes } from './format.ts';
import { hasGgufMagic } from './gguf.ts';
import { RemoteError, describeHttpStatus, resolveUrl, type RemoteFileInfo } from './hf.ts';
import { SpeedMeter } from './speedMeter.ts';
import { createStore } from './store.ts';

export type DownloadStatus = 'idle' | 'queued' | 'resolving' | 'downloading' | 'paused' | 'finalizing' | 'completed' | 'error';

/** The files of one install. */
export type FileKind = 'model' | 'mmproj' | 'draft';

export const FILE_KIND_LABEL: Record<FileKind, string> = { model: 'model', mmproj: 'image add-on', draft: 'speed-up draft' };

export interface DownloadState {
  status: DownloadStatus;
  /** Whole install (model + companions in this download). */
  bytesWritten: number;
  totalBytes: number;
  speedBps: number;
  etaSec: number;
  error?: string;
  /** For status 'error': does Resume make sense? */
  retryable: boolean;
  /** Transient info line, e.g. "Connection lost - retrying (1/4)". */
  note?: string;
  /** True when every file of the install was checked against the official SHA-256 (set on 'completed' by a download made in this app). */
  verified?: boolean;
  /** 0..1 while the SHA-256 check of the current file runs (status 'finalizing'). */
  verifyFraction?: number;
  /** 'completed' but the SHA-256 check still runs in the background: the model is usable now (verifyFraction / verifyEtaSec tell how far). */
  verifyPending?: boolean;
  /** Seconds left of the background check (0 = unknown). */
  verifyEtaSec?: number;
  /** File being transferred / verified right now. */
  part?: FileKind;
  /** The files of this install, in download order. */
  parts?: { kind: FileKind; totalBytes: number; done: boolean }[];
  /** 1-based place in the queue (status 'queued'). */
  queuePosition?: number;
  /** Companions this model offers that are not on the phone (on 'completed'): offer "Add image support" etc. */
  missing?: FileKind[];
}

export const IDLE_STATE: DownloadState = {
  status: 'idle',
  bytesWritten: 0,
  totalBytes: 0,
  speedBps: 0,
  etaSec: 0,
  retryable: false,
};

// -------------------------------------------------------------------- files of an install

/** One file to put on the phone. */
export interface DownloadFile {
  /** Platform key of this file: the model id for the model file, the local name for companions. */
  id: string;
  kind: FileKind;
  repo: string;
  /** Path in the Hub repo (may contain a folder). */
  filename: string;
  /** Flat file name on the phone (unique per Hub file, so two models can share one projector). */
  localName: string;
  sizeBytes: number;
  sha256: string;
  /** Destination folder (real filesystem path, e.g. a storage slot). Undefined = the default models folder. */
  dir?: string;
}

export interface InstallOptions {
  /** Include the image/audio projector (default true when the model has one). */
  vision?: boolean;
  /** Include the dedicated draft head for speculative decoding (default false). */
  draft?: boolean;
  /** Destination folder (a storage slot's real path). Default: where the model already is, else the default folder. */
  dir?: string;
}

const baseName = (p: string): string => p.slice(p.lastIndexOf('/') + 1);

/** Local name of a companion: `<owner>_<repo>.<file>`, e.g. `unsloth_Qwen3.5-4B-GGUF.mmproj-F16.gguf`. */
export function companionLocalName(f: Pick<HubFile, 'repo' | 'filename'>): string {
  return `${f.repo.replace('/', '_')}.${baseName(f.filename)}`;
}

export function installFiles(spec: ModelSpec, opts: InstallOptions = {}): DownloadFile[] {
  const out: DownloadFile[] = [
    { id: spec.id, kind: 'model', repo: spec.repo, filename: spec.filename, localName: baseName(spec.filename), sizeBytes: spec.sizeBytes, sha256: spec.sha256, dir: opts.dir },
  ];
  const add = (kind: FileKind, f: HubFile) => {
    const localName = companionLocalName(f);
    out.push({ id: localName, kind, repo: f.repo, filename: f.filename, localName, sizeBytes: f.sizeBytes, sha256: f.sha256, dir: opts.dir });
  };
  if ((opts.vision ?? true) && spec.mmproj) add('mmproj', spec.mmproj);
  if (opts.draft && spec.draft) add('draft', spec.draft);
  return out;
}

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
  /** Free bytes on the volume of `dir` (default: the models folder), or null if unknown. */
  freeSpaceBytes(dir?: string): number | null;
  files(file: DownloadFile): ModelFiles;
  fetchInfo(file: DownloadFile): Promise<RemoteFileInfo>;
  createTask(args: { spec: DownloadFile; url: string; onProgress: (absoluteBytes: number) => void }): TransferTask;
  /**
   * Full SHA-256 of the partial file, in small time slices so the UI stays alive. Must poll `shouldStop()` often and
   * return `stopped: true` as soon as it says so. Optional: a platform without it skips verification.
   */
  verifySha256?(
    file: DownloadFile,
    expected: string,
    onProgress: (fraction: number) => void,
    shouldStop: () => boolean,
    /** `which` 'dest' = hash the installed file (background mode); `gate` returns a promise to wait on while hashing is suspended (app in background). */
    opts?: { which?: 'part' | 'dest'; gate?: () => Promise<void> | undefined },
  ): Promise<{ ok: boolean; actual: string; stopped: boolean }>;
  /** Background checks still to finish (JSON strings), so a process kill does not lose them. */
  savePendingVerify?(entries: string[]): void;
  loadPendingVerify?(): string[];
  /** Remember which installs are running or queued so the next app launch can continue them (process kill / swipe-away). */
  saveIntent?(entries: string[]): void;
  loadIntent?(): string[];
  /**
   * Folder (real path) where this model file already is - installed or partial - in any storage slot, or undefined.
   * Companions are put next to their model, so the engine finds the projector beside it.
   */
  modelDir?(model: DownloadFile): string | undefined;
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

/** Intent entries: `id`, or `id#{"v":0,"d":1,"dir":"..."}` when the install options differ from the defaults. */
export function encodeIntent(id: string, opts: InstallOptions): string {
  const o: { v?: 0; d?: 1; dir?: string } = {};
  if (opts.vision === false) o.v = 0;
  if (opts.draft) o.d = 1;
  if (opts.dir) o.dir = opts.dir;
  return Object.keys(o).length > 0 ? `${id}#${JSON.stringify(o)}` : id;
}

export function decodeIntent(entry: string): { id: string; opts: InstallOptions } {
  const i = entry.indexOf('#');
  if (i < 0) return { id: entry, opts: {} };
  try {
    const o = JSON.parse(entry.slice(i + 1)) as { v?: number; d?: number; dir?: unknown };
    return {
      id: entry.slice(0, i),
      opts: { ...(o.v === 0 ? { vision: false } : {}), ...(o.d === 1 ? { draft: true } : {}), ...(typeof o.dir === 'string' ? { dir: o.dir } : {}) },
    };
  } catch {
    return { id: entry.slice(0, i), opts: {} };
  }
}

/** Numbers for a Downloads Hub header: what is running, waiting, and when it all finishes. */
export function summarizeDownloads(items: Record<string, DownloadState>): {
  active: number;
  queued: number;
  paused: number;
  failed: number;
  bytesRemaining: number;
  speedBps: number;
  /** Seconds until everything running or queued is downloaded at the current total speed (0 = unknown). */
  etaSec: number;
} {
  let active = 0;
  let queued = 0;
  let paused = 0;
  let failed = 0;
  let bytesRemaining = 0;
  let speedBps = 0;
  for (const s of Object.values(items)) {
    if (s.status === 'resolving' || s.status === 'downloading' || s.status === 'finalizing') active++;
    else if (s.status === 'queued') queued++;
    else if (s.status === 'paused') paused++;
    else if (s.status === 'error') failed++;
    else continue;
    if (s.status !== 'paused' && s.status !== 'error') bytesRemaining += Math.max(0, s.totalBytes - s.bytesWritten);
    if (s.status === 'downloading') speedBps += s.speedBps;
  }
  return { active, queued, paused, failed, bytesRemaining, speedBps, etaSec: speedBps >= 1024 && bytesRemaining > 0 ? Math.round(bytesRemaining / speedBps) : 0 };
}

// -------------------------------------------------------------------- manager

export type StartResult = { ok: true } | { ok: false; message: string };

interface Run {
  spec: ModelSpec;
  opts: InstallOptions;
  files: DownloadFile[];
  metas: RemoteFileInfo[] | null;
  /** Bytes of the whole install, and of the other files while one is transferring (for one progress bar). */
  total: number;
  base: number;
  /** Bytes still to download (shared disk-space check between parallel installs). */
  remaining: number;
  allVerified: boolean;
  /** Files installed but still to be SHA-checked in the background. */
  pending: BgItem[];
  task: TransferTask | null;
  /** File id the task belongs to (a paused task is only reused for the same file). */
  taskFile: string | null;
  active: boolean;
  pausing: boolean;
  cancelling: boolean;
  meter: SpeedMeter;
  lastEmit: number;
  /** Raw bytes of the current file seen so far and when they last increased (stall watchdog). */
  lastBytes: number;
  lastProgressAt: number;
  /** Force-settles the transfer promise (set only while a transfer is in flight). */
  abandon: (() => void) | null;
  done: Promise<void>;
}

interface BgItem {
  file: DownloadFile;
  expected: string;
}

interface BgJob {
  spec: ModelSpec;
  items: BgItem[];
  /** Total items (for one progress fraction) and how many are done. */
  total: number;
  done: number;
  verified: boolean;
  stop: boolean;
  running: Promise<void>;
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
   * 'background' (default): installed at once, SHA-256 checked afterwards without holding a queue slot; a mismatch deletes the file.
   * 'always': a file is only installed after its SHA-256 matches the Hub's (or the catalog's) hash.
   * 'off': size + GGUF header only. Exists because the check is pure JavaScript and may be slow on a phone.
   */
  verifyMode?: 'background' | 'always' | 'off';
  /** A background check found a damaged file (it is about to be deleted). The app unloads the model and shows a message. */
  onVerifyFailed?: (specId: string, kind: FileKind, message: string) => void;
  /** How long pause/cancel wait for the native transfer to report back before the run is abandoned (native cancel can hang). */
  stopGraceMs?: number;
  /** Installs transferring at the same time (default 1, max 4). The rest wait in the queue. */
  maxConcurrent?: number;
}

export interface DownloadStoreState {
  items: Record<string, DownloadState>;
  /** Model ids waiting to start, in order. */
  queue: string[];
  concurrency: number;
}

export class DownloadManager {
  readonly store = createStore<DownloadStoreState>({ items: {}, queue: [], concurrency: 1 });
  private readonly platform: DownloadPlatform;
  private readonly runs = new Map<string, Run>();
  private readonly known = new Map<string, ModelSpec>();
  /** Files being transferred right now (a projector shared by two models is only downloaded once). */
  private readonly fileLocks = new Map<string, Promise<void>>();
  private queue: string[] = [];
  private concurrency: number;
  private readonly maxRetries: number;
  private readonly backoff: number[];
  private readonly margin: number;
  private readonly stallMs: number;
  private readonly stallCheckMs: number;
  private readonly retryResetBytes: number;
  private readonly verifyMode: 'background' | 'always' | 'off';
  private readonly onVerifyFailed?: DownloadManagerOptions['onVerifyFailed'];
  private readonly bg = new Map<string, BgJob>();
  private appActive = true;
  private resumeGate: { promise: Promise<void>; open: () => void } | null = null;
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
    this.verifyMode = options.verifyMode ?? 'background';
    this.onVerifyFailed = options.onVerifyFailed;
    this.stopGraceMs = options.stopGraceMs ?? 4000;
    this.concurrency = clampConcurrency(options.maxConcurrent ?? 1);
    this.store.setState({ concurrency: this.concurrency });
  }

  // ---------------------------------------------------------------- queries

  stateOf(id: string): DownloadState {
    return this.store.getState().items[id] ?? IDLE_STATE;
  }

  /** Resolves when every started run has fully finished (state published AND resources released). */
  async settled(): Promise<void> {
    for (;;) {
      const pending = [...this.runs.values()].filter((r) => r.active);
      if (pending.length === 0) return;
      await Promise.all(pending.map((r) => r.done.catch(() => undefined)));
    }
  }

  /** Id of an install that is currently transferring, if any (compat: with a queue, several may run). */
  busyId(): string | null {
    for (const [id, run] of this.runs) {
      if (!run.active) continue;
      const s = this.stateOf(id).status;
      if (s === 'resolving' || s === 'downloading' || s === 'finalizing') return id;
    }
    return null;
  }

  queueOrder(): string[] {
    return [...this.queue];
  }

  // ---------------------------------------------------------------- commands

  /**
   * Start, queue, resume after pause, or retry after an error. Safe to call repeatedly (idempotent while running or
   * queued). `opts` are remembered for later resumes of the same install.
   */
  async start(spec: ModelSpec, opts?: InstallOptions): Promise<StartResult> {
    this.known.set(spec.id, spec);
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
    if (this.queue.includes(spec.id)) return { ok: true };
    if (!this.platform.isStorageReady()) {
      return { ok: false, message: 'Choose where CHIWIWI keeps its data first (Settings > Storage).' };
    }
    const merged: InstallOptions = { ...(existing?.opts ?? {}), ...(opts ?? {}) };
    const dir = merged.dir ?? this.platform.modelDir?.(installFiles(spec, { vision: false })[0]);
    const files = installFiles(spec, { ...merged, dir });
    const run: Run = existing ?? newRun(spec);
    if (run.files.map((f) => `${f.dir ?? ''}|${f.id}`).join() !== files.map((f) => `${f.dir ?? ''}|${f.id}`).join()) run.metas = null;
    run.spec = spec;
    run.opts = merged;
    run.files = files;
    run.pausing = false;
    run.cancelling = false;
    this.runs.set(spec.id, run);

    if (this.activeCount() >= this.concurrency) {
      this.queue.push(spec.id);
      this.patch(spec.id, { status: 'queued', error: undefined, retryable: false, note: undefined, speedBps: 0, etaSec: 0, verifyFraction: undefined });
      this.publishQueue();
      this.syncIntent();
      return { ok: true };
    }
    this.launch(run);
    return { ok: true };
  }

  async pause(id: string): Promise<void> {
    if (this.dequeue(id)) {
      const run = this.runs.get(id);
      if (run) this.afterStop(run);
      this.syncIntent();
      return;
    }
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

  /** Cancel; by default the partial files are deleted too (never a file another install is still transferring). */
  async cancel(spec: ModelSpec, deletePartial = true): Promise<void> {
    this.dequeue(spec.id);
    await this.stopBg(spec.id);
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
      for (const f of run?.files ?? this.allFiles(spec)) {
        if (this.fileLocks.has(lockKey(f))) continue;
        try {
          this.platform.files(f).deletePart();
        } catch {
          // nothing to delete
        }
      }
    }
    this.syncIntent();
    this.refresh([spec]);
  }

  /**
   * Delete an installed (or partial) model and its companions. A projector that another installed model also uses
   * is kept. `keepCompanions: true` deletes only the model file.
   */
  async remove(spec: ModelSpec, opts: { keepCompanions?: boolean } = {}): Promise<void> {
    await this.cancel(spec, true);
    const shared = new Set<string>();
    for (const other of this.known.values()) {
      if (other.id === spec.id || this.stateOf(other.id).status !== 'completed') continue;
      for (const f of this.allFiles(other).slice(1)) shared.add(lockKey(f));
    }
    for (const f of this.allFiles(spec)) {
      if (f.kind !== 'model' && (opts.keepCompanions || shared.has(lockKey(f)))) continue;
      try {
        this.platform.files(f).deleteDest();
      } catch {
        // surfaced by refresh() if the file is still there
      }
    }
    this.refresh([spec]);
  }

  /** Re-read the disk: installed models (and missing companions), resumable partials. Does not touch running or queued installs. */
  refresh(specs: readonly ModelSpec[]): void {
    for (const spec of specs) this.known.set(spec.id, spec);
    if (!this.platform.isStorageReady()) return;
    for (const spec of specs) {
      const run = this.runs.get(spec.id);
      if (run?.active || this.queue.includes(spec.id) || this.bg.has(spec.id)) continue;
      // Keep a visible error until the user acts on it (Resume / Cancel).
      if (run && this.stateOf(spec.id).status === 'error') continue;
      try {
        const files = this.allFiles(spec);
        const sizes = files.map((f) => {
          const h = this.platform.files(f);
          const dest = h.destExists() ? h.destSize() : 0;
          const installed = dest >= f.sizeBytes * 0.9 && dest > 0;
          return { f, installed, bytes: installed ? dest : h.partExists() ? h.partSize() : 0 };
        });
        const [model, ...companions] = sizes;
        if (model.installed) {
          this.set(spec.id, {
            ...IDLE_STATE,
            status: 'completed',
            bytesWritten: model.bytes,
            totalBytes: model.bytes,
            missing: companions.filter((c) => !c.installed).map((c) => c.f.kind),
          });
        } else if (sizes.some((s) => s.bytes > 0 && s.f.kind !== 'draft') && model.bytes > 0) {
          // The default install (model + projector) has a partial: resumable.
          const counted = sizes.filter((s) => s.f.kind !== 'draft');
          this.set(spec.id, {
            ...IDLE_STATE,
            status: 'paused',
            bytesWritten: counted.reduce((n, s) => n + s.bytes, 0),
            totalBytes: counted.reduce((n, s) => n + s.f.sizeBytes, 0),
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
   * Call once after `refresh()` at startup: installs that were running or queued when the app was killed continue
   * (from their partial files), in their old order. Never ones the user paused or cancelled.
   */
  resumeInterrupted(specs: readonly ModelSpec[]): void {
    let entries: string[] = [];
    try {
      entries = this.platform.loadIntent?.() ?? [];
    } catch {
      entries = [];
    }
    this.resumePendingVerify(specs);
    let started = 0;
    for (const entry of entries) {
      const { id, opts } = decodeIntent(entry);
      const spec = specs.find((s) => s.id === id);
      if (!spec || this.stateOf(id).status === 'completed') continue;
      started++;
      void this.start(spec, opts);
    }
    if (entries.length > 0 && started === 0) this.syncIntent();
  }

  /** Pause everything: running installs and the queue. */
  async pauseAll(): Promise<void> {
    const ids = [...this.queue, ...[...this.runs.entries()].filter(([, r]) => r.active).map(([id]) => id)];
    await Promise.all(ids.map((id) => this.pause(id)));
  }

  /** Resume every paused (or retryable failed) install of `specs`, in that order, through the queue. */
  async resumeAll(specs: readonly ModelSpec[]): Promise<void> {
    for (const spec of specs) {
      const s = this.stateOf(spec.id);
      if (s.status === 'paused' || (s.status === 'error' && s.retryable)) await this.start(spec);
    }
  }

  /** Move a queued install to `index` (0 = next to start). */
  moveInQueue(id: string, index: number): void {
    const from = this.queue.indexOf(id);
    if (from < 0) return;
    this.queue.splice(from, 1);
    this.queue.splice(Math.max(0, Math.min(index, this.queue.length)), 0, id);
    this.publishQueue();
    this.syncIntent();
  }

  /** How many installs transfer at the same time (1..4). Raising it starts queued installs right away. */
  setConcurrency(n: number): void {
    this.concurrency = clampConcurrency(n);
    this.store.setState({ concurrency: this.concurrency });
    this.pump();
  }

  // ---------------------------------------------------------------- internals

  private allFiles(spec: ModelSpec): DownloadFile[] {
    return installFiles(spec, { vision: true, draft: true, dir: this.platform.modelDir?.(installFiles(spec, { vision: false })[0]) });
  }

  private activeCount(): number {
    let n = 0;
    for (const r of this.runs.values()) if (r.active) n++;
    return n;
  }

  private launch(run: Run): void {
    const id = run.spec.id;
    run.active = true;
    this.setAwake(+1);
    this.syncIntent();
    this.patch(id, {
      status: 'resolving', error: undefined, retryable: false, note: undefined, speedBps: 0, etaSec: 0,
      verified: undefined, verifyFraction: undefined, queuePosition: undefined, missing: undefined,
    });
    run.done = this.execute(run).finally(() => {
      run.active = false;
      this.setAwake(-1);
      this.syncIntent();
      this.pump();
    });
  }

  /** Start queued installs while there is room. */
  private pump(): void {
    while (this.queue.length > 0 && this.activeCount() < this.concurrency) {
      const id = this.queue.shift()!;
      const run = this.runs.get(id);
      if (run && !run.active) this.launch(run);
    }
    this.publishQueue();
  }

  private dequeue(id: string): boolean {
    const i = this.queue.indexOf(id);
    if (i < 0) return false;
    this.queue.splice(i, 1);
    this.publishQueue();
    return true;
  }

  private publishQueue(): void {
    const queue = [...this.queue];
    this.store.setState((s) => {
      const items = { ...s.items };
      queue.forEach((id, i) => {
        items[id] = { ...(items[id] ?? IDLE_STATE), status: 'queued', queuePosition: i + 1 };
      });
      return { items, queue };
    });
  }

  private syncIntent(): void {
    try {
      const running = [...this.runs.entries()].filter(([, r]) => r.active && !r.pausing && !r.cancelling).map(([id]) => id);
      const ids = [...running, ...this.queue.filter((id) => !running.includes(id))];
      this.platform.saveIntent?.(ids.map((id) => encodeIntent(id, this.runs.get(id)?.opts ?? {})));
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
      if (!run.metas) {
        const metas: RemoteFileInfo[] = [];
        for (const f of run.files) metas.push(await p.fetchInfo(f));
        run.metas = metas;
      }
      const metas = run.metas;
      if (this.stopped(run)) return this.afterStop(run);

      // What is already on the phone (a finished file of this install, or a projector shared with another model).
      const plan = run.files.map((f, i) => {
        const files = p.files(f);
        const size = metas[i].size;
        let done = false;
        if (files.destExists()) {
          const head = files.readHeader('dest');
          if (files.destSize() === size && head && hasGgufMagic(head)) done = true;
          else if (!this.fileLocks.has(lockKey(f))) files.deleteDest();
        }
        let have = !done && files.partExists() ? files.partSize() : 0;
        if (have > size && !this.fileLocks.has(lockKey(f))) {
          files.deletePart();
          have = 0;
        }
        return { f, size, done, have };
      });
      run.total = plan.reduce((n, x) => n + x.size, 0);
      run.remaining = plan.reduce((n, x) => n + (x.done ? 0 : x.size - x.have), 0);
      const partsOf = () => plan.map((x) => ({ kind: x.f.kind, totalBytes: x.size, done: x.done }));

      if (run.remaining > 0) {
        const dir = run.files[0].dir;
        const free = p.freeSpaceBytes(dir);
        let others = 0;
        for (const r of this.runs.values()) if (r !== run && r.active && r.files[0]?.dir === dir) others += r.remaining;
        const need = run.remaining + others + this.margin;
        if (free !== null && free < need) {
          throw new DownloadFailure(
            `Not enough free space: ${formatBytes(need)} needed${others > 0 ? ' (including other downloads in progress)' : ''}, ${formatBytes(free)} available. Free some space and try again.`,
            true,
          );
        }
      }

      const doneBytes = () => plan.reduce((n, x) => n + (x.done ? x.size : x.have), 0);
      this.patch(spec.id, { status: 'downloading', bytesWritten: doneBytes(), totalBytes: run.total, note: undefined, parts: partsOf() });
      run.meter.reset(doneBytes(), p.now());
      // "verified" = every file of this install was SHA-checked in this download (a file found on disk was not).
      run.allVerified = plan.every((x) => !x.done);
      run.pending = [];

      for (let i = 0; i < plan.length; i++) {
        const step = plan[i];
        if (step.done) continue;
        const key = lockKey(step.f);
        // Another install is fetching this very file (a shared projector): wait, then use its result.
        while (this.fileLocks.has(key)) {
          this.patch(spec.id, { note: `Waiting for the shared ${FILE_KIND_LABEL[step.f.kind]}...` });
          await this.fileLocks.get(key);
          if (this.stopped(run)) return this.afterStop(run);
        }
        const h = p.files(step.f);
        const head = h.destExists() ? h.readHeader('dest') : null;
        if (head && hasGgufMagic(head) && h.destSize() === step.size) {
          step.done = true;
          continue;
        }
        let release: () => void = () => undefined;
        this.fileLocks.set(key, new Promise<void>((r) => (release = r)));
        try {
          step.have = h.partExists() ? h.partSize() : 0;
          run.base = plan.reduce((n, x, j) => n + (j === i ? 0 : x.done ? x.size : x.have), 0);
          this.patch(spec.id, { status: 'downloading', part: step.f.kind, note: undefined });
          if (step.have < step.size) {
            const outcome = await this.transfer(run, step.f, step.size);
            if (outcome === 'cancelled') return;
            if (outcome === 'paused') return this.afterStop(run);
          }
          if (this.stopped(run)) return this.afterStop(run);
          if ((await this.finalize(run, step.f, step.size)) === 'stopped') return this.afterStop(run);
        } finally {
          this.fileLocks.delete(key);
          release();
        }
        step.done = true;
        run.remaining = plan.reduce((n, x) => n + (x.done ? 0 : x.size - x.have), 0);
        this.patch(spec.id, { parts: partsOf() });
      }
      this.complete(run, run.allVerified && run.files.length > 0);
      if (run.pending.length > 0) this.startBg(run.spec, run.pending, run.allVerified);
    } catch (e) {
      if (this.stopped(run)) return this.afterStop(run);
      const f = toFailure(e);
      this.patch(spec.id, { status: 'error', error: f.message, retryable: f.retryable, speedBps: 0, etaSec: 0, note: undefined, verifyFraction: undefined });
    }
  }

  /** Paused state with the real bytes on disk. */
  private afterStop(run: Run): void {
    if (run.cancelling) return;
    let bytes = 0;
    for (const f of run.files) {
      try {
        const h = this.platform.files(f);
        bytes += h.destExists() ? h.destSize() : h.partExists() ? h.partSize() : 0;
      } catch {
        // unreadable: count as 0
      }
    }
    this.patch(run.spec.id, {
      status: 'paused', bytesWritten: bytes, totalBytes: run.total || this.stateOf(run.spec.id).totalBytes,
      speedBps: 0, etaSec: 0, note: undefined, verifyFraction: undefined, queuePosition: undefined,
    });
  }

  private async transfer(run: Run, file: DownloadFile, size: number): Promise<'completed' | 'paused' | 'cancelled'> {
    const { spec } = run;
    const p = this.platform;
    let attempt = 0;
    for (;;) {
      if (!run.task || !run.task.isPaused() || run.taskFile !== file.id) {
        run.task = p.createTask({
          spec: file,
          url: resolveUrl(file.repo, file.filename),
          onProgress: (bytes) => this.onProgress(run, bytes, size),
        });
        run.taskFile = file.id;
      }
      // Re-seed from the partial file: a resumed native task restarts at the on-disk length, which can be a
      // little below the last value we saw, and that must not look like "no progress".
      const startFiles = p.files(file);
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
        const files = p.files(file);
        // A retry that moved the file forward is not "the same failure again": refill the budget.
        if (run.lastBytes - bytesAtStart >= this.retryResetBytes) attempt = 0;

        if (f.rangeNotSatisfiable) {
          // The server rejected our resume offset: either we already have everything, or the partial is stale.
          if (files.partExists() && files.partSize() >= size) return 'completed';
          files.deletePart();
          run.task = null;
          run.lastBytes = 0;
          run.meter.reset(run.base, p.now());
          this.patch(spec.id, { bytesWritten: run.base });
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

  /** `bytes` = raw bytes of the current file; the store gets the whole install's bytes. */
  private onProgress(run: Run, bytes: number, fileSize: number): void {
    if (this.stopped(run)) return;
    const now = this.platform.now();
    if (bytes > run.lastBytes) {
      run.lastBytes = bytes;
      run.lastProgressAt = now;
    }
    const absolute = run.base + bytes;
    const bps = run.meter.push(absolute, now);
    if (now - run.lastEmit < 250 && bytes < fileSize) return;
    run.lastEmit = now;
    this.patch(run.spec.id, {
      status: 'downloading',
      bytesWritten: absolute,
      totalBytes: run.total,
      speedBps: bps,
      etaSec: run.meter.etaSeconds(run.total - absolute),
      note: undefined,
    });
  }

  private async finalize(run: Run, file: DownloadFile, size: number): Promise<'done' | 'stopped'> {
    const { spec } = run;
    const p = this.platform;
    const files = p.files(file);
    const what = file.kind === 'model' ? 'the download' : `the ${FILE_KIND_LABEL[file.kind]}`;
    this.patch(spec.id, { status: 'finalizing', part: file.kind, bytesWritten: run.base + size, speedBps: 0, etaSec: 0, note: 'Checking the file...', verifyFraction: undefined });

    const have = files.partExists() ? files.partSize() : 0;
    if (have > size) {
      files.deletePart();
      throw new DownloadFailure('The file came out larger than expected and was discarded. Please download it again.', true);
    }
    if (have < size) {
      throw new DownloadFailure(`The download ended early (${formatBytes(have)} of ${formatBytes(size)}). Tap Resume to continue.`, true);
    }
    const head = files.readHeader('part');
    if (!head || !hasGgufMagic(head)) {
      files.deletePart();
      throw new DownloadFailure('The downloaded file is not a valid model (it was probably an error page). It was removed. Please try again.', true);
    }

    // Mandatory integrity check: the Hub's hash is for the file that was actually served, so it wins over the catalog copy.
    const meta = run.metas?.[run.files.indexOf(file)];
    const expected = (meta?.sha256 || file.sha256 || '').toLowerCase();
    let verified = false;
    if (expected && this.verifyMode === 'background' && p.verifySha256) {
      // Usable now; the checksum runs afterwards (startBg) and deletes the file if it does not match.
      files.promotePart();
      run.pending.push({ file, expected });
      return 'done';
    }
    if (expected && this.verifyMode === 'always' && p.verifySha256) {
      const t0 = p.now();
      const r = await p.verifySha256(
        file,
        expected,
        (fraction) => {
          const elapsed = Math.max(1, p.now() - t0);
          const f = Math.min(1, Math.max(0, fraction));
          this.patch(spec.id, {
            status: 'finalizing',
            verifyFraction: f,
            speedBps: f > 0 ? (size * f * 1000) / elapsed : 0,
            etaSec: f > 0.01 ? Math.round((elapsed / f - elapsed) / 1000) : 0,
            note: `Verifying ${what} (one time) ${Math.round(f * 100)}%`,
          });
        },
        () => this.stopped(run),
      );
      if (r.stopped || this.stopped(run)) return 'stopped';
      if (!r.ok) {
        files.deletePart();
        throw new DownloadFailure(
          `The downloaded ${file.kind === 'model' ? 'file' : FILE_KIND_LABEL[file.kind]} does not match the official checksum (it is damaged), so it was deleted. Tap Try again to download it fresh.`,
          true,
        );
      }
      verified = true;
    }
    if (!verified) run.allVerified = false;
    files.promotePart();
    return 'done';
  }

  // ---------------------------------------------------------------- background verification

  /** Installed models whose SHA-256 check is still running (the Downloads Hub lists them apart from the queue). */
  verifyingIds(): string[] {
    return [...this.bg.keys()];
  }

  /** Resolves when no background check is running (tests; never needed by the UI). */
  async verifySettled(): Promise<void> {
    while (this.bg.size > 0) await Promise.all([...this.bg.values()].map((j) => j.running.catch(() => undefined)));
  }

  /** App went to the background / came back. While suspended, hashing waits (no progress lost, never marked failed). */
  setAppActive(active: boolean): void {
    if (active === this.appActive) return;
    this.appActive = active;
    if (!active) {
      let open: () => void = () => undefined;
      this.resumeGate = { promise: new Promise<void>((r) => (open = r)), open };
    } else {
      this.resumeGate?.open();
      this.resumeGate = null;
    }
  }

  private startBg(spec: ModelSpec, items: BgItem[], verified: boolean): void {
    const id = spec.id;
    const existing = this.bg.get(id);
    if (existing) {
      existing.items.push(...items);
      existing.total += items.length;
      existing.verified = existing.verified && verified;
      this.savePending();
      return;
    }
    const job: BgJob = { spec, items: [...items], total: items.length, done: 0, verified, stop: false, running: Promise.resolve() };
    this.bg.set(id, job);
    this.patch(id, { verifyPending: true, verifyFraction: 0, verifyEtaSec: 0 });
    this.savePending();
    job.running = this.runBg(job).finally(() => {
      if (this.bg.get(id) === job) this.bg.delete(id);
      this.savePending();
    });
  }

  private async runBg(job: BgJob): Promise<void> {
    const p = this.platform;
    const id = job.spec.id;
    const t0 = p.now();
    const idle = { verifyPending: false, verifyFraction: undefined, verifyEtaSec: undefined };
    while (job.items.length > 0 && !job.stop) {
      const item = job.items[0];
      let r: { ok: boolean; stopped: boolean };
      try {
        r = await p.verifySha256!(
          item.file,
          item.expected,
          (fraction) => {
            const f = Math.min(1, Math.max(0, (job.done + fraction) / job.total));
            const elapsed = Math.max(1, p.now() - t0);
            this.patch(id, { verifyPending: true, verifyFraction: f, verifyEtaSec: f > 0.01 ? Math.round((elapsed / f - elapsed) / 1000) : 0 });
          },
          () => job.stop,
          { which: 'dest', gate: () => this.resumeGate?.promise },
        );
      } catch {
        // The file could not be read (storage unplugged...): not proof of damage, so nothing is deleted.
        this.patch(id, idle);
        return;
      }
      if (r.stopped || job.stop) return;
      job.items.shift();
      job.done++;
      if (!r.ok) {
        job.items.length = 0;
        this.failBg(job, item.file);
        return;
      }
      this.savePending();
    }
    if (job.stop) return;
    this.patch(id, { ...idle, ...(job.verified ? { verified: true } : {}) });
  }

  /** Mismatch: stop using the file (unload through the callback), delete it, say so. */
  private failBg(job: BgJob, file: DownloadFile): void {
    const id = job.spec.id;
    const what = file.kind === 'model' ? 'file' : FILE_KIND_LABEL[file.kind];
    const message = `The downloaded ${what} does not match the official checksum (it is damaged), so it was deleted. Tap Try again to download it fresh.`;
    try {
      this.onVerifyFailed?.(id, file.kind, message);
    } catch {
      // the callback must not stop the delete below
    }
    try {
      this.platform.files(file).deleteDest();
    } catch {
      // surfaced by refresh() if the file is still there
    }
    if (file.kind === 'model') {
      this.bg.delete(id);
      this.set(id, { ...IDLE_STATE, status: 'error', error: message, retryable: true });
    } else {
      const s = this.stateOf(id);
      this.patch(id, { verifyPending: false, verifyFraction: undefined, verifyEtaSec: undefined, note: message, missing: [...new Set([...(s.missing ?? []), file.kind])] });
    }
  }

  private async stopBg(id: string): Promise<void> {
    const job = this.bg.get(id);
    if (!job) return;
    job.stop = true;
    this.resumeGate?.open();
    await job.running.catch(() => undefined);
    this.bg.delete(id);
    this.savePending();
  }

  private savePending(): void {
    try {
      const out: string[] = [];
      for (const j of this.bg.values()) for (const it of j.items) out.push(JSON.stringify({ specId: j.spec.id, file: it.file, expected: it.expected, verified: j.verified }));
      this.platform.savePendingVerify?.(out);
    } catch {
      // best effort
    }
  }

  /** After a process kill: continue the checks that were still pending (the files are installed and loadable meanwhile). */
  private resumePendingVerify(specs: readonly ModelSpec[]): void {
    if (!this.platform.verifySha256 || this.verifyMode === 'off') return;
    let entries: string[] = [];
    try {
      entries = this.platform.loadPendingVerify?.() ?? [];
    } catch {
      return;
    }
    const grouped = new Map<string, { items: BgItem[]; verified: boolean }>();
    for (const e of entries) {
      try {
        const x = JSON.parse(e) as { specId: string; file: DownloadFile; expected: string; verified?: boolean };
        if (!x.expected || !this.platform.files(x.file).destExists()) continue; // deleted meanwhile: nothing to check
        const g = grouped.get(x.specId) ?? { items: [], verified: true };
        g.items.push({ file: x.file, expected: x.expected });
        g.verified = g.verified && x.verified !== false;
        grouped.set(x.specId, g);
      } catch {
        // corrupt record: drop it
      }
    }
    for (const [id, g] of grouped) {
      const spec = specs.find((s) => s.id === id) ?? this.known.get(id);
      if (spec && this.stateOf(id).status === 'completed') this.startBg(spec, g.items, g.verified);
    }
    if (entries.length > 0 && grouped.size === 0) this.savePending();
  }

  private complete(run: Run, verified: boolean): void {
    const have = new Set(run.files.map((f) => f.kind));
    const offered: FileKind[] = [...(run.spec.mmproj ? (['mmproj'] as const) : []), ...(run.spec.draft ? (['draft'] as const) : [])];
    this.set(run.spec.id, {
      ...IDLE_STATE,
      status: 'completed',
      bytesWritten: run.total,
      totalBytes: run.total,
      parts: run.files.map((f, i) => ({ kind: f.kind, totalBytes: run.metas?.[i]?.size ?? f.sizeBytes, done: true })),
      missing: offered.filter((k) => !have.has(k)),
      ...(verified && run.pending.length === 0 ? { verified: true } : {}),
      ...(run.pending.length > 0 ? { verifyPending: true, verifyFraction: 0, verifyEtaSec: 0 } : {}),
    });
  }
}

function newRun(spec: ModelSpec): Run {
  return {
    spec,
    opts: {},
    files: [],
    metas: null,
    total: 0,
    base: 0,
    remaining: 0,
    allVerified: true,
    pending: [],
    task: null,
    taskFile: null,
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
}

function lockKey(f: DownloadFile): string {
  return `${f.dir ?? ''}|${f.id}`;
}

function clampConcurrency(n: number): number {
  return Math.max(1, Math.min(4, Math.floor(Number.isFinite(n) ? n : 1)));
}
