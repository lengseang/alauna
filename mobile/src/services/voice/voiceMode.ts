/**
 * Voice mode controller: runs core/voiceLoop's state machine against the real pieces
 * (stt.ts mic + VAD + whisper, the chat service's streamed reply, tts.ts sentence queue).
 *
 * The chat is reached only through `chatApi` below (services/chat.ts today); if W2 changes the chat API, adapt it there.
 */
import { useSyncExternalStore } from 'react';
import { createStore } from '../../core/store.ts';
import { IDLE_VOICE, voiceReducer, type VoiceEffect, type VoiceEvent, type VoiceLoopOptions, type VoiceLoopState } from '../../core/voiceLoop.ts';
import { getSpeechModel } from '../../core/voiceModels.ts';
import { chatStore, sendMessage, stopGeneration } from '../chat.ts';
import { getVoicePrefs, initVoicePrefs, voicePrefsStore } from './prefs.ts';
import { isSpeechModelInstalled } from './speechModels.ts';
import { WHISPER_JS_MISSING } from './native.ts';
import { MIC_MODULE_MISSING, micCaptureAvailable, releaseStt, startListening, stopListening, sttEngineAvailable, updateLiveVad, type SttFailure } from './stt.ts';
import { speak, stopSpeaking } from './tts.ts';

const chatApi = {
  send: (text: string) => sendMessage(text),
  stop: () => stopGeneration(),
  isBusy: () => chatStore.getState().sending,
  subscribe: chatStore.subscribe,
  /** The assistant message created at/after `since`, if any. */
  replyAfter(since: number) {
    const ms = chatStore.getState().thread.messages;
    const last = ms[ms.length - 1];
    return last && last.role === 'assistant' && last.createdAt >= since ? last : null;
  },
};

/** What the overlay should offer when voice mode cannot run. */
export type VoiceFix = 'download_model' | 'open_settings' | 'install_update' | null;

export interface VoiceModeState extends VoiceLoopState {
  /** Next step for the error shown in `error`. */
  fix: VoiceFix;
}

export const voiceModeStore = createStore<VoiceModeState>({ ...IDLE_VOICE, fix: null });

export function useVoiceMode(): VoiceModeState {
  return useSyncExternalStore(voiceModeStore.subscribe, voiceModeStore.getState);
}

/** Why voice mode cannot start right now (checked before any permission prompt), or null when it can. */
export function voiceModeBlocker(): { message: string; fix: VoiceFix } | null {
  if (!sttEngineAvailable()) return { message: WHISPER_JS_MISSING, fix: 'install_update' };
  if (!micCaptureAvailable()) return { message: MIC_MODULE_MISSING, fix: 'install_update' };
  const prefs = getVoicePrefs();
  if (!isSpeechModelInstalled(prefs.sttModelId)) {
    const name = getSpeechModel(prefs.sttModelId)?.name ?? 'A speech model';
    return { message: `${name} is not downloaded yet. Download it in Settings > Audio & Voice.`, fix: 'download_model' };
  }
  return null;
}

const FIX_FOR: Partial<Record<SttFailure, VoiceFix>> = {
  no_mic_module: 'install_update',
  no_engine: 'install_update',
  not_installed: 'download_model',
  mic_blocked: 'open_settings',
};

function options(): VoiceLoopOptions {
  const p = getVoicePrefs();
  return { tts: p.ttsEnabled, bargeIn: p.bargeIn, continuous: p.continuous };
}

export function dispatchVoice(event: VoiceEvent): void {
  const { fix, ...loop } = voiceModeStore.getState();
  const { state, effects } = voiceReducer(loop, event, options());
  voiceModeStore.setState({ ...state, fix: state.phase === 'error' ? fix : null });
  for (const fx of effects) void run(fx);
}

// ------------------------------------------------------------------ effects

let transcribeTimer: ReturnType<typeof setTimeout> | null = null;
/** whisper never answers for an empty slice; do not sit in "transcribing" forever. */
const TRANSCRIBE_TIMEOUT_MS = 20_000;

const handlers = {
  onSpeechStart: () => dispatchVoice({ type: 'speechStart' }),
  onPartial: (text: string) => dispatchVoice({ type: 'partial', text }),
  onSpeechEnd: () => {
    dispatchVoice({ type: 'speechEnd' });
    if (transcribeTimer) clearTimeout(transcribeTimer);
    transcribeTimer = setTimeout(() => {
      if (voiceModeStore.getState().phase === 'transcribing') dispatchVoice({ type: 'final', text: '' });
    }, TRANSCRIBE_TIMEOUT_MS);
  },
  onFinal: (text: string) => dispatchVoice({ type: 'final', text }),
  onError: (message: string) => dispatchVoice({ type: 'fail', message: `Voice input stopped: ${message}` }),
};

async function run(fx: VoiceEffect): Promise<void> {
  try {
    switch (fx.type) {
      case 'listen': {
        const r = await startListening(handlers);
        if (!r.ok) {
          dispatchVoice({ type: 'fail', message: r.message });
          voiceModeStore.setState({ fix: FIX_FOR[r.reason] ?? null });
        }
        return;
      }
      case 'mute':
        return await stopListening();
      case 'send':
        return await sendTurn(fx.text);
      case 'speak':
        speak(fx.text, { onDone: () => dispatchVoice({ type: 'utteranceDone' }) });
        return;
      case 'silence':
        return await stopSpeaking();
      case 'cancelReply':
        return await chatApi.stop();
    }
  } catch (e) {
    dispatchVoice({ type: 'fail', message: e instanceof Error ? e.message : String(e) });
  }
}

let turnToken = 0;

async function sendTurn(text: string): Promise<void> {
  const token = ++turnToken;
  // A reply cancelled by barge-in may still be winding down; the chat refuses a second send meanwhile.
  for (let waited = 0; chatApi.isBusy() && waited < 5000; waited += 100) await new Promise((r) => setTimeout(r, 100));
  if (token !== turnToken) return;
  const since = Date.now();
  const forward = (settled: boolean) => {
    if (token !== turnToken) return;
    const m = chatApi.replyAfter(since);
    if (!m) {
      if (settled) dispatchVoice({ type: 'reply', text: '', done: true }); // e.g. "remember ..." answered by a toast
      return;
    }
    if (m.status === 'error') dispatchVoice({ type: 'replyFailed', message: m.error ?? 'The model could not answer.' });
    else dispatchVoice({ type: 'reply', text: m.text, done: settled || m.status !== 'streaming' });
  };
  const unsubscribe = chatApi.subscribe(() => forward(false));
  try {
    const r = await chatApi.send(text);
    if (token !== turnToken) return;
    if (!r.ok && !chatApi.replyAfter(since)) dispatchVoice({ type: 'replyFailed', message: r.message });
    else forward(true);
  } finally {
    unsubscribe();
  }
}

// ------------------------------------------------------------------ public API

export type StartVoiceResult = { ok: true } | { ok: false; message: string; fix: VoiceFix };

/** Start (or restart after an error). Fails fast, without prompting for anything, when a prerequisite is missing. */
export async function startVoiceMode(): Promise<StartVoiceResult> {
  await initVoicePrefs();
  const blocker = voiceModeBlocker();
  if (blocker) {
    voiceModeStore.setState({ ...IDLE_VOICE, phase: 'error', error: blocker.message, fix: blocker.fix });
    return { ok: false, ...blocker };
  }
  dispatchVoice({ type: 'start' });
  return { ok: true };
}

/** Stop everything (mic, speech, reply) and free the speech models' RAM. */
export async function stopVoiceMode(): Promise<void> {
  turnToken++;
  if (transcribeTimer) clearTimeout(transcribeTimer);
  dispatchVoice({ type: 'stop' });
  voiceModeStore.setState({ ...IDLE_VOICE, turns: voiceModeStore.getState().turns, fix: null });
  await releaseStt();
}

// Sensitivity changes in Settings apply to a running session immediately.
voicePrefsStore.subscribe(() => updateLiveVad(voicePrefsStore.getState()));
