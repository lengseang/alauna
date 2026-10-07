import test from 'node:test';
import assert from 'node:assert';
import { MMKVCache, CACHE_KEYS } from '../src/services/mmkvCache.ts';
import { MemoryEngine } from '../src/services/memoryEngine.ts';
import { cn } from '../src/lib/utils.ts';

test('MMKV Memory Cache: sub-millisecond synchronous set and get', () => {
  const start = performance.now();
  MMKVCache.setString('test_key', 'sovereign_value');
  const readBack = MMKVCache.getString('test_key');
  const elapsed = performance.now() - start;

  assert.strictEqual(readBack, 'sovereign_value');
  assert.ok(elapsed < 2.0, `MMKV read/write took ${elapsed}ms, expected sub-2ms`);
});

test('MMKV Memory Cache: JSON object storage & retrieval', () => {
  const testData = {
    archetype: 'challenger',
    pad: { pleasure: 0.2, arousal: 0.8, dominance: 0.9 },
    active: true,
  };

  MMKVCache.setObject('test_soul_state', testData);
  const retrieved = MMKVCache.getObject<typeof testData>('test_soul_state');

  assert.deepStrictEqual(retrieved, testData);
});

test('MMKV Thread Fast-Cache: sub-millisecond thread persistence and retrieval', () => {
  const thread = {
    id: 'thread_test_mmkv',
    title: 'MMKV Test Chat',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    soulConfig: {
      archetype: 'tactical',
      pad: { pleasure: 0.1, arousal: 0.85, dominance: 0.95 },
      toneIntensity: 0.8,
    },
    messages: [
      {
        id: 'msg_0',
        sender: 'assistant',
        text: 'Ready.',
        timestamp: Date.now(),
        tokenCountEst: 1,
      },
    ],
    compactedSummaries: [],
    totalTokensEst: 1,
    isIncognito: false,
  };

  const start = performance.now();
  MMKVCache.setObject(`${CACHE_KEYS.THREAD_PREFIX}${thread.id}`, thread);
  const loaded = MMKVCache.getObject<typeof thread>(`${CACHE_KEYS.THREAD_PREFIX}${thread.id}`);
  const elapsed = performance.now() - start;

  assert.ok(loaded !== null);
  assert.strictEqual(loaded?.id, thread.id);
  assert.strictEqual(loaded?.messages.length, 1);
  assert.ok(elapsed < 2.0, `Thread load took ${elapsed}ms`);
});

test('MemoryEngine with MMKV: cache synchronization and clearAll', async () => {
  MemoryEngine.addMemory('User runs Samsung Galaxy S23 Ultra hardware', 'entity', 0.9);
  const promptContext = MemoryEngine.formatPromptContext();

  assert.ok(promptContext.includes('Galaxy S23 Ultra'));

  const countBefore = MemoryEngine.getCount();
  assert.ok(countBefore > 0);

  MemoryEngine.clearAll();
  assert.strictEqual(MemoryEngine.getCount(), 0);
  assert.strictEqual(MemoryEngine.formatPromptContext(), '');
});

test('RN Reusables cn utility merges classes conditionally', () => {
  const result = cn('bg-black text-white', false && 'hidden', true && 'p-4', 'bg-zinc-900');
  // twMerge should override bg-black with bg-zinc-900 and include p-4
  assert.ok(result.includes('bg-zinc-900'));
  assert.ok(result.includes('text-white'));
  assert.ok(result.includes('p-4'));
  assert.ok(!result.includes('bg-black'));
});
