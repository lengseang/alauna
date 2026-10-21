/**
 * InferenceEngine backed by llama.rn (llama.cpp via JSI).
 *
 * Every call below was checked against the INSTALLED llama.rn 0.12.9 sources (node_modules/llama.rn/src/index.ts,
 * src/types.ts and cpp/jsi/*): parameter names, the progress callback (integer percent 0..100), the token
 * callback ({ token }), the result fields (timings.*, tokens_*, draft_tokens*, interrupted, context_full) and release().
 *
 * v2 facts from the native sources that shape this file:
 *  - Speculative decoding in 0.12.9 is MTP only (cpp/rn-completion.cpp `shouldUseMTP`): `spec_type: 'draft-mtp'` at
 *    init, the draft is either the target's own nextn layers or a separate MTP-head GGUF (`model_draft`). The draft must
 *    have the target's embedding width or llama.cpp ABORTS the process (GGML_ASSERT in common/speculative.cpp), so the
 *    pair is checked from the GGUF headers (`loadLlamaModelInfo`) BEFORE initLlama and refused with a reason.
 *  - Vision: `ctx.initMultimodal({ path: mmproj })` after load; images go in as `image_url` message parts.
 *  - KV sessions: `completion({ prompt, n_predict: 0 })` evaluates a prefix; `saveSession`/`loadSession` persist it.
 *
 * `llama.rn` is required lazily so that opening the app in an environment without the native module
 * (Expo Go, web) shows a clear message instead of crashing at import time. Nothing here fabricates output:
 * if the engine cannot run, load() throws and the UI says why.
 */
import { Platform } from 'react-native';
import type { ContextParams, LlamaContext, NativeBackendDeviceInfo, RNLlamaOAICompatibleMessage } from 'llama.rn';
import {
  EngineLoadError,
  EngineUnavailableError,
  SpeculativeUnsupportedError,
  type GenerateParams,
  type GenerateResult,
  type InferenceEngine,
  type LoadParams,
  type LoadedModelInfo,
  type PrefixEval,
  type SpeculativeLoad,
} from '../core/engineTypes.ts';
import type { PromptMessage } from '../core/chatPrompt.ts';
import { DEFAULT_SAMPLING } from '../core/settingsModel.ts';

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

/** Default batch: 512 = llama.cpp's own micro-batch default, keeps compute buffers small on a phone. */
const DEFAULT_BATCH = 512;

const LOAD_LOG_LINES = 40;

/** Marks where the first user message starts in the template output (the cached prefix ends right before it). */
const PREFIX_SENTINEL = 'CHIWIWI_PREFIX_SENTINEL_7f3a9c';

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

/** GGUF header values (llama.rn returns every key as a string). */
async function ggufInfo(mod: LlamaModule, path: string): Promise<Record<string, unknown>> {
  const info = (await mod.loadLlamaModelInfo(path)) as Record<string, unknown> | undefined;
  if (!info || typeof info !== 'object') throw new Error('could not read the GGUF header');
  return info;
}

const headerNum = (info: Record<string, unknown>, key: string): number => {
  const arch = String(info['general.architecture'] ?? '');
  const v = Number(info[`${arch}.${key}`]);
  return Number.isFinite(v) ? v : 0;
};

/**
 * Refuse a speculative configuration llama.cpp cannot run, from the GGUF headers alone (no load, no crash).
 * Exported for the contract test.
 */
export async function checkSpeculative(mod: LlamaModule, targetPath: string, sp: SpeculativeLoad): Promise<void> {
  let target: Record<string, unknown>;
  try {
    target = await ggufInfo(mod, targetPath);
  } catch (e) {
    throw new SpeculativeUnsupportedError(`The model header could not be read (${e instanceof Error ? e.message : String(e)}).`);
  }
  if (sp.mode === 'mtp') {
    if (headerNum(target, 'nextn_predict_layers') <= 0) {
      throw new SpeculativeUnsupportedError('This model file has no built-in MTP draft layers, so it cannot draft for itself.');
    }
    return;
  }
  let draft: Record<string, unknown>;
  try {
    draft = await ggufInfo(mod, sp.draftPath);
  } catch (e) {
    throw new SpeculativeUnsupportedError(`The draft model header could not be read (${e instanceof Error ? e.message : String(e)}).`);
  }
  // llama.cpp asserts n_embd_out(draft) == n_embd_out(target) and ABORTS otherwise (common/speculative.cpp).
  const outWidth = (info: Record<string, unknown>) => headerNum(info, 'embedding_length_out') || headerNum(info, 'embedding_length');
  const tW = outWidth(target);
  const dW = outWidth(draft);
  if (headerNum(draft, 'nextn_predict_layers') <= 0 || tW <= 0 || tW !== dW) {
    throw new SpeculativeUnsupportedError(
      `This engine version (llama.rn 0.12.9) only drafts with MTP draft heads built for the target model; the chosen draft is a standalone model` +
        (tW !== dW ? ` (hidden size ${dW} vs ${tW})` : '') +
        '.',
    );
  }
}

/** Our messages -> llama.rn's OpenAI-style messages (images become image_url parts before the text). */
function toLlamaMessages(messages: PromptMessage[]): RNLlamaOAICompatibleMessage[] {
  return messages.map((m) =>
    m.images?.length
      ? {
          role: m.role,
          content: [
            ...m.images.map((url) => ({ type: 'image_url' as const, image_url: { url: url.replace(/^file:\/\//, '') } })),
            { type: 'text' as const, text: m.content || ' ' },
          ],
        }
      : { role: m.role, content: m.content },
  );
}

/** The real CPU/GPU device list (llama.cpp backends compiled into this build). */
export async function getBackendDevices(): Promise<NativeBackendDeviceInfo[]> {
  return loadModule().getBackendDevicesInfo();
}

/**
 * Compute the CPU affinity mask targeting Android high-performance cores.
 * On modern 8-core Android SoCs (Snapdragon 8 Gen 2 / 8 Gen 1 / Dimensity):
 * Cores 0-2 (or 0-3) are LITTLE/efficiency cores (Cortex-A510 @ 2.0 GHz).
 * Cores 3-6 are BIG/performance cores (Cortex-A710/A715 @ 2.8 GHz).
 * Core 7 is the PRIME core (Cortex-X3 @ 3.36 GHz).
 *
 * Allocating the top N cores (from Core 7 downwards) achieves peak inference throughput
 * while leaving efficiency cores 0..2 100% free for the Android OS UI thread, SurfaceFlinger,
 * audio pipelines, and the React Native Hermes runtime.
 */
export function androidCpuMask(threads: number): string | undefined {
  if (threads <= 0) return undefined;
  if (threads >= 8) return '0xFF';
  const val = ((1 << threads) - 1) << (8 - threads);
  return '0x' + val.toString(16).toUpperCase();
}

export class LlamaEngine implements InferenceEngine {
  private ctx: LlamaContext | null = null;

  async load(params: LoadParams): Promise<LoadedModelInfo> {
    const mod = loadModule();
    await this.release();

    if (params.speculative) await checkSpeculative(mod, params.path, params.speculative);

    // Stability first: CPU everywhere on Android unless the user opts into the experimental GPU path.
    const backend: Pick<ContextParams, 'n_gpu_layers' | 'devices'> =
      Platform.OS === 'android'
        ? params.useGpu
          ? { n_gpu_layers: params.nGpuLayers ?? 99 }
          : { devices: ['CPU'] }
        : {};
    const sp = params.speculative;
    const speculative: Partial<ContextParams> = sp
      ? {
          spec_type: 'draft-mtp',
          spec_draft_n_max: sp.nMax,
          spec_draft_p_min: sp.pMin,
          ...(sp.mode === 'draft' ? { model_draft: sp.draftPath } : {}),
        }
      : {};
    const batch = params.nBatch ?? DEFAULT_BATCH;

    const isAndroid = Platform.OS === 'android';
    // Performance & stability on Android:
    // 1. Assign explicit thread count (default 4 on big cores) to prevent SELinux-blocked sysfs reads
    //    in llama.rn's set_best_cores from producing an all-zero CPU mask.
    // 2. Pass explicit cpu_mask targeting the performance cluster (cores 4..7 on 8-core CPUs like Snapdragon 8 Gen 2)
    //    and cpu_strict: false so worker threads balance without stalling, keeping cores 0..2 100% free for the Android UI.
    const effectiveThreads = params.threads && params.threads > 0 ? params.threads : (isAndroid ? 4 : undefined);
    const cpuMask = isAndroid && effectiveThreads ? androidCpuMask(effectiveThreads) : undefined;

    const log = await captureLoadLog(mod);
    let ctx: LlamaContext;
    try {
      ctx = await mod.initLlama(
        {
          model: params.path,
          n_ctx: params.nCtx,
          n_batch: batch,
          n_ubatch: batch,
          n_parallel: 1, // Single-user mobile chat: eliminates 8x KV cache sequences / ~2GB memory bloat
          use_mlock: params.useMlock ?? false,
          ...(params.useMmap !== undefined ? { use_mmap: params.useMmap } : {}),
          ...(params.flashAttn ? { flash_attn_type: params.flashAttn } : {}),
          ...(params.cacheTypeK ? { cache_type_k: params.cacheTypeK } : {}),
          ...(params.cacheTypeV ? { cache_type_v: params.cacheTypeV } : {}),
          ...(effectiveThreads ? { n_threads: effectiveThreads } : {}),
          ...(cpuMask ? { cpu_mask: cpuMask, cpu_strict: false } : {}),
          ...backend,
          ...speculative,
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

    let multimodal: LoadedModelInfo['multimodal'] = null;
    let multimodalError: string | undefined;
    if (params.mmprojPath) {
      try {
        const ok = await ctx.initMultimodal({
          path: params.mmprojPath.replace(/^file:\/\//, ''),
          use_gpu: params.useGpu,
          image_max_tokens: params.imageMaxTokens ?? 512,
          image_min_tokens: params.imageMinTokens ?? 64,
        });
        if (ok) multimodal = await ctx.getMultimodalSupport();
        else multimodalError = 'the projector file did not initialise';
      } catch (e) {
        multimodalError = e instanceof Error ? e.message : String(e);
      }
    }

    const arch = (ctx.model?.metadata as Record<string, unknown> | undefined)?.['general.architecture'];
    return {
      description: ctx.model?.desc ?? 'GGUF model',
      backend: ctx.gpu ? `GPU (${ctx.devices?.join(', ') ?? 'accelerated'})` : 'CPU',
      gpu: !!ctx.gpu,
      nCtx: params.nCtx,
      modelBytes: ctx.model?.size ?? 0,
      architecture: typeof arch === 'string' ? arch : undefined,
      devices: ctx.devices ?? [],
      reasonNoGPU: ctx.reasonNoGPU || undefined,
      androidLib: ctx.androidLib || undefined,
      ...(sp ? { speculative: sp.mode } : {}),
      multimodal,
      ...(multimodalError ? { multimodalError } : {}),
    };
  }

  async generate(params: GenerateParams): Promise<GenerateResult> {
    const ctx = this.ctx;
    if (!ctx) throw new EngineUnavailableError('no model is loaded');
    const t0 = Date.now();
    const messages = toLlamaMessages(params.messages);

    // Ask the template whether it pre-opened a <think> block (newer Qwen / DeepSeek templates do),
    // so the UI can split reasoning from the answer correctly from the very first token.
    let thinkingForcedOpen = false;
    try {
      const formatted = await ctx.getFormattedChat(messages, undefined, {
        jinja: true,
        enable_thinking: params.enableThinking,
        reasoning_format: 'none',
      });
      thinkingForcedOpen = formatted.type === 'jinja' && !!(formatted as { thinking_forced_open?: boolean }).thinking_forced_open;
    } catch {
      // Not fatal: explicit <think> tags are still parsed.
    }
    params.onStart?.({ thinkingForcedOpen });

    const sampling = params.sampling ?? DEFAULT_SAMPLING;
    let accumulated = '';
    let ttftMs = 0;
    const result = await ctx.completion(
      {
        messages,
        n_predict: params.maxTokens,
        temperature: params.temperature,
        top_k: sampling.topK,
        top_p: sampling.topP,
        min_p: sampling.minP,
        penalty_repeat: sampling.repeatPenalty,
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
      cachedTokens: result.tokens_cached ?? timings?.cache_n ?? undefined,
      draftTokens: result.draft_tokens ?? 0,
      draftAccepted: result.draft_tokens_accepted ?? 0,
    };
  }

  /** Exact prompt length (in the model's own tokens) after its chat template is applied (images included). */
  async countPromptTokens(messages: PromptMessage[], enableThinking: boolean): Promise<number> {
    const ctx = this.ctx;
    if (!ctx) throw new EngineUnavailableError('no model is loaded');
    try {
      const formatted = await ctx.getFormattedChat(toLlamaMessages(messages), undefined, {
        jinja: true,
        enable_thinking: enableThinking,
        reasoning_format: 'none',
      });
      const media = formatted.media_paths?.length ? { media_paths: formatted.media_paths } : undefined;
      const { tokens } = await ctx.tokenize(formatted.prompt, media);
      return tokens.length;
    } catch {
      return 0;
    }
  }

  /**
   * Evaluate only the system-prompt prefix into the KV cache. The prefix is the template output up to where the first
   * user message's text starts, so it is a byte-exact prefix of every later chat prompt with this system prompt.
   */
  async evalPrefix(system: string, enableThinking: boolean): Promise<PrefixEval> {
    const ctx = this.ctx;
    if (!ctx) throw new EngineUnavailableError('no model is loaded');
    const formatted = await ctx.getFormattedChat(
      [
        { role: 'system', content: system },
        { role: 'user', content: PREFIX_SENTINEL },
      ],
      undefined,
      { jinja: true, enable_thinking: enableThinking, reasoning_format: 'none' },
    );
    const at = formatted.prompt.indexOf(PREFIX_SENTINEL);
    if (at <= 0) throw new Error('the chat template did not place the system prompt first');
    const r = await ctx.completion({ prompt: formatted.prompt.slice(0, at), n_predict: 0 });
    return { tokens: r.tokens_evaluated ?? 0 };
  }

  async saveSession(path: string): Promise<number> {
    const ctx = this.ctx;
    if (!ctx) throw new EngineUnavailableError('no model is loaded');
    return ctx.saveSession(path.replace(/^file:\/\//, ''));
  }

  async loadSession(path: string): Promise<number> {
    const ctx = this.ctx;
    if (!ctx) throw new EngineUnavailableError('no model is loaded');
    try {
      const r = await ctx.loadSession(path);
      return r?.tokens_loaded ?? 0;
    } catch (e) {
      // A failed restore can leave a half-written cache: start clean so the next reply re-reads its prompt.
      try {
        await ctx.clearCache(true);
      } catch {
        // nothing more to do
      }
      throw e;
    }
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
