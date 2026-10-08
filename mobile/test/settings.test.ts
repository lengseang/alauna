import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, MAX_CONTEXT, sanitizeSettings } from '../src/core/settingsModel.ts';

test('settings: garbage input yields safe defaults and never throws', () => {
  for (const bad of [null, undefined, 5, 'x', [], true]) {
    assert.deepEqual(sanitizeSettings(bad), DEFAULT_SETTINGS);
  }
  // Defaults are returned as fresh objects (mutating a result must not corrupt the defaults).
  const a = sanitizeSettings(null);
  a.pad.pleasure = -1;
  a.verified.x = { at: 1, tokensPerSecond: 1, loadMs: 1 };
  assert.equal(DEFAULT_SETTINGS.pad.pleasure, 0.65);
  assert.deepEqual(DEFAULT_SETTINGS.verified, {});
});

test('settings: valid values round-trip; invalid fields fall back individually', () => {
  const good = {
    archetype: 'mentor', pad: { pleasure: 0.1, arousal: 0.2, dominance: 0.3 }, activeModelId: 'qwen3.5-4b',
    verified: { 'qwen3.5-4b': { at: 5, tokensPerSecond: 11.5, loadMs: 900 } },
    contextOverride: 4096, threads: 6, useGpu: true, thinkingEnabled: false, pendingMountModelId: 'qwen3.5-9b',
  };
  assert.deepEqual(sanitizeSettings(JSON.parse(JSON.stringify(good))), good);

  const s = sanitizeSettings({ archetype: 'wizard', pad: { pleasure: 'hot' }, contextOverride: 12, threads: 99, useGpu: 'yes', thinkingEnabled: 1, verified: { a: null, b: { at: 'x' }, c: { at: 3 } } });
  assert.equal(s.archetype, 'empath', 'unknown archetype');
  assert.deepEqual(s.pad, DEFAULT_SETTINGS.pad, 'incomplete pad');
  assert.equal(s.contextOverride, null, 'context below 512 rejected');
  assert.equal(s.threads, null, 'absurd thread count rejected');
  assert.equal(s.useGpu, false);
  assert.equal(s.thinkingEnabled, true);
  assert.deepEqual(Object.keys(s.verified), ['c']);
  assert.deepEqual(s.verified.c, { at: 3, tokensPerSecond: 0, loadMs: 0 });
});

test('settings: an absurd context size cannot make the engine allocate gigabytes of KV cache', () => {
  assert.equal(sanitizeSettings({ contextOverride: 10_000_000 }).contextOverride, MAX_CONTEXT);
  assert.equal(sanitizeSettings({ contextOverride: 4096.7 }).contextOverride, 4097);
  assert.equal(sanitizeSettings({ contextOverride: Infinity }).contextOverride, null);
  assert.equal(sanitizeSettings({ contextOverride: NaN }).contextOverride, null);
});
