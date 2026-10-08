/**
 * First-run path in one call: make sure the model is on the phone (download if needed, resume if partial,
 * verify), then load it and prove it can answer.
 *
 *   downloadAndLoad(spec, deps)  ->  { ok: true } | { ok: false, stage, reason, message, fix? }
 *
 * Progress is observable the normal way (download store, engine status); `onStage` adds a single coarse stage for a
 * "Getting ready" screen. Pure logic with injected managers, tested with fakes.
 */
import type { ModelSpec } from './catalog.ts';
import type { DownloadManager, DownloadState } from './downloadManager.ts';
import type { EngineManager } from './engineManager.ts';

export type SetupStage = 'downloading' | 'verifying' | 'loading' | 'warming' | 'done';

export type SetupResult =
  | { ok: true; alreadyInstalled: boolean; tokensPerSecond: number }
  | {
      ok: false;
      stage: 'download' | 'load';
      /** `paused`/`cancelled`: the user (or the app) stopped it - not an error. `busy`: another download is running. */
      reason: 'paused' | 'cancelled' | 'error' | 'refused' | 'engine';
      message: string;
      fix?: string;
      retryable?: boolean;
    };

export interface SetupDeps {
  downloads: Pick<DownloadManager, 'start' | 'stateOf' | 'store'>;
  engine: Pick<EngineManager, 'mount' | 'isReady' | 'state'>;
  isInstalled(spec: ModelSpec): boolean;
  onStage?(stage: SetupStage): void;
}

/** Resolve at the next settled state of this download. `idle` after activity means it was cancelled. */
function waitForSettled(downloads: SetupDeps['downloads'], id: string): Promise<DownloadState> {
  return new Promise((resolve) => {
    let sawActivity = false;
    const check = (): boolean => {
      const s = downloads.stateOf(id);
      if (s.status === 'resolving' || s.status === 'downloading' || s.status === 'finalizing') sawActivity = true;
      const settled = s.status === 'completed' || s.status === 'error' || s.status === 'paused' || (s.status === 'idle' && sawActivity);
      if (settled) {
        off();
        resolve(s);
      }
      return settled;
    };
    const off = downloads.store.subscribe(check);
    check();
  });
}

export async function downloadAndLoad(spec: ModelSpec, deps: SetupDeps, opts: { force?: boolean } = {}): Promise<SetupResult> {
  const { downloads, engine } = deps;
  const stage = (s: SetupStage) => deps.onStage?.(s);

  if (engine.isReady(spec.id)) {
    stage('done');
    return { ok: true, alreadyInstalled: true, tokensPerSecond: engine.state.lastTokPerSec ?? 0 };
  }

  const alreadyInstalled = deps.isInstalled(spec);
  if (!alreadyInstalled) {
    stage('downloading');
    const started = await downloads.start(spec);
    if (!started.ok) return { ok: false, stage: 'download', reason: 'refused', message: started.message };

    // Mirror the manager's phases into coarse stages for the caller while we wait.
    const off = downloads.store.subscribe(() => {
      const st = downloads.stateOf(spec.id);
      if (st.status === 'finalizing') stage('verifying');
      else if (st.status === 'downloading' || st.status === 'resolving') stage('downloading');
    });
    const end = await waitForSettled(downloads, spec.id);
    off();

    if (end.status === 'error') {
      return { ok: false, stage: 'download', reason: 'error', message: end.error ?? 'The download failed.', retryable: end.retryable };
    }
    if (end.status === 'paused') return { ok: false, stage: 'download', reason: 'paused', message: 'The download is paused. Resume it to continue.', retryable: true };
    if (end.status === 'idle') return { ok: false, stage: 'download', reason: 'cancelled', message: 'The download was cancelled.' };
  }

  stage('loading');
  const mounted = await engine.mount(spec, { force: opts.force });
  if (!mounted.ok) {
    return { ok: false, stage: 'load', reason: 'engine', message: mounted.message, fix: mounted.fix };
  }
  stage('done');
  return { ok: true, alreadyInstalled, tokensPerSecond: mounted.tokensPerSecond };
}
