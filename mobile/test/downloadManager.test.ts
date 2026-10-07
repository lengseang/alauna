import test from 'node:test';
import assert from 'node:assert/strict';
import { DownloadManager, type DownloadManagerOptions, type DownloadPlatform, type DownloadState, type ModelFiles, type TransferTask } from '../src/core/downloadManager.ts';
import type { ModelSpec } from '../src/core/catalog.ts';
import { RemoteError, type RemoteFileInfo } from '../src/core/hf.ts';

const GGUF = new Uint8Array([0x47, 0x47, 0x55, 0x46]);
const HTML = new TextEncoder().encode('<!DO');

const specA: ModelSpec = {
  id: 'a', name: 'A', family: 'A', paramsB: 1, grade: 'C', repo: 'o/a', filename: 'a.gguf', sizeBytes: 1000,
  sha256: '', quantization: 'Q4_K_M', capabilities: ['Text'], thinking: 'none', contentPolicy: 'Standard', description: '',
};
const specB: ModelSpec = { ...specA, id: 'b', name: 'B', repo: 'o/b', filename: 'b.gguf' };

type Behavior =
  | { kind: 'complete'; header?: 'gguf' | 'html'; stopAt?: number }
  | { kind: 'fail'; at: number; message: string }
  | { kind: 'hang'; at: number };

interface Disk {
  dest: { size: number; head: Uint8Array } | null;
  part: { size: number; head: Uint8Array } | null;
}

function makeWorld(opts: { total?: number; free?: number | null; storageReady?: boolean; behaviors?: Behavior[]; fetchError?: Error; manager?: DownloadManagerOptions } = {}) {
  const total = opts.total ?? 1000;
  const disks = new Map<string, Disk>();
  const diskOf = (id: string): Disk => {
    if (!disks.has(id)) disks.set(id, { dest: null, part: null });
    return disks.get(id)!;
  };
  const behaviors = [...(opts.behaviors ?? [{ kind: 'complete' } as Behavior])];
  const log = { awake: [] as boolean[], sleeps: [] as number[], tasksCreated: 0, runs: 0, resumeOffsets: [] as number[] };
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
            if (cancelled) throw new Error('cancelled');
            if (paused) return 'paused';
            pos = Math.min(target, pos + 100);
            d.part.size = pos;
            onProgress(pos);
            await Promise.resolve();
          }
          if (beh.kind === 'fail') throw new Error(beh.message);
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
    keepAwake: (on) => { log.awake.push(on); },
    now: () => (clock += 300),
    sleep: async (ms) => {
      // The stall watchdog polls with this; yield to the event loop so a hung fake transfer cannot starve the test.
      if (opts.manager?.stallCheckMs !== undefined && ms === opts.manager.stallCheckMs) await new Promise<void>((r) => setTimeout(r, 0));
      else log.sleeps.push(ms);
    },
  };

  const manager = new DownloadManager(platform, { maxRetries: 3, backoffMs: [10, 20, 30], spaceMarginBytes: 0, stallTimeoutMs: 0, ...opts.manager });
  return {
    manager, log, diskOf, platform,
    setMeta: (m: Partial<RemoteFileInfo>) => { meta = { ...meta, ...m }; },
    setFree: (f: number | null) => { free = f; },
    setStorage: (r: boolean) => { storageReady = r; },
    pushBehaviors: (...b: Behavior[]) => behaviors.push(...b),
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

test('only one download at a time; second is allowed after the first finishes', async () => {
  const w = makeWorld({ behaviors: [{ kind: 'hang', at: 300 }, { kind: 'complete' }] });
  await w.manager.start(specA);
  await waitFor(w.manager, 'a', (s) => s.status === 'downloading' && s.bytesWritten >= 300);
  const second = await w.manager.start(specB);
  assert.equal(second.ok, false);
  assert.match((second as { message: string }).message, /another model/i);
  await w.manager.pause('a');
  await waitFor(w.manager, 'a', (s) => s.status === 'paused');
  assert.deepEqual(await w.manager.start(specB), { ok: true });
  assert.equal((await waitFor(w.manager, 'b', terminal)).status, 'completed');
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
