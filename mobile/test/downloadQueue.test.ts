import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DownloadManager,
  decodeIntent,
  encodeIntent,
  installFiles,
  summarizeDownloads,
  type DownloadFile,
  type DownloadPlatform,
  type DownloadState,
  type ModelFiles,
} from '../src/core/downloadManager.ts';
import type { ModelSpec } from '../src/core/catalog.ts';

const GGUF = new Uint8Array([0x47, 0x47, 0x55, 0x46]);

function spec(id: string, size: number, extra: Partial<ModelSpec> = {}): ModelSpec {
  return {
    id, name: id, family: id, paramsB: 1, grade: 'C', role: 'Fast', priority: 1, kvBytesPerToken: 1000, repo: `o/${id}`, filename: `${id}.gguf`,
    sizeBytes: size, sha256: 'ab'.repeat(32), quantization: 'Q4_K_M', capabilities: ['Text'], thinking: 'none', contentPolicy: 'Standard',
    description: '', license: 'apache-2.0', contextLength: 4096, chatTemplate: 'chatml', draftKey: id, published: '2025-01-01', ...extra,
  };
}
const MM = { repo: 'o/shared', filename: 'mmproj-F16.gguf', sizeBytes: 400, sha256: 'cd'.repeat(32) };
const vis = spec('vis', 1000, { capabilities: ['Text', 'Image'], mmproj: MM, draft: { repo: 'o/vis', filename: 'MTP/mtp-vis.gguf', sizeBytes: 200, sha256: 'ef'.repeat(32) } });
const vis2 = spec('vis2', 800, { capabilities: ['Text', 'Image'], mmproj: MM });
const a = spec('a', 1000);
const b = spec('b', 1000);
const c = spec('c', 1000);

/** Fake phone: disk keyed by file id, transfers advance 100 B per tick; `hold` keeps a file's transfer open until released. */
function world(opts: { free?: number | null; badSha?: string[]; intent?: string[]; concurrency?: number } = {}) {
  const disk = new Map<string, { dest: number | null; part: number | null }>();
  const d = (id: string) => (disk.get(id) ?? disk.set(id, { dest: null, part: null }).get(id))!;
  const log = { transfers: [] as string[], verified: [] as string[], intents: [] as string[][], dirs: [] as (string | undefined)[] };
  const gates = new Map<string, () => void>();
  const holds = new Set<string>();
  let intent = [...(opts.intent ?? [])];
  const platform: DownloadPlatform = {
    isStorageReady: () => true,
    freeSpaceBytes: () => opts.free ?? null,
    files(f: DownloadFile): ModelFiles {
      const x = d(f.id);
      return {
        destExists: () => x.dest !== null,
        destSize: () => x.dest ?? 0,
        partExists: () => x.part !== null,
        partSize: () => x.part ?? 0,
        deletePart: () => { x.part = null; },
        deleteDest: () => { x.dest = null; },
        readHeader: () => GGUF,
        promotePart: () => { x.dest = x.part; x.part = null; },
      };
    },
    fetchInfo: async (f) => ({ filename: f.filename, size: f.sizeBytes, sha256: f.sha256 }),
    createTask({ spec: f, onProgress }) {
      let paused = false;
      let cancelled = false;
      return {
        isPaused: () => paused,
        async pause() { paused = true; gates.get(f.id)?.(); },
        cancel() { cancelled = true; gates.get(f.id)?.(); },
        async run() {
          paused = false;
          log.transfers.push(f.id);
          log.dirs.push(f.dir);
          const x = d(f.id);
          x.part ??= 0;
          if (holds.has(f.id)) await new Promise<void>((r) => gates.set(f.id, r));
          while ((x.part ?? 0) < f.sizeBytes) {
            if (cancelled) throw new Error('cancelled');
            if (paused) return 'paused';
            x.part = Math.min(f.sizeBytes, (x.part ?? 0) + 100);
            onProgress(x.part);
            await Promise.resolve();
          }
          return 'completed';
        },
      };
    },
    async verifySha256(f) {
      log.verified.push(f.id);
      return { ok: !(opts.badSha ?? []).includes(f.id), actual: 'x', stopped: false };
    },
    saveIntent: (e) => { log.intents.push([...e]); intent = [...e]; },
    loadIntent: () => [...intent],
    keepAwake: () => undefined,
    now: (() => { let t = 1e6; return () => (t += 300); })(),
    sleep: async () => undefined,
  };
  const manager = new DownloadManager(platform, { stallTimeoutMs: 0, stopGraceMs: 40, spaceMarginBytes: 0, maxConcurrent: opts.concurrency });
  return { manager, d, log, holds, release: (id: string) => gates.get(id)?.(), intent: () => [...intent] };
}

function until(m: DownloadManager, id: string, pred: (s: DownloadState) => boolean, ms = 2000): Promise<DownloadState> {
  return new Promise((resolve, reject) => {
    const check = () => {
      const s = m.stateOf(id);
      if (pred(s)) { off(); clearTimeout(t); resolve(s); }
    };
    const off = m.store.subscribe(check);
    const t = setTimeout(() => { off(); reject(new Error(`timeout ${id}: ${JSON.stringify(m.stateOf(id))}`)); }, ms);
    check();
  });
}
const done = (s: DownloadState) => s.status === 'completed' || s.status === 'error' || s.status === 'paused';

// ----------------------------------------------------------------------- companions = one logical install

test('a vision model installs WITH its projector as one download: one progress bar, both SHA-verified, companion local name', async () => {
  const w = world();
  const totals = new Set<number>();
  w.manager.store.subscribe(() => totals.add(w.manager.stateOf('vis').totalBytes));
  await w.manager.start(vis);
  const s = await until(w.manager, 'vis', done);
  assert.equal(s.status, 'completed');
  assert.deepEqual([s.bytesWritten, s.totalBytes, s.verified], [1400, 1400, true]);
  assert.deepEqual(s.missing, ['draft'], 'the optional MTP draft is offered, not forced');
  assert.deepEqual(s.parts?.map((p) => p.kind), ['model', 'mmproj']);
  assert.deepEqual(w.log.transfers, ['vis', 'o_shared.mmproj-F16.gguf']);
  assert.deepEqual(w.log.verified, ['vis', 'o_shared.mmproj-F16.gguf']);
  assert.ok(!totals.has(1000) || totals.has(1400), 'the bar is sized for the whole install');
});

test('text-only install (vision: false) leaves the projector "missing"; adding it later downloads only the projector', async () => {
  const w = world();
  await w.manager.start(vis, { vision: false });
  const s = await until(w.manager, 'vis', done);
  assert.deepEqual([s.status, s.totalBytes, s.missing], ['completed', 1000, ['mmproj', 'draft']]);
  await w.manager.start(vis, { vision: true, draft: true });
  const s2 = await until(w.manager, 'vis', (x) => x.status === 'completed' && x.totalBytes === 1600);
  assert.deepEqual(w.log.transfers, ['vis', 'o_shared.mmproj-F16.gguf', 'o_vis.mtp-vis.gguf']);
  assert.equal(s2.verified, undefined, 'the model file was found on disk, not re-verified in this download');
  assert.deepEqual(s2.missing, []);
});

test('a projector shared by two models is downloaded once and kept while the other model uses it', async () => {
  const w = world();
  w.manager.refresh([vis, vis2]);
  await w.manager.start(vis);
  await until(w.manager, 'vis', done);
  await w.manager.start(vis2);
  assert.equal((await until(w.manager, 'vis2', done)).status, 'completed');
  assert.equal(w.log.transfers.filter((t) => t.includes('mmproj')).length, 1);
  await w.manager.remove(vis);
  assert.equal(w.d('vis').dest, null);
  assert.equal(w.d('o_shared.mmproj-F16.gguf').dest, 400, 'vis2 still needs it');
  await w.manager.remove(vis2);
  assert.equal(w.d('o_shared.mmproj-F16.gguf').dest, null, 'last user gone: deleted');
});

test('a damaged projector is never installed; the model stays, Try again fetches only the projector', async () => {
  const w = world({ badSha: ['o_shared.mmproj-F16.gguf'] });
  await w.manager.start(vis);
  const s = await until(w.manager, 'vis', done);
  assert.equal(s.status, 'error');
  assert.match(s.error!, /image add-on/);
  assert.equal(w.d('vis').dest, 1000, 'the verified model is kept');
  assert.equal(w.d('o_shared.mmproj-F16.gguf').part, null, 'damaged projector deleted');
});

test('disk-space precheck counts the companions and other running downloads, before anything is written', async () => {
  const w = world({ free: 1200 });
  await w.manager.start(vis);
  const s = await until(w.manager, 'vis', done);
  assert.equal(s.status, 'error');
  assert.match(s.error!, /not enough free space/i);
  assert.equal(w.log.transfers.length, 0);
  const ok = world({ free: 1400 });
  await ok.manager.start(vis);
  assert.equal((await until(ok.manager, 'vis', done)).status, 'completed');
});

test('storage slot: a destination folder applies to the model and its companions', async () => {
  const w = world();
  await w.manager.start(vis, { dir: '/storage/emulated/0/Slot2/CHIWIWI/models' });
  await until(w.manager, 'vis', done);
  assert.deepEqual(w.log.dirs, ['/storage/emulated/0/Slot2/CHIWIWI/models', '/storage/emulated/0/Slot2/CHIWIWI/models']);
  assert.deepEqual(installFiles(vis, { dir: '/x' }).map((f) => f.dir), ['/x', '/x']);
});

test('pause during the projector keeps the model; resume continues the projector, progress counts both', async () => {
  const w = world();
  w.holds.add('o_shared.mmproj-F16.gguf');
  await w.manager.start(vis);
  await until(w.manager, 'vis', (s) => s.part === 'mmproj');
  await w.manager.pause('vis');
  const p = await until(w.manager, 'vis', (s) => s.status === 'paused');
  assert.equal(p.bytesWritten, 1000, 'model done, projector partial 0');
  w.holds.clear();
  await w.manager.start(vis);
  assert.equal((await until(w.manager, 'vis', (s) => s.status === 'completed')).bytesWritten, 1400);
  assert.equal(w.log.transfers.filter((t) => t === 'vis').length, 1, 'the model was not downloaded twice');
});

// ----------------------------------------------------------------------- queue

test('queue: N=1 runs in order, reorder moves a waiting install, a queued one can be paused or cancelled', async () => {
  const w = world();
  w.holds.add('a');
  await w.manager.start(a);
  await w.manager.start(b);
  await w.manager.start(c);
  assert.deepEqual(w.manager.store.getState().queue, ['b', 'c']);
  assert.deepEqual([w.manager.stateOf('b').queuePosition, w.manager.stateOf('c').queuePosition], [1, 2]);
  w.manager.moveInQueue('c', 0);
  assert.deepEqual(w.manager.queueOrder(), ['c', 'b']);
  assert.equal(w.manager.stateOf('c').queuePosition, 1);
  assert.deepEqual(await w.manager.start(c), { ok: true }, 'idempotent while queued');
  await w.manager.pause('b');
  assert.equal(w.manager.stateOf('b').status, 'paused');
  assert.deepEqual(w.manager.queueOrder(), ['c']);
  w.release('a');
  await until(w.manager, 'c', (s) => s.status === 'completed');
  assert.deepEqual(w.log.transfers, ['a', 'c'], 'c (moved first) ran after a; paused b did not');
  await w.manager.start(b);
  await w.manager.cancel(b);
  await w.manager.settled();
});

test('queue: cancelling a queued install removes it without touching the running one', async () => {
  const w = world();
  w.holds.add('a');
  await w.manager.start(a);
  await w.manager.start(b);
  await w.manager.cancel(b);
  assert.equal(w.manager.stateOf('b').status, 'idle');
  assert.deepEqual(w.manager.queueOrder(), []);
  assert.equal(w.manager.stateOf('a').status, 'downloading');
  w.release('a');
  assert.equal((await until(w.manager, 'a', done)).status, 'completed');
});

test('queue: concurrency 2 runs two at once; raising concurrency starts waiting installs', async () => {
  const w = world({ concurrency: 2 });
  w.holds.add('a');
  w.holds.add('b');
  await w.manager.start(a);
  await w.manager.start(b);
  await w.manager.start(c);
  assert.deepEqual(w.manager.queueOrder(), ['c']);
  w.manager.setConcurrency(3);
  assert.deepEqual(w.manager.queueOrder(), []);
  assert.equal(w.manager.store.getState().concurrency, 3);
  await until(w.manager, 'c', (s) => s.status === 'completed');
  w.release('a');
  w.release('b');
  await w.manager.settled();
  assert.equal(w.manager.stateOf('a').status, 'completed');
  w.manager.setConcurrency(99);
  assert.equal(w.manager.store.getState().concurrency, 4, 'clamped');
});

test('queue: pause all stops running and queued installs; resume all continues them in order', async () => {
  const w = world();
  w.holds.add('a');
  await w.manager.start(a);
  await w.manager.start(b);
  await w.manager.pauseAll();
  await w.manager.settled();
  assert.deepEqual([w.manager.stateOf('a').status, w.manager.stateOf('b').status], ['paused', 'paused']);
  assert.deepEqual(w.intent(), [], 'nothing auto-resumes after a pause-all');
  w.holds.clear();
  await w.manager.resumeAll([a, b]);
  await w.manager.settled();
  assert.deepEqual([w.manager.stateOf('a').status, w.manager.stateOf('b').status], ['completed', 'completed']);
});

test('process kill with one running and one queued: both continue at the next launch, in order, with their options', async () => {
  const first = world();
  first.holds.add('vis');
  await first.manager.start(vis, { vision: false, dir: '/slot' });
  await first.manager.start(a);
  assert.deepEqual(first.intent(), [encodeIntent('vis', { vision: false, dir: '/slot' }), 'a']);
  const relaunch = world({ intent: first.intent() });
  relaunch.manager.refresh([vis, a]);
  relaunch.manager.resumeInterrupted([vis, a]);
  await relaunch.manager.settled();
  assert.deepEqual(relaunch.log.transfers, ['vis', 'a'], 'vis without its projector, then a');
  assert.deepEqual(relaunch.log.dirs[0], '/slot');
});

test('intent encoding round-trips and tolerates garbage', () => {
  assert.equal(encodeIntent('x', {}), 'x');
  assert.deepEqual(decodeIntent(encodeIntent('x', { vision: false, draft: true, dir: '/a#b' })), { id: 'x', opts: { vision: false, draft: true, dir: '/a#b' } });
  assert.deepEqual(decodeIntent('x#{oops'), { id: 'x', opts: {} });
});

test('hub summary: active / queued / paused counts, bytes left and a total ETA from the live speed', () => {
  const s = (status: DownloadState['status'], bytesWritten: number, totalBytes: number, speedBps = 0): DownloadState => ({
    status, bytesWritten, totalBytes, speedBps, etaSec: 0, retryable: false,
  });
  const sum = summarizeDownloads({
    a: s('downloading', 100, 10_100, 2048),
    b: s('queued', 0, 4096),
    c: s('paused', 5, 10),
    d: s('error', 0, 10),
    e: s('completed', 10, 10),
  });
  assert.deepEqual(sum, { active: 1, queued: 1, paused: 1, failed: 1, bytesRemaining: 14_096, speedBps: 2048, etaSec: 7 });
  assert.equal(summarizeDownloads({}).etaSec, 0);
});
