import test from 'node:test';
import assert from 'node:assert/strict';
import { DownloadManager, type DownloadManagerOptions, type DownloadPlatform, type DownloadState, type ModelFiles, type TransferTask } from '../src/core/downloadManager.ts';
import type { ModelSpec } from '../src/core/catalog.ts';
import { RemoteError, type RemoteFileInfo } from '../src/core/hf.ts';

const GGUF = new Uint8Array([0x47, 0x47, 0x55, 0x46]);
const HTML = new TextEncoder().encode('<!DO');

const specA: ModelSpec = {
  id: 'a', name: 'A', family: 'A', paramsB: 1, grade: 'C', role: 'Fast', priority: 1, kvBytesPerToken: 1000, repo: 'o/a', filename: 'a.gguf', sizeBytes: 1000,
  sha256: '', quantization: 'Q4_K_M', capabilities: ['Text'], thinking: 'none', contentPolicy: 'Standard', description: '',
  license: 'apache-2.0', contextLength: 4096, chatTemplate: 'chatml', draftKey: 'a', published: '2025-01-01',
};
const specB: ModelSpec = { ...specA, id: 'b', name: 'B', repo: 'o/b', filename: 'b.gguf' };
const HASH = 'ab'.repeat(32);
const HUB_HASH = 'cd'.repeat(32);

type Behavior =
  | { kind: 'complete'; header?: 'gguf' | 'html'; stopAt?: number }
  | { kind: 'fail'; at: number; message: string }
  | { kind: 'hang'; at: number }
  /** A broken native layer: after `at` bytes it never reports back, and ignores pause and cancel. */
  | { kind: 'deaf'; at: number };

interface Disk {
  dest: { size: number; head: Uint8Array } | null;
  part: { size: number; head: Uint8Array } | null;
}

interface VerifyOpts {
  ok?: boolean;
  steps?: number;
  /** Block the check at this step until `releaseVerify()`. */
  holdAt?: number;
}

function makeWorld(opts: { total?: number; free?: number | null; storageReady?: boolean; behaviors?: Behavior[]; fetchError?: Error; manager?: DownloadManagerOptions; verify?: VerifyOpts; noVerify?: boolean; intent?: string[]; pending?: string[] } = {}) {
  const total = opts.total ?? 1000;
  const disks = new Map<string, Disk>();
  const diskOf = (id: string): Disk => {
    if (!disks.has(id)) disks.set(id, { dest: null, part: null });
    return disks.get(id)!;
  };
  const behaviors = [...(opts.behaviors ?? [{ kind: 'complete' } as Behavior])];
  const log = { awake: [] as boolean[], sleeps: [] as number[], tasksCreated: 0, runs: 0, resumeOffsets: [] as number[], verifies: [] as string[], gated: 0, intents: [] as string[][] };
  let intent: string[] = [...(opts.intent ?? [])];
  let pending: string[] = [...(opts.pending ?? [])];
  let releaseVerify: () => void = () => undefined;
  const verifyGate = new Promise<void>((r) => { releaseVerify = r; });
  let clock = 1_000_000;
  let storageReady = opts.storageReady ?? true;
  let free = opts.free ?? null;
  let meta: RemoteFileInfo = { filename: 'x', size: total, sha256: null };

  const platform: DownloadPlatform = {
    isStorageReady: () => storageReady,
    freeSpaceBytes: () => free,
    files(spec): ModelFiles {
      const d = diskOf(spec.id);
      return {
        destExists: () => d.dest !== null,
        destSize: () => d.dest?.size ?? 0,
        partExists: () => d.part !== null,
        partSize: () => d.part?.size ?? 0,
        deletePart: () => { d.part = null; },
        deleteDest: () => { d.dest = null; },
        readHeader: (which) => (which === 'part' ? d.part?.head : d.dest?.head) ?? null,
        promotePart: () => { d.dest = d.part; d.part = null; },
      };
    },
    async fetchInfo() {
      if (opts.fetchError) throw opts.fetchError;
      return meta;
    },
    createTask({ spec, onProgress }): TransferTask {
      log.tasksCreated++;
      let paused = false;
      let cancelled = false;
      let wake: (() => void) | null = null;
      return {
        isPaused: () => paused,
        async pause() { paused = true; wake?.(); },
        cancel() { cancelled = true; wake?.(); },
        async run() {
          paused = false;
          log.runs++;
          const d = diskOf(spec.id);
          const beh = behaviors.shift() ?? ({ kind: 'complete' } as Behavior);
          const resumeFrom = d.part?.size ?? 0;
          log.resumeOffsets.push(resumeFrom);
          if (!d.part) d.part = { size: 0, head: beh.kind === 'complete' && beh.header === 'html' ? HTML : GGUF };
          const target = beh.kind === 'complete' ? (beh.stopAt ?? total) : beh.at;
          let pos = resumeFrom;
          while (pos < target) {
            if (beh.kind !== 'deaf') {
              if (cancelled) throw new Error('cancelled');
              if (paused) return 'paused';
            }
            pos = Math.min(target, pos + 100);
            d.part.size = pos;
            onProgress(pos);
            await Promise.resolve();
          }
          if (beh.kind === 'fail') throw new Error(beh.message);
          if (beh.kind === 'deaf') await new Promise<void>(() => undefined); // never settles
          if (beh.kind === 'hang') {
            // Stay "in flight" until the user pauses/cancels (pause may already have been requested).
            if (!paused && !cancelled) await new Promise<void>((r) => { wake = r; });
            if (cancelled) throw new Error('cancelled');
            return 'paused';
          }
          return 'completed';
        },
      };
    },
    verifySha256: opts.noVerify
      ? undefined
      : async (_spec, expected, onProgress, shouldStop, vo) => {
          log.verifies.push(`${vo?.which ?? 'part'}:${expected}`);
          const steps = opts.verify?.steps ?? 4;
          for (let i = 1; i <= steps; i++) {
            if (shouldStop()) return { ok: false, actual: '', stopped: true };
            const g = vo?.gate?.();
            if (g) { log.gated++; await g; }
            onProgress(i / steps);
            await new Promise<void>((r) => setTimeout(r, 0));
            if (opts.verify?.holdAt === i) await verifyGate;
          }
          return { ok: opts.verify?.ok ?? true, actual: 'computed', stopped: false };
        },
    savePendingVerify: (e) => { pending = [...e]; },
    loadPendingVerify: () => [...pending],
    saveIntent: (ids) => { log.intents.push([...ids]); intent = [...ids]; },
    loadIntent: () => [...intent],
    keepAwake: (on) => { log.awake.push(on); },
    now: () => (clock += 300),
    sleep: async (ms) => {
      // The stall watchdog polls with this; yield to the event loop so a hung fake transfer cannot starve the test.
      if (opts.manager?.stallCheckMs !== undefined && ms === opts.manager.stallCheckMs) await new Promise<void>((r) => setTimeout(r, 0));
      else log.sleeps.push(ms);
    },
  };

  const manager = new DownloadManager(platform, { maxRetries: 3, backoffMs: [10, 20, 30], spaceMarginBytes: 0, stallTimeoutMs: 0, stopGraceMs: 40, verifyMode: 'always', ...opts.manager });
  return {
    manager, log, diskOf, platform,
    setMeta: (m: Partial<RemoteFileInfo>) => { meta = { ...meta, ...m }; },
    setFree: (f: number | null) => { free = f; },
    setStorage: (r: boolean) => { storageReady = r; },
    pushBehaviors: (...b: Behavior[]) => behaviors.push(...b),
    releaseVerify: () => releaseVerify(),
    intentNow: () => [...intent],
    pendingNow: () => [...pending],
  };
}

function waitFor(manager: DownloadManager, id: string, pred: (s: DownloadState) => boolean, ms = 2000): Promise<DownloadState> {
  return new Promise((resolve, reject) => {
    const check = () => {
      const s = manager.stateOf(id);
      if (pred(s)) { off(); clearTimeout(t); resolve(s); }
    };
    const off = manager.store.subscribe(check);
    const t = setTimeout(() => { off(); reject(new Error(`timeout; state=${JSON.stringify(manager.stateOf(id))}`)); }, ms);
    check();
  });
}
const terminal = (s: DownloadState) => s.status === 'completed' || s.status === 'error' || s.status === 'paused';

// ----------------------------------------------------------------------------------------

test('happy path: resolving -> downloading -> finalizing -> completed, file promoted, awake toggled', async () => {
  const w = makeWorld();
  const seen: string[] = [];
  w.manager.store.subscribe(() => {
    const st = w.manager.stateOf('a').status;
    if (seen.at(-1) !== st) seen.push(st);
  });
  assert.deepEqual(await w.manager.start(specA), { ok: true });
  const done = await waitFor(w.manager, 'a', terminal);
  assert.equal(done.status, 'completed');
  assert.equal(done.bytesWritten, 1000);
  assert.deepEqual(seen, ['resolving', 'downloading', 'finalizing', 'completed']);
  assert.equal(w.diskOf('a').dest?.size, 1000);
  assert.equal(w.diskOf('a').part, null, 'partial removed after promote');
  await w.manager.settled();
  assert.deepEqual(w.log.awake, [true, false]);
});

test('refuses to start when the storage folder is not configured (ST-1)', async () => {
  const w = makeWorld({ storageReady: false });
  const r = await w.manager.start(specA);
  assert.equal(r.ok, false);
  assert.match((r as { message: string }).message, /storage/i);
  assert.equal(w.manager.stateOf('a').status, 'idle');
  assert.equal(w.log.tasksCreated, 0);
});

test('one download at a time by default: a second one is QUEUED (not refused) and starts when the first pauses', async () => {
  const w = makeWorld({ behaviors: [{ kind: 'hang', at: 300 }, { kind: 'complete' }] });
  await w.manager.start(specA);
  await waitFor(w.manager, 'a', (s) => s.status === 'downloading' && s.bytesWritten >= 300);
  assert.deepEqual(await w.manager.start(specB), { ok: true });
  const queued = w.manager.stateOf('b');
  assert.deepEqual([queued.status, queued.queuePosition], ['queued', 1]);
  assert.equal(w.log.tasksCreated, 1, 'b has not started yet');
  assert.deepEqual(w.manager.store.getState().queue, ['b']);
  await w.manager.pause('a');
  assert.equal((await waitFor(w.manager, 'b', terminal)).status, 'completed', 'b started by itself once a stopped');
  assert.equal(w.manager.stateOf('a').status, 'paused');
  assert.deepEqual(w.manager.store.getState().queue, []);
});

test('pause then resume continues from the partial file (MD-3: never restarts or corrupts)', async () => {
  const w = makeWorld({ behaviors: [{ kind: 'hang', at: 400 }, { kind: 'complete' }] });
  await w.manager.start(specA);
  await waitFor(w.manager, 'a', (s) => s.bytesWritten >= 400);
  await w.manager.pause('a');
  const paused = await waitFor(w.manager, 'a', (s) => s.status === 'paused');
  assert.equal(paused.bytesWritten, 400);
  assert.equal(w.diskOf('a').part?.size, 400, 'partial kept on disk');
  await w.manager.settled();
  assert.deepEqual(w.log.awake, [true, false], 'screen may sleep while paused');

  await w.manager.start(specA);
  const done = await waitFor(w.manager, 'a', (s) => s.status === 'completed');
  assert.equal(done.bytesWritten, 1000);
  assert.equal(w.log.tasksCreated, 1, 'the paused task object is reused, not recreated');
  assert.deepEqual(w.log.resumeOffsets, [0, 400], 'second run started at byte 400, not 0');
  assert.equal(w.diskOf('a').dest?.size, 1000);
});

test('resume tapped immediately after pause does not hang or double-run', async () => {
  const w = makeWorld({ behaviors: [{ kind: 'hang', at: 200 }, { kind: 'complete' }] });
  await w.manager.start(specA);
  await waitFor(w.manager, 'a', (s) => s.bytesWritten >= 200);
  const p = w.manager.pause('a');
  const r = w.manager.start(specA); // no await in between
  await p;
  assert.deepEqual(await r, { ok: true });
  assert.equal((await waitFor(w.manager, 'a', (s) => s.status === 'completed')).bytesWritten, 1000);
});

test('network drop is retried automatically from the partial file with backoff (MD-3)', async () => {
  const w = makeWorld({ behaviors: [{ kind: 'fail', at: 300, message: 'java.net.SocketTimeoutException' }, { kind: 'fail', at: 600, message: 'Unable to resolve host' }, { kind: 'complete' }] });
  const notes: string[] = [];
  w.manager.store.subscribe(() => { const n = w.manager.stateOf('a').note; if (n && notes.at(-1) !== n) notes.push(n); });
  await w.manager.start(specA);
  const done = await waitFor(w.manager, 'a', terminal);
  assert.equal(done.status, 'completed');
  assert.deepEqual(w.log.sleeps, [10, 20]);
  assert.deepEqual(w.log.resumeOffsets, [0, 300, 600]);
  assert.ok(notes.some((n) => /retrying \(1\/3\)/.test(n)) && notes.some((n) => /retrying \(2\/3\)/.test(n)));
  assert.equal(w.diskOf('a').dest?.size, 1000);
});

test('too many failures -> retryable error; partial survives; later Resume completes', async () => {
  const fails: Behavior[] = Array.from({ length: 4 }, (_, i) => ({ kind: 'fail', at: 100 * (i + 1), message: 'timeout' }));
  const w = makeWorld({ behaviors: fails });
  await w.manager.start(specA);
  const err = await waitFor(w.manager, 'a', terminal);
  assert.equal(err.status, 'error');
  assert.equal(err.retryable, true);
  assert.match(err.error!, /interrupted/i);
  assert.ok((w.diskOf('a').part?.size ?? 0) > 0, 'partial kept');
  w.manager.refresh([specA]); // a refresh must not erase the visible error
  assert.equal(w.manager.stateOf('a').status, 'error');

  w.pushBehaviors({ kind: 'complete' });
  await w.manager.start(specA);
  assert.equal((await waitFor(w.manager, 'a', (s) => s.status === 'completed')).bytesWritten, 1000);
  await w.manager.settled();
  assert.deepEqual(w.log.awake.filter(Boolean).length, w.log.awake.filter((x) => !x).length, 'keep-awake balanced');
});

test('permanent errors (HTTP 404/403) are not retried', async () => {
  const w = makeWorld({ behaviors: [{ kind: 'fail', at: 0, message: 'UnableToDownload: HTTP 404' }] });
  await w.manager.start(specA);
  const err = await waitFor(w.manager, 'a', terminal);
  assert.equal(err.status, 'error');
  assert.equal(err.retryable, false);
  assert.match(err.error!, /not found/i);
  assert.equal(w.log.sleeps.length, 0);
  assert.equal(w.log.runs, 1);
});

test('resolve failure (offline / gated) surfaces a clear message', async () => {
  const w = makeWorld({ fetchError: new RemoteError('No internet connection, or Hugging Face is unreachable.') });
  await w.manager.start(specA);
  const err = await waitFor(w.manager, 'a', terminal);
  assert.equal(err.status, 'error');
  assert.match(err.error!, /internet/i);
  assert.equal(w.log.tasksCreated, 0);
  const gated = makeWorld({ fetchError: new RemoteError('This model needs a Hugging Face login (gated) and cannot be downloaded in-app.', { status: 403, retryable: false }) });
  await gated.manager.start(specA);
  const g = await waitFor(gated.manager, 'a', terminal);
  assert.equal(g.retryable, false);
});

test('HTTP 416: partial already complete -> finishes; stale partial -> deleted and restarted', async () => {
  const w1 = makeWorld({ behaviors: [{ kind: 'fail', at: 1000, message: 'HTTP 416' }] });
  await w1.manager.start(specA);
  assert.equal((await waitFor(w1.manager, 'a', terminal)).status, 'completed');

  const w2 = makeWorld({ behaviors: [{ kind: 'fail', at: 300, message: 'HTTP 416' }, { kind: 'complete' }] });
  await w2.manager.start(specA);
  const done = await waitFor(w2.manager, 'a', terminal);
  assert.equal(done.status, 'completed');
  assert.deepEqual(w2.log.resumeOffsets, [0, 0], 'restarted from zero after discarding stale partial');
});

test('not enough free space is refused BEFORE downloading anything (MD-4)', async () => {
  const w = makeWorld({ free: 500 });
  await w.manager.start(specA);
  const err = await waitFor(w.manager, 'a', terminal);
  assert.equal(err.status, 'error');
  assert.match(err.error!, /not enough free space/i);
  assert.equal(w.log.tasksCreated, 0);
  assert.equal(w.diskOf('a').part, null);

  // Space is measured against what is still missing, so resuming a mostly-done file is allowed.
  const w2 = makeWorld({ free: 500, behaviors: [{ kind: 'complete' }] });
  w2.diskOf('a').part = { size: 700, head: GGUF };
  await w2.manager.start(specA);
  assert.equal((await waitFor(w2.manager, 'a', terminal)).status, 'completed');
});

test('truncated download is NOT installed; Resume finishes it (MD-5)', async () => {
  const w = makeWorld({ behaviors: [{ kind: 'complete', stopAt: 900 }, { kind: 'complete' }] });
  await w.manager.start(specA);
  const err = await waitFor(w.manager, 'a', terminal);
  assert.equal(err.status, 'error');
  assert.match(err.error!, /ended early/i);
  assert.equal(w.diskOf('a').dest, null, 'never promoted');
  assert.equal(w.diskOf('a').part?.size, 900);
  await w.manager.start(specA);
  assert.equal((await waitFor(w.manager, 'a', (s) => s.status === 'completed')).bytesWritten, 1000);
});

test('an HTML error page saved as a model is rejected and removed (MD-5)', async () => {
  const w = makeWorld({ behaviors: [{ kind: 'complete', header: 'html' }] });
  await w.manager.start(specA);
  const err = await waitFor(w.manager, 'a', terminal);
  assert.equal(err.status, 'error');
  assert.match(err.error!, /not a valid model/i);
  assert.equal(w.diskOf('a').dest, null);
  assert.equal(w.diskOf('a').part, null);
});

test('an oversized partial from a previous version is discarded instead of corrupting the install', async () => {
  const w = makeWorld({ behaviors: [{ kind: 'complete' }] });
  w.diskOf('a').part = { size: 5000, head: GGUF };
  await w.manager.start(specA);
  const done = await waitFor(w.manager, 'a', terminal);
  assert.equal(done.status, 'completed');
  assert.equal(w.diskOf('a').dest?.size, 1000);
  assert.deepEqual(w.log.resumeOffsets, [0]);
});

test('already-installed intact file completes instantly without downloading', async () => {
  const w = makeWorld();
  w.diskOf('a').dest = { size: 1000, head: GGUF };
  await w.manager.start(specA);
  assert.equal((await waitFor(w.manager, 'a', terminal)).status, 'completed');
  assert.equal(w.log.tasksCreated, 0);
  // A same-named file with the WRONG size is replaced, not trusted.
  const w2 = makeWorld();
  w2.diskOf('a').dest = { size: 640, head: GGUF };
  await w2.manager.start(specA);
  assert.equal((await waitFor(w2.manager, 'a', terminal)).status, 'completed');
  assert.equal(w2.diskOf('a').dest?.size, 1000);
});

test('cancel deletes the partial and returns to idle; keepPartial leaves a resumable file', async () => {
  const w = makeWorld({ behaviors: [{ kind: 'hang', at: 300 }] });
  await w.manager.start(specA);
  await waitFor(w.manager, 'a', (s) => s.bytesWritten >= 300);
  await w.manager.cancel(specA, true);
  assert.equal(w.manager.stateOf('a').status, 'idle');
  assert.equal(w.diskOf('a').part, null);
  assert.deepEqual(w.log.awake, [true, false]);

  const w2 = makeWorld({ behaviors: [{ kind: 'hang', at: 300 }] });
  await w2.manager.start(specA);
  await waitFor(w2.manager, 'a', (s) => s.bytesWritten >= 300);
  await w2.manager.cancel(specA, false);
  const s = w2.manager.stateOf('a');
  assert.equal(s.status, 'paused');
  assert.equal(s.bytesWritten, 300);
});

test('refresh() reports installed models and resumable partials after an app restart', () => {
  const w = makeWorld();
  w.diskOf('a').dest = { size: 1000, head: GGUF };
  w.diskOf('b').part = { size: 250, head: GGUF };
  w.manager.refresh([specA, specB, { ...specA, id: 'c', filename: 'c.gguf' }]);
  assert.equal(w.manager.stateOf('a').status, 'completed');
  const b = w.manager.stateOf('b');
  assert.equal(b.status, 'paused');
  assert.equal(b.bytesWritten, 250);
  assert.equal(w.manager.stateOf('c').status, 'idle');
  w.setStorage(false);
  w.manager.refresh([specA]); // no-op when storage is gated
});

test('remove() deletes the installed model and its partial', async () => {
  const w = makeWorld();
  w.diskOf('a').dest = { size: 1000, head: GGUF };
  w.diskOf('a').part = { size: 10, head: GGUF };
  await w.manager.remove(specA);
  assert.equal(w.diskOf('a').dest, null);
  assert.equal(w.diskOf('a').part, null);
  assert.equal(w.manager.stateOf('a').status, 'idle');
});

test('progress updates are throttled but the final value always lands', async () => {
  const w = makeWorld({ total: 100_000 });
  let emits = 0;
  w.manager.store.subscribe(() => emits++);
  await w.manager.start(specA);
  const done = await waitFor(w.manager, 'a', terminal, 5000);
  assert.equal(done.status, 'completed');
  // 1000 progress callbacks of 100 B; the fake clock advances 300 ms per read, so about 1 in 1 passes.
  assert.ok(done.bytesWritten === 100_000);
  assert.ok(emits < 3000);
});

// ---------------------------------------------------------------- stall watchdog

test('a silent stall (no error, no bytes) is cancelled and resumed from the partial file', async () => {
  const w = makeWorld({
    manager: { stallTimeoutMs: 3000, stallCheckMs: 777 },
    behaviors: [{ kind: 'hang', at: 300 }, { kind: 'complete' }],
  });
  const notes: string[] = [];
  w.manager.store.subscribe(() => { const n = w.manager.stateOf('a').note; if (n && notes.at(-1) !== n) notes.push(n); });
  await w.manager.start(specA);
  const done = await waitFor(w.manager, 'a', terminal, 5000);
  assert.equal(done.status, 'completed');
  assert.equal(w.log.tasksCreated, 2, 'a fresh task replaced the stuck one');
  assert.deepEqual(w.log.resumeOffsets, [0, 300], 'second attempt continued from the bytes already on disk');
  assert.ok(notes.some((n) => /retrying/.test(n)));
  assert.equal(w.diskOf('a').dest?.size, 1000);
  await w.manager.settled();
});

test('the watchdog does not fire while bytes keep arriving, nor while the user has paused', async () => {
  const ok = makeWorld({ manager: { stallTimeoutMs: 3000, stallCheckMs: 777 } });
  await ok.manager.start(specA);
  assert.equal((await waitFor(ok.manager, 'a', terminal, 5000)).status, 'completed');
  assert.equal(ok.log.tasksCreated, 1);
  await ok.manager.settled();

  const w = makeWorld({ manager: { stallTimeoutMs: 3000, stallCheckMs: 777 }, behaviors: [{ kind: 'hang', at: 300 }] });
  await w.manager.start(specA);
  await waitFor(w.manager, 'a', (s) => s.bytesWritten >= 300);
  await w.manager.pause('a');
  const paused = await waitFor(w.manager, 'a', terminal, 5000);
  assert.equal(paused.status, 'paused');
  assert.equal(paused.error, undefined, 'a user pause is not reported as a stall');
  assert.equal(w.log.tasksCreated, 1);
  await w.manager.settled();
});

test('a stall that never recovers ends in a retryable error, not an endless spinner', async () => {
  const w = makeWorld({
    manager: { stallTimeoutMs: 3000, stallCheckMs: 777 },
    behaviors: Array.from({ length: 4 }, () => ({ kind: 'hang', at: 0 } as Behavior)),
  });
  await w.manager.start(specA);
  const err = await waitFor(w.manager, 'a', terminal, 8000);
  assert.equal(err.status, 'error');
  assert.equal(err.retryable, true);
  assert.match(err.error!, /stopped receiving data/i);
  await w.manager.settled();
});

test('retry budget refills when a retry made real progress (long download, flaky network)', async () => {
  const fails: Behavior[] = Array.from({ length: 4 }, (_, i) => ({ kind: 'fail', at: 100 * (i + 1), message: 'timeout' }));
  // maxRetries is 3, so four failures would normally be fatal (see the test above) - unless each retry moved the file on.
  const w = makeWorld({ manager: { retryResetBytes: 50 }, behaviors: [...fails, { kind: 'complete' }] });
  await w.manager.start(specA);
  const done = await waitFor(w.manager, 'a', terminal);
  assert.equal(done.status, 'completed');
  assert.equal(w.diskOf('a').dest?.size, 1000);
  await w.manager.settled();
});

// ---------------------------------------------------------------- SHA-256 is mandatory when a hash is known

test('a hash that matches is required BEFORE the file is installed; progress and ETA are published while it runs', async () => {
  const w = makeWorld({ verify: { steps: 4 } });
  w.setMeta({ sha256: HUB_HASH });
  const seen: DownloadState[] = [];
  w.manager.store.subscribe(() => { const s = w.manager.stateOf('a'); if (s.status === 'finalizing') seen.push(s); });
  await w.manager.start(specA);
  const done = await waitFor(w.manager, 'a', terminal);
  assert.equal(done.status, 'completed');
  assert.equal(done.verified, true, 'the finished state says the checksum was verified');
  assert.deepEqual(w.log.verifies, [`part:${HUB_HASH}`]);
  assert.ok(seen.some((s) => s.verifyFraction !== undefined && s.verifyFraction > 0 && s.verifyFraction < 1), 'fractions published');
  assert.ok(seen.some((s) => /Verifying the download/.test(s.note ?? '')), 'note says what is happening');
  assert.ok(seen.some((s) => s.etaSec > 0), 'an ETA is shown for the check');
  assert.equal(w.diskOf('a').dest?.size, 1000);
  assert.equal(w.diskOf('a').part, null);
});

test('the Hub hash wins over the catalog hash; the catalog hash is used when the Hub gives none', async () => {
  const w = makeWorld();
  w.setMeta({ sha256: HUB_HASH });
  await w.manager.start({ ...specA, sha256: HASH });
  await waitFor(w.manager, 'a', terminal);
  assert.deepEqual(w.log.verifies, [`part:${HUB_HASH}`]);

  const w2 = makeWorld();
  await w2.manager.start({ ...specA, sha256: HASH });
  await waitFor(w2.manager, 'a', terminal);
  assert.deepEqual(w2.log.verifies, [`part:${HASH}`]);
});

test('a checksum MISMATCH is never installed: partial deleted, retryable error, a fresh Try again redownloads from zero', async () => {
  const w = makeWorld({ verify: { ok: false }, behaviors: [{ kind: 'complete' }, { kind: 'complete' }] });
  w.setMeta({ sha256: HUB_HASH });
  await w.manager.start(specA);
  const err = await waitFor(w.manager, 'a', terminal);
  assert.equal(err.status, 'error');
  assert.equal(err.retryable, true);
  assert.match(err.error!, /does not match the official checksum/i);
  assert.equal(w.diskOf('a').dest, null, 'corrupt model never promoted');
  assert.equal(w.diskOf('a').part, null, 'corrupt partial removed so the next try cannot reuse it');
  await w.manager.settled();
  await w.manager.start(specA);
  await waitFor(w.manager, 'a', (s) => s.status === 'error' || s.status === 'completed');
  assert.deepEqual(w.log.resumeOffsets, [0, 0], 'second attempt started from byte 0');
});

test('no hash anywhere, verifyMode "off", or a platform without hashing -> installed on size + GGUF header, not flagged verified', async () => {
  const none = makeWorld();
  await none.manager.start(specA);
  const a = await waitFor(none.manager, 'a', terminal);
  assert.deepEqual([a.status, a.verified, none.log.verifies.length], ['completed', undefined, 0]);

  const off = makeWorld({ manager: { verifyMode: 'off' } });
  off.setMeta({ sha256: HUB_HASH });
  await off.manager.start(specA);
  assert.deepEqual([(await waitFor(off.manager, 'a', terminal)).verified, off.log.verifies.length], [undefined, 0]);

  const bare = makeWorld({ noVerify: true });
  bare.setMeta({ sha256: HUB_HASH });
  await bare.manager.start(specA);
  assert.equal((await waitFor(bare.manager, 'a', terminal)).status, 'completed');
});

test('pausing DURING the checksum pauses (never completes); Resume re-checks and then installs', async () => {
  const w = makeWorld({ verify: { steps: 4, holdAt: 2 } });
  w.setMeta({ sha256: HUB_HASH });
  await w.manager.start(specA);
  await waitFor(w.manager, 'a', (s) => s.status === 'finalizing' && (s.verifyFraction ?? 0) >= 0.5);
  await w.manager.pause('a');
  w.releaseVerify();
  const paused = await waitFor(w.manager, 'a', (s) => s.status === 'paused');
  assert.equal(paused.verified, undefined);
  await w.manager.settled();
  assert.equal(w.manager.stateOf('a').status, 'paused', 'a pause never ends up as "completed"');
  assert.equal(w.diskOf('a').dest, null, 'not installed while unverified');
  assert.equal(w.diskOf('a').part?.size, 1000, 'the full partial is kept');

  await w.manager.start(specA);
  const done = await waitFor(w.manager, 'a', (s) => s.status === 'completed');
  assert.equal(done.verified, true);
  assert.equal(w.log.verifies.length, 2, 'verified again from scratch');
  assert.equal(w.log.runs, 1, 'no second download: the partial was already complete');
});

test('cancelling DURING the checksum stops it and deletes the partial', async () => {
  const w = makeWorld({ verify: { steps: 4, holdAt: 1 } });
  w.setMeta({ sha256: HUB_HASH });
  await w.manager.start(specA);
  await waitFor(w.manager, 'a', (s) => s.status === 'finalizing' && s.verifyFraction !== undefined);
  const cancelled = w.manager.cancel(specA, true);
  w.releaseVerify();
  await cancelled;
  assert.equal(w.manager.stateOf('a').status, 'idle');
  assert.equal(w.diskOf('a').part, null);
  assert.equal(w.diskOf('a').dest, null);
});

// ---------------------------------------------------------------- native layer misbehaves

test('Cancel never waits forever on a native task that does not report back (expo-file-system Android cancel race)', async () => {
  const w = makeWorld({ behaviors: [{ kind: 'deaf', at: 300 }] });
  await w.manager.start(specA);
  await waitFor(w.manager, 'a', (s) => s.bytesWritten >= 300);
  const t0 = Date.now();
  await w.manager.cancel(specA, true);
  assert.ok(Date.now() - t0 < 1500, 'cancel returned within the grace period');
  assert.equal(w.manager.stateOf('a').status, 'idle');
  assert.equal(w.diskOf('a').part, null);
  await w.manager.settled();
  assert.deepEqual(w.log.awake, [true, false], 'screen is allowed to sleep again');
});

test('Pause on a native task that never reports back still lets Resume start a fresh transfer', async () => {
  const w = makeWorld({ behaviors: [{ kind: 'deaf', at: 300 }, { kind: 'complete' }] });
  await w.manager.start(specA);
  await waitFor(w.manager, 'a', (s) => s.bytesWritten >= 300);
  await w.manager.pause('a');
  assert.equal(w.manager.stateOf('a').status, 'paused');
  assert.deepEqual(await w.manager.start(specA), { ok: true });
  const done = await waitFor(w.manager, 'a', (s) => s.status === 'completed', 3000);
  assert.equal(done.bytesWritten, 1000);
  assert.equal(w.diskOf('a').dest?.size, 1000);
});

// ---------------------------------------------------------------- survive background / process kill

test('process kill mid-download: relaunch finds the partial, shows Paused at N%, and Resume continues from that byte', async () => {
  const first = makeWorld({ behaviors: [{ kind: 'hang', at: 400 }] });
  await first.manager.start(specA);
  await waitFor(first.manager, 'a', (s) => s.bytesWritten >= 400);
  // The process dies here: the manager object is gone, only the disk (and the intent note) survive.
  const disk = first.diskOf('a');
  assert.deepEqual(first.intentNow(), ['a'], 'the in-flight download was recorded');

  const second = makeWorld({ behaviors: [{ kind: 'complete' }], intent: first.intentNow() });
  second.diskOf('a').part = { ...disk.part! };
  second.manager.refresh([specA]);
  const shown = second.manager.stateOf('a');
  assert.deepEqual([shown.status, shown.bytesWritten, shown.totalBytes], ['paused', 400, 1000]);
  second.manager.resumeInterrupted([specA]); // what the app does at launch
  const done = await waitFor(second.manager, 'a', (s) => s.status === 'completed');
  assert.equal(done.bytesWritten, 1000);
  assert.deepEqual(second.log.resumeOffsets, [400], 'continued at byte 400, not 0');
  assert.equal(second.diskOf('a').dest?.size, 1000);
});

test('a download the user paused or cancelled is NOT silently restarted at the next launch', async () => {
  const w = makeWorld({ behaviors: [{ kind: 'hang', at: 300 }] });
  await w.manager.start(specA);
  await waitFor(w.manager, 'a', (s) => s.bytesWritten >= 300);
  await w.manager.pause('a');
  await w.manager.settled();
  assert.deepEqual(w.intentNow(), [], 'pause clears the intent');

  const relaunch = makeWorld({ intent: w.intentNow() });
  relaunch.diskOf('a').part = { size: 300, head: GGUF };
  relaunch.manager.refresh([specA]);
  relaunch.manager.resumeInterrupted([specA]);
  assert.equal(relaunch.manager.stateOf('a').status, 'paused');
  assert.equal(relaunch.log.tasksCreated, 0, 'nothing started by itself');
});

test('the intent note is cleared when a download finishes or fails (no phantom resume later)', async () => {
  const w = makeWorld();
  await w.manager.start(specA);
  await waitFor(w.manager, 'a', terminal);
  await w.manager.settled();
  assert.deepEqual(w.intentNow(), []);
  assert.ok(w.log.intents.some((i) => i.includes('a')), 'it was recorded while running');

  const bad = makeWorld({ behaviors: [{ kind: 'fail', at: 0, message: 'HTTP 404' }] });
  await bad.manager.start(specA);
  await waitFor(bad.manager, 'a', terminal);
  await bad.manager.settled();
  assert.deepEqual(bad.intentNow(), []);
});

test('pause mid-download is "paused", never "completed 100%" (the old app marked it complete)', async () => {
  const w = makeWorld({ behaviors: [{ kind: 'hang', at: 500 }] });
  await w.manager.start(specA);
  await waitFor(w.manager, 'a', (s) => s.bytesWritten >= 500);
  await w.manager.pause('a');
  await w.manager.settled();
  const s = w.manager.stateOf('a');
  assert.equal(s.status, 'paused');
  assert.equal(s.bytesWritten, 500);
  assert.equal(w.diskOf('a').dest, null);
});

// ---------------------------------------------------------------- background verification

const bgOpts = (verify: VerifyOpts = {}) => ({ manager: { verifyMode: 'background' as const }, verify });

test('background: installed + usable at once, queue slot freed, check runs on the installed file and then flags verified', async () => {
  const w = makeWorld({ ...bgOpts({ steps: 3, holdAt: 2 }) });
  w.setMeta({ sha256: HUB_HASH });
  await w.manager.start(specA);
  await w.manager.start(specB);
  const a = await waitFor(w.manager, 'a', (s) => s.status === 'completed');
  assert.equal(a.verifyPending, true);
  assert.ok(w.diskOf('a').dest, 'promoted before the check finished');
  // b is not stuck behind a's check
  await waitFor(w.manager, 'b', (s) => s.status === 'completed');
  await w.manager.settled();
  assert.equal(w.manager.stateOf('a').verifyPending, true, 'still checking while b finished');
  assert.deepEqual(w.manager.verifyingIds().sort(), ['a', 'b']);
  assert.ok(w.pendingNow().length > 0, 'pending record persisted');
  w.releaseVerify();
  await w.manager.verifySettled();
  const done = w.manager.stateOf('a');
  assert.equal(done.verifyPending, false);
  assert.equal(done.verified, true);
  assert.ok(w.log.verifies.every((v) => v.startsWith('dest:')));
  assert.deepEqual(w.pendingNow(), []);
});

test('background: a mismatch unloads (callback), deletes the file and reports the checksum error', async () => {
  const failed: string[] = [];
  const w = makeWorld({ manager: { verifyMode: 'background', onVerifyFailed: (id, _k, m) => failed.push(`${id}:${m}`) }, verify: { ok: false } });
  w.setMeta({ sha256: HUB_HASH });
  await w.manager.start(specA);
  await w.manager.settled();
  await w.manager.verifySettled();
  const s = w.manager.stateOf('a');
  assert.equal(s.status, 'error');
  assert.match(s.error ?? '', /does not match the official checksum/);
  assert.equal(w.diskOf('a').dest, null, 'file deleted, so it can never be loaded');
  assert.equal(failed.length, 1);
  assert.deepEqual(w.pendingNow(), []);
});

test('background: a pending check survives an app kill and is resumed after refresh()', async () => {
  const w1 = makeWorld({ ...bgOpts({ steps: 4, holdAt: 1 }) });
  w1.setMeta({ sha256: HUB_HASH });
  await w1.manager.start(specA);
  await waitFor(w1.manager, 'a', (s) => s.status === 'completed');
  await w1.manager.settled();
  const record = w1.pendingNow();
  assert.equal(record.length, 1);
  const w2 = makeWorld({ ...bgOpts({ steps: 2 }), pending: record });
  w2.diskOf('a').dest = { size: 1000, head: GGUF };
  w2.manager.refresh([specA]);
  assert.equal(w2.manager.stateOf('a').status, 'completed', 'loadable while the check is pending');
  w2.manager.resumeInterrupted([specA]);
  assert.equal(w2.manager.stateOf('a').verifyPending, true);
  await w2.manager.verifySettled();
  assert.equal(w2.manager.stateOf('a').verified, true);
  assert.deepEqual(w2.pendingNow(), []);
});

test('background: hashing waits while the app is in the background and continues (never fails) on return', async () => {
  const w = makeWorld({ ...bgOpts({ steps: 3 }) });
  w.setMeta({ sha256: HUB_HASH });
  w.manager.setAppActive(false);
  await w.manager.start(specA);
  await waitFor(w.manager, 'a', (s) => s.status === 'completed');
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(w.manager.stateOf('a').verifyPending, true, 'parked, not failed');
  assert.ok(w.log.gated > 0);
  w.manager.setAppActive(true);
  await w.manager.verifySettled();
  assert.equal(w.manager.stateOf('a').verified, true);
});

test('background: cancel/remove stops the check', async () => {
  const w = makeWorld({ ...bgOpts({ steps: 50, holdAt: 1 }) });
  w.setMeta({ sha256: HUB_HASH });
  await w.manager.start(specA);
  await waitFor(w.manager, 'a', (s) => s.status === 'completed');
  w.releaseVerify();
  await w.manager.remove(specA);
  assert.equal(w.manager.verifyingIds().length, 0);
});
