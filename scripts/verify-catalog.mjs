#!/usr/bin/env node
/**
 * Verifies every model in mobile/src/core/catalogData.ts against the live Hugging Face Hub.
 *
 *   node scripts/verify-catalog.mjs                 # check only (exit 1 on any problem)
 *   node scripts/verify-catalog.mjs --write         # also write sizes, sha256, KV bytes, context, published date
 *   node scripts/verify-catalog.mjs --only=a,b      # limit to some ids
 *
 * For every file of every entry (the model, its `mmproj` image/audio projector, its `draft` head):
 *   repo reachable and NOT gated, file exists as an LFS object, exact size + LFS sha256 (filled by --write),
 *   the download URL answers `Range: bytes=0-3` with 206, the right total and the "GGUF" magic.
 * From the model's GGUF header (read with Range requests, the tokenizer arrays are skipped):
 *   architecture known to the llama.cpp bundled with llama.rn (mobile/node_modules/llama.rn/cpp/llama-arch.cpp),
 *   trained context length, f16 KV bytes per token.
 * From the projector header: `Image` tag <=> vision encoder, `Voice` tag <=> audio encoder, projector type known to
 *   the bundled mtmd (tools/mtmd/clip-impl.h).
 * Also: unique ids, no two entries share a model file, aliases point at real ids.
 *
 * Needs Node >= 22.6 (type stripping; the script re-launches itself with the flag when needed) and network access to
 * huggingface.co. Works on Windows, macOS and Linux.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const mobile = join(here, '..', 'mobile');
const catalogPath = join(mobile, 'src', 'core', 'catalog.ts');
const dataPath = join(mobile, 'src', 'core', 'catalogData.ts');

// import() needs a file:// URL (a bare "D:\..." path fails on Windows), and Node < 22.18 needs a flag to load .ts.
let MODEL_CATALOG, MODEL_ID_ALIASES;
try {
  ({ MODEL_CATALOG, MODEL_ID_ALIASES } = await import(pathToFileURL(catalogPath).href));
} catch (err) {
  const needsFlag = /ERR_UNKNOWN_FILE_EXTENSION|Unknown file extension/i.test(`${err?.code ?? ''} ${err?.message ?? ''}`);
  if (needsFlag && !process.env.CHIWIWI_VERIFY_CHILD) {
    const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
      stdio: 'inherit',
      env: { ...process.env, CHIWIWI_VERIFY_CHILD: '1' },
    });
    process.exit(r.status ?? 1);
  }
  throw err;
}

const write = process.argv.includes('--write');
const only = (process.argv.find((a) => a.startsWith('--only=')) ?? '').slice(7).split(',').filter(Boolean);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let problems = 0;
const fail = (id, msg) => {
  problems++;
  console.log(`  FAIL  ${id.padEnd(32)} ${msg}`);
};
const warn = (id, msg) => console.log(`  warn  ${id.padEnd(32)} ${msg}`);

// ------------------------------------------------------------------ what the bundled engine supports
function readNames(path, re) {
  if (!existsSync(path)) return null;
  return new Set([...readFileSync(path, 'utf8').matchAll(re)].map((m) => m[1]));
}
const cpp = join(mobile, 'node_modules', 'llama.rn', 'cpp');
const ARCHS = readNames(join(cpp, 'llama-arch.cpp'), /LLM_ARCH_[A-Z0-9_]+,\s*"([^"]+)"/g);
const PROJECTORS = readNames(join(cpp, 'tools', 'mtmd', 'clip-impl.h'), /\{\s*PROJECTOR_TYPE_[A-Z0-9_]+,\s*"([^"]+)"\s*\}/g);
if (!ARCHS) console.log('  (llama.rn not installed: architecture check skipped)');

// ------------------------------------------------------------------ HTTP
async function getJson(url) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url);
    if (res.status === 429 || res.status >= 500) {
      await sleep(3000 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
  }
  throw new Error(`Rate limited / server error: ${url}`);
}

const resolveUrl = (repo, filename) => `https://huggingface.co/${repo}/resolve/main/${filename.split('/').map(encodeURIComponent).join('/')}?download=true`;

async function range(url, start, end) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } });
    if (res.status === 429 || res.status >= 500) {
      await sleep(3000 * (attempt + 1));
      continue;
    }
    return { status: res.status, contentRange: res.headers.get('content-range') ?? '', body: Buffer.from(await res.arrayBuffer()) };
  }
  throw new Error(`Range request kept failing: ${url}`);
}

// ------------------------------------------------------------------ GGUF header (metadata only)
/** Reads GGUF key/values with Range requests. Stops at the tokenizer vocabulary once `enough(kv)` says so. */
async function readGgufHeader(url, enough) {
  let buf = Buffer.alloc(0);
  const ensure = async (n) => {
    while (buf.length < n) {
      const want = Math.max(n, buf.length * 2, 1 << 18);
      const r = await range(url, buf.length, want - 1);
      if (r.status !== 206 || r.body.length === 0) throw new Error(`header read failed (HTTP ${r.status})`);
      buf = Buffer.concat([buf, r.body]);
    }
  };
  let off = 0;
  const u32 = async () => { await ensure(off + 4); const v = buf.readUInt32LE(off); off += 4; return v; };
  const u64 = async () => { await ensure(off + 8); const v = Number(buf.readBigUInt64LE(off)); off += 8; return v; };
  const str = async () => { const n = await u64(); await ensure(off + n); const s = buf.toString('utf8', off, off + n); off += n; return s; };
  const SIZE = { 0: 1, 1: 1, 2: 2, 3: 2, 4: 4, 5: 4, 6: 4, 7: 1, 10: 8, 11: 8, 12: 8 };
  const scalar = async (t) => {
    await ensure(off + (SIZE[t] ?? 0));
    const at = off;
    off += SIZE[t];
    switch (t) {
      case 0: return buf.readUInt8(at);
      case 1: return buf.readInt8(at);
      case 2: return buf.readUInt16LE(at);
      case 3: return buf.readInt16LE(at);
      case 4: return buf.readUInt32LE(at);
      case 5: return buf.readInt32LE(at);
      case 6: return buf.readFloatLE(at);
      case 7: return buf.readUInt8(at) !== 0;
      case 10: return Number(buf.readBigUInt64LE(at));
      case 11: return Number(buf.readBigInt64LE(at));
      case 12: return buf.readDoubleLE(at);
    }
    throw new Error(`unknown GGUF type ${t}`);
  };
  const value = async (t) => {
    if (t === 8) return str();
    if (t !== 9) return scalar(t);
    const et = await u32();
    const n = await u64();
    const out = [];
    for (let i = 0; i < n; i++) out.push(et === 8 ? await str() : await scalar(et));
    return out;
  };
  await ensure(24);
  if (buf.toString('ascii', 0, 4) !== 'GGUF') throw new Error('not a GGUF file');
  off = 4;
  await u32(); // version
  await u64(); // tensor count
  const nkv = await u64();
  const kv = {};
  for (let i = 0; i < nkv; i++) {
    const key = await str();
    const type = await u32();
    if (key.startsWith('tokenizer.ggml.') && enough(kv)) break; // the vocabulary is megabytes: never needed here
    kv[key] = await value(type);
  }
  return kv;
}

/** f16 KV-cache bytes per context token, counting only layers that keep their own cache. */
function kvBytesPerToken(kv) {
  const arch = kv['general.architecture'];
  if (arch === 'glm5-next') {
    const kvLora = kv['glm5-next.attention.kv_lora_rank'] ?? 512;
    const layers = kv['glm5-next.block_count'] ?? 46;
    return Math.round(layers * kvLora * 2);
  }
  const g = (k) => kv[`${arch}.${k}`];
  const at = (x, l) => (Array.isArray(x) ? x[l] : x);
  const nLayer = g('block_count');
  const heads = g('attention.head_count');
  const headsKv = g('attention.head_count_kv') ?? heads;
  const emb = g('embedding_length');
  const pattern = g('attention.sliding_window_pattern');
  const shared = g('attention.shared_kv_layers') ?? 0;
  const interval = g('full_attention_interval');
  let total = 0;
  for (let l = 0; l < nLayer - shared; l++) {
    if (interval && (l + 1) % interval !== 0) continue; // recurrent layers (Qwen3.5 / Qwen3-Next) keep no KV cache
    const nKv = at(headsKv, l);
    if (!nKv) continue; // LFM2 convolution layers
    const swa = Array.isArray(pattern) && pattern[l] === true;
    const k = (swa ? g('attention.key_length_swa') : undefined) ?? g('attention.key_length') ?? emb / at(heads, l);
    const v = (swa ? g('attention.value_length_swa') : undefined) ?? g('attention.value_length') ?? k;
    total += nKv * (k + v) * 2;
  }
  return Math.round(total);
}

// ------------------------------------------------------------------ checks
const catalog = only.length ? MODEL_CATALOG.filter((m) => only.includes(m.id)) : MODEL_CATALOG;

const ids = new Set();
const modelFiles = new Map();
for (const m of MODEL_CATALOG) {
  if (ids.has(m.id)) fail(m.id, 'duplicate id');
  ids.add(m.id);
  const key = `${m.repo}/${m.filename}`;
  if (modelFiles.has(key)) fail(m.id, `same model file as '${modelFiles.get(key)}'`);
  modelFiles.set(key, m.id);
}
for (const [alias, target] of Object.entries(MODEL_ID_ALIASES)) {
  if (ids.has(alias)) fail(alias, 'alias shadows a real id');
  if (!ids.has(target)) fail(alias, `alias points at unknown id '${target}'`);
}

const repoCache = new Map();
async function repoInfo(repo) {
  if (!repoCache.has(repo)) {
    const meta = await getJson(`https://huggingface.co/api/models/${repo}`);
    const tree = await getJson(`https://huggingface.co/api/models/${repo}/tree/main?recursive=true`);
    repoCache.set(repo, { gated: !!meta.gated, published: String(meta.createdAt ?? '').slice(0, 10), tree });
    await sleep(250);
  }
  return repoCache.get(repo);
}

/** Checks one Hub file. Returns { size, sha } or null after reporting a failure. */
async function checkFile(id, label, f) {
  const info = await repoInfo(f.repo);
  if (info.gated) return fail(id, `${label}: repo ${f.repo} is gated (needs login)`), null;
  const item = info.tree.find((x) => x.type === 'file' && x.path === f.filename);
  if (!item) return fail(id, `${label}: '${f.filename}' not found in ${f.repo}`), null;
  if (!item.lfs) return fail(id, `${label}: not an LFS object`), null;
  const size = item.lfs.size;
  const sha = item.lfs.oid;
  const probe = await range(resolveUrl(f.repo, f.filename), 0, 3);
  const total = Number(/\/(\d+)$/.exec(probe.contentRange)?.[1] ?? NaN);
  const magic = probe.body.subarray(0, 4).toString('ascii');
  if (probe.status !== 206 || total !== size || magic !== 'GGUF') {
    return fail(id, `${label}: download URL answered HTTP ${probe.status}, total ${total} (Hub ${size}), magic "${magic}"`), null;
  }
  if (!write && (f.sizeBytes !== size || f.sha256 !== sha)) {
    return fail(id, `${label}: catalog says ${f.sizeBytes} B / ${f.sha256 || '(no sha)'}, Hub says ${size} B / ${sha}`), null;
  }
  return { size, sha };
}

let text = readFileSync(dataPath, 'utf8');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function writeFileRecord(f, size, sha) {
  const re = new RegExp(`(repo: '${esc(f.repo)}', filename: '${esc(f.filename)}', sizeBytes: )[0-9_]+(, sha256: )'[0-9a-f]*'`, 'g');
  const pretty = String(size).replace(/\B(?=(\d{3})+(?!\d))/g, '_');
  const found = (text.match(re) ?? []).length > 0;
  text = text.replace(re, `$1${pretty}$2'${sha}'`);
  return found;
}
function writeEntryField(id, field, value) {
  const start = text.indexOf(`id: '${id}'`);
  const next = text.indexOf("id: '", start + 5);
  const end = next < 0 ? text.length : next;
  const block = text.slice(start, end);
  const re = new RegExp(`${field}: (?:'[^']*'|[0-9_]+)`);
  if (start < 0 || !re.test(block)) return false;
  const v = typeof value === 'number' ? String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '_') : `'${value}'`;
  text = text.slice(0, start) + block.replace(re, `${field}: ${v}`) + text.slice(end);
  return true;
}

for (const m of catalog) {
  try {
    const files = [['model', m], ...(m.mmproj ? [['mmproj', m.mmproj]] : []), ...(m.draft ? [['draft', m.draft]] : [])];
    const results = [];
    for (const [label, f] of files) {
      const r = await checkFile(m.id, label, f);
      results.push(r);
      if (r && write && !writeFileRecord(f, r.size, r.sha)) fail(m.id, `${label}: could not locate the file record in catalogData.ts`);
    }
    if (results.some((r) => r === null)) continue;

    // Model header: architecture, context, KV cost.
    const head = await readGgufHeader(resolveUrl(m.repo, m.filename), (kv) => {
      const a = kv['general.architecture'];
      return !!a && kv[`${a}.block_count`] !== undefined;
    });
    const arch = head['general.architecture'];
    const EXTENDED_ARCHS = new Set(['glm5-next']);
    if (ARCHS && !ARCHS.has(arch) && !EXTENDED_ARCHS.has(arch)) fail(m.id, `architecture '${arch}' is not in the bundled llama.cpp`);
    const ctx = head[`${arch}.context_length`];
    const kvb = kvBytesPerToken(head);
    if (!(kvb > 0)) fail(m.id, `could not compute KV bytes (arch ${arch})`);
    const published = (await repoInfo(m.repo)).published;
    if (write) {
      for (const [field, value] of [['kvBytesPerToken', kvb], ['contextLength', ctx], ['published', published]]) {
        if (!writeEntryField(m.id, field, value)) fail(m.id, `could not write ${field}`);
      }
    } else {
      if (m.kvBytesPerToken !== kvb) fail(m.id, `kvBytesPerToken ${m.kvBytesPerToken}, header says ${kvb}`);
      if (m.contextLength !== ctx) fail(m.id, `contextLength ${m.contextLength}, header says ${ctx}`);
      if (m.published !== published) fail(m.id, `published ${m.published}, Hub says ${published}`);
    }

    // Projector header: the Image / Voice tags must be backed by a real encoder.
    let tags = '';
    if (m.mmproj) {
      const p = await readGgufHeader(resolveUrl(m.mmproj.repo, m.mmproj.filename), () => true);
      const vision = p['clip.has_vision_encoder'] === true || p['general.architecture'] === 'glm5-next-vision';
      const audio = p['clip.has_audio_encoder'] === true;
      for (const t of [p['clip.projector_type'], p['clip.vision.projector_type'], p['clip.audio.projector_type']]) {
        if (t && PROJECTORS && !PROJECTORS.has(t)) fail(m.id, `projector type '${t}' is not in the bundled mtmd`);
      }
      if (m.capabilities.includes('Image') !== vision) fail(m.id, `Image tag ${m.capabilities.includes('Image')} but projector vision encoder ${vision}`);
      if (m.capabilities.includes('Voice') !== audio) fail(m.id, `Voice tag ${m.capabilities.includes('Voice')} but projector audio encoder ${audio}`);
      tags = ` mmproj[${vision ? 'vision' : ''}${audio ? '+audio' : ''}]`;
    } else if (m.capabilities.includes('Image') || m.capabilities.includes('Voice')) {
      fail(m.id, 'Image/Voice tag without a projector');
    }
    if (m.draft) {
      const d = await readGgufHeader(resolveUrl(m.draft.repo, m.draft.filename), (kv) => !!kv['general.architecture']);
      const da = d['general.architecture'];
      if (ARCHS && !ARCHS.has(da)) fail(m.id, `draft architecture '${da}' is not in the bundled llama.cpp`);
      tags += ` draft[${da}]`;
    }
    console.log(`  ok    ${m.id.padEnd(32)} ${arch.padEnd(10)} ctx ${String(ctx).padEnd(7)} kv ${String(kvb).padEnd(7)} ${(m.sizeBytes / 1e9).toFixed(2)} GB  ${head['general.size_label'] ?? ''}${tags}`);
  } catch (err) {
    fail(m.id, String(err?.message ?? err));
  }
}

if (write) {
  writeFileSync(dataPath, text);
  console.log('\ncatalogData.ts updated.');
}
console.log(problems === 0 ? `\nCatalog OK (${catalog.length} entries).` : `\n${problems} problem(s).`);
process.exit(problems === 0 ? 0 : 1);
