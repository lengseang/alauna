/**
 * One assistant turn: build the prompt, stream the model's output, split
 * reasoning from the clean answer, and produce the final message fields.
 *
 * Requirements CH-1..CH-5, CH-7. Everything the "process panel" shows comes from
 * here and is real: phase changes are driven by actual tokens, prompt/generation
 * numbers come from the engine's own timings.
 */
import type { ModelSpec } from './catalog.ts';
import { buildPrompt, type BuiltPrompt, type HistoryMessage, type PromptMessage } from './chatPrompt.ts';
import { imagePaths, withAttachments, type Attachment, type ChatMessage, type MessageStats } from './chatTypes.ts';
import type { SamplingSettings } from './settingsModel.ts';
import { friendlyEngineError, type GenerateParams, type GenerateResult } from './engineTypes.ts';
import { parseThinking, type OutputPhase } from './thinking.ts';
import { groundSampling, groundSystemPrompt, pruneHistoryImages } from './visionProfile.ts';
import { isMessageCutOff, closeUnclosedMarkup, stripContinuationPreamble, stripRedundantCodeFence } from './conversationContinuity.ts';

export interface TurnInput {
  history: HistoryMessage[];
  userText: string;
  attachments: Attachment[];
  spec: ModelSpec;
  nCtx: number;
  system: string;
  thinkingEnabled: boolean;
  generate: (params: GenerateParams) => Promise<GenerateResult>;
  now: () => number;
  /** Called for every streamed update (the caller should coalesce for rendering). */
  onUpdate: (patch: Partial<ChatMessage>) => void;
  temperature?: number;
  /** Tokens one image can take in the prompt (visionProfile.imageTokenAllowance); default = chatPrompt's estimate. */
  imageTokens?: number;
  /** Full sampling (soul-adjusted, core/persona.ts padToSampling). Wins over `temperature`. */
  sampling?: SamplingSettings;
  /** Backend label to store in the reply's stats ("CPU" / "GPU (...)"). */
  backend?: string;
  /** Optional abort signal to cancel generation at any point (during prefill, reasoning, or answer). */
  signal?: AbortSignal;
  /**
   * Exact prompt size from the model's own tokenizer (null = cannot count). When given, the prompt is re-trimmed until
   * it really fits, which the character-based estimate cannot guarantee for Khmer, CJK, digits or code.
   */
  countPromptTokens?: (messages: PromptMessage[], enableThinking: boolean) => Promise<number | null>;
  /** Optional continuation payload when resuming a cut-off or cancelled assistant message */
  continuation?: {
    priorText: string;
    priorReasoning?: string;
  };
}

export type TurnOutcome = Pick<ChatMessage, 'text' | 'reasoning' | 'status' | 'stats' | 'thinkSeconds' | 'error' | 'phase' | 'notice' | 'canContinue' | 'rawText'>;

/** How many tokens we let the model write, relative to the context window. */
export function replyBudgetFor(spec: ModelSpec, nCtx: number, thinking: boolean): number {
  const reasoning = spec.thinking !== 'none' && thinking;
  return Math.max(256, Math.floor(nCtx * (reasoning ? 0.6 : 0.4)));
}

export function wantsThinking(spec: ModelSpec, thinkingEnabled: boolean): boolean {
  if (spec.thinking === 'always') return true;
  if (spec.thinking === 'toggle') return thinkingEnabled;
  return false;
}

export async function runAssistantTurn(input: TurnInput): Promise<TurnOutcome> {
  const { spec, now } = input;
  const priorText = input.continuation?.priorText ?? '';
  const priorReasoning = input.continuation?.priorReasoning ?? '';
  const thinking = wantsThinking(spec, input.thinkingEnabled);
  const replyBudget = replyBudgetFor(spec, input.nCtx, thinking);
  const userContent = withAttachments(input.userText, input.attachments);
  const userImages = imagePaths(input.attachments);
  const hasImages = userImages.length > 0;
  // Image turns: only this turn's images are sent (a text follow-up keeps the newest), a one-line grounding rule joins
  // the system prompt for this turn only, and sampling is lowered so the model stops inventing details.
  const system = hasImages ? groundSystemPrompt(input.system) : input.system;
  const history = pruneHistoryImages(input.history, hasImages);
  const sampling = input.sampling && hasImages ? groundSampling(input.sampling) : input.sampling;
  const temperature = sampling?.temperature ?? (hasImages ? Math.min(input.temperature ?? 0.7, 0.2) : input.temperature ?? 0.7);
  const build = (tokenScale: number): BuiltPrompt =>
    buildPrompt({
      system,
      history,
      userMessage: userContent,
      userImages,
      imageTokens: input.imageTokens,
      nCtx: input.nCtx,
      replyBudget,
      tokenScale,
    });
  if (input.signal?.aborted) {
    return {
      text: priorText,
      rawText: priorText,
      reasoning: priorReasoning || undefined,
      status: 'stopped',
      phase: 'done',
      notice: 'Stopped by user.',
    };
  }

  let built = build(1);
  let countedPromptTokens: number | null = null;
  if (input.countPromptTokens && !input.signal?.aborted) {
    const allowance = Math.max(256, input.nCtx - replyBudget);
    let scale = 1;
    const maxAttempts = userImages.length > 0 ? 1 : 3;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (input.signal?.aborted) break;
      let real: number | null = null;
      try {
        real = await input.countPromptTokens(built.messages, thinking);
      } catch {
        real = null;
      }
      if (real !== null) countedPromptTokens = real;
      if (real === null || real <= allowance) break;
      // Trimming user text can only recover tokens from text, not from image embeddings.
      if (userImages.length > 0) break;
      // The estimate was too low for this text: scale it by the error we just observed (+5%) and trim again.
      scale *= Math.max(1.1, (real / Math.max(1, built.estimatedPromptTokens)) * 1.05);
      built = build(scale);
    }
  }

  if (input.signal?.aborted) {
    return {
      text: priorText,
      rawText: priorText,
      reasoning: priorReasoning || undefined,
      status: 'stopped',
      phase: 'done',
      notice: 'Stopped by user.',
    };
  }

  const notes: string[] = [];
  if (built.droppedMessages > 0) notes.push(`${built.droppedMessages} older message${built.droppedMessages === 1 ? '' : 's'} did not fit the model's memory and were left out of this reply.`);
  if (built.truncatedUserMessage) notes.push('Your message was too long for the model and was shortened.');
  const overBudget = hasImages && countedPromptTokens !== null && countedPromptTokens > Math.max(256, input.nCtx - replyBudget);
  if (overBudget) notes.push('The image needs more memory than this context allows; lower the Vision token budget or raise the context size in Settings > Advanced.');

  const startedAt = now();
  let forcedOpen = spec.thinking === 'always';
  let thinkStartedAt: number | null = null;
  let thinkEndedAt: number | null = null;
  let lastStreamedRaw = '';
  let lastParsedAnswer = '';
  let lastParsedReasoning = '';

  const actualPromptEst = countedPromptTokens ?? built.estimatedPromptTokens;
  input.onUpdate({
    status: 'streaming',
    phase: 'reading',
    promptTokensEst: actualPromptEst,
    text: priorText,
    reasoning: priorReasoning || '',
    notice: userImages.length > 0
      ? [`Analyzing ${userImages.length === 1 ? 'image' : `${userImages.length} images`}${actualPromptEst ? ` (~${actualPromptEst} tokens)` : ''}`, ...(overBudget ? notes.slice(-1) : [])].join('. ')
      : notes.join(' ') || undefined,
  });

  const track = (raw: string): { answer: string; reasoning: string; phase: OutputPhase } => {
    const parsed = parseThinking(raw, { startInThinking: forcedOpen });
    if (parsed.phase === 'thinking' && thinkStartedAt === null) thinkStartedAt = now();
    if (parsed.reasoningComplete && thinkEndedAt === null) {
      if (thinkStartedAt === null) thinkStartedAt = startedAt;
      thinkEndedAt = now();
    }
    return { answer: parsed.answer, reasoning: parsed.reasoning, phase: parsed.phase };
  };

  try {
    const promptCost = countedPromptTokens ?? built.estimatedPromptTokens;
    const safeMaxTokens = Math.max(64, Math.min(replyBudget, input.nCtx - promptCost - 16));
    const result = await input.generate({
      messages: built.messages,
      maxTokens: safeMaxTokens,
      temperature,
      ...(sampling
        ? { sampling: { topP: sampling.topP, topK: sampling.topK, minP: sampling.minP, repeatPenalty: sampling.repeatPenalty } }
        : {}),
      enableThinking: thinking,
      onStart: (info) => {
        forcedOpen = forcedOpen || info.thinkingForcedOpen;
      },
      onText: (raw) => {
        if (input.signal?.aborted) return;
        lastStreamedRaw = raw;
        const p = track(raw);
        lastParsedAnswer = p.answer;
        lastParsedReasoning = p.reasoning;
        const cleanedAnswer = input.continuation
          ? stripRedundantCodeFence(stripContinuationPreamble(p.answer), priorText)
          : p.answer;
        const fullAnswer = priorText ? `${priorText}${cleanedAnswer}` : p.answer;
        const fullReasoning = priorReasoning && p.reasoning ? `${priorReasoning}\n\n${p.reasoning}` : (priorReasoning || p.reasoning);
        input.onUpdate({ text: fullAnswer, reasoning: fullReasoning || undefined, phase: p.phase, status: 'streaming' });
      },
    });

    forcedOpen = forcedOpen || result.thinkingForcedOpen;
    const final = track(result.text);
    const cleanedFinal = input.continuation
      ? stripRedundantCodeFence(stripContinuationPreamble(final.answer), priorText)
      : final.answer;
    const finalRawAnswer = priorText ? `${priorText}${cleanedFinal}` : final.answer;
    const finalReasoning = priorReasoning && final.reasoning ? `${priorReasoning}\n\n${final.reasoning}` : (priorReasoning || final.reasoning);
    const endedAt = now();
    const stats: MessageStats = {
      modelId: spec.id,
      promptTokens: result.promptTokens || built.estimatedPromptTokens,
      generatedTokens: result.generatedTokens,
      tokensPerSecond: result.tokensPerSecond || (result.predictedMs > 0 ? (result.generatedTokens * 1000) / result.predictedMs : 0),
      promptMs: result.promptMs,
      totalMs: endedAt - startedAt,
      ...(result.ttftMs ? { ttftMs: result.ttftMs } : {}),
      ...(result.cachedTokens !== undefined ? { cachedTokens: result.cachedTokens } : {}),
      ...(result.draftTokens ? { draftTokens: result.draftTokens, draftAccepted: result.draftAccepted ?? 0 } : {}),
      ...(input.backend ? { backend: input.backend } : {}),
    };

    if (result.contextFull) notes.push("The model's memory filled up, so the reply may be cut short. Start a new chat or raise the context size in Settings > Advanced.");
    let error: string | undefined;
    if (!result.interrupted && !finalRawAnswer.trim()) {
      if (finalReasoning.trim()) {
        notes.push('The model spent its whole budget thinking and never wrote an answer. Try again with Thinking turned off.');
      } else {
        error = 'The model returned an empty reply. Try again, or switch to a different model.';
      }
    }

    const isAborted = !!input.signal?.aborted || result.interrupted;
    const cutOff = isMessageCutOff({
      role: 'assistant',
      text: finalRawAnswer,
      status: error ? 'error' : isAborted ? 'stopped' : 'done',
      interrupted: isAborted,
      contextFull: result.contextFull,
      generatedTokens: result.generatedTokens,
      maxTokens: safeMaxTokens,
    });

    const finalAnswer = (isAborted || cutOff) ? closeUnclosedMarkup(finalRawAnswer) : finalRawAnswer;
    const thinkSeconds = thinkStartedAt !== null ? Math.max(0, ((thinkEndedAt ?? endedAt) - thinkStartedAt) / 1000) : undefined;
    return {
      text: finalAnswer,
      rawText: finalRawAnswer,
      reasoning: finalReasoning || undefined,
      status: error ? 'error' : isAborted ? 'stopped' : 'done',
      canContinue: !error && cutOff,
      stats,
      thinkSeconds,
      error,
      phase: 'done',
      notice: isAborted ? 'Stopped by user.' : notes.join(' ') || undefined,
    };
  } catch (e) {
    const err = friendlyEngineError(e);
    const isAbort = !!input.signal?.aborted || /stop|abort|cancel|interrupted/i.test(String(e)) || /stop|abort|cancel|interrupted/i.test(err);
    if (isAbort || lastParsedAnswer.trim().length > 0 || lastParsedReasoning.trim().length > 0 || priorText.trim().length > 0) {
      const cleanedLast = input.continuation
        ? stripRedundantCodeFence(stripContinuationPreamble(lastParsedAnswer), priorText)
        : lastParsedAnswer;
      const combined = priorText ? `${priorText}${cleanedLast}` : lastParsedAnswer;
      const closed = closeUnclosedMarkup(combined);
      const combinedReasoning = priorReasoning && lastParsedReasoning ? `${priorReasoning}\n\n${lastParsedReasoning}` : (priorReasoning || lastParsedReasoning);
      const endedAt = now();
      return {
        text: closed,
        rawText: combined,
        reasoning: combinedReasoning || undefined,
        status: 'stopped',
        canContinue: isMessageCutOff({
          role: 'assistant',
          text: combined,
          status: 'stopped',
          interrupted: true,
        }),
        stats: {
          modelId: spec.id,
          promptTokens: built.estimatedPromptTokens,
          generatedTokens: Math.max(1, Math.round(lastStreamedRaw.length / 3.5)),
          tokensPerSecond: 0,
          promptMs: 0,
          totalMs: endedAt - startedAt,
          ...(input.backend ? { backend: input.backend } : {}),
        },
        phase: 'done',
        notice: isAbort ? 'Stopped by user.' : notes.join(' ') || undefined,
      };
    }
    return {
      text: '',
      status: 'error',
      error: err,
      phase: 'done',
      notice: undefined,
    };
  }
}
