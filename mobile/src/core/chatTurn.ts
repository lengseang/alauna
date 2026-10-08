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
  /** Full sampling (soul-adjusted, core/persona.ts padToSampling). Wins over `temperature`. */
  sampling?: SamplingSettings;
  /** Backend label to store in the reply's stats ("CPU" / "GPU (...)"). */
  backend?: string;
  /**
   * Exact prompt size from the model's own tokenizer (null = cannot count). When given, the prompt is re-trimmed until
   * it really fits, which the character-based estimate cannot guarantee for Khmer, CJK, digits or code.
   */
  countPromptTokens?: (messages: PromptMessage[], enableThinking: boolean) => Promise<number | null>;
}

export type TurnOutcome = Pick<ChatMessage, 'text' | 'reasoning' | 'status' | 'stats' | 'thinkSeconds' | 'error' | 'phase' | 'notice'>;

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
  const thinking = wantsThinking(spec, input.thinkingEnabled);
  const replyBudget = replyBudgetFor(spec, input.nCtx, thinking);
  const userContent = withAttachments(input.userText, input.attachments);
  const userImages = imagePaths(input.attachments);
  const build = (tokenScale: number): BuiltPrompt =>
    buildPrompt({
      system: input.system,
      history: input.history,
      userMessage: userContent,
      userImages,
      nCtx: input.nCtx,
      replyBudget,
      tokenScale,
    });
  let built = build(1);
  if (input.countPromptTokens) {
    const allowance = Math.max(256, input.nCtx - replyBudget);
    let scale = 1;
    for (let attempt = 0; attempt < 3; attempt++) {
      let real: number | null = null;
      try {
        real = await input.countPromptTokens(built.messages, thinking);
      } catch {
        real = null;
      }
      if (real === null || real <= allowance) break;
      // The estimate was too low for this text: scale it by the error we just observed (+5%) and trim again.
      scale *= Math.max(1.1, (real / Math.max(1, built.estimatedPromptTokens)) * 1.05);
      built = build(scale);
    }
  }

  const notes: string[] = [];
  if (built.droppedMessages > 0) notes.push(`${built.droppedMessages} older message${built.droppedMessages === 1 ? '' : 's'} did not fit the model's memory and were left out of this reply.`);
  if (built.truncatedUserMessage) notes.push('Your message was too long for the model and was shortened.');

  const startedAt = now();
  let forcedOpen = spec.thinking === 'always';
  let thinkStartedAt: number | null = null;
  let thinkEndedAt: number | null = null;

  input.onUpdate({
    status: 'streaming',
    phase: 'reading',
    promptTokensEst: built.estimatedPromptTokens,
    text: '',
    reasoning: '',
    notice: notes.join(' ') || undefined,
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
    const result = await input.generate({
      messages: built.messages,
      maxTokens: replyBudget,
      temperature: input.sampling?.temperature ?? input.temperature ?? 0.7,
      ...(input.sampling
        ? { sampling: { topP: input.sampling.topP, topK: input.sampling.topK, minP: input.sampling.minP, repeatPenalty: input.sampling.repeatPenalty } }
        : {}),
      enableThinking: thinking,
      onStart: (info) => {
        forcedOpen = forcedOpen || info.thinkingForcedOpen;
      },
      onText: (raw) => {
        const p = track(raw);
        input.onUpdate({ text: p.answer, reasoning: p.reasoning, phase: p.phase, status: 'streaming' });
      },
    });

    forcedOpen = forcedOpen || result.thinkingForcedOpen;
    const final = track(result.text);
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
    if (!result.interrupted && !final.answer.trim()) {
      if (final.reasoning.trim()) {
        notes.push('The model spent its whole budget thinking and never wrote an answer. Try again with Thinking turned off.');
      } else {
        error = 'The model returned an empty reply. Try again, or switch to a different model.';
      }
    }

    const thinkSeconds = thinkStartedAt !== null ? Math.max(0, ((thinkEndedAt ?? endedAt) - thinkStartedAt) / 1000) : undefined;
    return {
      text: final.answer,
      reasoning: final.reasoning || undefined,
      status: error ? 'error' : result.interrupted ? 'stopped' : 'done',
      stats,
      thinkSeconds,
      error,
      phase: 'done',
      notice: notes.join(' ') || undefined,
    };
  } catch (e) {
    return {
      text: '',
      status: 'error',
      error: friendlyEngineError(e),
      phase: 'done',
      notice: undefined,
    };
  }
}
