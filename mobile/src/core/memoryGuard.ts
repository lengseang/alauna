/**
 * Frees the model's RAM when the app is idle in the background or the OS warns about memory.
 *
 * Why: a 3-6 GB resident model while the user switches apps invites Android's low-memory killer, and a kill throws
 * away an open chat's state and the loaded model at the worst moment. Releasing is cheap to undo: the next message
 * reloads the model (services/chat.ts does that automatically).
 *
 * Pure logic with injected timers so it is unit-tested without a phone. AppState wiring is in services/lifecycle.ts.
 * Rules: never interrupt a reply or a load; an `inactive` app (permission dialog, folder picker) is NOT background.
 */
export interface MemoryGuardDeps {
  /** A load or a reply is in progress. */
  isBusy(): boolean;
  isLoaded(): boolean;
  release(reason: 'memory' | 'background'): Promise<unknown>;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
}

export interface MemoryGuardOptions {
  /** How long the app may sit in the background before the model is released. */
  backgroundDelayMs?: number;
  /** While something is still running, look again after this long. */
  retryMs?: number;
}

export class MemoryGuard {
  private readonly deps: MemoryGuardDeps;
  private readonly delayMs: number;
  private readonly retryMs: number;
  private timer: unknown = null;
  private background = false;

  constructor(deps: MemoryGuardDeps, options: MemoryGuardOptions = {}) {
    this.deps = deps;
    this.delayMs = options.backgroundDelayMs ?? 45_000;
    this.retryMs = options.retryMs ?? 15_000;
  }

  onBackground(): void {
    this.background = true;
    this.arm(this.delayMs);
  }

  onForeground(): void {
    this.background = false;
    this.disarm();
  }

  /** The OS says memory is low. Release right away if idle; a running reply is never cut short. */
  onMemoryWarning(): void {
    if (!this.deps.isLoaded()) return;
    if (this.deps.isBusy()) {
      if (this.background) this.arm(this.retryMs);
      return;
    }
    void this.deps.release('memory');
  }

  private arm(ms: number): void {
    this.disarm();
    this.timer = this.deps.setTimer(() => {
      this.timer = null;
      this.check();
    }, ms);
  }

  private disarm(): void {
    if (this.timer !== null) this.deps.clearTimer(this.timer);
    this.timer = null;
  }

  private check(): void {
    if (!this.background || !this.deps.isLoaded()) return;
    if (this.deps.isBusy()) {
      this.arm(this.retryMs);
      return;
    }
    void this.deps.release('background');
  }
}
