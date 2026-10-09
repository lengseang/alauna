import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/core/store.ts';
import {
  type SoulDefinition,
  sanitizeSoul,
  duplicateSoulDef,
  exportSoulDefJson,
  importSoulDefJson,
} from '../src/core/soulSchema.ts';
import { getBuiltInSoul, BUILT_IN_SOULS } from '../src/core/builtInSouls.ts';
import { initThreadEmotionalState, type ThreadEmotionalState } from '../src/core/soulRuntime.ts';

interface PureSoulState {
  customSouls: Record<string, SoulDefinition>;
  favoriteIds: string[];
  emotionalStates: Record<string, ThreadEmotionalState>;
}

test('pure soul store: retrieves built-ins and active default soul', () => {
  const sage = getBuiltInSoul('soul_sage');
  assert.ok(sage);
  assert.equal(sage.name, 'Sovereign Sage');
});

test('pure soul store: saves, duplicates, and deletes custom souls', () => {
  const store = createStore<PureSoulState>({
    customSouls: {},
    favoriteIds: ['soul_sage'],
    emotionalStates: {},
  });

  const sage = getBuiltInSoul('soul_sage')!;
  const clone = duplicateSoulDef(sage, 'Cloned Sage');
  assert.ok(clone);
  assert.equal(clone.name, 'Cloned Sage');
  assert.equal(clone.type, 'custom');
  assert.notEqual(clone.id, 'soul_sage');

  // Save clone
  store.setState((s) => ({ customSouls: { ...s.customSouls, [clone.id]: clone } }));
  assert.ok(store.getState().customSouls[clone.id]);
  assert.equal(store.getState().customSouls[clone.id].name, 'Cloned Sage');

  // Delete clone
  const updated = { ...store.getState().customSouls };
  delete updated[clone.id];
  store.setState({ customSouls: updated });
  assert.equal(store.getState().customSouls[clone.id], undefined);
});

test('pure soul store: favorites toggle and persistence', () => {
  const store = createStore<PureSoulState>({
    customSouls: {},
    favoriteIds: ['soul_sage'],
    emotionalStates: {},
  });

  const toggleFav = (id: string) => {
    const favs = store.getState().favoriteIds;
    const next = favs.includes(id) ? favs.filter((f) => f !== id) : [...favs, id];
    store.setState({ favoriteIds: next });
  };

  assert.ok(store.getState().favoriteIds.includes('soul_sage'));
  toggleFav('soul_rebel');
  assert.ok(store.getState().favoriteIds.includes('soul_rebel'));
  toggleFav('soul_rebel');
  assert.ok(!store.getState().favoriteIds.includes('soul_rebel'));
});

test('pure soul store: exportSoulJson and importSoulJson roundtrip', () => {
  const analyst = getBuiltInSoul('soul_analyst')!;
  const exported = exportSoulDefJson(analyst);
  assert.ok(exported);
  const parsed = JSON.parse(exported);
  assert.equal(parsed.name, 'Tactical Analyst');

  const imported = importSoulDefJson(exported);
  assert.ok(imported);
  assert.equal(imported.type, 'imported');
  assert.equal(imported.identity.name, 'Tactical Analyst');
  assert.notEqual(imported.id, 'soul_analyst');
});

test('pure soul store: manages thread emotional runtime states', () => {
  const sage = getBuiltInSoul('soul_sage')!;
  const state = initThreadEmotionalState('thread_test_1', sage);
  assert.equal(state.threadId, 'thread_test_1');
  assert.equal(state.soulId, sage.id);
  assert.equal(state.activeEmotions['calm'], 85);
});
