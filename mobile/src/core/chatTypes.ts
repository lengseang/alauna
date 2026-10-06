import type { PADVector, SoulArchetypeKey } from './persona.ts';
import { ARCHETYPES } from './persona.ts';
import type { HistoryMessage } from './chatPrompt.ts';

export interface MessageStats {
  modelId: string;
  promptTokens: number;
  generatedTokens: number;
  tokensPerSecond: number;
  promptMs: number;
  totalMs: number;
}

export interface Attachment {
  name: string;
  /** Text content that was added to the prompt (truncated if large). */
  content: string;
  truncated: boolean;
}

export type MessageStatus = 'streaming' | 'done' | 'stopped' | 'error';
/** Live phase shown in the process panel. 'loading' = model is being loaded into RAM first. */
export type MessagePhase = 'loading' | 'reading' | 'thinking' | 'answering' | 'done';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  /** User text, or the assistant's clean answer (reasoning excluded). */
  text: string;
  reasoning?: string;
  attachments?: Attachment[];
  createdAt: number;
  status: MessageStatus;
  error?: string;
  stats?: MessageStats;
  /** Seconds the model spent in its reasoning phase, if any. */
  thinkSeconds?: number;
  /** Transient: what the model is doing right now (only meaningful while streaming). */
  phase?: MessagePhase;
  /** Transient: rough size of the prompt being read. */
  promptTokensEst?: number;
  /** Plain-language heads-up (e.g. older messages left out of the prompt). */
  notice?: string;
}

export interface ThreadSoul {
  archetype: SoulArchetypeKey;
  pad: PADVector;
  customBackstory?: string;
  toneIntensity: number;
}

export interface ChatThread {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  soul: ThreadSoul;
  messages: ChatMessage[];
  incognito: boolean;
}

export const DEFAULT_TITLE = 'New chat';

let counter = 0;
export function newId(prefix: string): string {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function newThread(archetype: SoulArchetypeKey, pad: PADVector, opts: { incognito?: boolean } = {}): ChatThread {
  const now = Date.now();
  return {
    id: newId('thread'),
    title: DEFAULT_TITLE,
    createdAt: now,
    updatedAt: now,
    soul: { archetype, pad: { ...pad }, toneIntensity: 0.8 },
    messages: [],
    incognito: !!opts.incognito,
  };
}

export function defaultSoul(archetype: SoulArchetypeKey): ThreadSoul {
  return { archetype, pad: { ...ARCHETYPES[archetype].defaultPAD }, toneIntensity: 0.8 };
}

/** First line of the first user message, shortened. */
export function titleFrom(text: string): string {
  const line = text.trim().split('\n')[0]?.trim() ?? '';
  if (!line) return DEFAULT_TITLE;
  return line.length > 40 ? `${line.slice(0, 39).trimEnd()}…` : line;
}

/** Conversation as the model should see it: finished turns only. */
export function toHistory(messages: ChatMessage[]): HistoryMessage[] {
  const out: HistoryMessage[] = [];
  for (const m of messages) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: withAttachments(m.text, m.attachments) });
    } else if ((m.status === 'done' || m.status === 'stopped') && m.text.trim()) {
      out.push({ role: 'assistant', content: m.text });
    }
  }
  return out;
}

export function withAttachments(text: string, attachments?: Attachment[]): string {
  if (!attachments || attachments.length === 0) return text;
  const blocks = attachments.map(
    (a) => `[Attached file: ${a.name}${a.truncated ? ' (truncated)' : ''}]\n\`\`\`\n${a.content}\n\`\`\``,
  );
  return `${blocks.join('\n\n')}\n\n${text}`.trim();
}

export const MAX_ATTACHMENT_CHARS = 8000;

export function makeAttachment(name: string, content: string): Attachment {
  const truncated = content.length > MAX_ATTACHMENT_CHARS;
  return { name, content: truncated ? content.slice(0, MAX_ATTACHMENT_CHARS) : content, truncated };
}

// ---------------------------------------------------------------- persistence

const ROLES = new Set(['user', 'assistant']);
const STATUSES = new Set(['streaming', 'done', 'stopped', 'error']);

/** Drop fields that only make sense while a message is being generated. */
export function toPersistable(thread: ChatThread): ChatThread {
  return {
    ...thread,
    messages: thread.messages.map((m) => {
      const { phase: _phase, promptTokensEst: _est, ...rest } = m;
      void _phase;
      void _est;
      // A message that was streaming when we save can never finish: store it as stopped.
      return rest.status === 'streaming' ? { ...rest, status: 'stopped' as const } : rest;
    }),
  };
}

/** Validate JSON from disk (older versions, hand edits, partial writes). Returns null if unusable. */
export function sanitizeThread(raw: unknown): ChatThread | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id) return null;
  const messages: ChatMessage[] = [];
  if (Array.isArray(r.messages)) {
    for (const item of r.messages) {
      if (!item || typeof item !== 'object') continue;
      const m = item as Record<string, unknown>;
      if (typeof m.id !== 'string' || typeof m.role !== 'string' || !ROLES.has(m.role) || typeof m.text !== 'string') continue;
      const status = typeof m.status === 'string' && STATUSES.has(m.status) ? (m.status as MessageStatus) : 'done';
      messages.push({
        ...(m as unknown as ChatMessage),
        status: status === 'streaming' ? 'stopped' : status,
        phase: undefined,
        promptTokensEst: undefined,
      });
    }
  }
  const soulRaw = (r.soul && typeof r.soul === 'object' ? r.soul : {}) as Record<string, unknown>;
  const archetype = typeof soulRaw.archetype === 'string' && soulRaw.archetype in ARCHETYPES ? (soulRaw.archetype as SoulArchetypeKey) : 'empath';
  const padRaw = (soulRaw.pad && typeof soulRaw.pad === 'object' ? soulRaw.pad : {}) as Record<string, unknown>;
  const base = ARCHETYPES[archetype].defaultPAD;
  const pad = {
    pleasure: typeof padRaw.pleasure === 'number' ? padRaw.pleasure : base.pleasure,
    arousal: typeof padRaw.arousal === 'number' ? padRaw.arousal : base.arousal,
    dominance: typeof padRaw.dominance === 'number' ? padRaw.dominance : base.dominance,
  };
  const now = Date.now();
  return {
    id: r.id,
    title: typeof r.title === 'string' && r.title ? r.title : DEFAULT_TITLE,
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : now,
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : now,
    soul: {
      archetype,
      pad,
      customBackstory: typeof soulRaw.customBackstory === 'string' ? soulRaw.customBackstory : undefined,
      toneIntensity: typeof soulRaw.toneIntensity === 'number' ? Math.min(1, Math.max(0.1, soulRaw.toneIntensity)) : 0.8,
    },
    messages,
    incognito: false,
  };
}

/** Thread ids become file names: only allow a safe alphabet. */
export function isSafeThreadId(id: string): boolean {
  return /^[A-Za-z0-9_-]{3,80}$/.test(id);
}
