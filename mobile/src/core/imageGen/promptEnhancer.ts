/**
 * Local LLM Prompt Enhancer (pure core).
 *
 * Feature ID: CHIWIWI-IMG-ARCH-001 §5.8 (Task T12)
 * Expands user prompt into high-fidelity diffusion positive and negative prompts
 * using the loaded on-device LLM. Never silent: results are populated into the UI
 * for the user to review, edit, or reject before generation.
 */

import type { EngineManager } from '../engineManager.ts';
import { diagnoseEngineError } from '../engineTypes.ts';
import { parseThinking } from '../thinking.ts';
import type { GenerationGoal } from './types.ts';

export const PROMPT_ENHANCER_SYSTEM_PROMPT = `You are an expert diffusion prompt engineer for on-device Stable Diffusion models.
Expand the user's short concept into a vivid, coherent positive prompt and a concise negative prompt.

Rules:
1. Emphasize visual specifics: subject anatomy, camera framing (e.g. 85mm portrait, wide shot), lighting (e.g. rim light, cinematic shadows), rich textures, and environment.
2. Keep the positive prompt under 55 words to avoid clipping in CLIP text encoders.
3. Keep the negative prompt under 25 words (avoid blur, duplicate limbs, bad anatomy, text, watermarks).
4. Output EXACTLY in this format with no extra commentary:
POSITIVE: <expanded positive prompt>
NEGATIVE: <negative prompt>`;

export interface EnhancedPromptResult {
  ok: boolean;
  positivePrompt?: string;
  negativePrompt?: string;
  tokensGenerated?: number;
  message?: string;
}

export function parseEnhancedPromptResponse(rawText: string): { positive: string; negative: string } {
  const clean = rawText.trim();
  const positiveMatch = clean.match(/POSITIVE:\s*([\s\S]*?)(?=NEGATIVE:|$)/i);
  const negativeMatch = clean.match(/NEGATIVE:\s*([\s\S]*?)$/i);

  let positive = positiveMatch ? positiveMatch[1].trim() : '';
  let negative = negativeMatch ? negativeMatch[1].trim() : '';

  // Fallback if model output didn't use strict POSITIVE: tag
  if (!positive) {
    // If output starts with lines before NEGATIVE:
    const lines = clean.split('\n');
    const nonNegLines = lines.filter((l) => !l.toLowerCase().startsWith('negative:'));
    positive = nonNegLines.join(' ').replace(/^positive:\s*/i, '').trim();
  }

  // Sanitize common LLM filler artifacts
  positive = positive.replace(/^["']|["']$/g, '').trim();
  negative = negative.replace(/^["']|["']$/g, '').trim();

  return { positive, negative };
}

export async function enhancePromptWithLLM(
  engine: Pick<EngineManager, 'state' | 'isReady' | 'generate'>,
  userPrompt: string,
  _goal?: GenerationGoal,
): Promise<EnhancedPromptResult> {
  if (!userPrompt || !userPrompt.trim()) {
    return { ok: false, message: 'Please enter a prompt concept to enhance.' };
  }

  if (engine.state.status === 'generating' || engine.state.status === 'mounting') {
    return { ok: false, message: 'The local LLM is currently busy. Wait for generation to finish.' };
  }

  if (!engine.isReady()) {
    return {
      ok: false,
      message: 'No chat model is loaded. Load an LLM (e.g. Qwen, Llama, Hermes) in Chat or Vault to enhance prompts locally.',
    };
  }

  try {
    const response = await engine.generate({
      messages: [
        { role: 'system', content: PROMPT_ENHANCER_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt.trim() },
      ],
      maxTokens: 140,
      temperature: 0.7,
      sampling: { topP: 0.9, topK: 40, minP: 0.05, repeatPenalty: 1.1 },
      enableThinking: false,
      onText: () => undefined,
    });

    const parsed = parseThinking(response.text, { startInThinking: response.thinkingForcedOpen });
    const answer = parsed.answer.trim();

    if (!answer) {
      return { ok: false, message: 'The model returned an empty response. Try again.' };
    }

    const { positive, negative } = parseEnhancedPromptResponse(answer);

    if (!positive) {
      return { ok: false, message: 'Failed to extract enhanced prompt from model response.' };
    }

    return {
      ok: true,
      positivePrompt: positive,
      negativePrompt: negative || undefined,
      tokensGenerated: response.generatedTokens,
    };
  } catch (err) {
    const diag = diagnoseEngineError(err);
    return { ok: false, message: `${diag.message} ${diag.fix}` };
  }
}
