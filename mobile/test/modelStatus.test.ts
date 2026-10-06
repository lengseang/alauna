import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveModelStatus, actionsFor, type ModelStatusKind } from '../src/core/modelStatus.ts';
import { IDLE_STATE, type DownloadState } from '../src/core/downloadManager.ts';

const idleEngine = { status: 'unmounted' as const, modelId: null, stage: null, loadProgress: 0 };
const dl = (over: Partial<DownloadState>): DownloadState => ({ ...IDLE_STATE, ...over });
const st = (download: DownloadState, engine: any = idleEngine, verified = false) => deriveModelStatus({ modelId: 'm', download, engine, verified });

test('status: every download state maps to a distinct, honest label', () => {
  assert.equal(st(IDLE_STATE).kind, 'not_downloaded');
  assert.equal(st(dl({ status: 'resolving' })).kind, 'resolving');
  const d = st(dl({ status: 'downloading', note: 'Connection lost - retrying (1/4)...' }));
  assert.deepEqual([d.kind, d.label], ['downloading', 'Connection lost - retrying (1/4)...']);
  assert.equal(st(dl({ status: 'finalizing' })).kind, 'finalizing');
  const p = st(dl({ status: 'paused', bytesWritten: 410, totalBytes: 1000 }));
  assert.deepEqual([p.kind, p.label, p.tone], ['paused', 'Paused at 41%', 'warn']);
  assert.equal(st(dl({ status: 'error', error: 'x' })).tone, 'bad');
});

test('status: installed shows whether it has been verified on THIS phone', () => {
  const done = dl({ status: 'completed', bytesWritten: 5, totalBytes: 5 });
  assert.match(st(done, idleEngine, false).label, /Load it to verify/);
  assert.match(st(done, idleEngine, true).label, /Verified on this phone/);
});

test('status: engine state for THIS model wins; other models are unaffected', () => {
  const done = dl({ status: 'completed' });
  const mounting = (stage: any, p = 0.4) => ({ status: 'mounting' as const, modelId: 'm', stage, loadProgress: p });
  assert.equal(st(done, mounting('loading')).label, 'Loading into memory 40%');
  assert.equal(st(done, mounting('testing')).label, 'Testing a reply...');
  assert.equal(st(done, mounting('checking')).label, 'Checking file...');
  assert.deepEqual([st(done, { status: 'ready', modelId: 'm', stage: null, loadProgress: 1 }).kind, st(done, { status: 'generating', modelId: 'm', stage: null, loadProgress: 1 }).kind], ['active', 'active']);
  // A different model being active does not change this card.
  assert.equal(st(done, { status: 'ready', modelId: 'other', stage: null, loadProgress: 1 }, true).kind, 'installed');
  assert.equal(st(done, { status: 'mounting', modelId: 'other', stage: 'loading', loadProgress: 0.2 }).kind, 'installed');
  // Failed load of this model is visible on its own card.
  assert.equal(st(done, { status: 'error', modelId: 'm', stage: null, loadProgress: 0 }).kind, 'load_failed');
  assert.equal(st(done, { status: 'error', modelId: 'other', stage: null, loadProgress: 0 }).kind, 'installed');
});

test('actions: each status offers exactly the controls that make sense (no dead or duplicate buttons)', () => {
  const kinds: ModelStatusKind[] = ['not_downloaded', 'resolving', 'downloading', 'paused', 'finalizing', 'download_error', 'installed', 'loading', 'active', 'load_failed'];
  for (const k of kinds) {
    const a = actionsFor(k, true);
    assert.equal(new Set(a).size, a.length, `${k}: duplicate action`);
  }
  assert.deepEqual(actionsFor('not_downloaded', false), ['download']);
  assert.deepEqual(actionsFor('downloading', false), ['pause', 'cancel']);
  assert.deepEqual(actionsFor('paused', false), ['resume', 'cancel']);
  assert.deepEqual(actionsFor('download_error', true), ['retry', 'cancel']);
  assert.deepEqual(actionsFor('download_error', false), ['cancel'], 'permanent errors (404/gated) offer no Retry');
  assert.deepEqual(actionsFor('finalizing', false), [], 'no buttons while the app is checking the file');
  assert.deepEqual(actionsFor('loading', false), []);
  assert.ok(actionsFor('installed', false).includes('load'));
  assert.ok(actionsFor('active', false).includes('start_chat') && actionsFor('active', false).includes('unload'));
  assert.ok(!actionsFor('not_downloaded', false).includes('delete'), 'cannot delete what is not there');
  assert.ok(!actionsFor('downloading', false).includes('load'), 'cannot load a half-downloaded file');
});
