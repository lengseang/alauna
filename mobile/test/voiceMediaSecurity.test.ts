import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanTranscript, MAX_SENTENCE_CHARS, nextSentences, toSpeakable } from '../src/core/voiceChunker.ts';
import { IDLE_VOICE, voiceReducer, type VoiceEffect, type VoiceEvent, type VoiceLoopOptions, type VoiceLoopState } from '../src/core/voiceLoop.ts';
import {
  DEFAULT_VOICE_PREFS,
  KOKORO_MODEL,
  SPEECH_MODELS,
  STT_MODELS,
  VAD_MODEL,
  getSpeechModel,
  sanitizeVoicePrefs,
  speechModelUrl,
  vadOptionsFor,
  voiceNeedsNetwork,
  whisperLanguage,
} from '../src/core/voiceModels.ts';
import { DEFAULT_SECURITY_PREFS, lockMethodFrom, sanitizeSecurityPrefs, shouldLockOnResume } from '../src/core/appLock.ts';
import { classifyFile, looksBinary, safeName, sniffImage, type TextAttachment } from '../src/core/attachmentRules.ts';
import type { Attachment } from '../src/core/chatTypes.ts';

// ------------------------------------------------------------------ chunker

/** Feed `full` in slices (like coalesced chat updates) and collect every sentence. */
function stream(full: string, step: number): string[] {
  const out: string[] = [];
  let from = 0;
  for (let i = step; i < full.length + step; i += step) {
    const r = nextSentences(full.slice(0, i), from, false);
    out.push(...r.sentences);
    from = r.next;
  }
  out.push(...nextSentences(full, from, true).sentences);
  return out;
}

test('chunker: whole sentences, every one per update, same result at any streaming granularity', () => {
  const full = 'Hello there! How are you? I am fine. Thanks';
  const expected = ['Hello there!', 'How are you?', 'I am fine.', 'Thanks'];
  for (const step of [1, 2, 3, 7, 100]) assert.deepEqual(stream(full, step), expected, `step ${step}`);
  // One update containing two sentence ends returns both (the old chunker returned one per token).
  assert.deepEqual(nextSentences('One. Two. Thr', 0, false).sentences, ['One.', 'Two.']);
});

test('chunker: a trailing period waits for the next character (it might be "3.14")', () => {
  assert.deepEqual(nextSentences('Pi is 3.', 0, false).sentences, []);
  assert.deepEqual(stream('Pi is 3.14 roughly. Next.', 1), ['Pi is 3.14 roughly.', 'Next.']);
});

test('chunker: abbreviations, initials and list numbers do not end a sentence', () => {
  assert.deepEqual(stream('Ask Dr. Smith, e.g. on Monday. Done.', 1), ['Ask Dr. Smith, e.g. on Monday.', 'Done.']);
  assert.deepEqual(stream('J. R. R. Tolkien wrote it. Yes.', 2), ['J. R. R. Tolkien wrote it.', 'Yes.']);
  assert.deepEqual(stream('Steps:\n1. Boil water\n2. Add tea\n', 1), ['Steps:', 'Boil water', 'Add tea']);
});

test('chunker: code blocks are not read aloud, markdown symbols are stripped', () => {
  const full = 'Run this:\n```js\nconsole.log("a. b. c.");\n```\nThat **prints** text. See [docs](https://x.y/z).';
  assert.deepEqual(stream(full, 3), ['Run this:', 'That prints text.', 'See docs.']);
  // While the block is still streaming nothing after the fence is emitted.
  assert.deepEqual(nextSentences('Code:\n```py\nx = 1. ', 0, false).sentences, ['Code:']);
  assert.equal(toSpeakable('---'), '');
  assert.equal(toSpeakable('## Title'), 'Title');
});

test('chunker: very long runs without punctuation are split at a comma/space so speech starts quickly', () => {
  const long = Array.from({ length: 80 }, (_, i) => `word${i}`).join(' ');
  const parts = stream(long, 5);
  assert.ok(parts.length >= 2);
  for (const p of parts) assert.ok(p.length <= MAX_SENTENCE_CHARS);
  assert.equal(parts.join(' '), long);
});

test('chunker: CJK full stops split without a following space', () => {
  assert.deepEqual(stream('你好。今天很好！', 1), ['你好。', '今天很好！']);
});

test('transcript cleanup removes whisper non-speech tags', () => {
  assert.equal(cleanTranscript(' [BLANK_AUDIO] '), '');
  assert.equal(cleanTranscript('(music) Hello *coughs* world [Music]'), 'Hello world');
});

// ------------------------------------------------------------------ voice loop

const OPTS: VoiceLoopOptions = { tts: true, bargeIn: true, continuous: true };

function run(events: VoiceEvent[], opts = OPTS, start: VoiceLoopState = IDLE_VOICE) {
  let state = start;
  const effects: VoiceEffect[] = [];
  const phases: string[] = [];
  for (const e of events) {
    const t = voiceReducer(state, e, opts);
    state = t.state;
    effects.push(...t.effects);
    phases.push(state.phase);
  }
  return { state, effects, phases };
}

test('voice loop: full turn idle -> listening -> transcribing -> thinking -> speaking -> listening', () => {
  const r = run([
    { type: 'start' },
    { type: 'speechStart' },
    { type: 'partial', text: 'what is' },
    { type: 'speechEnd' },
    { type: 'final', text: ' What is the time? ' },
    { type: 'reply', text: '', done: false },
    { type: 'reply', text: 'It is noon. Have', done: false },
    { type: 'reply', text: 'It is noon. Have a nice day.', done: true },
    { type: 'utteranceDone' },
    { type: 'utteranceDone' },
  ]);
  assert.deepEqual(r.phases, ['listening', 'listening', 'listening', 'transcribing', 'thinking', 'thinking', 'speaking', 'speaking', 'speaking', 'listening']);
  assert.deepEqual(r.effects, [
    { type: 'listen' },
    { type: 'send', text: 'What is the time?' },
    { type: 'speak', text: 'It is noon.' },
    { type: 'speak', text: 'Have a nice day.' },
    { type: 'listen' },
  ]);
  assert.equal(r.state.turns, 1);
  assert.equal(r.state.heard, '');
});

test('voice loop: barge-in while speaking stops TTS + the reply and listens', () => {
  const r = run([
    { type: 'start' },
    { type: 'final', text: 'Tell me a story' },
    { type: 'reply', text: 'Once upon a time. There', done: false },
    { type: 'speechStart' },
    { type: 'reply', text: 'Once upon a time. There was a king.', done: false }, // late tokens of the cancelled reply
  ]);
  assert.equal(r.state.phase, 'listening');
  assert.deepEqual(r.effects.slice(-2), [{ type: 'silence' }, { type: 'cancelReply' }]);
  assert.equal(r.effects.filter((e) => e.type === 'speak').length, 1, 'cancelled reply is not spoken any more');
});

test('voice loop: without barge-in the mic is muted while busy and speech is ignored', () => {
  const opts = { ...OPTS, bargeIn: false };
  const r = run([{ type: 'start' }, { type: 'final', text: 'hi' }, { type: 'speechStart' }, { type: 'final', text: 'echo' }], opts);
  assert.equal(r.state.phase, 'thinking');
  assert.deepEqual(r.effects, [{ type: 'listen' }, { type: 'mute' }, { type: 'send', text: 'hi' }]);
});

test('voice loop: TTS off = reply shown, not spoken; one-shot mode goes idle after the reply', () => {
  const r = run([{ type: 'start' }, { type: 'final', text: 'hi' }, { type: 'reply', text: 'Hello. Bye.', done: true }], { ...OPTS, tts: false, continuous: false });
  assert.equal(r.state.phase, 'idle');
  assert.equal(r.state.reply, 'Hello. Bye.');
  assert.ok(!r.effects.some((e) => e.type === 'speak'));
  assert.deepEqual(r.effects.at(-1), { type: 'mute' });
});

test('voice loop: noise-only transcripts keep listening; errors and stop are honest', () => {
  const noise = run([{ type: 'start' }, { type: 'speechEnd' }, { type: 'final', text: '[BLANK_AUDIO]' }]);
  assert.equal(noise.state.phase, 'listening');
  assert.ok(!noise.effects.some((e) => e.type === 'send'));

  const failed = run([{ type: 'start' }, { type: 'final', text: 'hi' }, { type: 'replyFailed', message: 'No model selected yet.' }]);
  assert.equal(failed.state.phase, 'error');
  assert.equal(failed.state.error, 'No model selected yet.');
  // Retry from the error state.
  assert.equal(voiceReducer(failed.state, { type: 'start' }, OPTS).state.phase, 'listening');

  const stopped = run([{ type: 'start' }, { type: 'final', text: 'hi' }, { type: 'reply', text: 'Sure. B', done: false }, { type: 'stop' }]);
  assert.equal(stopped.state.phase, 'idle');
  assert.deepEqual(stopped.effects.slice(-3), [{ type: 'mute' }, { type: 'silence' }, { type: 'cancelReply' }]);

  const micFail = run([{ type: 'start' }, { type: 'fail', message: 'Microphone permission denied.' }]);
  assert.equal(micFail.state.phase, 'error');
});

test('voice loop: an empty finished reply (e.g. a "remember" command) ends the turn', () => {
  const r = run([{ type: 'start' }, { type: 'final', text: 'remember I like tea' }, { type: 'reply', text: '', done: true }]);
  assert.equal(r.state.phase, 'listening');
  assert.equal(r.state.turns, 1);
});

// ------------------------------------------------------------------ speech models + prefs

test('speech models: verified HF files (exact size + sha256), unique ids, tiny/base/small in .en + multilingual', () => {
  assert.equal(new Set(SPEECH_MODELS.map((m) => m.id)).size, SPEECH_MODELS.length);
  for (const m of SPEECH_MODELS) {
    assert.match(m.sha256, /^[0-9a-f]{64}$/, m.id);
    assert.ok(Number.isInteger(m.bytes) && m.bytes > 500_000, m.id);
    if (m.kind === 'stt' || m.kind === 'vad') {
      assert.match(speechModelUrl(m), /^https:\/\/huggingface\.co\/[\w.-]+\/[\w.-]+\/resolve\/main\/ggml-[\w.-]+\.bin$/);
    } else {
      assert.match(speechModelUrl(m), /^https:\/\/huggingface\.co\/[\w.-]+\/[\w.-]+\/resolve\/main\/[\w.-/]+$/);
    }
  }
  for (const size of ['tiny', 'base', 'small']) {
    assert.ok(STT_MODELS.some((m) => m.id.includes(size) && m.englishOnly), `${size}.en`);
    assert.ok(STT_MODELS.some((m) => m.id.includes(size) && !m.englishOnly), `${size} multilingual`);
  }
  assert.equal(VAD_MODEL.kind, 'vad');
  assert.equal(KOKORO_MODEL.kind, 'tts');
  assert.equal(getSpeechModel(DEFAULT_VOICE_PREFS.sttModelId)?.kind, 'stt');
});

test('voice prefs: corrupt values fall back, ranges are clamped, English-only models force "en"', () => {
  assert.deepEqual(sanitizeVoicePrefs(null), DEFAULT_VOICE_PREFS);
  const p = sanitizeVoicePrefs({ sttModelId: 'silero-vad-v6.2.0', vadThreshold: 7, endOfSpeechMs: 'x', ttsVoice: '', ttsRate: 0.5, language: 'DROP TABLE' });
  assert.equal(p.sttModelId, DEFAULT_VOICE_PREFS.sttModelId, 'the VAD model is not an STT model');
  assert.equal(p.vadThreshold, 0.95);
  assert.equal(p.endOfSpeechMs, 800);
  assert.equal(p.ttsVoice, null);
  assert.equal(p.ttsRate, 0.5);
  assert.equal(p.language, 'auto');
  assert.equal(whisperLanguage(getSpeechModel('whisper-base.en')!, { language: 'km' }), 'en');
  assert.equal(whisperLanguage(getSpeechModel('whisper-base')!, { language: 'km' }), 'km');
  assert.deepEqual(vadOptionsFor({ vadThreshold: 0.3, endOfSpeechMs: 900 }).threshold, 0.3);
  assert.equal(vadOptionsFor({ vadThreshold: 0.3, endOfSpeechMs: 900 }).minSilenceDurationMs, 900);
});

test('TTS voices: network vs on-device read from the Android voice name', () => {
  assert.equal(voiceNeedsNetwork('en-us-x-iob-network'), true);
  assert.equal(voiceNeedsNetwork('en-us-x-iob-local'), false);
  assert.equal(voiceNeedsNetwork('en-US-language'), null);
});

// ------------------------------------------------------------------ app lock

test('app lock: locks only when enabled and away long enough; corrupt prefs are safe', () => {
  const on = { appLock: true, lockAfterMinutes: 5 };
  assert.equal(shouldLockOnResume(on, null, 1e6), false, 'never left the foreground');
  assert.equal(shouldLockOnResume(on, 0, 4 * 60_000), false);
  assert.equal(shouldLockOnResume(on, 0, 5 * 60_000), true);
  assert.equal(shouldLockOnResume({ ...on, lockAfterMinutes: 0 }, 1000, 1000), true, '0 = immediately');
  assert.equal(shouldLockOnResume({ ...on, appLock: false }, 0, 1e9), false);
  assert.deepEqual(sanitizeSecurityPrefs({ appLock: 'yes', lockAfterMinutes: -3 }), { appLock: DEFAULT_SECURITY_PREFS.appLock, lockAfterMinutes: 0 });
  assert.deepEqual([0, 1, 2, 3].map(lockMethodFrom), ['none', 'screen-lock', 'biometric', 'biometric']);
});

// ------------------------------------------------------------------ attachments

test('attachments: classification, image sniffing and the binary guard', () => {
  assert.equal(classifyFile('photo.HEIC', null), 'image');
  assert.equal(classifyFile('x', 'image/png'), 'image');
  assert.equal(classifyFile('report.pdf', 'application/pdf'), 'unsupported');
  assert.equal(classifyFile('song.mp3', 'audio/mpeg'), 'unsupported');
  assert.equal(classifyFile('notes.md', 'text/markdown'), 'text');
  assert.equal(classifyFile('main.rs', 'application/octet-stream'), 'text', 'unknown types are read, then the binary guard decides');

  assert.equal(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
  assert.equal(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d])), 'image/png');
  assert.equal(sniffImage(new Uint8Array([0x52, 0x49, 0x46, 0x46])), null, 'WebP (RIFF) is not decodable by llama.cpp');

  const enc = new TextEncoder();
  assert.equal(looksBinary(enc.encode('Hello\tworld\r\nក្រុង 東京')), false);
  assert.equal(looksBinary(new Uint8Array([0x25, 0x50, 0x00, 0x44])), true);
  assert.equal(looksBinary(new Uint8Array(100).fill(0x01)), true);

  assert.equal(safeName('../../etc/passwd', 'file'), 'passwd');
  assert.equal(safeName('', 'Photo'), 'Photo');
});

test('attachments: a text attachment is accepted wherever chat expects an Attachment', () => {
  const t: TextAttachment = { kind: 'text', id: 'a', name: 'n.txt', content: 'x', truncated: false, bytes: 1 };
  const asChat: Attachment = t; // compile-time check (typecheck:tests)
  assert.equal(asChat.content, 'x');
});
