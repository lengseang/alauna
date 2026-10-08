/**
 * Pure helpers behind the Settings screens (no React, no react-native): labels, choice lists, the diagnostics report.
 * Unit-tested in test/settingsUi.test.ts.
 */
import { formatBytes, formatDuration, formatSpeed } from '../../core/format.ts';
import { VAD_SENSITIVITY_PRESETS } from '../../core/voiceModels.ts';

/** n_ctx choices: null = automatic by the phone's memory. */
export const CTX_CHOICES = [null, 512, 1024, 2048, 3072, 4096, 6144, 8192, 12288, 16384, 32768] as const;
/** CPU threads: null = the engine's own choice (fast cores). */
export const THREAD_CHOICES = [null, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 16] as const;
export const BATCH_CHOICES = [32, 64, 128, 256, 512, 1024, 2048] as const;
export const PURGE_DAYS_CHOICES = [0, 7, 14, 30, 60, 90, 180, 365] as const;
/** Common Whisper languages; 'auto' lets the model detect it. The .en models always use English. */
export const LANGUAGE_CHOICES: ReadonlyArray<{ code: string; name: string }> = [
  { code: 'auto', name: 'Detect automatically' },
  { code: 'en', name: 'English' },
  { code: 'km', name: 'Khmer' },
  { code: 'th', name: 'Thai' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'fr', name: 'French' },
  { code: 'es', name: 'Spanish' },
  { code: 'de', name: 'German' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'hi', name: 'Hindi' },
  { code: 'ar', name: 'Arabic' },
];

export const languageName = (code: string): string => LANGUAGE_CHOICES.find((l) => l.code === code)?.name ?? code;

export const labelDays = (d: number): string => (d <= 0 ? 'Off' : d === 1 ? '1 day' : `${d} days`);
export const labelMinutes = (m: number): string => (m <= 0 ? 'Immediately' : m === 1 ? 'After 1 minute' : `After ${m} minutes`);
export const labelTokens = (n: number | null, auto: number): string => (n === null ? `Auto (${auto})` : `${n} tokens`);
export const labelThreads = (n: number | null): string => (n === null ? 'Auto' : String(n));
export const onOff = (v: boolean): string => (v ? 'On' : 'Off');

/** Whole milliseconds for a Stat, or null when nothing was measured. */
export const wholeMs = (v: number | null | undefined): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null);
/** One decimal for tok/s, or null. */
export const oneDecimal = (v: number | null | undefined): string | null => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(1) : null);

/** The old app's three sensitivity pills (High / Normal / Low): which one the threshold equals, if any. */
export function vadPresetFor(threshold: number): string | null {
  const p = VAD_SENSITIVITY_PRESETS.find((x) => Math.abs(x.threshold - threshold) < 0.005);
  return p ? p.label : null;
}

export interface SlotLike {
  usedBytes: number | null;
  modelBytes: number | null;
  modelFiles: number;
  freeBytes: number | null;
  available: boolean;
}

/** "3 models, 6.1 GB · 7.4 GB free" - only what was measured; free space unknown (SD card) is said, not guessed. */
export function slotLine(s: SlotLike): string {
  if (!s.available) return 'Not available right now. Is the card or folder still there?';
  const parts: string[] = [];
  parts.push(`${s.modelFiles} ${s.modelFiles === 1 ? 'model' : 'models'}${s.modelBytes !== null ? `, ${formatBytes(s.modelBytes)}` : ''}`);
  if (s.usedBytes !== null && s.usedBytes !== s.modelBytes) parts.push(`${formatBytes(s.usedBytes)} in total`);
  parts.push(s.freeBytes !== null ? `${formatBytes(s.freeBytes)} free` : 'free space unknown for this volume');
  return parts.join(' · ');
}

export interface SpeechStateLike {
  status: 'absent' | 'downloading' | 'paused' | 'verifying' | 'installed' | 'error';
  receivedBytes: number;
  totalBytes: number;
  bytesPerSecond: number;
  etaSeconds: number;
  verifyProgress: number;
}

/** 0..1 for a progress bar, or null when there is nothing in progress. */
export function speechFraction(s: SpeechStateLike): number | null {
  if (s.status === 'verifying') return s.verifyProgress;
  if (s.status === 'downloading' || s.status === 'paused') return s.totalBytes > 0 ? s.receivedBytes / s.totalBytes : 0;
  return null;
}

/** One honest line for a speech model. */
export function speechLine(s: SpeechStateLike): string {
  const pct = Math.round((speechFraction(s) ?? 0) * 100);
  switch (s.status) {
    case 'downloading':
      return `Downloading ${pct}% · ${formatBytes(s.receivedBytes)} of ${formatBytes(s.totalBytes)}${s.bytesPerSecond > 0 ? ` · ${formatSpeed(s.bytesPerSecond)}` : ''}${s.etaSeconds > 0 ? ` · ${formatDuration(s.etaSeconds)} left` : ''}`;
    case 'paused':
      return `Paused at ${pct}% (${formatBytes(s.receivedBytes)} of ${formatBytes(s.totalBytes)})`;
    case 'verifying':
      return `Checking the file ${pct}%`;
    case 'installed':
      return 'On this phone';
    case 'error':
      return 'Download failed';
    default:
      return `Not downloaded · ${formatBytes(s.totalBytes)}`;
  }
}

export type DiagValue = string | number | boolean | null | undefined;
export interface DiagSection {
  title: string;
  rows: Array<[string, DiagValue]>;
}

/** Plain-text report for support: sections of "key: value". Missing values are written "n/a", never invented. */
export function buildDiagnostics(sections: readonly DiagSection[], at: Date): string {
  const show = (v: DiagValue): string => (v === null || v === undefined || v === '' ? 'n/a' : typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v));
  const lines = [`CHIWIWI diagnostics · ${at.toISOString()}`];
  for (const s of sections) {
    lines.push('', `== ${s.title} ==`);
    for (const [k, v] of s.rows) lines.push(`${k}: ${show(v)}`);
  }
  return lines.join('\n');
}
