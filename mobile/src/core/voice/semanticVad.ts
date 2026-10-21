/**
 * Semantic VAD (Voice Activity Detection & Turn-Taking Engine).
 *
 * Combines high-speed acoustic energy/zero-crossing detection with linguistic
 * semantic completion analysis to achieve instant, natural conversation replies.
 *
 * Unlike traditional acoustic-only VAD (like Silero) which requires arbitrary long
 * silence intervals (1500ms - 2000ms) to avoid interrupting the speaker, Semantic VAD
 * dynamically modulates the end-of-speech silence window:
 *  - Semantic complete / terminal closure: 350ms - 400ms (instant reply handover)
 *  - Semantic hesitation / trailing connective: 1300ms - 1500ms (patient listening)
 *  - Mid-thought / neutral: 600ms - 750ms
 *
 * Pure TypeScript core: zero React Native imports, 100% testable in Node.js.
 */

export type SemanticTurnState =
  | 'complete'    // Terminated thought, question, or affirmative closure
  | 'hesitating' // Trailing conjunction, preposition, or filler word
  | 'neutral'    // Mid-sentence or unclassified
  | 'empty';     // No transcript yet

/** Words indicating the speaker is mid-thought and pausing to formulate words */
const HESITATION_WORDS = new Set([
  'and', 'but', 'or', 'so', 'because', 'although', 'if', 'when', 'while',
  'that', 'with', 'for', 'to', 'from', 'in', 'on', 'at', 'by', 'as',
  'the', 'a', 'an', 'my', 'your', 'his', 'her', 'their', 'our',
  'uh', 'um', 'er', 'ah', 'hmm', 'like', 'actually', 'basically',
]);

/** Phrases that definitively mark conversational turn handover */
const CONVERSATIONAL_CLOSURES = new Set([
  'yes', 'yeah', 'yep', 'no', 'nope', 'nah', 'okay', 'ok', 'alright',
  'sure', 'definitely', 'absolutely', 'exactly', 'sounds good', 'cool',
  'thanks', 'thank you', 'got it', 'i see', 'understood',
  'goodbye', 'bye', 'good night', 'see ya', 'help me',
]);

/** Question start tokens */
const QUESTION_STARTERS = new Set([
  'who', 'what', 'when', 'where', 'why', 'how', 'which', 'whose',
  'is', 'are', 'am', 'was', 'were', 'do', 'does', 'did', 'can', 'could',
  'would', 'will', 'should', 'may', 'might', 'have', 'has', 'had',
]);

/**
 * Calculates RMS volume of 16-bit linear PCM audio.
 * Normalized to 0.0 .. 1.0.
 */
export function calculatePcmRms(bytes: Uint8Array): number {
  if (!bytes || bytes.length < 2) return 0;
  const sampleCount = Math.floor(bytes.length / 2);
  let sumSquares = 0;

  for (let i = 0; i < bytes.length - 1; i += 2) {
    let sample = bytes[i] | (bytes[i + 1] << 8);
    if (sample >= 32768) sample -= 65536;
    sumSquares += sample * sample;
  }

  const rms = Math.sqrt(sumSquares / sampleCount);
  return Math.min(1.0, Math.max(0.0, rms / 8000));
}

/**
 * Calculates Zero Crossing Rate (ZCR) of 16-bit linear PCM audio.
 * Normalized to 0.0 .. 1.0.
 */
export function calculatePcmZcr(bytes: Uint8Array): number {
  if (!bytes || bytes.length < 4) return 0;
  const sampleCount = Math.floor(bytes.length / 2);
  let zeroCrossings = 0;
  let prevSample = 0;

  for (let i = 0; i < bytes.length - 1; i += 2) {
    let sample = bytes[i] | (bytes[i + 1] << 8);
    if (sample >= 32768) sample -= 65536;
    if ((prevSample < 0 && sample >= 0) || (prevSample >= 0 && sample < 0)) {
      zeroCrossings++;
    }
    prevSample = sample;
  }

  return sampleCount > 0 ? Math.min(1.0, (zeroCrossings / sampleCount) * 3.5) : 0;
}

/**
 * Analyzes partial or full transcript text to classify semantic turn completion.
 */
export function classifySemanticTurn(text: string): SemanticTurnState {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return 'empty';

  // 1. Explicit terminal punctuation
  if (/[.?!]$/.test(trimmed)) {
    return 'complete';
  }

  // 2. Tokenize words
  const words = trimmed.replace(/[^a-z0-9\s'-]/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'empty';

  const lastWord = words[words.length - 1];
  const firstWord = words[0];

  // 3. Trailing hesitation or connective word -> speaker is continuing
  if (HESITATION_WORDS.has(lastWord)) {
    return 'hesitating';
  }

  // 4. Single-token or short conversational closure -> speaker is done
  if (words.length <= 4 && CONVERSATIONAL_CLOSURES.has(trimmed)) {
    return 'complete';
  }

  // 5. Question structure with reasonable length (>= 3 words)
  if (words.length >= 3 && QUESTION_STARTERS.has(firstWord)) {
    return 'complete';
  }

  // 6. Sentence with substantial length (>= 6 words) ending on noun/verb/adjective
  if (words.length >= 6 && !HESITATION_WORDS.has(lastWord)) {
    return 'complete';
  }

  return 'neutral';
}

/**
 * Computes dynamic silence threshold based on semantic state.
 */
export function getDynamicSilenceTimeoutMs(
  turnState: SemanticTurnState,
  baseSilenceMs = 700
): number {
  switch (turnState) {
    case 'complete':
      // Fast path: turn is finished semantically, cut silence to minimum for instant reply
      return Math.min(baseSilenceMs, 380);
    case 'hesitating':
      // Patient path: trailing connector ("and...", "because..."), wait longer
      return Math.max(baseSilenceMs, 1400);
    case 'neutral':
      return baseSilenceMs;
    case 'empty':
    default:
      // No transcript: wait slightly longer to avoid cutting early acoustic noise
      return Math.max(baseSilenceMs, 1000);
  }
}

export interface SemanticVadOptions {
  energyThreshold?: number; // 0..1 (default: 0.08)
  baseSilenceMs?: number;   // default: 700ms
  minSpeechDurationMs?: number; // default: 200ms
}

export class SemanticVadSession {
  private energyThreshold: number;
  private baseSilenceMs: number;
  private minSpeechDurationMs: number;

  private isSpeechActive = false;
  private speechStartTime = 0;
  private lastVoiceTime = 0;
  private currentTranscript = '';
  private currentTurnState: SemanticTurnState = 'empty';

  constructor(options: SemanticVadOptions = {}) {
    this.energyThreshold = options.energyThreshold ?? 0.08;
    this.baseSilenceMs = options.baseSilenceMs ?? 700;
    this.minSpeechDurationMs = options.minSpeechDurationMs ?? 200;
  }

  /**
   * Feed a live PCM audio buffer chunk into the session.
   */
  feedAudio(
    pcmBytes: Uint8Array,
    now = Date.now()
  ): {
    speechStarted: boolean;
    speechEnded: boolean;
    volume: number;
    turnState: SemanticTurnState;
  } {
    const volume = calculatePcmRms(pcmBytes);
    const hasVoice = volume >= this.energyThreshold;

    let speechStarted = false;
    let speechEnded = false;

    if (hasVoice) {
      this.lastVoiceTime = now;
      if (!this.isSpeechActive) {
        this.isSpeechActive = true;
        this.speechStartTime = now;
        speechStarted = true;
      }
    } else if (this.isSpeechActive) {
      const silenceDuration = now - this.lastVoiceTime;
      const speechDuration = now - this.speechStartTime;
      const dynamicTimeout = getDynamicSilenceTimeoutMs(this.currentTurnState, this.baseSilenceMs);

      if (speechDuration >= this.minSpeechDurationMs && silenceDuration >= dynamicTimeout) {
        this.isSpeechActive = false;
        speechEnded = true;
      }
    }

    return {
      speechStarted,
      speechEnded,
      volume,
      turnState: this.currentTurnState,
    };
  }

  /**
   * Update the latest partial transcript from Whisper to refine semantic turn state.
   */
  updateTranscript(text: string): SemanticTurnState {
    this.currentTranscript = text;
    this.currentTurnState = classifySemanticTurn(text);
    return this.currentTurnState;
  }

  getTranscript(): string {
    return this.currentTranscript;
  }

  getTurnState(): SemanticTurnState {
    return this.currentTurnState;
  }

  isActive(): boolean {
    return this.isSpeechActive;
  }

  reset(): void {
    this.isSpeechActive = false;
    this.speechStartTime = 0;
    this.lastVoiceTime = 0;
    this.currentTranscript = '';
    this.currentTurnState = 'empty';
  }
}
