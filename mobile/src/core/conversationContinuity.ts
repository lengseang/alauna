/**
 * Hermes-inspired Continuous Chat, Cancellation Resilience & Context Continuity.
 *
 * Provides:
 *  1. Cutoff detection: determines if an assistant turn stopped prematurely (cancellation, context limit, budget).
 *  2. Continuation directives: formats seamless resume prompts so the model continues without repetition.
 *  3. Seamless continuation cleanup: removes leading preamble filler and duplicate code fences.
 *  4. Rolling Hierarchical Context Anchoring: when older turns are pruned from the context window, extracts
 *     a compact continuity anchor so the model never suffers amnesia ("without losing the old one").
 */
import type { HistoryMessage } from './chatPrompt.ts';
import { estimateTokens } from './chatPrompt.ts';

export const CONTINUATION_DIRECTIVE =
  'Continue your previous response from the exact point where it was cut off. Do not repeat or restate what was already written. Seamlessly continue the text or code.';

export interface CutoffCheckInput {
  role: 'user' | 'assistant';
  text: string;
  status?: string;
  interrupted?: boolean;
  contextFull?: boolean;
  generatedTokens?: number;
  maxTokens?: number;
}

/** Check if markdown code block fences are unclosed in the text. */
export function hasUnclosedCodeBlock(text: string): boolean {
  const matches = text.match(/```/g);
  return !!(matches && matches.length % 2 !== 0);
}

/**
 * Determine if an assistant message was cut off mid-stream and can be seamlessly continued.
 */
export function isMessageCutOff(input: CutoffCheckInput): boolean {
  if (input.role !== 'assistant') return false;
  const text = input.text.trim();
  if (!text) return false;

  // Explicit cancellation or engine interrupt
  if (input.status === 'stopped' || input.interrupted) return true;

  // Context window ceiling hit
  if (input.contextFull) return true;

  // Token limit reached
  if (input.generatedTokens && input.maxTokens && input.generatedTokens >= input.maxTokens - 4) {
    return true;
  }

  // Unclosed code block typically indicates an abrupt cutoff
  if (hasUnclosedCodeBlock(text)) return true;

  // Abrupt punctuation endings (e.g. trailing comma, hyphen, colon, or plain alphanumeric without terminal punctuation)
  const lastChar = text.slice(-1);
  const terminalPunctuation = new Set([
    '.', '!', '?', '"', "'", '`', '*', '_', '~', '|', '\n',
    '}', ']', ')', '>', '。', '！', '？', '…', '；', ';',
  ]);
  if (!terminalPunctuation.has(lastChar)) {
    return true;
  }

  return false;
}

/**
 * Cleanly closes any open markdown code blocks in a partial answer so that the UI
 * and subsequent turns render valid markdown.
 */
export function closeUnclosedMarkup(text: string): string {
  if (hasUnclosedCodeBlock(text)) {
    return `${text}\n\`\`\``;
  }
  return text;
}

/**
 * Prepares prior text for continuation by stripping any artificially added closing
 * code fence so that new tokens append seamlessly inside the open code block.
 */
export function preparePriorTextForContinuation(text: string): string {
  if (text.endsWith('\n```') && hasUnclosedCodeBlock(text.slice(0, -4))) {
    return text.slice(0, -4);
  }
  return text;
}

/**
 * Common preamble phrases models output when prompted to continue.
 * Strips conversational filler so continuation merges seamlessly with priorText.
 */
export function stripContinuationPreamble(text: string): string {
  const preambleRegex = /^(?:(?:Certainly|Sure|Okay|Of course)[!,.]?\s*)?(?:(?:here(?:\s+is|'s)\s+(?:the\s+)?(?:continuation|rest|remainder)(?:\s+of\s+the\s+(?:response|code|text|message))?|continuing(?:\s+from\s+where\s+(?:we|I)\s+left\s+off)?|resuming(?:\s+from\s+above)?):?[\s\r\n]*)/i;
  return text.replace(preambleRegex, '');
}

/**
 * If prior text ended inside an unclosed code block, strip any redundant opening fence
 * in the continuation output so code does not accidentally close or duplicate the block.
 */
export function stripRedundantCodeFence(continuationText: string, priorText: string): string {
  if (!hasUnclosedCodeBlock(priorText)) return continuationText;
  return continuationText.replace(/^```[a-zA-Z0-9_-]*\r?\n/, '');
}

/**
 * Extract a concise snippet from a message for the continuity anchor.
 */
function extractSnippet(text: string, maxChars = 120): string {
  const clean = text.replace(/```[\s\S]*?```/g, '[code]').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, maxChars - 1)}…`;
}

/**
 * Builds a compact [Context Continuity Anchor] from older messages that were pruned
 * out of the active context window. Bounded to `maxTokens` (default ~120 tokens).
 *
 * Uses hierarchical selection: preserves the conversation's initial root goal (turn 0)
 * plus the most recent pruned turns immediately preceding the active window.
 */
export function buildContextContinuityAnchor(
  prunedMessages: readonly HistoryMessage[],
  maxTokens = 120,
): string | null {
  if (!prunedMessages || prunedMessages.length === 0) return null;

  // Hierarchical selection: prioritize first turn (topic root) + most recent pruned turns
  const selected: HistoryMessage[] = [];
  if (prunedMessages.length <= 3) {
    selected.push(...prunedMessages);
  } else {
    selected.push(prunedMessages[0]);
    // Take the most recent turns up to 3
    const tail = prunedMessages.slice(1).slice(-3);
    selected.push(...tail);
  }

  const entries: string[] = [];
  let tokenCost = 25; // Base envelope cost

  for (let i = 0; i < selected.length; i++) {
    const m = selected[i];
    const prefix = m.role === 'user' ? 'User' : 'Assistant';
    const snippet = extractSnippet(m.content);
    const line = `- ${prefix}: "${snippet}"`;
    const cost = estimateTokens(line);

    if (tokenCost + cost > maxTokens) {
      if (entries.length === 0) {
        entries.push(line);
      }
      break;
    }
    entries.push(line);
    tokenCost += cost;
  }

  if (entries.length === 0) return null;

  return `[Context Continuity Anchor (Earlier conversation turns kept in memory)]:\n${entries.join('\n')}`;
}
