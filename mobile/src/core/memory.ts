/** User-managed facts that are added to the system prompt (Settings > Memory, or "/remember ..." in chat). */
export interface MemoryFact {
  id: string;
  text: string;
  createdAt: number;
}

export const MAX_FACTS = 40;
export const MAX_FACT_CHARS = 200;

export type AddFactResult = { ok: true; facts: MemoryFact[]; fact: MemoryFact } | { ok: false; reason: string };

export function addFact(facts: MemoryFact[], text: string, now: number, id: string): AddFactResult {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return { ok: false, reason: 'Nothing to remember - the text was empty.' };
  if (clean.length > MAX_FACT_CHARS) return { ok: false, reason: `Keep it under ${MAX_FACT_CHARS} characters so it fits the model's memory.` };
  if (facts.some((f) => f.text.toLowerCase() === clean.toLowerCase())) return { ok: false, reason: 'I already remember that.' };
  if (facts.length >= MAX_FACTS) return { ok: false, reason: `Memory is full (${MAX_FACTS} facts). Delete one first.` };
  const fact = { id, text: clean, createdAt: now };
  return { ok: true, facts: [...facts, fact], fact };
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
      out.push({ id: f.id, text: f.text.slice(0, MAX_FACT_CHARS), createdAt: typeof f.createdAt === 'number' ? f.createdAt : 0 });
    }
  }
  return out.slice(0, MAX_FACTS);
}

/** "/remember I live in Phnom Penh" -> "I live in Phnom Penh"; anything else -> null. */
export function parseRememberCommand(input: string): string | null {
  const m = /^\/remember\s+([\s\S]+)$/i.exec(input.trim());
  return m ? m[1].trim() : null;
}
