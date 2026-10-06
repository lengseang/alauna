import type { PromptMessage } from './chatPrompt.ts';

export interface LoadParams {
  /** Real filesystem path to the GGUF file. */
  path: string;
  nCtx: number;
  /** null = engine default (pins the fast cores). */
  threads: number | null;
  useGpu: boolean;
  /** 0..1 */
  onProgress?: (fraction: number) => void;
}

export interface LoadedModelInfo {
  description: string;
  backend: string;
  gpu: boolean;
  nCtx: number;
  modelBytes: number;
}

export interface GenerateParams {
  messages: PromptMessage[];
  maxTokens: number;
  temperature: number;
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
}

export interface InferenceEngine {
  load(params: LoadParams): Promise<LoadedModelInfo>;
  generate(params: GenerateParams): Promise<GenerateResult>;
  stop(): Promise<void>;
  release(): Promise<void>;
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

/** Turn a native load/generate failure into advice the user can act on. */
export function friendlyEngineError(e: unknown): string {
  if (e instanceof EngineUnavailableError) return e.message;
  const raw = e instanceof Error ? e.message : String(e);
  if (/out of memory|alloc|bad_alloc|ENOMEM|oom/i.test(raw)) {
    return 'Not enough memory to load this model. Close other apps, or choose a smaller model (or a smaller context in Settings > Advanced).';
  }
  if (/unknown model architecture|unsupported|invalid.*(magic|gguf)|failed to (load|read)|bad magic|tensor/i.test(raw)) {
    return 'The engine could not read this model file. It may be damaged or use a format this version does not support. Delete it and download again, or pick another model.';
  }
  if (/no such file|ENOENT|not found|permission|EACCES/i.test(raw)) {
    return 'The engine could not open the model file. Check the storage folder permission in Settings > Storage.';
  }
  return `The engine failed: ${raw.slice(0, 200)}`;
}
