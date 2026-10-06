/**
 * InferenceEngine backed by llama.rn (llama.cpp via JSI).
 *
 * `llama.rn` is required lazily so that opening the app in an environment without
 * the native module (Expo Go, web) shows a clear message instead of crashing at
 * import time. Nothing here fabricates output: if the engine cannot run, load()
 * throws EngineUnavailableError and the UI says so.
 */
import { Platform } from 'react-native';
import type { LlamaContext } from 'llama.rn';
import {
  EngineUnavailableError,
  type GenerateParams,
  type GenerateResult,
  type InferenceEngine,
  type LoadParams,
  type LoadedModelInfo,
} from '../core/engineTypes.ts';

type LlamaModule = typeof import('llama.rn');

function loadModule(): LlamaModule {
  try {
    return require('llama.rn') as LlamaModule;
  } catch (e) {
    throw new EngineUnavailableError(e instanceof Error ? e.message : undefined);
  }
}

const STOP_WORDS = ['<|im_end|>', '<|eot_id|>', '<end_of_turn>', '</s>'];

export class LlamaEngine implements InferenceEngine {
  private ctx: LlamaContext | null = null;

  async load(params: LoadParams): Promise<LoadedModelInfo> {
    const mod = loadModule();
    await this.release();

    // Stability first: CPU everywhere on Android unless the user opts into the experimental GPU path.
    const backend: Record<string, unknown> =
      Platform.OS === 'android'
        ? params.useGpu
          ? { n_gpu_layers: 99 }
          : { devices: ['CPU'] }
        : {};

    let ctx: LlamaContext;
    try {
      ctx = await mod.initLlama(
        {
          model: params.path,
          n_ctx: params.nCtx,
          use_mlock: false,
          ...(params.threads ? { n_threads: params.threads } : {}),
          ...backend,
        },
        // llama.rn reports an integer percentage 0..100.
        (percent: number) => params.onProgress?.(percent / 100),
      );
    } catch (e) {
      if (e instanceof Error && /JSI|TurboModule|RNLlama|could not be found|not.*installed/i.test(e.message)) {
        throw new EngineUnavailableError(e.message);
      }
      throw e;
    }
    this.ctx = ctx;
    return {
      description: ctx.model?.desc ?? 'GGUF model',
      backend: ctx.gpu ? `GPU (${ctx.devices?.join(', ') ?? 'accelerated'})` : 'CPU',
      gpu: !!ctx.gpu,
      nCtx: params.nCtx,
      modelBytes: ctx.model?.size ?? 0,
    };
  }

  async generate(params: GenerateParams): Promise<GenerateResult> {
    const ctx = this.ctx;
    if (!ctx) throw new EngineUnavailableError('no model is loaded');

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
    const result = await ctx.completion(
      {
        messages: params.messages,
        n_predict: params.maxTokens,
        temperature: params.temperature,
        top_k: 40,
        top_p: 0.9,
        min_p: 0.05,
        penalty_repeat: 1.1,
        stop: STOP_WORDS,
        jinja: true,
        enable_thinking: params.enableThinking,
        // Keep <think> markup inline; core/thinking.ts separates it deterministically.
        reasoning_format: 'none',
      },
      (data) => {
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
    };
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
