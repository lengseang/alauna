/**
 * Memory vault: user-managed facts that are added to the system prompt (Settings > Memory, or "/remember ..." in chat).
 * Facts can be paused (kept, but not sent). `memoryBudget` reports EXACTLY which facts reach the prompt, using the same
 * selection `buildSystemPrompt` uses (`selectMemoryLines`), so the UI number cannot drift from what the model sees.
 */
import { estimateTokens } from './chatPrompt.ts';

export interface MemoryFact {
  id: string;
  text: string;
  createdAt: number;
  updatedAt?: number;
  /** Kept in the vault but NOT sent to the model. */
  paused?: boolean;
}

export const MAX_FACTS = 40;
export const MAX_FACT_CHARS = 200;
/** Characters of memory text that reach the system prompt (older facts first; the first one that does not fit ends the list). */
export const MAX_MEMORY_CHARS = 700;

export type AddFactResult = { ok: true; facts: MemoryFact[]; fact: MemoryFact } | { ok: false; reason: string };

const clean = (text: string) => text.replace(/\s+/g, ' ').trim();

function validateText(facts: MemoryFact[], text: string, exceptId?: string): string | null {
  const c = clean(text);
  if (!c) return 'Nothing to remember - the text was empty.';
  if (c.length > MAX_FACT_CHARS) return `Keep it under ${MAX_FACT_CHARS} characters so it fits the model's memory.`;
  if (facts.some((f) => f.id !== exceptId && f.text.toLowerCase() === c.toLowerCase())) return 'I already remember that.';
  return null;
}

export function addFact(facts: MemoryFact[], text: string, now: number, id: string): AddFactResult {
  const bad = validateText(facts, text);
  if (bad) return { ok: false, reason: bad };
  if (facts.length >= MAX_FACTS) return { ok: false, reason: `Memory is full (${MAX_FACTS} facts). Delete one first.` };
  const fact: MemoryFact = { id, text: clean(text), createdAt: now };
  return { ok: true, facts: [...facts, fact], fact };
}

export function editFact(facts: MemoryFact[], id: string, text: string, now: number): AddFactResult {
  const existing = facts.find((f) => f.id === id);
  if (!existing) return { ok: false, reason: 'That fact no longer exists.' };
  const bad = validateText(facts, text, id);
  if (bad) return { ok: false, reason: bad };
  const fact: MemoryFact = { ...existing, text: clean(text), updatedAt: now };
  return { ok: true, facts: facts.map((f) => (f.id === id ? fact : f)), fact };
}

export function setFactPaused(facts: MemoryFact[], id: string, paused: boolean): MemoryFact[] {
  return facts.map((f) => (f.id === id ? { ...f, paused } : f));
}

export function removeFact(facts: MemoryFact[], id: string): MemoryFact[] {
  return facts.filter((f) => f.id !== id);
}

export function sanitizeFacts(raw: unknown): MemoryFact[] {
  if (!Array.isArray(raw)) return [];
  const out: MemoryFact[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const f = item as Record<string, unknown>;
    if (typeof f.id === 'string' && typeof f.text === 'string' && f.text.trim()) {
      const fact: MemoryFact = { id: f.id, text: f.text.slice(0, MAX_FACT_CHARS), createdAt: typeof f.createdAt === 'number' ? f.createdAt : 0 };
      if (typeof f.updatedAt === 'number') fact.updatedAt = f.updatedAt;
      if (f.paused === true) fact.paused = true;
      out.push(fact);
    }
  }
  return out.slice(0, MAX_FACTS);
}

/** The memory lines that fit the prompt budget, in order. Shared by buildSystemPrompt and memoryBudget. */
export function selectMemoryLines(texts: string[]): string[] {
  let used = 0;
  const lines: string[] = [];
  for (const raw of texts) {
    const m = raw.trim();
    if (!m) continue;
    if (used + m.length > MAX_MEMORY_CHARS) break;
    used += m.length;
    lines.push(m);
  }
  return lines;
}

/** Texts of the facts that are switched on (what callers pass to buildSystemPrompt). */
export function activeFactTexts(facts: MemoryFact[]): string[] {
  return facts.filter((f) => !f.paused).map((f) => f.text);
}

export interface MemoryBudget {
  /** Facts whose text is in the system prompt. */
  included: MemoryFact[];
  /** Active facts that did not fit the budget (not sent). */
  overBudget: MemoryFact[];
  paused: MemoryFact[];
  usedChars: number;
  maxChars: number;
  /** Estimate (the same conservative estimator the prompt builder uses) of the memory block's tokens. */
  estimatedTokens: number;
  /** The exact text block added to the system prompt ('' when nothing is sent). */
  promptBlock: string;
}

export function memoryBudget(facts: MemoryFact[]): MemoryBudget {
  const active = facts.filter((f) => !f.paused);
  const lines = selectMemoryLines(active.map((f) => f.text));
  const included = active.slice(0, lines.length);
  const promptBlock = lines.length > 0 ? `Things the user told you to remember:\n${lines.map((m) => `- ${m}`).join('\n')}` : '';
  return {
    included,
    overBudget: active.slice(lines.length),
    paused: facts.filter((f) => f.paused),
    usedChars: lines.reduce((n, l) => n + l.length, 0),
    maxChars: MAX_MEMORY_CHARS,
    estimatedTokens: promptBlock ? estimateTokens(promptBlock) : 0,
    promptBlock,
  };
}

/** "/remember I live in Phnom Penh" -> "I live in Phnom Penh"; anything else -> null. */
export function parseRememberCommand(input: string): string | null {
  const m = /^\/remember\s+([\s\S]+)$/i.exec(input.trim());
  return m ? m[1].trim() : null;
}
