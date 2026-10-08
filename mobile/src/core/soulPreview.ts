/**
 * Soul preview = a REAL short generation with the loaded model, using exactly the system prompt and sampling a chat
 * with this soul would use. No model loaded -> an honest error, never canned text.
 */
import type { ThreadSoul } from './chatTypes.ts';
import type { EngineManager } from './engineManager.ts';
import { diagnoseEngineError } from './engineTypes.ts';
import { buildSystemPrompt, padToSampling } from './persona.ts';
import type { SamplingSettings } from './settingsModel.ts';
import { parseThinking } from './thinking.ts';

export const SOUL_PREVIEW_PROMPT = 'Introduce yourself to me in two short sentences.';
export const SOUL_PREVIEW_MAX_TOKENS = 80;

export type SoulPreviewResult =
  | { ok: true; text: string; tokens: number; tokPerSec: number | null; ttftMs: number | null; sampling: SamplingSettings; systemPrompt: string }
  | { ok: false; reason: 'no_model' | 'busy' | 'engine'; message: string };

export async function runSoulPreview(
  engine: Pick<EngineManager, 'state' | 'isReady' | 'generate'>,
  soul: ThreadSoul,
  baseSampling: SamplingSettings,
  prompt = SOUL_PREVIEW_PROMPT,
): Promise<SoulPreviewResult> {
  if (engine.state.status === 'generating' || engine.state.status === 'mounting') {
    return { ok: false, reason: 'busy', message: 'The model is busy. Wait for it to finish, then try the preview again.' };
  }
  if (!engine.isReady()) {
    return { ok: false, reason: 'no_model', message: 'No model is loaded. Load a model first, then the preview is written by it live.' };
  }
  const systemPrompt = buildSystemPrompt({ archetype: soul.archetype, pad: soul.pad, toneIntensity: soul.toneIntensity, backstory: soul.customBackstory });
  const sampling = padToSampling(soul.pad, soul.toneIntensity, baseSampling);
  try {
    const r = await engine.generate({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      maxTokens: SOUL_PREVIEW_MAX_TOKENS,
      temperature: sampling.temperature,
      sampling: { topP: sampling.topP, topK: sampling.topK, minP: sampling.minP, repeatPenalty: sampling.repeatPenalty },
      enableThinking: false,
      onText: () => undefined,
    });
    const parsed = parseThinking(r.text, { startInThinking: r.thinkingForcedOpen });
    const text = parsed.answer.trim();
    if (!text) return { ok: false, reason: 'engine', message: 'The model returned an empty preview. Try again or load another model.' };
    const tps = r.tokensPerSecond || (r.predictedMs > 0 ? (r.generatedTokens * 1000) / r.predictedMs : 0);
    return { ok: true, text, tokens: r.generatedTokens, tokPerSec: tps ? Number(tps.toFixed(1)) : null, ttftMs: r.ttftMs ?? null, sampling, systemPrompt };
  } catch (e) {
    const d = diagnoseEngineError(e);
    return { ok: false, reason: 'engine', message: `${d.message} ${d.fix}` };
  }
}
