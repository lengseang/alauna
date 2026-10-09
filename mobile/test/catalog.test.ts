import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_CAPABILITIES,
  MODEL_CATALOG,
  MODEL_ID_ALIASES,
  draftOptions,
  draftTargets,
  getModel,
  gradeFor,
  installSizeBytes,
  libraryFacets,
  normalizeCapability,
  queryCatalog,
  queryLibrary,
  resolveModelId,
  type ModelSpec,
} from '../src/core/catalog.ts';
import { estimateRamBytes, rateFit, defaultContext, fitFor, recommendModel } from '../src/core/fit.ts';
import { companionLocalName, installFiles } from '../src/core/downloadManager.ts';

const GB = 1e9;
// Real totalMemory values Android reports are a bit below the marketing number.
const PHONES = { '4GB': 3.6 * GB, '6GB': 5.4 * GB, '8GB': 7.3 * GB, '12GB': 11.2 * GB, '16GB': 15.0 * GB };
const HEX64 = /^[0-9a-f]{64}$/;

// --------------------------------------------------------------------------- parity: nothing from before is lost

/** Every id the old app (94b571d S23_MODEL_DATABASE), the v1 rebuild (d919a34) and the 6-model catalog used. */
const OLD_APP_IDS = [
  'gemma-4-12b', 'gemma-4-12b-abliterated', 'llama-3.1-8b', 'dolphin-3.0-8b', 'minicpm-v-2.6-8b', 'qwen2.5-vl-7b-abliterated',
  'qwen3-8b', 'huihui-qwen3-8b-abliterated', 'gemma-4-e4b', 'qwen3.5-4b', 'phi-4-mini-3.8b', 'llama-3.2-3b-abliterated',
  'qwen2.5-vl-3b', 'qwen2.5-vl-3b-abliterated', 'smollm2-135m-nano', 'llama-3.2-1b', 'gemma-4-e2b', 'smollm3-1.7b',
  'smollm3-1.7b-uncensored', 'qwen2.5-1.5b', 'qwen2.5-1.5b-uncensored', 'moondream2', 'smolvlm-uncensored',
];
const V1_IDS = [
  'smollm2-360m', 'llama-3.2-1b', 'qwen2.5-1.5b', 'smollm2-1.7b', 'qwen3-1.7b', 'deepseek-r1-1.5b', 'qwen3.5-2b', 'gemma-2-2b',
  'llama-3.2-3b', 'smollm3-3b', 'qwen3-4b', 'qwen3.5-4b', 'gemma-3-4b', 'phi-4-mini', 'llama-3.1-8b', 'qwen3-8b', 'deepseek-r1-7b',
  'qwen3.5-9b', 'gemma-4-12b', 'dolphin-3.0-8b', 'huihui-qwen3.5-9b-abliterated',
];
const CURRENT_IDS = ['qwen3.5-0.8b', 'qwen3.5-2b', 'qwen3.5-4b', 'qwen3-4b-instruct-2507', 'gemma-4-e2b', 'qwen3.5-9b'];
/** Old-app card names whose file was wrong: each name now has a real entry. */
const OLD_NAMES = [
  'Gemma 2 9B', 'Llama 3.1 8B', 'Dolphin 3.0 8B', 'Qwen2.5-VL 7B', 'Qwen2.5-VL 7B Abliterated', 'Qwen2.5 7B', 'Qwen2.5 7B Compact',
  'Gemma 2 2B', 'Qwen2.5 3B', 'Llama 3.2 3B', 'Qwen2.5-VL 3B', 'Qwen2.5-VL 3B Abliterated', 'SmolLM2 135M Nano', 'Llama 3.2 1B',
  'SmolLM2 1.7B', 'DeepSeek-R1 Distill 1.5B', 'Qwen2.5 1.5B', 'Moondream 2',
];

test('library: at least 30 entries, and every old/v1/current id still resolves (aliases where the old id was mislabeled)', () => {
  assert.ok(MODEL_CATALOG.length >= 30, `only ${MODEL_CATALOG.length}`);
  for (const id of [...OLD_APP_IDS, ...V1_IDS, ...CURRENT_IDS]) assert.ok(getModel(id), `old id ${id} does not resolve`);
  for (const name of OLD_NAMES) assert.ok(MODEL_CATALOG.some((m) => m.name === name), `old card "${name}" has no entry`);
  for (const [alias, target] of Object.entries(MODEL_ID_ALIASES)) {
    assert.ok(!MODEL_CATALOG.some((m) => m.id === alias), `${alias} must not also be an id`);
    assert.equal(getModel(alias)?.id, target);
    assert.equal(resolveModelId(alias), target);
  }
  assert.equal(resolveModelId('qwen3.5-4b'), 'qwen3.5-4b');
  assert.equal(getModel('nope'), undefined);
  assert.equal(getModel(null), undefined);
});

test('library: the old tag set is kept (Text/Image/Voice/Code/Video) plus Reasoning; every tag but Video is on a real entry', () => {
  assert.deepEqual([...ALL_CAPABILITIES].sort(), ['Code', 'Image', 'Reasoning', 'Text', 'Video', 'Voice']);
  const facets = libraryFacets();
  for (const c of ['Text', 'Image', 'Voice', 'Code', 'Reasoning'] as const) assert.ok(facets.capabilities[c] > 0, `no entry tagged ${c}`);
  assert.equal(facets.capabilities.Video, 0, 'no model can watch video through llama.rn; the tag stays as an honest empty filter');
  assert.ok(facets.policy.Uncensored >= 5 && facets.policy.Standard >= 25);
  assert.ok(facets.grades.S > 0 && facets.grades.B > 0 && facets.grades.C > 0);
  assert.equal(facets.grades.S + facets.grades.B + facets.grades.C, MODEL_CATALOG.length);
});

// --------------------------------------------------------------------------- truthfulness of every entry

test('library: ids, model files and projector names are unique; Hub names like mmproj-F16.gguf never collide on the phone', () => {
  const ids = new Set(MODEL_CATALOG.map((m) => m.id));
  const files = new Set(MODEL_CATALOG.map((m) => `${m.repo}/${m.filename}`));
  assert.equal(ids.size, MODEL_CATALOG.length);
  assert.equal(files.size, MODEL_CATALOG.length);
  const local = new Map<string, string>();
  for (const m of MODEL_CATALOG) {
    for (const f of installFiles(m, { vision: true, draft: true })) {
      const hub = `${f.repo}/${f.filename}`;
      const prev = local.get(f.localName);
      assert.ok(!prev || prev === hub, `${f.localName} would hold both ${prev} and ${hub}`);
      local.set(f.localName, hub);
      assert.ok(!f.localName.includes('/'), 'local names are flat');
    }
  }
  assert.notEqual(companionLocalName(getModel('qwen3.5-2b')!.mmproj!), companionLocalName(getModel('qwen3.5-4b')!.mmproj!));
});

test('library: every entry is well-formed and verified data (never hand-typed zeros)', () => {
  for (const m of MODEL_CATALOG) {
    assert.ok(m.repo.includes('/') && m.filename.toLowerCase().endsWith('.gguf'), `${m.id}: file`);
    assert.ok(!/mmproj/i.test(m.filename), `${m.id}: a projector is not a model`);
    assert.ok(m.sizeBytes > 50_000_000, `${m.id}: size`);
    assert.match(m.sha256, HEX64, `${m.id}: a real sha256 is mandatory (downloads are verified against it)`);
    assert.ok(m.kvBytesPerToken > 0 && m.contextLength >= 2048, `${m.id}: header data`);
    assert.match(m.published, /^\d{4}-\d{2}-\d{2}$/, `${m.id}: published`);
    assert.ok(m.license.length > 0 && m.description.length > 20 && m.draftKey.length > 0, `${m.id}: license/description/draftKey`);
    for (const f of [m.mmproj, m.draft]) {
      if (!f) continue;
      assert.ok(f.repo.includes('/') && f.filename.endsWith('.gguf') && f.sizeBytes > 10_000_000, `${m.id}: companion file`);
      assert.match(f.sha256, HEX64, `${m.id}: companion sha256`);
    }
    if (m.mmproj) assert.match(m.mmproj.filename, /mmproj/i, `${m.id}: projector file name`);
    // Tags must be deliverable: images/audio need the projector, reasoning needs a thinking mode.
    for (const c of m.capabilities) assert.ok(ALL_CAPABILITIES.includes(c), `${m.id}: tag ${c}`);
    assert.ok(m.capabilities.includes('Text'), `${m.id}: every model chats in text`);
    assert.ok(!m.capabilities.includes('Video'), `${m.id}: Video cannot be delivered`);
    if (m.capabilities.includes('Image') || m.capabilities.includes('Voice')) assert.ok(m.mmproj, `${m.id}: Image/Voice without a projector`);
    if (m.mmproj) assert.ok(m.capabilities.includes('Image') || m.capabilities.includes('Voice'), `${m.id}: projector without a tag`);
    assert.equal(m.thinking !== 'none', m.capabilities.includes('Reasoning'), `${m.id}: thinking vs Reasoning tag`);
    // Name, id and family agree (the old app had "Moondream 2" pointing at SmolLM2 360M).
    assert.ok(m.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(m.family.toLowerCase().replace(/[^a-z0-9]/g, '')), `${m.id}: name vs family`);
    assert.match(m.uniqueTag, /^#[A-Za-z0-9]+$/, `${m.id}: uniqueTag`);
    assert.ok(m.bestFor.length > 15 && m.bestFor.length < 160, `${m.id}: bestFor`);
    // "Uncensored" only for builds that really are abliterated / refusal-free upstream.
    if (m.contentPolicy === 'Uncensored') assert.match(`${m.repo} ${m.name}`, /abliterated|dolphin|uncensored|heretic|stheno|toppy|lunaris|rocinante|gemmasutra/i, `${m.id}: uncensored claim`);
    else assert.doesNotMatch(`${m.repo}/${m.filename}`, /abliterated/i, `${m.id}: abliterated file labelled Standard`);
    assert.equal(m.grade, gradeFor(m), `${m.id}: grade is computed`);
    if (m.draft) assert.ok(m.draftKey === 'gemma4', `${m.id}: only Gemma 4 ships MTP draft heads here`);
  }
});

test('library: grade S/B/C follows the RAM need on a phone (C <= 2.5 GB, B <= 5 GB, S above)', () => {
  for (const m of MODEL_CATALOG) {
    const ram = estimateRamBytes(m, 4096);
    assert.equal(m.grade, ram <= 2.5 * GB ? 'C' : ram <= 5 * GB ? 'B' : 'S', m.id);
  }
  assert.equal(getModel('smollm2-135m-nano')!.grade, 'C');
  assert.equal(getModel('qwen3.5-4b')!.grade, 'B');
  assert.equal(getModel('qwen3.5-9b')!.grade, 'S');
});

test('library: one clear default (Qwen3.5 4B), a tiny smoke test, vision and voice models are real', () => {
  const top = [...MODEL_CATALOG].sort((a, b) => b.priority - a.priority)[0];
  assert.deepEqual([top.id, top.role], ['qwen3.5-4b', 'Balanced (default)']);
  assert.equal(MODEL_CATALOG.filter((m) => m.role === 'Balanced (default)').length, 1);
  assert.ok(MODEL_CATALOG.some((m) => m.role === 'Smoke test' && m.sizeBytes < 700_000_000));
  assert.ok(getModel('qwen3.5-4b')!.capabilities.includes('Image'));
  assert.ok(getModel('gemma-4-e2b')!.capabilities.includes('Voice'));
  assert.ok(getModel('moondream2')!.mmproj, 'Moondream 2 is a real moondream file with its projector now');
  assert.match(getModel('moondream2')!.filename, /moondream2/);
  assert.match(getModel('gemma-4-e4b')!.filename, /gemma-4-E4B/, 'old id gemma-4-e4b pointed at Gemma 2 2B');
});

// --------------------------------------------------------------------------- query API

test('query: search matches every word across name, family, role, description and tags', () => {
  const gemma = queryLibrary({ search: 'gemma' });
  const gemmaFamily = MODEL_CATALOG.filter((m) => m.family === 'Gemma').map((m) => m.id);
  assert.ok(gemmaFamily.length >= 5 && gemmaFamily.every((id) => gemma.some((m) => m.id === id)));
  assert.ok(gemma.every((m) => /gemma/i.test(`${m.name} ${m.description}`)));
  assert.equal(queryLibrary({ search: 'balanced' })[0]?.id, 'qwen3.5-4b', 'search also matches the role');
  const both = queryLibrary({ search: 'qwen vision' });
  assert.ok(both.some((m) => m.id === 'qwen3-vl-4b') && both.every((m) => m.capabilities.includes('Image')), 'both words must match');
  assert.equal(queryLibrary({ search: 'zzzz-not-a-model' }).length, 0);
});

test('query: capability AND vs OR, aliases (Vision = Image), grade and policy filters', () => {
  const and = queryLibrary({ capabilities: ['Image', 'Reasoning'], match: 'AND' });
  const or = queryLibrary({ capabilities: ['Image', 'Reasoning'], match: 'OR' });
  assert.ok(and.length > 0 && or.length > and.length);
  assert.ok(and.every((m) => m.capabilities.includes('Image') && m.capabilities.includes('Reasoning')));
  assert.ok(or.every((m) => m.capabilities.includes('Image') || m.capabilities.includes('Reasoning')));
  assert.deepEqual(queryLibrary({ capabilities: ['Vision'] }).map((m) => m.id), queryLibrary({ capabilities: ['Image'] }).map((m) => m.id));
  assert.equal(normalizeCapability('vision'), 'Image');
  assert.equal(normalizeCapability('audio'), 'Voice');
  assert.equal(normalizeCapability('nonsense'), null);
  assert.equal(queryLibrary({ capabilities: ['Video'] }).length, 0);

  const sb = queryLibrary({ grades: ['S', 'B'] });
  assert.ok(sb.length > 0 && sb.every((m) => m.grade !== 'C'));
  assert.equal(queryLibrary({ grades: [] }).length, MODEL_CATALOG.length, 'no grade selected = all');
  const unc = queryLibrary({ policy: 'Uncensored' });
  assert.ok(unc.length >= 5 && unc.every((m) => m.contentPolicy === 'Uncensored'));
  assert.equal(queryLibrary({ policy: 'Standard' }).length + unc.length, MODEL_CATALOG.length);
});

test('query: "fits this phone" uses the real RAM (and the projector when filtering for images); unknown RAM filters nothing', () => {
  const fits12 = queryLibrary({ fitsPhone: true, ramBytes: PHONES['12GB'] });
  assert.ok(!fits12.some((m) => m.id === 'gemma-4-12b'), 'the 12B is too heavy for a 12 GB phone');
  assert.ok(fits12.some((m) => m.id === 'qwen3.5-9b'), 'the 9B fits (tight)');
  for (const m of fits12) assert.notEqual(fitFor(m, PHONES['12GB']), 'too_heavy', m.id);
  const fits4 = queryLibrary({ fitsPhone: true, ramBytes: PHONES['4GB'] });
  assert.ok(fits4.length < fits12.length && fits4.every((m) => m.grade !== 'S'));
  assert.equal(queryLibrary({ fitsPhone: true, ramBytes: null }).length, MODEL_CATALOG.length);
  const visionFits = queryLibrary({ fitsPhone: true, ramBytes: PHONES['8GB'], capabilities: ['Image'] });
  assert.ok(visionFits.length <= queryLibrary({ fitsPhone: true, ramBytes: PHONES['8GB'] }).filter((m) => m.capabilities.includes('Image')).length);
});

test('query: installed / available split', () => {
  const installedIds = ['qwen3.5-4b', 'gemma-4-e2b'];
  assert.deepEqual(queryLibrary({ install: 'installed', installedIds, sort: 'name' }).map((m) => m.id), ['gemma-4-e2b', 'qwen3.5-4b']);
  assert.equal(queryLibrary({ install: 'available', installedIds }).length, MODEL_CATALOG.length - 2);
});

test('query: every sort order', () => {
  const isSorted = <T>(xs: T[], key: (x: T) => number | string, dir: 1 | -1) =>
    xs.every((x, i) => i === 0 || (dir === 1 ? key(xs[i - 1]) <= key(x) : key(xs[i - 1]) >= key(x)));
  assert.ok(isSorted(queryLibrary({ sort: 'size_asc' }), installSizeBytes, 1));
  assert.ok(isSorted(queryLibrary({ sort: 'size_desc' }), installSizeBytes, -1));
  assert.ok(isSorted(queryLibrary({ sort: 'ram_asc' }), (m) => estimateRamBytes(m, defaultContext(null)), 1));
  assert.ok(isSorted(queryLibrary({ sort: 'ram_desc' }), (m) => estimateRamBytes(m, defaultContext(null)), -1));
  const names = queryLibrary({ sort: 'name' }).map((m) => m.name);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
  const grade = queryLibrary({ sort: 'grade' }).map((m) => m.grade).join('');
  assert.match(grade, /^S+B+C+$/);
  assert.ok(isSorted(queryLibrary({ sort: 'newest' }), (m: ModelSpec) => m.published, -1));
  // Recommended on the owner's phone: comfortable models first, the default at the very top.
  const rec = queryLibrary({ sort: 'recommended', ramBytes: PHONES['12GB'] });
  assert.equal(rec[0].id, 'qwen3.5-4b');
  assert.equal(rateFit(estimateRamBytes(rec.at(-1)!, 4096), PHONES['12GB']), 'too_heavy');
});

test('query: the v1 queryCatalog API still behaves as before', () => {
  const any = queryCatalog({ capabilities: ['Reasoning', 'Code'], match: 'ANY' });
  const all = queryCatalog({ capabilities: ['Reasoning', 'Code'], match: 'ALL' });
  assert.ok(any.length >= all.length && all.every((m) => m.capabilities.includes('Reasoning') && m.capabilities.includes('Code')));
  const asc = queryCatalog({});
  for (let i = 1; i < asc.length; i++) assert.ok(asc[i - 1].sizeBytes <= asc[i].sizeBytes, 'default: model size ascending');
  assert.equal(queryCatalog({ sort: 'size_desc' })[0].sizeBytes, Math.max(...MODEL_CATALOG.map((m) => m.sizeBytes)));
  assert.ok(queryCatalog({ onlyUncensored: true }).every((m) => m.contentPolicy === 'Uncensored'));
  assert.ok(queryCatalog({ grade: 'S' }).every((m) => m.grade === 'S'));
});

// --------------------------------------------------------------------------- speculative pairing

test('speculative: drafts share the tokenizer key, are at most half the size, smallest first; Gemma 4 offers its MTP head first', () => {
  const q4 = draftOptions(getModel('qwen3.5-4b')!);
  assert.deepEqual(q4.map((o) => (o.kind === 'model' ? o.spec.id : 'mtp')), ['qwen3.5-0.8b', 'qwen3.5-2b', 'qwen3.5-2b-hauhau-aggressive']);
  const g = draftOptions(getModel('gemma-4-12b')!);
  assert.equal(g[0].kind, 'mtp');
  assert.ok(g.some((o) => o.kind === 'model' && o.spec.id === 'gemma-4-e2b'));
  for (const t of MODEL_CATALOG) {
    for (const o of draftOptions(t)) {
      if (o.kind !== 'model') continue;
      assert.equal(o.spec.draftKey, t.draftKey, `${t.id} <- ${o.spec.id}`);
      assert.ok(o.spec.paramsB <= t.paramsB * 0.5 && o.spec.id !== t.id);
    }
  }
  assert.equal(draftOptions(getModel('qwen3.5-0.8b')!).length, 0, 'nothing smaller to draft with');
  assert.deepEqual(draftOptions(getModel('qwen3.5-9b')!, MODEL_CATALOG, ['qwen3.5-2b']).map((o) => (o.kind === 'model' ? o.spec.id : 'mtp')), ['qwen3.5-2b']);
  // A standard target prefers a standard draft even when an abliterated one is smaller-or-equal.
  const q7 = draftOptions(getModel('qwen2.5-7b')!).filter((o) => o.kind === 'model').map((o) => (o.kind === 'model' ? o.spec.contentPolicy : ''));
  assert.equal(q7.indexOf('Uncensored'), q7.lastIndexOf('Standard') + 1);
  assert.ok(q7.includes('Uncensored'));
  assert.ok(draftTargets(getModel('qwen3.5-0.8b')!).some((m) => m.id === 'qwen3.5-9b'));
});

// --------------------------------------------------------------------------- fit + recommendation (device-aware)

test('fit: ratings scale with real RAM (broad devices, not one phone)', () => {
  const q9 = getModel('qwen3.5-9b')!;
  const q4 = getModel('qwen3.5-4b')!;
  const q08 = getModel('qwen3.5-0.8b')!;
  assert.equal(fitFor(q9, PHONES['4GB']), 'too_heavy');
  assert.equal(fitFor(q9, PHONES['8GB']), 'too_heavy');
  assert.ok(['ok', 'tight'].includes(fitFor(q9, PHONES['12GB'])), '9B is the 12 GB ceiling, never "runs great"');
  assert.notEqual(fitFor(q9, PHONES['16GB']), 'too_heavy');
  assert.equal(fitFor(q08, PHONES['4GB']), 'great');
  assert.equal(fitFor(q4, PHONES['12GB']), 'great');
  assert.ok(['great', 'ok'].includes(fitFor(q4, PHONES['8GB'])));
  assert.equal(fitFor(q4, PHONES['4GB']), 'too_heavy');
});

test('fit: unknown RAM never blocks, rating is "unknown"; context grows with RAM', () => {
  assert.equal(rateFit(5e9, null), 'unknown');
  assert.equal(rateFit(5e9, 0), 'unknown');
  assert.equal(defaultContext(null), 2048);
  assert.equal(defaultContext(PHONES['4GB']), 1536);
  assert.equal(defaultContext(PHONES['12GB']), 4096);
  const m = getModel('qwen3.5-9b')!;
  assert.ok(estimateRamBytes(m, 8192) > estimateRamBytes(m, 2048));
  assert.ok(estimateRamBytes(m, 2048) > m.sizeBytes);
});

test('fit: recommendation is the 4B default on 8-16 GB phones; never uncensored, never priority 0, never the 8-9B tier', () => {
  assert.equal(recommendModel(MODEL_CATALOG, PHONES['12GB'])!.id, 'qwen3.5-4b');
  assert.equal(recommendModel(MODEL_CATALOG, PHONES['16GB'])!.id, 'qwen3.5-4b', 'more RAM does not change the default');
  assert.equal(recommendModel(MODEL_CATALOG, PHONES['8GB'])!.id, 'qwen3.5-4b');
  assert.equal(recommendModel(MODEL_CATALOG, PHONES['6GB'])!.id, 'qwen3.5-2b', '6 GB: the quick model');
  assert.equal(recommendModel(MODEL_CATALOG, PHONES['4GB'])!.id, 'qwen3.5-2b');
  for (const [label, ram] of Object.entries(PHONES)) {
    const rec = recommendModel(MODEL_CATALOG, ram)!;
    assert.equal(rec.contentPolicy, 'Standard', label);
    assert.ok(rec.priority > 0, label);
    assert.ok(['great', 'ok'].includes(fitFor(rec, ram)), `${label}: ${rec.id} -> ${fitFor(rec, ram)}`);
    assert.ok(rec.paramsB < 8, `${label}: ${rec.id} must not be the heavy tier`);
  }
  // A very small phone still gets the smallest recommendable model (not a 135M demo).
  assert.equal(recommendModel(MODEL_CATALOG, 1.5 * GB)!.id, 'qwen3.5-0.8b');
  assert.equal(recommendModel(MODEL_CATALOG, null)!.role, 'Fast');
});

test('library v2.1: parameter bands, small-uncensored set, speed class and honest image tools', async () => {
  const { PARAM_BANDS, paramBand, isSmallUncensored, speedHint, IMAGE_TOOLS } = await import('../src/core/catalog.ts');
  assert.deepEqual(PARAM_BANDS.map((b) => b.label), ['\u22641B', '1\u20132B', '3\u20134B', '7\u20139B', '10\u201314B']);
  assert.equal(paramBand({ paramsB: 0.6 }), 'xs');
  assert.equal(paramBand({ paramsB: 2.0 }), 's');
  assert.equal(paramBand({ paramsB: 3.2 }), 'm');
  assert.equal(paramBand({ paramsB: 8 }), 'l');
  assert.equal(paramBand({ paramsB: 14.8 }), 'xl');
  assert.ok(MODEL_CATALOG.filter(isSmallUncensored).length >= 15);
  assert.ok(MODEL_CATALOG.some((m) => m.id === 'gemma-4-e2b-hauhau-aggressive' && m.contentPolicy === 'Uncensored'));
  assert.equal(speedHint({ sizeBytes: 4e8 }).fast, true);
  assert.equal(speedHint({ sizeBytes: 6e9 }).fast, false);
  for (const t of IMAGE_TOOLS) assert.ok(t.status === 'engine-unavailable' && /not in this build/.test(t.note), t.id);
  assert.ok(IMAGE_TOOLS.length >= 2 && !MODEL_CATALOG.some((m) => IMAGE_TOOLS.some((t) => t.id === m.id)));
});

test('task T8: verified Hermes 4 14B and Mistral NeMo Instruct 12B exist in catalog', () => {
  const h4 = getModel('hermes-4-14b');
  assert.ok(h4, 'hermes-4-14b must resolve');
  assert.equal(h4.family, 'Hermes');
  assert.equal(h4.quantization, 'Q4_K_M');
  assert.equal(h4.uniqueTag, '#Hermes4Steerable');
  assert.equal(h4.chatTemplate, 'chatml');
  assert.equal(h4.role, 'Heavy (16 GB phones)');
  assert.ok(h4.capabilities.includes('Reasoning'));

  const nemo = getModel('mistral-nemo-instruct-12b');
  assert.ok(nemo, 'mistral-nemo-instruct-12b must resolve');
  assert.equal(nemo.family, 'Mistral');
  assert.equal(nemo.quantization, 'Q4_K_M');
  assert.equal(nemo.uniqueTag, '#MistralNeMo128k');
  assert.equal(nemo.chatTemplate, 'mistral');
  assert.equal(nemo.role, 'Heavy (16 GB phones)');
});
