import test from 'node:test';
import assert from 'node:assert/strict';
import { orphanedTemps, readWithFallback, writeAtomic, type FileIO } from '../src/core/atomicFile.ts';

/** In-memory directory that can be told to "die" (throw) at a chosen step, leaving the files exactly as a kill would. */
function fakeDir(dieAt?: 'write-half' | 'after-remove') {
  const files = new Map<string, string>();
  const io: FileIO = {
    exists: (n) => files.has(n),
    write(n, text) {
      if (dieAt === 'write-half' && n.endsWith('.tmp')) {
        files.set(n, text.slice(0, Math.floor(text.length / 2))); // truncated by the kill
        throw new Error('killed while writing');
      }
      files.set(n, text);
    },
    remove(n) {
      files.delete(n);
      if (dieAt === 'after-remove') throw new Error('killed after delete');
    },
    rename(from, to) {
      if (files.has(to)) throw new Error('target exists');
      const v = files.get(from);
      if (v === undefined) throw new Error('missing source');
      files.delete(from);
      files.set(to, v);
    },
    read: async (n) => {
      const v = files.get(n);
      if (v === undefined) throw new Error('ENOENT');
      return v;
    },
  };
  return { io, files };
}

const parseJson = (t: string) => JSON.parse(t) as { v: number };

test('atomic: a normal save replaces the file and leaves no temp behind', async () => {
  const d = fakeDir();
  writeAtomic(d.io, 'a.json', JSON.stringify({ v: 1 }));
  writeAtomic(d.io, 'a.json', JSON.stringify({ v: 2 }));
  assert.deepEqual([...d.files.keys()], ['a.json']);
  assert.equal((await readWithFallback(d.io, 'a.json', parseJson))?.v, 2);
});

test('atomic: killed while writing the temp file -> the OLD complete file is still what loads', async () => {
  const d = fakeDir('write-half');
  d.files.set('a.json', JSON.stringify({ v: 1 }));
  assert.throws(() => writeAtomic(d.io, 'a.json', JSON.stringify({ v: 2, padding: 'x'.repeat(50) })));
  assert.equal((await readWithFallback(d.io, 'a.json', parseJson))?.v, 1, 'the half-written temp is ignored (main parses)');
});

test('atomic: killed after deleting the old file but before the rename -> the complete temp copy is recovered', async () => {
  const d = fakeDir('after-remove');
  d.files.set('a.json', JSON.stringify({ v: 1 }));
  assert.throws(() => writeAtomic(d.io, 'a.json', JSON.stringify({ v: 2 })));
  assert.deepEqual([...d.files.keys()], ['a.json.tmp']);
  assert.equal((await readWithFallback(d.io, 'a.json', parseJson))?.v, 2, 'newest complete data wins');
  assert.deepEqual(orphanedTemps([...d.files.keys()]), ['a.json'], 'listing code can find such a file');
});

test('atomic: a truncated main file falls back to a complete temp copy; if neither parses the result is null (never throws)', async () => {
  const d = fakeDir();
  d.files.set('a.json', '{"v":');
  d.files.set('a.json.tmp', JSON.stringify({ v: 7 }));
  assert.equal((await readWithFallback(d.io, 'a.json', parseJson))?.v, 7);
  d.files.set('a.json.tmp', '{"v');
  assert.equal(await readWithFallback(d.io, 'a.json', parseJson), null);
  assert.equal(await readWithFallback(fakeDir().io, 'missing.json', parseJson), null);
  // A parser that rejects (returns null) moves on to the next copy.
  d.files.set('a.json', '{"v":1}');
  d.files.set('a.json.tmp', '{"v":2}');
  assert.equal((await readWithFallback(d.io, 'a.json', (t) => (JSON.parse(t).v === 1 ? null : JSON.parse(t))))?.v, 2);
});

test('atomic: orphanedTemps only reports temps whose main file is missing', () => {
  assert.deepEqual(orphanedTemps(['a.json', 'a.json.tmp', 'b.json.tmp', 'c.json']), ['b.json']);
  assert.deepEqual(orphanedTemps([]), []);
});
