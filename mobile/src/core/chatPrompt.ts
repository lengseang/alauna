/**
 * Builds the message list sent to the model.
 *
 *  - Uses as much recent history as fits the context window (sliding window).
 *    The UI keeps the full transcript; only the prompt is trimmed.
 *  - Guarantees strict user/assistant alternation (several chat templates, e.g.
 *    Gemma, reject anything else) by merging consecutive same-role messages and
 *    dropping empty ones.
 */

import { buildContextContinuityAnchor } from './conversationContinuity.ts';

export type Role = 'system' | 'user' | 'assistant';
export interface PromptMessage {
  role: Role;
  content: string;
  /** Real file paths of images for this turn (vision models with an mmproj only). */
  images?: string[];
}
export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  images?: string[];
}

/** Prompt-size allowance per image (aligned with the default 512 vision token budget). */
export const IMAGE_TOKEN_ESTIMATE = 512;
const imageCost = (images: string[] | undefined, perImage: number) => (images?.length ?? 0) * perImage;

/**
 * Conservative token estimate. Undercounting overflows the model's context (a hard "Context is full"
 * error), overcounting only drops older history a little sooner, so every guess leans high:
 *  - English letters/spaces: ~3.2 chars per token
 *  - digits: one token each (Qwen / Llama tokenise numbers digit by digit)
 *  - punctuation, brackets, operators (code): half a token each
 *  - accented Latin: 1.2 tokens; everything else (Khmer, Thai, CJK, Arabic, emoji halves...): 2.5 tokens per UTF-16 unit
 * `scale` lets callers calibrate against the engine's real count (see core/chatTurn.ts).
 */
export function estimateTokens(text: string, scale = 1): number {
  let cost = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 128) {
      if (c >= 48 && c <= 57) cost += 1;
      else if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 32 || c === 10 || c === 13) cost += 1 / 3.2;
      else cost += 0.5;
    } else if (c <= 0x024f) cost += 1.2;
    else cost += 2.5;
  }
  return Math.ceil(cost * scale);
}

export function normalizeHistory(history: HistoryMessage[]): HistoryMessage[] {
  const out: HistoryMessage[] = [];
  for (const m of history) {
    const content = m.content.trim();
    const images = m.images?.length ? [...m.images] : undefined;
    if (!content && !images) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) {
      last.content = [last.content, content].filter(Boolean).join('\n\n');
      if (images) last.images = [...(last.images ?? []), ...images];
    } else {
      out.push(images ? { role: m.role, content, images } : { role: m.role, content });
    }
  }
  // A conversation must start with a user turn.
  while (out.length > 0 && out[0].role !== 'user') out.shift();
  return out;
}

export interface BuildPromptInput {
  system: string;
  history: HistoryMessage[];
  userMessage: string;
  /** Images attached to the new user message. */
  userImages?: string[];
  nCtx: number;
  /** Tokens kept free for the model's reply. */
  replyBudget: number;
  /** Tokens one image can take (core/visionProfile.ts imageTokenAllowance). Default: IMAGE_TOKEN_ESTIMATE. */
  imageTokens?: number;
  /** Multiplier applied to every estimate (1 = default heuristic; raise it after the engine reported a larger real count). */
  tokenScale?: number;
  /** Custom continuity anchor override or false to disable automatic rolling anchor */
  continuityAnchor?: string | false;
}

export interface BuiltPrompt {
  messages: PromptMessage[];
  /** How many older history messages did not fit and were left out of the prompt. */
  droppedMessages: number;
  estimatedPromptTokens: number;
  /** True if the newest user message itself had to be shortened. */
  truncatedUserMessage: boolean;
  /** Rolling continuity anchor summarizing pruned earlier turns (if any). */
  continuityAnchor?: string;
}

export function buildPrompt(input: BuildPromptInput): BuiltPrompt {
  const { system, nCtx, replyBudget } = input;
  const scale = input.tokenScale ?? 1;
  const perImage = input.imageTokens ?? IMAGE_TOKEN_ESTIMATE;
  const tokens = (text: string) => estimateTokens(text, scale);
  const budget = Math.max(256, nCtx - replyBudget);
  const systemTokens = system ? tokens(system) + 8 : 0;

  let userMessage = input.userMessage.trim();
  let truncatedUserMessage = false;
  const maxUserTokens = Math.max(64, budget - systemTokens - 16);
  if (tokens(userMessage) > maxUserTokens) {
    // Cut by estimated cost, not by a fixed chars-per-token ratio, so Khmer/CJK/digit-heavy text shrinks enough.
    let keepChars = Math.max(64, Math.floor((maxUserTokens * 3.2) / scale));
    while (keepChars > 64 && tokens(userMessage.slice(0, keepChars)) > maxUserTokens) keepChars = Math.floor(keepChars * 0.8);
    userMessage = `${userMessage.slice(0, keepChars)}\n\n[...message shortened to fit the model's context window]`;
    truncatedUserMessage = true;
  }

  const userImages = input.userImages?.length ? [...input.userImages] : undefined;
  let used = systemTokens + tokens(userMessage) + imageCost(userImages, perImage) + 8;
  const history = normalizeHistory(input.history);
  const kept: HistoryMessage[] = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const cost = tokens(history[i].content) + imageCost(history[i].images, perImage) + 8;
    if (used + cost > budget) break;
    used += cost;
    kept.unshift(history[i]);
  }
  // Keep alternation valid after trimming from the front.
  while (kept.length > 0 && kept[0].role !== 'user') kept.shift();
  const droppedMessages = history.length - kept.length;

  let continuityAnchor: string | undefined;
  if (droppedMessages > 0 && input.continuityAnchor !== false) {
    const pruned = history.slice(0, droppedMessages);
    const anchor = typeof input.continuityAnchor === 'string'
      ? input.continuityAnchor
      : buildContextContinuityAnchor(pruned, 120);
    if (anchor) {
      continuityAnchor = anchor;
      used += tokens(anchor) + 8;
    }
  }

  // If the history ends with a user turn, merge the new message into it (alternation).
  const messages: PromptMessage[] = [];
  const effectiveSystem = [system, continuityAnchor].filter(Boolean).join('\n\n');
  if (effectiveSystem) messages.push({ role: 'system', content: effectiveSystem });
  for (const m of kept) messages.push(m.images ? { role: m.role, content: m.content, images: [...m.images] } : { role: m.role, content: m.content });
  const last = messages[messages.length - 1];
  if (last && last.role === 'user') {
    last.content = [last.content, userMessage].filter(Boolean).join('\n\n');
    if (userImages) last.images = [...(last.images ?? []), ...userImages];
  } else {
    messages.push(userImages ? { role: 'user', content: userMessage, images: userImages } : { role: 'user', content: userMessage });
  }

  return { messages, droppedMessages, estimatedPromptTokens: used, truncatedUserMessage, continuityAnchor };
}
