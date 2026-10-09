import type { PromptMessage } from './chatPrompt.ts';
import type { FlashAttnMode, KvCacheType, SamplingSettings } from './settingsModel.ts';

/** Speculative decoding as llama.rn 0.12.9 implements it: MTP ("multi-token prediction") drafting. */
export type SpeculativeLoad =
  /** The target GGUF's own built-in MTP (nextn) draft layers. */
  | { mode: 'mtp'; nMax: number; pMin: number }
  /** A separate draft GGUF (must be an MTP draft head with the target's embedding width). */
  | { mode: 'draft'; draftPath: string; nMax: number; pMin: number };

export interface LoadParams {
  /** Real filesystem path to the GGUF file. */
  path: string;
  nCtx: number;
  /** null = engine default (pins the fast cores). */
  threads: number | null;
  useGpu: boolean;
  /** GPU layers when useGpu (default 99 = all). */
  nGpuLayers?: number;
  /** n_batch = n_ubatch (default 512). */
  nBatch?: number;
  flashAttn?: FlashAttnMode;
  cacheTypeK?: KvCacheType;
  cacheTypeV?: KvCacheType;
  useMmap?: boolean;
  useMlock?: boolean;
  speculative?: SpeculativeLoad;
  /** Vision projector (mmproj GGUF) path: initMultimodal is called after the model loads. */
  mmprojPath?: string;
  /** Max vision tokens per image (default: 512). Caps dynamic patch resolution to prevent prefill freeze/OOM. */
  imageMaxTokens?: number;
  /** Min vision tokens per image (default: 64). */
  imageMinTokens?: number;
  /** 0..1 */
  onProgress?: (fraction: number) => void;
}

export interface LoadedModelInfo {
  description: string;
  backend: string;
  gpu: boolean;
  nCtx: number;
  modelBytes: number;
  /** GGUF `general.architecture` (e.g. "qwen35"), when the engine could read it. */
  architecture?: string;
  /** Backend devices llama.cpp actually used (e.g. ["CPU"] or ["GPUOpenCL", "CPU"]). */
  devices?: string[];
  /** llama.rn's own explanation when the GPU was not used. */
  reasonNoGPU?: string;
  /** Native library variant Android picked (e.g. rnllama_jni_v8_2_dotprod_i8mm). */
  androidLib?: string;
  /** Speculative decoding is configured for this context (the mode that was loaded). */
  speculative?: SpeculativeLoad['mode'];
  /** Vision/audio support after initMultimodal; null = no projector. */
  multimodal?: { vision: boolean; audio: boolean } | null;
  /** Why the projector could not be used (model still works for text). */
  multimodalError?: string;
}

/** A completion done just to evaluate a prompt prefix into the KV cache (n_predict 0). */
export interface PrefixEval {
  tokens: number;
}

export interface GenerateParams {
  messages: PromptMessage[];
  maxTokens: number;
  temperature: number;
  /** top_p / top_k / min_p / repeat penalty. Omitted = the engine's defaults (DEFAULT_SAMPLING). */
  sampling?: Omit<SamplingSettings, 'temperature'>;
  /** Hybrid reasoning models: false asks the template to skip the thinking phase. */
  enableThinking: boolean;
  /** Called with the full raw text so far (reasoning markup still inline). */
  onText: (accumulatedRaw: string) => void;
  /** Called once, before the first token, when the template pre-opened a <think> block. */
  onStart?: (info: { thinkingForcedOpen: boolean }) => void;
}

export interface GenerateResult {
  text: string;
  promptTokens: number;
  generatedTokens: number;
  promptMs: number;
  predictedMs: number;
  tokensPerSecond: number;
  interrupted: boolean;
  contextFull: boolean;
  thinkingForcedOpen: boolean;
  /** Time from the start of the call to the first streamed token (prompt processing included). 0/undefined = no token. */
  ttftMs?: number;
  /** Prompt tokens reused from the KV cache instead of being evaluated again. */
  cachedTokens?: number;
  /** Speculative decoding counters for this call (0 when it was not active). */
  draftTokens?: number;
  draftAccepted?: number;
}

export interface InferenceEngine {
  load(params: LoadParams): Promise<LoadedModelInfo>;
  generate(params: GenerateParams): Promise<GenerateResult>;
  stop(): Promise<void>;
  release(): Promise<void>;
  /**
   * Exact number of prompt tokens these messages will use once the model's own chat template is applied.
   * Optional: engines that cannot count return nothing and callers fall back to an estimate.
   */
  countPromptTokens?(messages: PromptMessage[], enableThinking: boolean): Promise<number>;
  /** KV session cache (optional): evaluate the system-prompt prefix only, then save/restore the context state. */
  evalPrefix?(system: string, enableThinking: boolean): Promise<PrefixEval>;
  saveSession?(path: string): Promise<number>;
  /** Returns the number of tokens restored. */
  loadSession?(path: string): Promise<number>;
}

/** The requested speculative configuration cannot run with this model/draft (checked BEFORE loading, so nothing crashes). */
export class SpeculativeUnsupportedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'SpeculativeUnsupportedError';
  }
}

export class EngineUnavailableError extends Error {
  constructor(detail?: string) {
    super(
      'The on-device AI engine is not available in this build. Install the CHIWIWI app (APK / development build) - it does not run inside Expo Go or a browser.' +
        (detail ? ` (${detail})` : ''),
    );
    this.name = 'EngineUnavailableError';
  }
}

/** A load failure that carries what llama.cpp printed while loading (the thrown message alone is just "Failed to load model"). */
export class EngineLoadError extends Error {
  nativeLog: string;
  constructor(message: string, nativeLog = '') {
    super(message);
    this.name = 'EngineLoadError';
    this.nativeLog = nativeLog;
  }
}

export type EngineErrorKind =
  | 'unavailable'
  | 'out_of_memory'
  | 'bad_file'
  | 'unsupported_model'
  | 'file_access'
  | 'context_full'
  | 'busy'
  | 'no_output'
  | 'unknown';

export interface EngineDiagnosis {
  kind: EngineErrorKind;
  /** What went wrong, in plain words. */
  message: string;
  /** What the user can do about it. */
  fix: string;
}

const FIX_SMALLER = 'Pick a smaller model, close other apps, or lower the context size in Settings > Advanced.';
const FIX_REDOWNLOAD = 'Delete the model and download it again, or pick another model.';

/**
 * Turn a native load/generate failure into a cause + a next step.
 * llama.rn only throws "Failed to load model" for every load failure, so the llama.cpp log
 * lines captured during the load (`EngineLoadError.nativeLog`) are searched as well.
 */
export function diagnoseEngineError(e: unknown): EngineDiagnosis {
  if (e instanceof EngineUnavailableError) {
    return { kind: 'unavailable', message: e.message, fix: 'Install the CHIWIWI app (APK / development build). It does not run in Expo Go or a browser.' };
  }
  const raw = e instanceof Error ? e.message : String(e);
  const log = e instanceof EngineLoadError ? e.nativeLog : '';
  const hay = `${raw}\n${log}`;

  if (/unknown model architecture|unsupported (model )?architecture|unknown architecture|arch.*not supported/i.test(hay)) {
    return {
      kind: 'unsupported_model',
      message: 'This version of the AI engine does not know this model type yet.',
      fix: 'Pick a different model (Qwen3 4B Instruct is the safest), or update CHIWIWI to a newer build.',
    };
  }
  if (/not within the file bounds|file is (too small|truncated)|incomplete|unexpected end|failed to read magic|invalid magic|bad magic|not a valid gguf|gguf_init_from_file|invalid gguf|failed to (read|load) (the )?(model|gguf|file) (header|metadata)/i.test(hay)) {
    return { kind: 'bad_file', message: 'The model file is damaged or incomplete.', fix: FIX_REDOWNLOAD };
  }
  if (/no such file|ENOENT|failed to open|cannot open|permission denied|EACCES|operation not permitted/i.test(hay)) {
    return {
      kind: 'file_access',
      message: 'The engine could not open the model file.',
      fix: 'Check the storage folder and "All files access" in Settings > Storage, or switch to app storage and download the model again.',
    };
  }
  if (/out of memory|failed to allocate|unable to allocate|cannot allocate|bad_alloc|ENOMEM|alloc.*fail|\boom\b|not enough memory|mmap.*(fail|error)/i.test(hay)) {
    return { kind: 'out_of_memory', message: 'There is not enough free memory to load this model.', fix: FIX_SMALLER };
  }
  if (/context is full|context_full|prompt.*too long|exceeds.*context/i.test(raw)) {
    return {
      kind: 'context_full',
      message: "The conversation no longer fits in the model's memory.",
      fix: 'Start a new chat, or raise the context size in Settings > Advanced.',
    };
  }
  if (/context is busy/i.test(raw)) {
    return { kind: 'busy', message: 'The model is still working on the previous request.', fix: 'Wait a moment, or press Stop, then try again.' };
  }
  if (/failed to load model/i.test(raw)) {
    // Nothing more specific was logged. On a phone this is, by far, most often memory.
    return {
      kind: 'out_of_memory',
      message: 'The engine could not load this model (most likely not enough free memory, or the file is damaged).',
      fix: `${FIX_SMALLER} If it keeps failing, ${FIX_REDOWNLOAD.charAt(0).toLowerCase()}${FIX_REDOWNLOAD.slice(1)}`,
    };
  }
  return { kind: 'unknown', message: `The engine reported: ${raw.slice(0, 200)}`, fix: 'Try again. If it keeps happening, pick another model.' };
}

/** One-line version of `diagnoseEngineError` (cause + fix) for places that show a single string. */
export function friendlyEngineError(e: unknown): string {
  const d = diagnoseEngineError(e);
  return d.kind === 'unavailable' ? d.message : `${d.message} ${d.fix}`;
}
