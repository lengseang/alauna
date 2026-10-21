/**
 * Kokoro Neural TTS Service powered directly by sherpa-onnx native bridge.
 *
 * Runs high-fidelity, studio-quality 24 kHz on-device Kokoro neural synthesis
 * using native C++ ONNX Runtime and direct hardware AudioTrack PCM playback.
 */
import { useSyncExternalStore } from 'react';
import { NativeModules, TurboModuleRegistry } from 'react-native';
import { Directory, File } from 'expo-file-system';
import { createStore } from '../../core/store.ts';
import { uriToPath } from '../../core/paths.ts';
import { isStorageReady, vaultRoot } from '../storage.ts';
import { DEFAULT_KOKORO_STYLE_ID } from '../../core/voice/kokoroStyles.ts';

function getSherpaNative(): any {
  try {
    return TurboModuleRegistry.get('SherpaOnnx') ?? NativeModules.SherpaOnnx ?? null;
  } catch {
    return null;
  }
}

/**
 * Speaker ID mapping for Kokoro multi-lang v1.0 (53 speakers).
 * Directly maps each Kokoro style ID to the corresponding multi-lang model SID.
 * Default female gold standard: af_heart (SID 3). Default male: am_adam (SID 11).
 */
export const KOKORO_SID_MAP: Record<string, number> = {
  af_alloy: 0,
  af_aoede: 1,
  af_bella: 2,
  af_heart: 3,
  af_jessica: 4,
  af_kore: 5,
  af_nicole: 6,
  af_nova: 7,
  af_river: 8,
  af_sarah: 9,
  af_sky: 10,
  am_adam: 11,
  am_echo: 12,
  am_eric: 13,
  am_fenrir: 14,
  am_liam: 15,
  am_michael: 16,
  am_onyx: 17,
  am_puck: 18,
  bf_alice: 19,
  bf_emma: 20,
  bf_isabella: 21,
  bm_daniel: 22,
  bm_fable: 23,
  bm_george: 24,
  bm_lewis: 25,
};

export type KokoroEngineStatus = 'uninstalled' | 'extracting' | 'ready' | 'synthesizing' | 'error';

export interface KokoroEngineState {
  status: KokoroEngineStatus;
  error: string | null;
  speakerCount: number;
}

export const kokoroEngineStore = createStore<KokoroEngineState>({
  status: 'uninstalled',
  error: null,
  speakerCount: 0,
});

export function useKokoroEngine(): KokoroEngineState {
  return useSyncExternalStore(kokoroEngineStore.subscribe, kokoroEngineStore.getState);
}

const KOKORO_INSTANCE_ID = 'alauna_kokoro_tts';
let activeInstanceId: string | null = null;
let activeStopTimer: ReturnType<typeof setTimeout> | null = null;
let isInitializing = false;

function kokoroBaseDir(): Directory {
  return new Directory(vaultRoot(), 'voice/kokoro_onnx');
}

/**
 * Finds the directory containing Kokoro model files (either directly or inside unpacked subfolder).
 */
export function findKokoroModelDirectory(): string | null {
  if (!isStorageReady()) return null;
  const base = kokoroBaseDir();
  if (!base.exists) return null;

  const basePath = uriToPath(base.uri);
  const subfolderPath = `${basePath}/kokoro-int8-multi-lang-v1_0`;

  // Check subfolder first
  const subModel = new File(base, 'kokoro-int8-multi-lang-v1_0/model.int8.onnx');
  if (subModel.exists) return subfolderPath;

  // Check direct base directory
  const directModel = new File(base, 'model.int8.onnx');
  if (directModel.exists) return basePath;

  return null;
}

export function isModelDownloaded(): boolean {
  return findKokoroModelDirectory() !== null;
}

export function isNeuralReady(): boolean {
  return activeInstanceId !== null;
}

/**
 * Unpacks the downloaded Kokoro .tar.bz2 archive into <vault>/voice/kokoro_onnx.
 */
export async function unpackKokoroArchive(archivePath: string): Promise<boolean> {
  const native = getSherpaNative();
  if (!native || typeof native.extractArchive !== 'function') {
    kokoroEngineStore.setState({ status: 'error', error: 'SherpaOnnx native module not available' });
    return false;
  }
  const destDir = kokoroBaseDir();
  if (!destDir.exists) {
    destDir.create({ intermediates: true, idempotent: true });
  }
  const targetPath = uriToPath(destDir.uri);
  kokoroEngineStore.setState({ status: 'extracting', error: null });

  try {
    const result = await native.extractArchive(
      archivePath,
      targetPath,
      true, // force
      0, // skipEntries
      archivePath, // operationId
      true, // showNotificationsEnabled
      'Kokoro-82M Neural Voice', // notificationTitle
      'Unpacking neural voice models...' // notificationText
    );
    if (result && (result.success || (result.bytesExtracted && result.bytesExtracted > 0))) {
      await initKokoroNeural();
      return true;
    }
    // Also check if model file became available regardless of extractArchive result object shape
    if (findKokoroModelDirectory()) {
      await initKokoroNeural();
      return true;
    }
    kokoroEngineStore.setState({ status: 'error', error: result?.reason || 'Archive extraction failed' });
    return false;
  } catch (err) {
    // If files already exist or extract threw, verify model on disk
    if (findKokoroModelDirectory()) {
      await initKokoroNeural();
      return true;
    }
    const msg = err instanceof Error ? err.message : String(err);
    kokoroEngineStore.setState({ status: 'error', error: `Unpack error: ${msg}` });
    return false;
  }
}

/**
 * Initializes the Kokoro ONNX neural engine if models are present.
 */
export async function initKokoroNeural(): Promise<boolean> {
  if (isNeuralReady()) {
    kokoroEngineStore.setState({ status: 'ready', error: null, speakerCount: 53 });
    return true;
  }
  if (isInitializing) return false;

  const modelDir = findKokoroModelDirectory();
  if (!modelDir) {
    kokoroEngineStore.setState({ status: 'uninstalled', error: null, speakerCount: 0 });
    return false;
  }

  const native = getSherpaNative();
  if (!native || typeof native.initializeTts !== 'function') {
    kokoroEngineStore.setState({ status: 'error', error: 'SherpaOnnx TTS module not available', speakerCount: 0 });
    return false;
  }

  isInitializing = true;
  try {
    // Android SherpaOnnxModule expects 13 parameters + Promise
    const result = await native.initializeTts(
      KOKORO_INSTANCE_ID,
      modelDir,
      'kokoro',
      4, // 4 threads for fast real-time INT8 neural inference on modern octa-core SoCs
      false, // debug
      undefined, // noiseScale
      undefined, // noiseScaleW
      undefined, // lengthScale
      undefined, // ruleFsts
      undefined, // ruleFars
      undefined, // maxNumSentences
      undefined, // silenceScale
      'cpu' // provider
    );
    if (result && result.success) {
      activeInstanceId = KOKORO_INSTANCE_ID;
      kokoroEngineStore.setState({
        status: 'ready',
        error: null,
        speakerCount: result.numSpeakers || 53,
      });
      return true;
    }
    activeInstanceId = null;
    kokoroEngineStore.setState({
      status: 'error',
      error: result?.error || 'Native Kokoro engine failed to initialize',
      speakerCount: 0,
    });
    return false;
  } catch (e) {
    activeInstanceId = null;
    kokoroEngineStore.setState({
      status: 'error',
      error: e instanceof Error ? e.message : String(e),
      speakerCount: 0,
    });
    return false;
  } finally {
    isInitializing = false;
  }
}

export interface NeuralSpeakOptions {
  styleId?: string | null;
  speed?: number;
  pitch?: number;
  onDone?: () => void;
}

interface QueuedUtterance {
  id: number;
  text: string;
  options: NeuralSpeakOptions;
  resolve: (ok: boolean) => void;
}

const utteranceQueue: QueuedUtterance[] = [];
let isPlayingUtterance = false;
let currentUtteranceId = 0;

async function executeNeuralSynthesis(text: string, options: NeuralSpeakOptions): Promise<boolean> {
  const native = getSherpaNative();
  if (!native || typeof native.generateTts !== 'function') return false;

  const styleId = options.styleId ?? DEFAULT_KOKORO_STYLE_ID;
  const sid = KOKORO_SID_MAP[styleId] ?? KOKORO_SID_MAP[DEFAULT_KOKORO_STYLE_ID] ?? 3;
  const speed = options.speed ?? 1.0;

  try {
    const result = await native.generateTts(activeInstanceId, text, {
      sid,
      speed,
      playDirectly: true,
    });
    return !!(result && result.success);
  } catch (err) {
    return false;
  }
}

async function processNextUtterance(): Promise<void> {
  if (isPlayingUtterance || utteranceQueue.length === 0) return;
  isPlayingUtterance = true;
  const current = utteranceQueue.shift()!;

  try {
    kokoroEngineStore.setState({ status: 'synthesizing' });
    const ok = await executeNeuralSynthesis(current.text, current.options);
    kokoroEngineStore.setState({ status: 'ready' });
    current.options.onDone?.();
    current.resolve(ok);
  } catch (err) {
    kokoroEngineStore.setState({ status: 'ready' });
    current.options.onDone?.();
    current.resolve(false);
  } finally {
    isPlayingUtterance = false;
    if (utteranceQueue.length > 0) {
      void processNextUtterance();
    }
  }
}

/**
 * Synthesizes and plays speech using genuine Kokoro neural inference.
 * Sequential queue ensures sentences play naturally without overlapping or audio crashes.
 */
export async function synthesizeNeural(
  text: string,
  options: NeuralSpeakOptions = {}
): Promise<boolean> {
  if (!activeInstanceId) {
    const ok = await initKokoroNeural();
    if (!ok || !activeInstanceId) return false;
  }

  return new Promise<boolean>((resolve) => {
    utteranceQueue.push({
      id: ++currentUtteranceId,
      text,
      options,
      resolve,
    });
    void processNextUtterance();
  });
}

export function stopNeuralSynthesis(): void {
  // Clear any pending queued sentences
  while (utteranceQueue.length > 0) {
    const item = utteranceQueue.shift();
    item?.options.onDone?.();
    item?.resolve(false);
  }
  isPlayingUtterance = false;

  if (activeInstanceId) {
    try {
      const native = getSherpaNative();
      if (native && typeof native.stopTtsPcmPlayer === 'function') {
        native.stopTtsPcmPlayer(activeInstanceId);
      }
    } catch {
      // safe ignore
    }
  }
  if (kokoroEngineStore.getState().status === 'synthesizing') {
    kokoroEngineStore.setState({ status: 'ready' });
  }
}

export async function disposeKokoroNeural(): Promise<void> {
  stopNeuralSynthesis();
  if (activeInstanceId) {
    try {
      const native = getSherpaNative();
      if (native && typeof native.unloadTts === 'function') {
        await native.unloadTts(activeInstanceId);
      }
    } catch {
      // safe ignore
    }
    activeInstanceId = null;
  }
  kokoroEngineStore.setState({ status: 'uninstalled', speakerCount: 0 });
}
