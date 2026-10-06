/** Smoothed transfer speed + ETA from a stream of "bytes so far" samples. */
export class SpeedMeter {
  private lastTime = 0;
  private lastBytes = 0;
  private bps = 0;
  private readonly alpha: number;
  private readonly minWindowMs: number;

  constructor(alpha = 0.3, minWindowMs = 500) {
    this.alpha = alpha;
    this.minWindowMs = minWindowMs;
  }

  reset(bytes = 0, now = Date.now()): void {
    this.lastTime = now;
    this.lastBytes = bytes;
    this.bps = 0;
  }

  /** Feed the absolute byte count; returns the current smoothed bytes/second. */
  push(bytes: number, now = Date.now()): number {
    const dt = now - this.lastTime;
    if (this.lastTime === 0) {
      this.reset(bytes, now);
      return 0;
    }
    if (dt >= this.minWindowMs) {
      const delta = Math.max(0, bytes - this.lastBytes);
      const instant = (delta * 1000) / dt;
      this.bps = this.bps === 0 ? instant : this.alpha * instant + (1 - this.alpha) * this.bps;
      this.lastTime = now;
      this.lastBytes = bytes;
    }
    return this.bps;
  }

  get bytesPerSecond(): number {
    return this.bps;
  }

  /** Seconds remaining, or 0 when unknown. */
  etaSeconds(remainingBytes: number): number {
    if (this.bps < 1024 || remainingBytes <= 0) return 0;
    return Math.round(remainingBytes / this.bps);
  }
}
