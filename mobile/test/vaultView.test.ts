/**
 * Pure logic behind the Model Vault / Downloads Hub / Speculative screens (src/ui/vaultLogic.ts).
 * The screens themselves are React Native and are verified by typecheck + the Android export bundle.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { MODEL_CATALOG, getModel } from '../src/core/catalog.ts';
import { IDLE_STATE, type DownloadState } from '../src/core/downloadManager.ts';
import {
  DEFAULT_FILTERS,
  IDLE_ENGINE,
  SORTS,
  SPEC_PRESETS,
  activeFilterCount,
  contextLabel,
  fitVerdict,
  licenseNote,
  mtpTargets,
  paramsLabel,
  partitionDownloads,
  presetSupport,
  rowState,
  runVaultQuery,
  sectionsFor,
  speedupLabel,
  toggle,
  wantedMode,
} from '../src/ui/vaultLogic.ts';

const GB = 1e9;
const env6 = { ramBytes: 6 * GB, nCtx: 2048, installedIds: [] as string[] };
const m = (id: string) => {
  const spec = getModel(id);
  assert.ok(spec, `missing catalog entry ${id}`);
  return spec;
};
const dl = (p: Partial<DownloadState>): DownloadState => ({ ...IDLE_STATE, ...p });

test('every one of the 8 sort orders is offered, and only Best fit and Grade are grouped', () => {
  assert.deepEqual(SORTS.map((s) => s.value).sort(), ['grade', 'name', 'newest', 'ram_asc', 'ram_desc', 'recommended', 'size_asc', 'size_desc']);
  assert.deepEqual(SORTS.filter((s) => s.grouped).map((s) => s.value), ['recommended', 'grade']);
});

test('tag filters: All tags narrows, Any tag widens', () => {
  const both = runVaultQuery({ ...DEFAULT_FILTERS, caps: ['Image', 'Code'], match: 'AND' }, env6);
  const either = runVaultQuery({ ...DEFAULT_FILTERS, caps: ['Image', 'Code'], match: 'OR' }, env6);
  assert.ok(both.every((x) => x.capabilities.includes('Image') && x.capabilities.includes('Code')));
  assert.ok(either.every((x) => x.capabilities.includes('Image') || x.capabilities.includes('Code')));
  assert.ok(either.length > both.length);
  assert.ok(either.length >= runVaultQuery({ ...DEFAULT_FILTERS, caps: ['Image'] }, env6).length);
});

test('Video is a kept filter that honestly matches nothing', () => {
  assert.equal(runVaultQuery({ ...DEFAULT_FILTERS, caps: ['Video'] }, env6).length, 0);
});

test('policy chips: one chip filters, both or none show everything', () => {
  const total = runVaultQuery(DEFAULT_FILTERS, env6).length;
  assert.equal(total, MODEL_CATALOG.length);
  const unc = runVaultQuery({ ...DEFAULT_FILTERS, policies: ['Uncensored'] }, env6);
  assert.ok(unc.length > 0 && unc.every((x) => x.contentPolicy === 'Uncensored'));
  assert.equal(runVaultQuery({ ...DEFAULT_FILTERS, policies: ['Standard', 'Uncensored'] }, env6).length, total);
});

test('"Fits this phone" removes only what rows would call too heavy; installed filter uses the installed ids', () => {
  const fits = runVaultQuery({ ...DEFAULT_FILTERS, fits: true }, env6);
  assert.ok(fits.length < MODEL_CATALOG.length && fits.length > 0);
  assert.ok(fits.every((x) => fitVerdict(x, env6.ramBytes, env6.nCtx).rating !== 'too_heavy'));
  assert.equal(runVaultQuery({ ...DEFAULT_FILTERS, fits: true }, { ...env6, ramBytes: null }).length, MODEL_CATALOG.length);
  const inst = runVaultQuery({ ...DEFAULT_FILTERS, installed: true }, { ...env6, installedIds: ['qwen3.5-4b'] });
  assert.deepEqual(inst.map((x) => x.id), ['qwen3.5-4b']);
});

test('search narrows by words and filter counting ignores search and sort', () => {
  const r = runVaultQuery({ ...DEFAULT_FILTERS, search: 'qwen vision' }, env6);
  assert.ok(r.length > 0 && r.length < MODEL_CATALOG.length);
  assert.ok(r.every((x) => /qwen/i.test(JSON.stringify(x)) && /vision/i.test(JSON.stringify(x))));
  assert.equal(activeFilterCount({ ...DEFAULT_FILTERS, search: 'x', sort: 'name' }), 0);
  assert.equal(activeFilterCount({ ...DEFAULT_FILTERS, caps: ['Text', 'Code'], grades: ['S'], fits: true }), 4);
  assert.deepEqual(toggle(['a'], 'b'), ['a', 'b']);
  assert.deepEqual(toggle(['a', 'b'], 'a'), ['b']);
});

test('grade groups: Grade sort is S, B, C; Best fit puts the group holding the best fit first; other sorts are one list', () => {
  const all = MODEL_CATALOG;
  const byGrade = sectionsFor(all, 'grade', env6);
  assert.deepEqual(byGrade.map((s) => s.key), ['S', 'B', 'C']);
  assert.equal(byGrade.reduce((n, s) => n + s.data.length, 0), all.length);
  assert.ok(byGrade[0].title.includes('Titans') && byGrade[1].title.includes('Sweet spot') && byGrade[2].title.includes('Ultra-light'));

  const ordered = runVaultQuery(DEFAULT_FILTERS, env6);
  const fit = sectionsFor(ordered, 'recommended', env6);
  assert.notEqual(fit[0].key, 'S', 'on a 6 GB phone the Titans are not first');
  assert.ok(['great', 'ok'].includes(fitVerdict(fit[0].data[0], env6.ramBytes, env6.nCtx).rating));

  const flat = sectionsFor(runVaultQuery({ ...DEFAULT_FILTERS, sort: 'name' }, env6), 'name', env6);
  assert.equal(flat.length, 1);
  assert.deepEqual(flat[0].data.map((x) => x.name), [...flat[0].data].map((x) => x.name).sort((a, b) => a.localeCompare(b)));
  assert.deepEqual(sectionsFor([], 'name', env6), []);
});

test('row status and the single primary action for each state', () => {
  const spec = m('qwen3.5-4b');
  const act = (d: Partial<DownloadState>, eng = IDLE_ENGINE, verified = false) => rowState(spec, dl(d), eng, verified).primary?.action;
  assert.equal(act({}), 'download');
  assert.equal(act({ status: 'queued', queuePosition: 2 }), 'cancel');
  assert.equal(rowState(spec, dl({ status: 'queued', queuePosition: 2 }), IDLE_ENGINE, false).label, 'Queued #2');
  assert.equal(act({ status: 'downloading', bytesWritten: 50, totalBytes: 100 }), 'pause');
  const downloading = rowState(spec, dl({ status: 'downloading', bytesWritten: 50, totalBytes: 100, speedBps: 5e6 }), IDLE_ENGINE, false);
  assert.equal(downloading.fraction, 0.5);
  assert.match(downloading.label, /^Downloading 50% · /);
  assert.equal(act({ status: 'paused', bytesWritten: 25, totalBytes: 100 }), 'resume');
  assert.equal(rowState(spec, dl({ status: 'finalizing', verifyFraction: 0.4 }), IDLE_ENGINE, false).label, 'Verifying 40%');
  assert.equal(act({ status: 'error', retryable: true }), 'retry');
  const dead = rowState(spec, dl({ status: 'error', retryable: false }), IDLE_ENGINE, false);
  assert.deepEqual(dead.primary, { action: 'cancel', label: 'Discard' });
  assert.equal(dead.tone, 'bad');
  assert.equal(act({ status: 'completed' }), 'load');
  assert.equal(rowState(spec, dl({ status: 'completed' }), IDLE_ENGINE, true).label, 'Installed · works on this phone');
  const mounting = { status: 'mounting', modelId: spec.id, stage: 'loading', loadProgress: 0.4 } as const;
  const loading = rowState(spec, dl({ status: 'completed' }), mounting, false);
  assert.deepEqual(loading.primary, { action: 'busy', label: 'Loading' });
  assert.equal(loading.fraction, 0.4);
  const ready = rowState(spec, dl({ status: 'completed' }), { status: 'ready', modelId: spec.id, stage: null, loadProgress: 1 }, true);
  assert.deepEqual(ready.primary, { action: 'start_chat', label: 'Chat' });
  assert.equal(ready.label, 'Loaded');
  // Another model being loaded does not change this one.
  assert.equal(act({ status: 'completed' }, { status: 'ready', modelId: 'other', stage: null, loadProgress: 1 }), 'load');
});

test('fit includes the image add-on a default install loads', () => {
  const vl = m('qwen3.5-4b');
  assert.ok(vl.mmproj);
  const v = fitVerdict(vl, 12 * GB, 4096);
  assert.ok(v.ramBytes > 0 && v.label.length > 0);
  assert.equal(fitVerdict(vl, null, 4096).rating, 'unknown');
});

test('licenses: research and custom licenses warn, permissive ones do not', () => {
  assert.match(licenseNote('qwen-research')?.text ?? '', /not for commercial use/);
  for (const l of ['gemma', 'llama3.2', 'lfm1.0', 'minicpm-model-license']) assert.ok(licenseNote(l), l);
  for (const l of ['apache-2.0', 'mit']) assert.equal(licenseNote(l), null, l);
  // Every license the catalog carries is either warned about or one we know is permissive.
  const unknown = [...new Set(MODEL_CATALOG.map((x) => x.license))].filter((l) => !licenseNote(l) && !/^(apache|mit|bsd|cc|openrail)/i.test(l));
  assert.deepEqual(unknown, [], 'a catalog license has no verdict: add it to licenseNote');
});

test('the three old speculative presets resolve to real models and carry an honest verdict', () => {
  assert.equal(SPEC_PRESETS.length, 3);
  for (const p of SPEC_PRESETS) {
    const x = presetSupport(p);
    assert.ok(x.target && x.draft, `${p.id} resolves (old ids go through the aliases)`);
    assert.equal(x.pairRunnable, false);
    assert.match(x.reason ?? '', /Not supported by this engine version/);
  }
  assert.equal(presetSupport(SPEC_PRESETS[2]).mtpAlternative, true, 'Gemma 4 12B drafts with its own MTP head');
  assert.equal(presetSupport(SPEC_PRESETS[0]).mtpAlternative, false);
  assert.ok(mtpTargets().length >= 3 && mtpTargets().every((t) => !!t.draft));
});

test('wantedMode mirrors planSpeculative; speed-up is a label or nothing', () => {
  assert.equal(wantedMode({ enabled: false, draftModelId: 'x' }), 'off');
  assert.equal(wantedMode({ enabled: true, draftModelId: null }), 'mtp');
  assert.equal(wantedMode({ enabled: true, draftModelId: 'mtp' }), 'mtp');
  assert.equal(wantedMode({ enabled: true, draftModelId: 'smollm2-135m' }), 'draft');
  assert.equal(speedupLabel(null), null);
  assert.equal(speedupLabel(1.6), '1.6x');
  assert.equal(speedupLabel(2), '2.0x');
});

test('downloads are grouped by state, the queue keeps its order', () => {
  const items: Record<string, DownloadState> = {
    'qwen3.5-4b': dl({ status: 'downloading' }),
    'gemma-4-e2b': dl({ status: 'queued', queuePosition: 2 }),
    'llama-3.2-1b': dl({ status: 'queued', queuePosition: 1 }),
    'smollm2-360m': dl({ status: 'paused' }),
    'qwen3-8b': dl({ status: 'error' }),
    'qwen3.5-2b': dl({ status: 'completed' }),
    'qwen3.5-0.8b': dl({ status: 'finalizing' }),
    'not-in-catalog': dl({ status: 'completed' }),
  };
  const g = partitionDownloads(items, ['llama-3.2-1b', 'gemma-4-e2b']);
  assert.deepEqual(g.queued, ['llama-3.2-1b', 'gemma-4-e2b']);
  assert.deepEqual([...g.active].sort(), ['qwen3.5-0.8b', 'qwen3.5-4b']);
  assert.deepEqual(g.paused, ['smollm2-360m']);
  assert.deepEqual(g.failed, ['qwen3-8b']);
  assert.deepEqual(g.installed, ['qwen3.5-2b']);
});

test('labels for facts', () => {
  assert.equal(contextLabel(262144), '256K tokens');
  assert.equal(contextLabel(0), 'unknown');
  assert.equal(paramsLabel(0.36), '360M');
  assert.equal(paramsLabel(4), '4B');
  assert.equal(paramsLabel(1.7), '1.7B');
});

test('vault: parameter grouping and the small-uncensored chip', () => {
  const env = { ramBytes: 12e9, nCtx: 4096, installedIds: [] as string[] };
  const small = runVaultQuery({ ...DEFAULT_FILTERS, smallUncensored: true }, env);
  assert.ok(small.length >= 15 && small.every((m) => m.contentPolicy === 'Uncensored' && m.paramsB <= 4.7));
  const bands = runVaultQuery({ ...DEFAULT_FILTERS, bands: ['xl'] }, env);
  assert.ok(bands.length > 0 && bands.every((m) => m.paramsB > 10));
  const secs = sectionsFor(runVaultQuery(DEFAULT_FILTERS, env), 'recommended', env, 'params');
  assert.deepEqual(secs.map((x) => x.key), ['p-xs', 'p-s', 'p-m', 'p-l', 'p-xl']);
  assert.equal(secs.reduce((n, x) => n + x.data.length, 0), MODEL_CATALOG.length);
  assert.equal(activeFilterCount({ ...DEFAULT_FILTERS, bands: ['xs', 's'], smallUncensored: true }), 3);
});
