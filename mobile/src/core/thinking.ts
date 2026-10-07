/**
 * Splits a model's raw output into "reasoning" and the clean "answer".
 *
 * Reasoning models emit `<think> ... </think>` before the answer. Some chat
 * templates (DeepSeek-R1 distills) already open the tag in the PROMPT, so the
 * output starts *inside* the thinking block and only contains the closing tag;
 * that is what `startInThinking` is for.
 *
 * The function is stateless: call it with the full accumulated text on every
 * token. It also hides a half-received tag (e.g. "<thi") so the UI never flashes
 * raw markup, and strips leaked control tokens from the answer.
 */

export type OutputPhase = 'reading' | 'thinking' | 'answering';

export interface ParsedOutput {
  reasoning: string;
  answer: string;
  phase: OutputPhase;
  /** True once the closing tag has been seen (reasoning is complete). */
  reasoningComplete: boolean;
}

// Qwen / DeepSeek / SmolLM use <think>; Gemma 4 wraps its thoughts in <|channel>thought ... <channel|> (read from its chat template).
const OPEN_TAGS = ['<think>', '<thinking>', '<|channel>thought'];
const CLOSE_TAGS = ['</think>', '</thinking>', '<channel|>'];
// ChatML / Llama 3 | Gemma 2-3 | Gemma 4 | BOS/EOS text | DeepSeek
const LEAKED_TOKENS =
  /<\|(?:im_end|im_start|eot_id|end_of_text|endoftext|end|assistant)\|>|<end_of_turn>|<start_of_turn>(?:model|user)?|<turn\|>|<\|turn>(?:model|user)?|<bos>|<eos>|<｜(?:end▁of▁sentence|User|Assistant)｜>/g;

function findFirst(text: string, tags: string[], from = 0): { index: number; tag: string } | null {
  let best: { index: number; tag: string } | null = null;
  for (const tag of tags) {
    const i = text.indexOf(tag, from);
    if (i >= 0 && (best === null || i < best.index)) best = { index: i, tag };
  }
  return best;
}

/** If `text` ends with a proper prefix of any tag, return how many chars to hide. */
function partialTagSuffix(text: string, tags: string[]): number {
  let hide = 0;
  for (const tag of tags) {
    for (let len = Math.min(tag.length - 1, text.length); len > 0; len--) {
      if (text.endsWith(tag.slice(0, len))) {
        hide = Math.max(hide, len);
        break;
      }
    }
  }
  return hide;
}

function clean(text: string): string {
  return text.replace(LEAKED_TOKENS, '');
}

export function parseThinking(raw: string, opts: { startInThinking?: boolean } = {}): ParsedOutput {
  if (raw.length === 0) {
    return { reasoning: '', answer: '', phase: 'reading', reasoningComplete: false };
  }

  const open = findFirst(raw, OPEN_TAGS);
  // A closing tag with no opening tag means the prompt pre-opened the block and the engine did not tell us
  // (template not recognised): everything before the close tag is reasoning, never part of the answer.
  const strayClose = open === null && !opts.startInThinking ? findFirst(raw, CLOSE_TAGS) : null;
  const startsThinking = open !== null || !!opts.startInThinking || strayClose !== null;

  if (!startsThinking) {
    const hide = partialTagSuffix(raw, OPEN_TAGS);
    const visible = hide > 0 ? raw.slice(0, raw.length - hide) : raw;
    return {
      reasoning: '',
      answer: clean(visible).replace(/^\s+/, ''),
      phase: visible.length > 0 ? 'answering' : 'reading',
      reasoningComplete: false,
    };
  }

  // Text before an explicit <think> is part of the answer preamble (rare); keep it.
  const before = open ? raw.slice(0, open.index) : '';
  const afterOpen = open ? raw.slice(open.index + open.tag.length) : raw;

  const close = findFirst(afterOpen, CLOSE_TAGS);
  if (!close) {
    const hide = partialTagSuffix(afterOpen, CLOSE_TAGS);
    const body = hide > 0 ? afterOpen.slice(0, afterOpen.length - hide) : afterOpen;
    return {
      reasoning: clean(body).trim(),
      answer: clean(before).trim(),
      phase: 'thinking',
      reasoningComplete: false,
    };
  }

  const reasoning = afterOpen.slice(0, close.index);
  const rest = afterOpen.slice(close.index + close.tag.length);
  const hide = partialTagSuffix(rest, OPEN_TAGS);
  const answerRaw = (before + (hide > 0 ? rest.slice(0, rest.length - hide) : rest));
  const answer = clean(answerRaw).replace(/^\s+/, '');
  return {
    reasoning: clean(reasoning).trim(),
    answer,
    phase: 'answering',
    reasoningComplete: true,
  };
}
