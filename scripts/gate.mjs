#!/usr/bin/env node
// Supervision gate: run before every commit/PR (`node scripts/gate.mjs`). Exit 1 = do not merge.
// Project quality gate: validates catalog integrity, verified models, and green test suite.
// Baselines live in docs/BASELINE.json. Raise them (never lower) with `node scripts/gate.mjs --update`.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

// Importing the catalog (.ts) needs type stripping: re-run ourselves with the flag when it is missing.
if (!process.execArgv.includes('--experimental-strip-types')) {
  const r = spawnSync(process.execPath, ['--no-warnings', '--experimental-strip-types', fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mobile = join(root, 'mobile');
const baselinePath = join(root, 'docs', 'BASELINE.json');
const fails = [];
const note = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails.push(msg); };

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (f !== 'node_modules') walk(p, out); } else if (/\.(ts|tsx)$/.test(f)) out.push(p);
  }
  return out;
}

// --- measure current state
const { MODEL_CATALOG } = await import(pathToFileURL(join(mobile, 'src/core/catalog.ts')).href);
const routesSrc = readFileSync(join(mobile, 'src/ui/routes.tsx'), 'utf8');
const routeCount = new Set([...routesSrc.matchAll(/^\s*'([a-z][a-z/]*)'\s*:/gm)].map((m) => m[1])).size;
const testCount = readdirSync(join(mobile, 'test')).filter((f) => f.endsWith('.test.ts')).length;
const current = { catalogEntries: MODEL_CATALOG.length, routes: routeCount, testFiles: testCount };

// --- 1. nothing removed (counts may only grow)
if (process.argv.includes('--update')) {
  writeFileSync(baselinePath, JSON.stringify(current, null, 2) + '\n');
  console.log('Baseline updated:', current);
  process.exit(0);
}
const base = JSON.parse(readFileSync(baselinePath, 'utf8'));
for (const k of Object.keys(base)) note(current[k] >= base[k], `${k}: ${current[k]} (baseline ${base[k]}) - removing features is not allowed`);

// --- 2. source rules
const files = walk(join(mobile, 'src'));
const radius = [], fakes = [];
const FAKE = [/Snapdragon NPU/i, /Thought for 1\.2s/, /\b2\.8x\b/, /86\.4%/];
for (const f of files) {
  const s = readFileSync(f, 'utf8');
  for (const m of s.matchAll(/borderRadius\s*:\s*([1-9]\d*)/g)) radius.push(`${f.replace(root, '')}: borderRadius ${m[1]}`);
  for (const re of FAKE) if (re.test(s)) fakes.push(`${f.replace(root, '')}: ${re}`);
}
note(radius.length === 0, `no rounded corners${radius.length ? '\n  ' + radius.slice(0, 10).join('\n  ') : ''}`);
note(fakes.length === 0, `no known fake status text${fakes.length ? '\n  ' + fakes.join('\n  ') : ''}`);

// --- 3. real checks (PowerShell/npm): typecheck + tests, catalog sanity offline
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const r = spawnSync(npm, ['run', 'check'], { cwd: mobile, encoding: 'utf8', shell: true });
note(r.status === 0, 'npm run check (typecheck + tests)');
if (r.status !== 0) console.log((r.stdout + r.stderr).split('\n').slice(-25).join('\n'));

console.log(fails.length ? `\nGATE FAILED (${fails.length})` : '\nGATE PASSED');
console.log('Still do by hand: `node scripts/verify-catalog.mjs` (network) if the catalog changed, and the Android export:');
console.log('  cd mobile; npx expo export --platform android --output-dir $env:TEMP\\exp');
process.exit(fails.length ? 1 : 0);
