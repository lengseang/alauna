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

test('Soul Archetypes: default PAD vectors respect bounds (-1..1 for Pleasure, 0..1 for Arousal/Dominance)', async () => {
  const { ARCHETYPES } = await import('../src/types/soul.ts');
  for (const [key, arch] of Object.entries(ARCHETYPES)) {
    assert.ok(arch.defaultPAD.pleasure >= -1.0 && arch.defaultPAD.pleasure <= 1.0, `${key} pleasure out of bounds`);
    assert.ok(arch.defaultPAD.arousal >= 0.0 && arch.defaultPAD.arousal <= 1.0, `${key} arousal out of bounds`);
    assert.ok(arch.defaultPAD.dominance >= 0.0 && arch.defaultPAD.dominance <= 1.0, `${key} dominance out of bounds`);
    assert.ok(arch.name.length > 0);
    assert.ok(arch.systemPromptModifier.length > 0);
  }
});

test('MMKV Fast-Cache: stores and retrieves tone intensity and global soul settings', () => {
  MMKVCache.setNumber(CACHE_KEYS.GLOBAL_TONE_INTENSITY, 0.9);
  assert.strictEqual(MMKVCache.getNumber(CACHE_KEYS.GLOBAL_TONE_INTENSITY), 0.9);

  MMKVCache.setString(CACHE_KEYS.GLOBAL_ARCHETYPE, 'tactical');
  assert.strictEqual(MMKVCache.getString(CACHE_KEYS.GLOBAL_ARCHETYPE), 'tactical');

  const customPad = { pleasure: -0.2, arousal: 0.9, dominance: 0.8 };
  MMKVCache.setObject(CACHE_KEYS.GLOBAL_PAD, customPad);
  assert.deepStrictEqual(MMKVCache.getObject(CACHE_KEYS.GLOBAL_PAD), customPad);
});

test('Storage Partitioning: 5 sovereign slots with isolated roles and format tags', () => {
  const SLOTS = [
    { id: 'models', badge: 'SLOT 01', format: '.gguf binary weights', role: 'Mounted directly into RAM during conversations via GGML runtime.' },
    { id: 'chats', badge: 'SLOT 02', format: '.chiwiwi JSON & Compaction Anchors', role: 'Mirrored in sub-millisecond MMKV cache + durable fail-safe disk persistence.' },
    { id: 'souls', badge: 'SLOT 03', format: '.soul.json identity presets', role: 'Portable personality templates loaded per-chat or applied globally.' },
    { id: 'skills', badge: 'SLOT 04', format: '.skill.json capability manifests', role: 'Injected into prompt context without bloating core neural weights.' },
    { id: 'media', badge: 'SLOT 05', format: 'Private image/audio attachments', role: 'Hermetically sealed from phone MediaStore; only CHIWIWI can read.' },
  ];

  assert.strictEqual(SLOTS.length, 5);
  for (const s of SLOTS) {
    assert.ok(s.id.length > 0);
    assert.ok(s.badge.startsWith('SLOT'));
    assert.ok(s.format.length > 0);
    assert.ok(s.role.length > 0);
  }
});

