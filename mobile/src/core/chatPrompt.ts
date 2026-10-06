/**
 * Builds the message list sent to the model.
 *
 *  - Uses as much recent history as fits the context window (sliding window).
 *    The UI keeps the full transcript; only the prompt is trimmed.
 *  - Guarantees strict user/assistant alternation (several chat templates, e.g.
 *    Gemma, reject anything else) by merging consecutive same-role messages and
 *    dropping empty ones.
 */

export type Role = 'system' | 'user' | 'assistant';
export interface PromptMessage {
  role: Role;
  content: string;
}
export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Conservative token estimate (real tokenizers average ~3.5-4 chars/token for English). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.2);
}

export function normalizeHistory(history: HistoryMessage[]): HistoryMessage[] {
  const out: HistoryMessage[] = [];
  for (const m of history) {
    const content = m.content.trim();
    if (!content) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) {
      last.content = `${last.content}\n\n${content}`;
    } else {
      out.push({ role: m.role, content });
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
  nCtx: number;
  /** Tokens kept free for the model's reply. */
  replyBudget: number;
}

export interface BuiltPrompt {
  messages: PromptMessage[];
  /** How many older history messages did not fit and were left out of the prompt. */
  droppedMessages: number;
  estimatedPromptTokens: number;
  /** True if the newest user message itself had to be shortened. */
  truncatedUserMessage: boolean;
}

export function buildPrompt(input: BuildPromptInput): BuiltPrompt {
  const { system, nCtx, replyBudget } = input;
  const budget = Math.max(256, nCtx - replyBudget);
  const systemTokens = system ? estimateTokens(system) + 8 : 0;

  let userMessage = input.userMessage.trim();
  let truncatedUserMessage = false;
  const maxUserTokens = Math.max(64, budget - systemTokens - 16);
  if (estimateTokens(userMessage) > maxUserTokens) {
    const keepChars = Math.floor(maxUserTokens * 3.2);
    userMessage = `${userMessage.slice(0, keepChars)}\n\n[...message shortened to fit the model's context window]`;
    truncatedUserMessage = true;
  }

  let used = systemTokens + estimateTokens(userMessage) + 8;
  const history = normalizeHistory(input.history);
  const kept: HistoryMessage[] = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const cost = estimateTokens(history[i].content) + 8;
    if (used + cost > budget) break;
    used += cost;
    kept.unshift(history[i]);
  }
  // Keep alternation valid after trimming from the front.
  while (kept.length > 0 && kept[0].role !== 'user') kept.shift();
  const droppedMessages = history.length - kept.length;

  // If the history ends with a user turn, merge the new message into it (alternation).
  const messages: PromptMessage[] = [];
  if (system) messages.push({ role: 'system', content: system });
  for (const m of kept) messages.push({ role: m.role, content: m.content });
  const last = messages[messages.length - 1];
  if (last && last.role === 'user') {
    last.content = `${last.content}\n\n${userMessage}`;
  } else {
    messages.push({ role: 'user', content: userMessage });
  }

  return { messages, droppedMessages, estimatedPromptTokens: used, truncatedUserMessage };
}
