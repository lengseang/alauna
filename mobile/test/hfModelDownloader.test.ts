import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  HFModelResolver,
  Sha256Digest,
  computeStringSha256,
  computeBufferSha256,
  HFModelDownloader,
  HFResolverError,
  HFSha256MismatchError,
} from '../src/services/hfModelDownloader.ts';

describe('HFModelResolver', () => {
  it('resolves direct download URL for official Hugging Face repositories', () => {
    const llamaUrl = HFModelResolver.resolveDirectUrl(
      'bartowski/Meta-Llama-3.1-8B-Instruct-GGUF',
      'Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf'
    );
    assert.strictEqual(
      llamaUrl,
      'https://huggingface.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF/resolve/main/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf?download=true'
    );

    const qwenUrl = HFModelResolver.resolveDirectUrl(
      'Qwen/Qwen2.5-7B-Instruct-GGUF',
      'qwen2.5-7b-instruct-q4_k_m.gguf',
      'v1.0'
    );
    assert.strictEqual(
      qwenUrl,
      'https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/v1.0/qwen2.5-7b-instruct-q4_k_m.gguf?download=true'
    );
  });

  it('correctly parses GGUF quantization patterns', () => {
    assert.strictEqual(
      HFModelResolver.parseQuantization('Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf'),
      'Q4_K_M'
    );
    assert.strictEqual(
      HFModelResolver.parseQuantization('qwen2.5-7b-instruct-q8_0.gguf'),
      'Q8_0'
    );
    assert.strictEqual(
      HFModelResolver.parseQuantization('phi-3-mini-4k-instruct-IQ3_M.gguf'),
      'IQ3_M'
    );
    assert.strictEqual(
      HFModelResolver.parseQuantization('gemma-2-9b-it.BF16.gguf'),
      'BF16'
    );
    assert.strictEqual(
      HFModelResolver.parseQuantization('random-model-name.gguf'),
      'UNKNOWN'
    );
  });

  it('formats byte sizes into sovereign human-readable strings', () => {
    assert.strictEqual(HFModelResolver.formatBytes(0), '0 B');
    assert.strictEqual(HFModelResolver.formatBytes(1024), '1.00 KB');
    assert.strictEqual(HFModelResolver.formatBytes(524288000), '500.00 MB');
    assert.strictEqual(HFModelResolver.formatBytes(5284823040), '4.92 GB');
  });

  it('formats ETA seconds cleanly', () => {
    assert.strictEqual(HFModelResolver.formatSeconds(0), '--:--');
    assert.strictEqual(HFModelResolver.formatSeconds(45), '00:45');
    assert.strictEqual(HFModelResolver.formatSeconds(125), '02:05');
    assert.strictEqual(HFModelResolver.formatSeconds(3665), '1h 01m');
  });
});

describe('Sha256Digest (Pure TypeScript FIPS 180-4 Engine)', () => {
  it('matches NIST test vector for empty string', () => {
    const hash = computeStringSha256('');
    assert.strictEqual(
      hash,
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
  });

  it('matches NIST test vector for "abc"', () => {
    const hash = computeStringSha256('abc');
    assert.strictEqual(
      hash,
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  it('matches NIST test vector for standard pangram', () => {
    const hash = computeStringSha256('The quick brown fox jumps over the lazy dog');
    assert.strictEqual(
      hash,
      'd7a8fbb307d7809469ca9ab0b972857e2a945237b60565a855402e32d1632550'
    );
  });

  it('handles incremental multi-chunk streaming without buffer overflow', () => {
    const testString = 'The quick brown fox jumps over the lazy dog';
    const encoder = new TextEncoder();
    const fullBytes = encoder.encode(testString);

    const digest = new Sha256Digest();
    // Feed bytes in tiny 3-byte chunks to test chunk boundary transitions
    for (let i = 0; i < fullBytes.length; i += 3) {
      digest.update(fullBytes.subarray(i, Math.min(fullBytes.length, i + 3)));
    }

    assert.strictEqual(
      digest.digestHex(),
      'd7a8fbb307d7809469ca9ab0b972857e2a945237b60565a855402e32d1632550'
    );
  });
});

describe('HFModelDownloader', () => {
  it('initializes in idle state with accurate progress snapshot', () => {
    const downloader = new HFModelDownloader({
      repoId: 'bartowski/Meta-Llama-3.1-8B-Instruct-GGUF',
      filename: 'Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf',
    });

    assert.strictEqual(downloader.getStatus(), 'idle');
    const p = downloader.getProgress();
    assert.strictEqual(p.status, 'idle');
    assert.strictEqual(p.progress, 0);
    assert.strictEqual(p.bytesWritten, 0);
    assert.strictEqual(p.totalBytes, 0);
    assert.strictEqual(p.speedMBs, 0);
  });

  it('creates serializable resume state for persistent checkpointing', () => {
    const downloader = new HFModelDownloader({
      repoId: 'Qwen/Qwen2.5-7B-Instruct-GGUF',
      filename: 'qwen2.5-7b-instruct-q4_k_m.gguf',
      revision: 'main',
      expectedSha256: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    });

    const resumeState = downloader.getResumeState();
    assert.strictEqual(resumeState.repoId, 'Qwen/Qwen2.5-7B-Instruct-GGUF');
    assert.strictEqual(resumeState.filename, 'qwen2.5-7b-instruct-q4_k_m.gguf');
    assert.strictEqual(resumeState.expectedSha256, 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890');
    assert.ok(resumeState.partialFileUri.includes('.chiwiwi_part'));
  });

  it('throws typed HFSha256MismatchError on checksum failure', () => {
    const err = new HFSha256MismatchError('test.gguf', 'calc123', 'exp123');
    assert.strictEqual(err.name, 'HFSha256MismatchError');
    assert.strictEqual(err.calculatedHash, 'calc123');
    assert.strictEqual(err.expectedHash, 'exp123');
    assert.ok(err.message.includes('Integrity verification failed'));
  });
});
