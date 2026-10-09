/** Settings screens: the pure helpers behind them (labels, choice lists, speech-model lines, diagnostics). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { BATCH_CHOICES, CTX_CHOICES, buildDiagnostics, describeVerifyMode, labelDays, labelMinutes, labelVerifyMode, languageName, oneDecimal, slotLine, speechFraction, speechLine, vadPresetFor, VERIFY_MODE_CHOICES, wholeMs } from '../src/ui/settings/logic.ts';

test('choice lists match the ranges the settings model accepts', () => {
  assert.equal(CTX_CHOICES[0], null);
  assert.ok(CTX_CHOICES.slice(1).every((n) => n !== null && n >= 512 && n <= 32768));
  assert.ok(BATCH_CHOICES.every((n) => n >= 32 && n <= 2048));
  assert.deepEqual(VERIFY_MODE_CHOICES, ['background', 'always', 'off']);
});

test('labels', () => {
  assert.equal(labelDays(0), 'Off');
  assert.equal(labelDays(1), '1 day');
  assert.equal(labelDays(30), '30 days');
  assert.equal(labelMinutes(0), 'Immediately');
  assert.equal(labelMinutes(1), 'After 1 minute');
  assert.equal(labelMinutes(15), 'After 15 minutes');
  assert.equal(languageName('km'), 'Khmer');
  assert.equal(languageName('xx'), 'xx');
  assert.equal(labelVerifyMode('background'), 'Background check');
  assert.equal(labelVerifyMode('always'), 'Block until verified');
  assert.equal(labelVerifyMode('off'), 'Off');
  assert.match(describeVerifyMode('background'), /background/i);
  assert.match(describeVerifyMode('always'), /blocks until/i);
  assert.match(describeVerifyMode('off'), /skips verification/i);
});

test('numbers: nothing measured stays null', () => {
  assert.equal(wholeMs(null), null);
  assert.equal(wholeMs(Number.NaN), null);
  assert.equal(wholeMs(412.6), 413);
  assert.equal(oneDecimal(undefined), null);
  assert.equal(oneDecimal(12.345), '12.3');
});

test('VAD pills: High 0.3 / Normal 0.5 / Low 0.8, anything else is custom', () => {
  assert.equal(vadPresetFor(0.3), 'High');
  assert.equal(vadPresetFor(0.5), 'Normal');
  assert.equal(vadPresetFor(0.8), 'Low');
  assert.equal(vadPresetFor(0.55), null);
});

test('slotLine says what is unknown instead of guessing', () => {
  const base = { usedBytes: 6_500_000_000, modelBytes: 6_100_000_000, modelFiles: 3, freeBytes: null, available: true };
  assert.match(slotLine(base), /3 models/);
  assert.match(slotLine(base), /free space unknown/);
  assert.match(slotLine({ ...base, freeBytes: 7_400_000_000 }), /7\.40 GB free/);
  assert.match(slotLine({ ...base, available: false }), /Not available/);
  assert.match(slotLine({ ...base, modelFiles: 1, usedBytes: 6_100_000_000, freeBytes: 1e9 }), /^1 model,/);
});

test('speech model lines and progress', () => {
  const s = { status: 'downloading' as const, receivedBytes: 50e6, totalBytes: 100e6, bytesPerSecond: 5e6, etaSeconds: 10, verifyProgress: 0 };
  assert.equal(speechFraction(s), 0.5);
  assert.match(speechLine(s), /Downloading 50%/);
  assert.equal(speechFraction({ ...s, status: 'verifying', verifyProgress: 0.25 }), 0.25);
  assert.equal(speechFraction({ ...s, status: 'installed' }), null);
  assert.match(speechLine({ ...s, status: 'absent', receivedBytes: 0 }), /Not downloaded/);
  assert.match(speechLine({ ...s, status: 'paused' }), /Paused at 50%/);
});

test('diagnostics: sections, yes/no, and n/a for missing values', () => {
  const text = buildDiagnostics(
    [
      { title: 'Phone', rows: [['Name', 'Pixel'], ['Memory', null]] },
      { title: 'Engine', rows: [['GPU', false], ['Speed', 12.5], ['Error', '']] },
    ],
    new Date('2026-10-08T00:00:00Z'),
  );
  assert.match(text, /^CHIWIWI diagnostics · 2026-10-08T00:00:00.000Z/);
  assert.match(text, /== Phone ==\nName: Pixel\nMemory: n\/a/);
  assert.match(text, /GPU: no\nSpeed: 12.5\nError: n\/a/);
});
