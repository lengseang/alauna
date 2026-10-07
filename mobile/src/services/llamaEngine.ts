/**
 * InferenceEngine backed by llama.rn (llama.cpp via JSI).
 *
 * Every call below was checked against the INSTALLED llama.rn 0.12.9 sources (node_modules/llama.rn/src/index.ts,
 * src/types.ts and cpp/jsi/*): parameter names, the progress callback (integer percent 0..100), the token
 * callback ({ token }), the result fields (timings.*, tokens_*, interrupted, context_full) and release().
 *
 * `llama.rn` is required lazily so that opening the app in an environment without the native module
 * (Expo Go, web) shows a clear message instead of crashing at import time. Nothing here fabricates output:
 * if the engine cannot run, load() throws and the UI says why.
 */
import { Platform } from 'react-native';
import type { ContextParams, LlamaContext } from 'llama.rn';
import {
  EngineLoadError,
  EngineUnavailableError,
  type GenerateParams,
  type GenerateResult,
  type InferenceEngine,
  type LoadParams,
  type LoadedModelInfo,
} from '../core/engineTypes.ts';
import type { PromptMessage } from '../core/chatPrompt.ts';

type LlamaModule = typeof import('llama.rn');

function loadModule(): LlamaModule {
  try {
    return require('llama.rn') as LlamaModule;
  } catch (e) {
    throw new EngineUnavailableError(e instanceof Error ? e.message : undefined);
  }
}

/**
 * Belt and braces: llama.cpp already stops on the model's own end-of-generation tokens.
 * llama.rn PUSHES the template's extra stops into the array it is given, so never pass this constant itself
 * (a shared array would grow on every call and leak one model's stops into the next model).
 */
const STOP_WORDS = ['<|im_end|>', '<|eot_id|>', '<end_of_turn>', '</s>'];

/** Batch sizes that suit a phone: 512 = llama.cpp's own micro-batch default, keeps compute buffers small. */
const N_BATCH = 512;
const N_UBATCH = 512;

const LOAD_LOG_LINES = 40;

/** Collect llama.cpp's warnings/errors while a model loads: the thrown error is only "Failed to load model". */
async function captureLoadLog(mod: LlamaModule): Promise<{ lines: string[]; stop: () => Promise<void> }> {
  const lines: string[] = [];
  try {
    const sub = mod.addNativeLogListener((level, text) => {
      if ((level === 'error' || level === 'warn') && lines.length < LOAD_LOG_LINES) lines.push(text.trim().slice(0, 300));
    });
    await mod.toggleNativeLog(true);
    return {
      lines,
      stop: async () => {
        sub.remove();
        try {
          await mod.toggleNativeLog(false);
        } catch {
          // logging is a diagnostic only
        }
      },
    };
  } catch {
    return { lines, stop: async () => undefined };
  }
}

export class LlamaEngine implements InferenceEngine {
  private ctx: LlamaContext | null = null;

  async load(params: LoadParams): Promise<LoadedModelInfo> {
    const mod = loadModule();
    await this.release();

    // Stability first: CPU everywhere on Android unless the user opts into the experimental GPU path.
    const backend: Pick<ContextParams, 'n_gpu_layers' | 'devices'> =
      Platform.OS === 'android'
        ? params.useGpu
          ? { n_gpu_layers: 99 }
          : { devices: ['CPU'] }
        : {};

    const log = await captureLoadLog(mod);
    let ctx: LlamaContext;
    try {
      ctx = await mod.initLlama(
        {
          model: params.path,
          n_ctx: params.nCtx,
          n_batch: N_BATCH,
          n_ubatch: N_UBATCH,
          use_mlock: false,
          ...(params.threads ? { n_threads: params.threads } : {}),
          ...backend,
        },
        // llama.rn reports an integer percentage 0..100 (and calls it with 0 first and 100 last).
        (percent: number) => params.onProgress?.(percent / 100),
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (/JSI|TurboModule|RNLlama|could not be found|not.*installed|Missing JSI/i.test(message)) {
        throw new EngineUnavailableError(message);
      }
      throw new EngineLoadError(message, log.lines.join('\n'));
    } finally {
      await log.stop();
    }
    this.ctx = ctx;
    const arch = (ctx.model?.metadata as Record<string, unknown> | undefined)?.['general.architecture'];
    return {
      description: ctx.model?.desc ?? 'GGUF model',
      backend: ctx.gpu ? `GPU (${ctx.devices?.join(', ') ?? 'accelerated'})` : 'CPU',
      gpu: !!ctx.gpu,
      nCtx: params.nCtx,
      modelBytes: ctx.model?.size ?? 0,
      architecture: typeof arch === 'string' ? arch : undefined,
    };
  }

  async generate(params: GenerateParams): Promise<GenerateResult> {
    const ctx = this.ctx;
    if (!ctx) throw new EngineUnavailableError('no model is loaded');
    const t0 = Date.now();

    // Ask the template whether it pre-opened a <think> block (newer Qwen / DeepSeek templates do),
    // so the UI can split reasoning from the answer correctly from the very first token.
    let thinkingForcedOpen = false;
    try {
      const formatted = await ctx.getFormattedChat(params.messages, undefined, {
        jinja: true,
        enable_thinking: params.enableThinking,
        reasoning_format: 'none',
      });
      thinkingForcedOpen = formatted.type === 'jinja' && !!(formatted as { thinking_forced_open?: boolean }).thinking_forced_open;
    } catch {
      // Not fatal: explicit <think> tags are still parsed.
    }
    params.onStart?.({ thinkingForcedOpen });

    let accumulated = '';
    let ttftMs = 0;
    const result = await ctx.completion(
      {
        messages: params.messages,
        n_predict: params.maxTokens,
        temperature: params.temperature,
        top_k: 40,
        top_p: 0.9,
        min_p: 0.05,
        penalty_repeat: 1.1,
        stop: [...STOP_WORDS],
        jinja: true,
        enable_thinking: params.enableThinking,
        // Keep <think> markup inline; core/thinking.ts separates it deterministically.
        reasoning_format: 'none',
      },
      (data) => {
        if (ttftMs === 0) ttftMs = Math.max(1, Date.now() - t0);
        accumulated += data.token;
        params.onText(accumulated);
      },
    );

    const timings = result.timings;
    return {
      text: accumulated || result.text || '',
      promptTokens: result.tokens_evaluated ?? 0,
      generatedTokens: result.tokens_predicted ?? 0,
      promptMs: timings?.prompt_ms ?? 0,
      predictedMs: timings?.predicted_ms ?? 0,
      tokensPerSecond: timings?.predicted_per_second ?? 0,
      interrupted: !!result.interrupted,
      contextFull: !!result.context_full,
      thinkingForcedOpen,
      ttftMs,
    };
  }

  /** Exact prompt length (in the model's own tokens) after its chat template is applied. */
  async countPromptTokens(messages: PromptMessage[], enableThinking: boolean): Promise<number> {
    const ctx = this.ctx;
    if (!ctx) throw new EngineUnavailableError('no model is loaded');
    const formatted = await ctx.getFormattedChat(messages, undefined, {
      jinja: true,
      enable_thinking: enableThinking,
      reasoning_format: 'none',
    });
    const { tokens } = await ctx.tokenize(formatted.prompt);
    return tokens.length;
  }

  async stop(): Promise<void> {
    await this.ctx?.stopCompletion();
  }

  async release(): Promise<void> {
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx) await ctx.release();
  }
}
