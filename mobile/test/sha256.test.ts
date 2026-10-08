import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { Sha256Digest, computeBufferSha256 } from '../src/core/sha256.ts';

test('sha256: matches node:crypto for every length 0..300 (padding boundaries)', () => {
  for (let len = 0; len <= 300; len++) {
    const b = randomBytes(len);
    assert.equal(computeBufferSha256(new Uint8Array(b)), createHash('sha256').update(b).digest('hex'), `len ${len}`);
  }
});

test('sha256: chunked updates with awkward chunk sizes equal one-shot', () => {
  const b = randomBytes(100_000);
  const want = createHash('sha256').update(b).digest('hex');
  for (const chunk of [1, 7, 63, 64, 65, 1000, 4096, 65_537]) {
    const d = new Sha256Digest();
    for (let o = 0; o < b.length; o += chunk) d.update(new Uint8Array(b.subarray(o, o + chunk)));
    assert.equal(d.digestHex(), want, `chunk ${chunk}`);
  }
});

test('sha256: known vector and use-after-finalize guard', () => {
  assert.equal(
    computeBufferSha256(new TextEncoder().encode('abc')),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
  const d = new Sha256Digest();
  d.update(new Uint8Array([1, 2, 3]));
  const h = d.digestHex();
  assert.equal(d.digestHex(), h, 'idempotent');
  assert.throws(() => d.update(new Uint8Array([4])));
});
