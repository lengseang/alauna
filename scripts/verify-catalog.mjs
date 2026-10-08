#!/usr/bin/env node
/**
 * Verifies every model in mobile/src/core/catalog.ts against the live Hugging Face Hub.
 *
 *   node scripts/verify-catalog.mjs            # check only (exit 1 on any problem)
 *   node scripts/verify-catalog.mjs --write    # also write exact sizes + sha256 back into catalog.ts
 *
 * Checks per entry: repo reachable & ungated, file exists, is a real GGUF (LFS),
 * size/sha256 match (or are filled in with --write), the resolve URL answers a Range request
 * with 206 + the right total + the "GGUF" magic, and no two entries share a file.
 * Needs Node >= 22.6 (type stripping; the script re-launches itself with the flag when needed)
 * and network access to huggingface.co. Works on Windows, macOS and Linux.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const catalogPath = join(here, '..', 'mobile', 'src', 'core', 'catalog.ts');

// import() needs a file:// URL (a bare "D:\..." path fails on Windows), and Node < 22.18 needs a flag to load .ts.
let MODEL_CATALOG;
try {
  ({ MODEL_CATALOG } = await import(pathToFileURL(catalogPath).href));
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

    // The URL the app downloads from must really serve the file: Range works (206), total matches, first bytes are "GGUF".
    const probe = await fetch(`https://huggingface.co/${m.repo}/resolve/main/${m.filename}?download=true`, { headers: { Range: 'bytes=0-3' } });
    const total = Number(/\/(\d+)$/.exec(probe.headers.get('content-range') ?? '')?.[1] ?? NaN);
    const magic = Buffer.from(await probe.arrayBuffer()).subarray(0, 4).toString('ascii');
    if (probe.status !== 206 || total !== size || magic !== 'GGUF') {
      fail(m.id, `download URL: HTTP ${probe.status}, content-range total ${total} (Hub ${size}), magic "${magic}"`);
      continue;
    }
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
