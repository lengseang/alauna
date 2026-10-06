#!/usr/bin/env node
/**
 * Verifies every model in mobile/src/core/catalog.ts against the live Hugging Face Hub.
 *
 *   node scripts/verify-catalog.mjs            # check only (exit 1 on any problem)
 *   node scripts/verify-catalog.mjs --write    # also write exact sizes + sha256 back into catalog.ts
 *
 * Checks per entry: repo reachable & ungated, file exists, is a real GGUF (LFS),
 * size/sha256 match (or are filled in with --write), and no two entries share a file.
 * Needs Node >= 22.6 (type stripping) and network access to huggingface.co.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const catalogPath = join(here, '..', 'mobile', 'src', 'core', 'catalog.ts');
const { MODEL_CATALOG } = await import(catalogPath);

const write = process.argv.includes('--write');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let problems = 0;
const fail = (id, msg) => {
  problems++;
  console.log(`  FAIL  ${id.padEnd(30)} ${msg}`);
};

async function getJson(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url);
    if (res.status === 429) {
      await sleep(4000 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
  }
  throw new Error(`Rate limited: ${url}`);
}

// duplicate-file check
const seen = new Map();
for (const m of MODEL_CATALOG) {
  const key = `${m.repo}/${m.filename}`;
  if (seen.has(key)) fail(m.id, `same file as '${seen.get(key)}'`);
  seen.set(key, m.id);
}
const ids = new Set();
for (const m of MODEL_CATALOG) {
  if (ids.has(m.id)) fail(m.id, 'duplicate id');
  ids.add(m.id);
}

let text = readFileSync(catalogPath, 'utf8');
const treeCache = new Map();

for (const m of MODEL_CATALOG) {
  try {
    let info = treeCache.get(m.repo);
    if (!info) {
      const meta = await getJson(`https://huggingface.co/api/models/${m.repo}`);
      const tree = await getJson(`https://huggingface.co/api/models/${m.repo}/tree/main`);
      info = { gated: !!meta.gated, tree };
      treeCache.set(m.repo, info);
      await sleep(500);
    }
    if (info.gated) {
      fail(m.id, `repo ${m.repo} is gated (needs login)`);
      continue;
    }
    const file = info.tree.find((f) => f.path === m.filename);
    if (!file) {
      fail(m.id, `file '${m.filename}' not found in ${m.repo}`);
      continue;
    }
    if (!file.lfs) {
      fail(m.id, 'file is not an LFS object (not a real GGUF?)');
      continue;
    }
    const size = file.lfs.size;
    const sha = file.lfs.oid;
    const sizeOk = size === m.sizeBytes;
    const shaOk = !m.sha256 || m.sha256 === sha;
    if (write) {
      const entry = new RegExp(
        `(repo: '${m.repo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}',\\s*filename: '${m.filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}',\\s*sizeBytes: )[0-9_]+(,\\s*sha256: )'[0-9a-f]*'`,
      );
      if (!entry.test(text)) {
        fail(m.id, 'could not locate entry in catalog.ts for --write');
        continue;
      }
      const pretty = String(size).replace(/\B(?=(\d{3})+(?!\d))/g, '_');
      text = text.replace(entry, `$1${pretty}$2'${sha}'`);
      console.log(`  wrote ${m.id.padEnd(30)} ${size} B  ${sha.slice(0, 12)}…`);
    } else if (!sizeOk || !shaOk) {
      fail(m.id, `catalog says ${m.sizeBytes} B / ${m.sha256 || '(no sha)'}, Hub says ${size} B / ${sha}`);
    } else {
      console.log(`  ok    ${m.id.padEnd(30)} ${(size / 1e9).toFixed(2)} GB`);
    }
  } catch (err) {
    fail(m.id, String(err.message ?? err));
  }
}

if (write) {
  writeFileSync(catalogPath, text);
  console.log('\ncatalog.ts updated.');
}
console.log(problems === 0 ? '\nCatalog OK.' : `\n${problems} problem(s).`);
process.exit(problems === 0 ? 0 : 1);
