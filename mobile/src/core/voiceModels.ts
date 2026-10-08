/**
 * Speech models (whisper.cpp ggml files + the Silero VAD model) and voice preferences. Pure data + validation.
 *
 * Sizes and SHA-256 are the Hugging Face LFS values, read from
 *   https://huggingface.co/api/models/ggerganov/whisper.cpp/tree/main   and
 *   https://huggingface.co/api/models/ggml-org/whisper-vad/tree/main    (2026-10-08)
 * and cross-checked against the X-Linked-Size / X-Linked-ETag headers of the resolve URLs. Never hand-edit them.
 */

export interface SpeechModelSpec {
  id: string;
  name: string;
  kind: 'stt' | 'vad';
  repo: string;
  filename: string;
  bytes: number;
  sha256: string;
  /** .en models only understand English (and are a bit more accurate at it). */
  englishOnly: boolean;
  quant: 'f16' | 'q5_1' | 'f32';
  note: string;
}

const W = 'ggerganov/whisper.cpp';

export const STT_MODELS: SpeechModelSpec[] = [
  { id: 'whisper-tiny.en', name: 'Whisper Tiny (English)', kind: 'stt', repo: W, filename: 'ggml-tiny.en.bin', bytes: 77_704_715, sha256: '921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f', englishOnly: true, quant: 'f16', note: 'Fastest. Good for short English commands.' },
  { id: 'whisper-tiny', name: 'Whisper Tiny (multilingual)', kind: 'stt', repo: W, filename: 'ggml-tiny.bin', bytes: 77_691_713, sha256: 'be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21', englishOnly: false, quant: 'f16', note: 'Fastest, 99 languages, lower accuracy.' },
  { id: 'whisper-base.en', name: 'Whisper Base (English)', kind: 'stt', repo: W, filename: 'ggml-base.en.bin', bytes: 147_964_211, sha256: 'a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002', englishOnly: true, quant: 'f16', note: 'Recommended for English conversation.' },
  { id: 'whisper-base', name: 'Whisper Base (multilingual)', kind: 'stt', repo: W, filename: 'ggml-base.bin', bytes: 147_951_465, sha256: '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe', englishOnly: false, quant: 'f16', note: 'Balanced, 99 languages.' },
  { id: 'whisper-small.en-q5_1', name: 'Whisper Small (English, q5_1)', kind: 'stt', repo: W, filename: 'ggml-small.en-q5_1.bin', bytes: 190_098_681, sha256: 'bfdff4894dcb76bbf647d56263ea2a96645423f1669176f4844a1bf8e478ad30', englishOnly: true, quant: 'q5_1', note: 'Most accurate here; slower replies.' },
  { id: 'whisper-small-q5_1', name: 'Whisper Small (multilingual, q5_1)', kind: 'stt', repo: W, filename: 'ggml-small-q5_1.bin', bytes: 190_085_487, sha256: 'ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb', englishOnly: false, quant: 'q5_1', note: 'Most accurate multilingual option here; slower.' },
];

/** Silero VAD v6.2.0 for whisper.cpp: detects when you start and stop talking. Downloaded together with any STT model. */
export const VAD_MODEL: SpeechModelSpec = {
  id: 'silero-vad-v6.2.0',
  name: 'Silero VAD v6.2.0',
  kind: 'vad',
  repo: 'ggml-org/whisper-vad',
  filename: 'ggml-silero-v6.2.0.bin',
  bytes: 885_098,
  sha256: '2aa269b785eeb53a82983a20501ddf7c1d9c48e33ab63a41391ac6c9f7fb6987',
  englishOnly: false,
  quant: 'f32',
  note: 'Voice activity detection.',
};

export const SPEECH_MODELS: SpeechModelSpec[] = [...STT_MODELS, VAD_MODEL];
export const DEFAULT_STT_MODEL_ID = 'whisper-base.en';

export function getSpeechModel(id: string | null | undefined): SpeechModelSpec | null {
  return SPEECH_MODELS.find((m) => m.id === id) ?? null;
}

export function speechModelUrl(spec: SpeechModelSpec): string {
  return `https://huggingface.co/${spec.repo}/resolve/main/${spec.filename}`;
}

// ------------------------------------------------------------------ preferences

export interface VoicePrefs {
  sttModelId: string;
  /** Whisper language: 'auto' or an ISO-639-1 code. English-only models always use 'en'. */
  language: string;
  /** Silero speech probability threshold: lower = more sensitive (picks up quieter speech and more noise). */
  vadThreshold: number;
  /** Silence that ends your turn, in ms. */
  endOfSpeechMs: number;
  ttsEnabled: boolean;
  /** expo-speech voice identifier; null = the phone's default voice. */
  ttsVoice: string | null;
  ttsRate: number;
  ttsPitch: number;
  bargeIn: boolean;
  continuous: boolean;
}

/** The old app's three sensitivity pills, kept: High / Normal / Low sensitivity. */
export const VAD_SENSITIVITY_PRESETS = [
  { label: 'High', threshold: 0.3 },
  { label: 'Normal', threshold: 0.5 },
  { label: 'Low', threshold: 0.8 },
] as const;

export const DEFAULT_VOICE_PREFS: VoicePrefs = {
  sttModelId: DEFAULT_STT_MODEL_ID,
  language: 'auto',
  vadThreshold: 0.5,
  endOfSpeechMs: 800,
  ttsEnabled: true,
  ttsVoice: null,
  ttsRate: 1,
  ttsPitch: 1,
  bargeIn: true,
  continuous: true,
};

const clamp = (v: unknown, lo: number, hi: number, dflt: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt;

/** Merge unknown/old/corrupt JSON into valid prefs. Never throws. */
export function sanitizeVoicePrefs(raw: unknown): VoicePrefs {
  const d = DEFAULT_VOICE_PREFS;
  if (!raw || typeof raw !== 'object') return { ...d };
  const r = raw as Record<string, unknown>;
  const stt = getSpeechModel(typeof r.sttModelId === 'string' ? r.sttModelId : null);
  return {
    sttModelId: stt && stt.kind === 'stt' ? stt.id : d.sttModelId,
    language: typeof r.language === 'string' && /^(auto|[a-z]{2,3})$/.test(r.language) ? r.language : d.language,
    vadThreshold: clamp(r.vadThreshold, 0.05, 0.95, d.vadThreshold),
    endOfSpeechMs: Math.round(clamp(r.endOfSpeechMs, 200, 3000, d.endOfSpeechMs)),
    ttsEnabled: typeof r.ttsEnabled === 'boolean' ? r.ttsEnabled : d.ttsEnabled,
    ttsVoice: typeof r.ttsVoice === 'string' && r.ttsVoice ? r.ttsVoice : null,
    ttsRate: clamp(r.ttsRate, 0.25, 3, d.ttsRate),
    ttsPitch: clamp(r.ttsPitch, 0.25, 3, d.ttsPitch),
    bargeIn: typeof r.bargeIn === 'boolean' ? r.bargeIn : d.bargeIn,
    continuous: typeof r.continuous === 'boolean' ? r.continuous : d.continuous,
  };
}

/** Language actually passed to whisper for this model. */
export function whisperLanguage(spec: SpeechModelSpec, prefs: Pick<VoicePrefs, 'language'>): string {
  return spec.englishOnly ? 'en' : prefs.language;
}

/** whisper.rn VadOptions for the realtime VAD (shape of whisper.rn's VAD_PRESETS.default, with the user's knobs). */
export function vadOptionsFor(prefs: Pick<VoicePrefs, 'vadThreshold' | 'endOfSpeechMs'>) {
  return {
    threshold: prefs.vadThreshold,
    minSpeechDurationMs: 250,
    minSilenceDurationMs: prefs.endOfSpeechMs,
    maxSpeechDurationS: 30,
    speechPadMs: 30,
    samplesOverlap: 0.1,
  };
}

/**
 * Android voice names say whether a voice is on the phone ("en-us-x-iob-local") or streamed from Google
 * ("en-us-x-iob-network"). expo-speech does not expose the flag, so this reads the name. null = cannot tell.
 */
export function voiceNeedsNetwork(identifier: string): boolean | null {
  if (/network/i.test(identifier)) return true;
  if (/local|embedded/i.test(identifier)) return false;
  return null;
}
