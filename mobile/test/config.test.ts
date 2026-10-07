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

test('config: builds only arm64 (every native module was being compiled four times)', () => {
  const plugin = appJson.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-build-properties');
  assert.ok(plugin, 'expo-build-properties plugin missing');
  assert.deepEqual(plugin[1].android.buildArchs, ['arm64-v8a']);
  assert.ok(appJson.plugins.includes('llama.rn'), 'llama.rn config plugin missing');
});

test('config: llama.rn is pinned to an exact stable version (no ^, no rc)', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.match(pkg.dependencies['llama.rn'], /^\d+\.\d+\.\d+$/);
});

test('config: no "draw over other apps" permission (Expo template adds it; a release build does not need it)', () => {
  assert.ok(appJson.android.blockedPermissions?.includes('android.permission.SYSTEM_ALERT_WINDOW'));
});

test('config: native splash never flashes white in dark mode (themed splash: warm light + dark variant)', () => {
  const plugin = appJson.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-splash-screen');
  assert.ok(plugin, 'expo-splash-screen plugin missing (the top-level "splash" key is legacy in SDK 57)');
  assert.ok(!('splash' in appJson), 'legacy top-level splash key should not be used');
  const luminance = (hex: string) => {
    const n = parseInt(hex.replace('#', ''), 16);
    return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  };
  const lightBg: string = plugin[1].backgroundColor;
  const darkBg: string = plugin[1].dark?.backgroundColor ?? lightBg;
  assert.ok(luminance(darkBg) < 0.15, `dark-mode splash background ${darkBg} must be dark`);
  assert.notEqual(lightBg.toLowerCase(), '#ffffff', 'light splash is the warm ivory, not template white');
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.ok(pkg.dependencies['expo-splash-screen'], 'expo-splash-screen must be installed for its plugin to run');
});

test('config: icon assets referenced by app.json exist', () => {
  const files = [appJson.icon, appJson.android.adaptiveIcon.foregroundImage, ...appJson.plugins.filter((p: unknown) => Array.isArray(p) && p[0] === 'expo-splash-screen').flatMap((p: any) => [p[1].image, p[1].dark?.image].filter(Boolean))];
  for (const f of files) assert.ok(readFileSync(join(root, f)).length > 1000, `${f} missing or empty`);
});

test('config: EAS "development" profile builds a real dev client APK (Metro over Wi-Fi needs expo-dev-client)', () => {
  const eas = JSON.parse(readFileSync(join(root, 'eas.json'), 'utf8'));
  const dev = eas.build.development;
  assert.equal(dev.developmentClient, true, 'without it the APK has no launcher to type/scan the Metro URL');
  assert.equal(dev.distribution, 'internal');
  assert.equal(dev.android.buildType, 'apk', 'an installable APK, not an AAB');
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.ok(pkg.dependencies['expo-dev-client'], 'expo-dev-client must be installed for developmentClient builds');
  assert.ok(pkg.dependencies['expo-device'], 'expo-device supplies the real RAM the fit logic needs');
});
