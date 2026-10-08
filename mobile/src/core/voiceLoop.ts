/**
 * Voice mode as a pure state machine: idle -> listening -> transcribing -> thinking -> speaking -> listening ...
 *
 * The reducer never touches the phone. It returns the next state plus a list of effects (mic on/off, send text to the
 * chat, speak a sentence, stop speaking, cancel the reply) that services/voice/voiceMode.ts executes. Every event comes
 * from something real: the VAD (speech start/end), whisper (partial/final text), the chat stream, the TTS engine.
 */
import { cleanTranscript, nextSentences } from './voiceChunker.ts';

export type VoicePhase = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking' | 'error';

export interface VoiceLoopOptions {
  /** Speak the answer (false = transcribe + show the reply only). */
  tts: boolean;
  /** Keep the mic open while the assistant thinks/speaks, so talking over it stops it. */
  bargeIn: boolean;
  /** After a reply, listen again (true) or go idle (false). */
  continuous: boolean;
}

export interface VoiceLoopState {
  phase: VoicePhase;
  /** What the user said this turn (live partial text while listening). */
  heard: string;
  /** The assistant's visible answer so far this turn. */
  reply: string;
  /** Chunker offset into `reply` (see voiceChunker.nextSentences). */
  chunkFrom: number;
  /** Sentences handed to TTS and not finished yet. */
  pendingSpeech: number;
  replyDone: boolean;
  error: string | null;
  /** Completed turns since voice mode started. */
  turns: number;
}

export type VoiceEvent =
  | { type: 'start' }
  | { type: 'stop' }
  | { type: 'speechStart' }
  | { type: 'partial'; text: string }
  | { type: 'speechEnd' }
  | { type: 'final'; text: string }
  | { type: 'reply'; text: string; done: boolean }
  | { type: 'replyFailed'; message: string }
  | { type: 'utteranceDone' }
  | { type: 'fail'; message: string };

export type VoiceEffect =
  | { type: 'listen' }
  | { type: 'mute' }
  | { type: 'send'; text: string }
  | { type: 'speak'; text: string }
  | { type: 'silence' }
  | { type: 'cancelReply' };

export const IDLE_VOICE: VoiceLoopState = {
  phase: 'idle',
  heard: '',
  reply: '',
  chunkFrom: 0,
  pendingSpeech: 0,
  replyDone: false,
  error: null,
  turns: 0,
};

export interface Transition {
  state: VoiceLoopState;
  effects: VoiceEffect[];
}

const busy = (p: VoicePhase) => p === 'thinking' || p === 'speaking';

/** Interrupt whatever the assistant is doing this turn. */
function interrupt(s: VoiceLoopState): VoiceEffect[] {
  const fx: VoiceEffect[] = [];
  if (s.pendingSpeech > 0 || s.phase === 'speaking') fx.push({ type: 'silence' });
  if (busy(s.phase) && !s.replyDone) fx.push({ type: 'cancelReply' });
  return fx;
}

function endTurn(s: VoiceLoopState, o: VoiceLoopOptions): Transition {
  const turns = s.turns + 1;
  if (o.continuous) {
    return { state: { ...s, phase: 'listening', heard: '', pendingSpeech: 0, turns }, effects: [{ type: 'listen' }] };
  }
  return { state: { ...s, phase: 'idle', pendingSpeech: 0, turns }, effects: [{ type: 'mute' }] };
}

export function voiceReducer(s: VoiceLoopState, e: VoiceEvent, o: VoiceLoopOptions): Transition {
  const same: Transition = { state: s, effects: [] };
  switch (e.type) {
    case 'start':
      if (s.phase !== 'idle' && s.phase !== 'error') return same;
      return { state: { ...IDLE_VOICE, phase: 'listening', turns: s.turns }, effects: [{ type: 'listen' }] };

    case 'stop':
      if (s.phase === 'idle') return same;
      return { state: { ...s, phase: 'idle', pendingSpeech: 0 }, effects: [{ type: 'mute' }, ...interrupt(s)] };

    case 'fail':
      return { state: { ...s, phase: 'error', error: e.message, pendingSpeech: 0 }, effects: [{ type: 'mute' }, ...interrupt(s)] };

    case 'speechStart':
      if (s.phase === 'transcribing') return { state: { ...s, phase: 'listening' }, effects: [] };
      if (busy(s.phase) && o.bargeIn) {
        // Barge-in: the user talks over the assistant -> stop it and listen to them.
        return { state: { ...s, phase: 'listening', heard: '', pendingSpeech: 0, replyDone: true }, effects: interrupt(s) };
      }
      return same;

    case 'partial':
      if (s.phase !== 'listening') return same;
      return { state: { ...s, heard: cleanTranscript(e.text) }, effects: [] };

    case 'speechEnd':
      if (s.phase !== 'listening') return same;
      return { state: { ...s, phase: 'transcribing' }, effects: [] };

    case 'final': {
      if (s.phase !== 'listening' && s.phase !== 'transcribing') return same; // echo / leftovers while busy
      const text = cleanTranscript(e.text);
      if (!text) return { state: { ...s, phase: 'listening', heard: '' }, effects: [] };
      const effects: VoiceEffect[] = o.bargeIn ? [] : [{ type: 'mute' }];
      effects.push({ type: 'send', text });
      return {
        state: { ...s, phase: 'thinking', heard: text, reply: '', chunkFrom: 0, pendingSpeech: 0, replyDone: false, error: null },
        effects,
      };
    }

    case 'reply': {
      if (!busy(s.phase) || s.replyDone) return same;
      const { sentences, next } = o.tts ? nextSentences(e.text, s.chunkFrom, e.done) : { sentences: [], next: s.chunkFrom };
      const pendingSpeech = s.pendingSpeech + sentences.length;
      const state: VoiceLoopState = {
        ...s,
        reply: e.text,
        chunkFrom: next,
        pendingSpeech,
        replyDone: e.done,
        phase: pendingSpeech > 0 ? 'speaking' : 'thinking',
      };
      const effects: VoiceEffect[] = sentences.map((text) => ({ type: 'speak', text }));
      if (e.done && pendingSpeech === 0) {
        const end = endTurn(state, o);
        return { state: end.state, effects: [...effects, ...end.effects] };
      }
      return { state, effects };
    }

    case 'utteranceDone': {
      if (!busy(s.phase) || s.pendingSpeech === 0) return same;
      const pendingSpeech = s.pendingSpeech - 1;
      if (pendingSpeech === 0 && s.replyDone) return endTurn({ ...s, pendingSpeech }, o);
      return { state: { ...s, pendingSpeech, phase: pendingSpeech > 0 ? 'speaking' : 'thinking' }, effects: [] };
    }

    case 'replyFailed':
      if (!busy(s.phase)) return same;
      return { state: { ...s, phase: 'error', error: e.message, pendingSpeech: 0, replyDone: true }, effects: [{ type: 'mute' }, ...interrupt(s)] };
  }
  return same;
}
