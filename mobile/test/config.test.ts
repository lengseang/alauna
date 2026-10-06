import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const appJson = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8')).expo;
const storageSrc = readFileSync(join(root, 'src/services/storage.ts'), 'utf8');

test('config: APP_PACKAGE in storage.ts equals the Android package in app.json', () => {
  const m = /APP_PACKAGE\s*=\s*'([^']+)'/.exec(storageSrc);
  assert.ok(m, 'APP_PACKAGE constant not found');
  assert.equal(m![1], appJson.android.package);
});

test('config: only permissions that a shipped feature uses are declared', () => {
  const perms: string[] = appJson.android.permissions;
  const allowed = new Set([
    'android.permission.INTERNET', // model download from Hugging Face
    'android.permission.MANAGE_EXTERNAL_STORAGE', // external vault folder (Android 11+)
    'android.permission.READ_EXTERNAL_STORAGE', // external vault folder (Android 8-10)
    'android.permission.WRITE_EXTERNAL_STORAGE',
  ]);
  for (const p of perms) assert.ok(allowed.has(p), `unexpected permission ${p}`);
  // Features that do not exist must not ask for their permissions (honesty + privacy).
  for (const banned of ['RECORD_AUDIO', 'CAMERA', 'POST_NOTIFICATIONS', 'READ_MEDIA_IMAGES', 'READ_MEDIA_VIDEO', 'READ_MEDIA_AUDIO', 'FOREGROUND_SERVICE', 'WAKE_LOCK']) {
    assert.ok(!perms.some((p) => p.endsWith(banned)), `${banned} should not be requested`);
  }
});

test('config: builds only arm64 (the multi-hour build was 4 ABIs of llama.cpp)', () => {
  const plugin = appJson.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-build-properties');
  assert.ok(plugin, 'expo-build-properties plugin missing');
  assert.deepEqual(plugin[1].android.buildArchs, ['arm64-v8a']);
  assert.ok(appJson.plugins.includes('llama.rn'), 'llama.rn config plugin missing');
});

test('config: llama.rn is pinned to an exact stable version (no ^, no rc)', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.match(pkg.dependencies['llama.rn'], /^\d+\.\d+\.\d+$/);
});
