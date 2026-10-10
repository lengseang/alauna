/**
 * On-device speech-to-text with whisper.rn 0.7.4: model load/release, mic permission at the moment of use, realtime
 * transcription with the Silero VAD (RealtimeTranscriber + RingBufferVad), and one-shot transcription of WAV files.
 *
 * whisper.rn and the mic stream are reached only through ./native.ts (switched off until the `buffer` and
 * `@fugood/react-native-audio-pcm-stream` packages are installed); until then every entry point returns an honest
 * failure with the reason instead of crashing.
 */
import { useSyncExternalStore } from 'react';
import { Linking, PermissionsAndroid, Platform } from 'react-native';
import type { WhisperContext, WhisperVadContext } from '../../../node_modules/whisper.rn/lib/typescript/index';
import type { RealtimeTranscriber } from '../../../node_modules/whisper.rn/lib/typescript/realtime-transcription/index';
import { formatBytes } from '../../core/format.ts';
import { uriToPath } from '../../core/paths.ts';
import { createStore } from '../../core/store.ts';
import { cleanTranscript } from '../../core/voiceChunker.ts';
import { VAD_MODEL, getSpeechModel, vadOptionsFor, whisperLanguage, type VoicePrefs } from '../../core/voiceModels.ts';
import { MIC_MODULE_MISSING, WHISPER_JS_MISSING, createMicStream, loadWhisper } from './native.ts';
import { getVoicePrefs } from './prefs.ts';
import { speechModelPath } from './speechModels.ts';

export { MIC_MODULE_MISSING } from './native.ts';

export type MicPermission = 'granted' | 'denied' | 'blocked' | 'unknown';

export type SttFailure = 'no_mic_module' | 'no_engine' | 'not_installed' | 'mic_denied' | 'mic_blocked' | 'load_failed' | 'failed';
export type SttResult = { ok: true } | { ok: false; reason: SttFailure; message: string };

export interface SttState {
  /** whisper.rn can run in this build (false until the `buffer` package is installed, see native.ts). */
  engine: boolean;
  /** This build can capture live microphone audio (false until the pcm-stream module is in the APK). */
  micCapture: boolean;
  mic: MicPermission;
  /** STT model currently in RAM. */
  loadedModelId: string | null;
  loading: boolean;
  listening: boolean;
  error: string | null;
}

export const sttStore = createStore<SttState>({
  engine: loadWhisper() !== null,
  micCapture: createMicStream() !== null,
  mic: 'unknown',
  loadedModelId: null,
  loading: false,
  listening: false,
  error: null,
});

export function useStt(): SttState {
  return useSyncExternalStore(sttStore.subscribe, sttStore.getState);
}

export interface AudioMeterState {
  volume: number; // 0..1 normalized loudness
  pitch: number;  // 0..1 estimated pitch frequency
}

export const audioMeterStore = createStore<AudioMeterState>({ volume: 0, pitch: 0 });

export function useAudioMeter(): AudioMeterState {
  return useSyncExternalStore(audioMeterStore.subscribe, audioMeterStore.getState);
}

function calculateAudioMeter(bytes: Uint8Array): { volume: number; pitch: number } {
  if (!bytes || bytes.length < 2) return { volume: 0, pitch: 0 };
  const samples = Math.floor(bytes.length / 2);
  let sumSquares = 0;
  let zeroCrossings = 0;
  let prevSample = 0;

  for (let i = 0; i < bytes.length - 1; i += 2) {
    let sample = bytes[i] | (bytes[i + 1] << 8);
    if (sample >= 32768) sample -= 65536;
    sumSquares += sample * sample;

    if ((prevSample < 0 && sample >= 0) || (prevSample >= 0 && sample < 0)) {
      zeroCrossings++;
    }
    prevSample = sample;
  }

  const rms = Math.sqrt(sumSquares / samples);
  const volume = Math.min(1, Math.max(0, rms / 8000));
  const zcr = samples > 0 ? zeroCrossings / samples : 0;
  const pitch = Math.min(1, Math.max(0, zcr * 3.5));

  return { volume, pitch };
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const fail = (reason: SttFailure, msg: string): SttResult => ({ ok: false, reason, message: msg });

// ------------------------------------------------------------------ permission

/** Ask for the microphone only when voice input is actually started. */
export async function requestMicPermission(): Promise<MicPermission> {
  if (Platform.OS !== 'android') return 'unknown'; // iOS: the recorder module prompts by itself
  const perm = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
  let status: MicPermission;
  try {
    if (await PermissionsAndroid.check(perm)) status = 'granted';
    else {
      const r = await PermissionsAndroid.request(perm, {
        title: 'Microphone',
        message: 'CHIWIWI turns your voice into text on this phone. Audio never leaves the device.',
        buttonPositive: 'Allow',
        buttonNegative: 'Not now',
      });
      status = r === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : r === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ? 'blocked' : 'denied';
    }
  } catch {
    status = 'denied';
  }
  sttStore.setState({ mic: status });
  return status;
}

/** For the "blocked" state: Android only lets the user re-allow it in the app's system settings. */
export const openAppSettings = (): Promise<void> => Linking.openSettings();

// ------------------------------------------------------------------ model

let ctx: WhisperContext | null = null;
let vadCtx: WhisperVadContext | null = null;
let loadingPromise: Promise<SttResult> | null = null;

/** Load the chosen whisper model + the VAD model into RAM (no-op if already loaded). */
export function loadStt(modelId: string = getVoicePrefs().sttModelId): Promise<SttResult> {
  if (ctx && sttStore.getState().loadedModelId === modelId) return Promise.resolve({ ok: true });
  if (!loadingPromise) loadingPromise = doLoad(modelId).finally(() => (loadingPromise = null));
  return loadingPromise;
}

async function doLoad(modelId: string): Promise<SttResult> {
  const spec = getSpeechModel(modelId);
  if (!spec || spec.kind !== 'stt') return fail('not_installed', 'Choose a speech model in Settings > Audio & Voice.');
  const path = speechModelPath(spec.id);
  const vadPath = speechModelPath(VAD_MODEL.id);
  if (!path || !vadPath) {
    return fail('not_installed', `${spec.name} (${formatBytes(spec.bytes)}) is not downloaded yet. Download it in Settings > Audio & Voice.`);
  }
  const native = loadWhisper();
  if (!native) return fail('no_engine', WHISPER_JS_MISSING);
  const { whisper } = native;
  await releaseStt();
  sttStore.setState({ loading: true, error: null });
  try {
    ctx = await whisper.initWhisper({ filePath: path, useGpu: false });
    vadCtx = await whisper.initWhisperVad({ filePath: vadPath, useGpu: false });
    sttStore.setState({ loading: false, loadedModelId: spec.id });
    return { ok: true };
  } catch (e) {
    await releaseStt();
    const msg = `Could not load ${spec.name}: ${message(e)}`;
    sttStore.setState({ loading: false, error: msg });
    return fail('load_failed', msg);
  }
}

/** Stop listening and free the speech models' RAM. */
export async function releaseStt(): Promise<void> {
  await stopListening();
  const [c, v] = [ctx, vadCtx];
  ctx = null;
  vadCtx = null;
  sttStore.setState({ loadedModelId: null });
  await Promise.allSettled([c?.release(), v?.release()]);
}

// ------------------------------------------------------------------ one-shot

export type FileTranscript = { ok: true; text: string; language: string; ms: number } | { ok: false; reason: SttFailure; message: string };

/** Transcribe a WAV file (any sample rate; whisper.rn resamples). Path or file:// URI. */
export async function transcribeFile(pathOrUri: string): Promise<FileTranscript> {
  const loaded = await loadStt();
  if (!loaded.ok) return loaded;
  if (!ctx) return { ok: false, reason: 'load_failed', message: 'Speech model is not loaded.' };
  const spec = getSpeechModel(sttStore.getState().loadedModelId)!;
  const t0 = Date.now();
  try {
    const r = await ctx.transcribe(uriToPath(pathOrUri), { language: whisperLanguage(spec, getVoicePrefs()) }).promise;
    return { ok: true, text: cleanTranscript(r.result), language: r.language, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, reason: 'failed', message: `Transcription failed: ${message(e)}` };
  }
}

// ------------------------------------------------------------------ realtime

export interface ListenHandlers {
  onSpeechStart(): void;
  onSpeechEnd(): void;
  /** Live text of the utterance so far (re-transcribed while you talk). */
  onPartial(text: string): void;
  /** Final text of one utterance (after the VAD saw end of speech). */
  onFinal(text: string): void;
  onError(message: string): void;
}

let transcriber: RealtimeTranscriber | null = null;

export function micCaptureAvailable(): boolean {
  return createMicStream() !== null;
}

/** Whether whisper.rn can run in this build at all (model downloads work either way). */
export function sttEngineAvailable(): boolean {
  return loadWhisper() !== null;
}

/** Open the mic and stream utterances through VAD + whisper. Checks module -> model -> permission, in that order. */
export async function startListening(h: ListenHandlers, prefs: VoicePrefs = getVoicePrefs()): Promise<SttResult> {
  if (transcriber) return { ok: true };
  const mic = createMicStream();
  if (!mic) return fail('no_mic_module', MIC_MODULE_MISSING);
  const loaded = await loadStt(prefs.sttModelId);
  if (!loaded.ok) return loaded;
  const perm = await requestMicPermission();
  if (perm === 'blocked') return fail('mic_blocked', 'Microphone access is turned off for CHIWIWI. Allow it in the app settings.');
  if (perm === 'denied') return fail('mic_denied', 'Voice input needs the microphone. Nothing is recorded unless you start voice mode.');
  if (!ctx || !vadCtx) return fail('load_failed', 'Speech model is not loaded.');

  const native = loadWhisper();
  if (!native) return fail('no_engine', WHISPER_JS_MISSING);
  const { realtime } = native;
  const spec = getSpeechModel(sttStore.getState().loadedModelId)!;

  // Intercept raw mic PCM frames to drive the reactive VoiceOrb bounce & meter
  const rawMic = mic;
  const wrappedMic = {
    initialize: (cfg: any) => rawMic.initialize(cfg),
    start: () => rawMic.start(),
    stop: () => {
      audioMeterStore.setState({ volume: 0, pitch: 0 });
      return rawMic.stop();
    },
    isRecording: () => rawMic.isRecording(),
    onData: (cb: any) => {
      rawMic.onData((data: any) => {
        if (data?.data) {
          try {
            const meter = calculateAudioMeter(data.data);
            audioMeterStore.setState(meter);
          } catch {
            // safe meter calculation ignore
          }
        }
        cb(data);
      });
    },
    onError: (cb: any) => rawMic.onError(cb),
    onStatusChange: (cb: any) => rawMic.onStatusChange(cb),
    release: () => {
      audioMeterStore.setState({ volume: 0, pitch: 0 });
      return rawMic.release();
    },
  };

  const t = new realtime.RealtimeTranscriber(
    { whisperContext: ctx, vadContext: new realtime.RingBufferVad(vadCtx, { vadOptions: vadOptionsFor(prefs) }), audioStream: wrappedMic },
    {
      audioSliceSec: 30,
      promptPreviousSlices: false, // every utterance is its own message; chaining makes whisper repeat itself
      realtimeProcessingPauseMs: 500,
      transcribeOptions: { language: whisperLanguage(spec, prefs) },
      // 6 = VOICE_RECOGNITION (standard Android recognition mic with noise suppression on Galaxy & Snapdragon)
      audioStreamConfig: { sampleRate: 16000, channels: 1, bitsPerSample: 16, audioSource: 6 },
    },
    {
      onVad: (ev) => {
        if (ev.type === 'speech_start') h.onSpeechStart();
        else if (ev.type === 'speech_end') h.onSpeechEnd();
      },
      onTranscribe: (ev) => {
        if (ev.type === 'transcribe' && ev.data) h.onPartial(ev.data.result);
      },
      onSliceTranscriptionStabilized: (text) => h.onFinal(text),
      onError: (err) => h.onError(err),
    },
  );
  try {
    await t.start();
  } catch (e) {
    await t.release().catch(() => undefined);
    return fail('failed', `Could not start the microphone: ${message(e)}`);
  }
  transcriber = t;
  sttStore.setState({ listening: true, error: null });
  return { ok: true };
}

export async function stopListening(): Promise<void> {
  audioMeterStore.setState({ volume: 0, pitch: 0 });
  const t = transcriber;
  transcriber = null;
  sttStore.setState({ listening: false });
  if (!t) return;
  try {
    await t.stop();
  } finally {
    await t.release().catch(() => undefined);
  }
}

/** Apply a new VAD threshold / end-of-speech silence while listening. */
export function updateLiveVad(prefs: Pick<VoicePrefs, 'vadThreshold' | 'endOfSpeechMs'>): void {
  transcriber?.updateVadOptions(vadOptionsFor(prefs));
}
