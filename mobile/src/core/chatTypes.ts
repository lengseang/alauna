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
  /** Time from request to first streamed token (ms), measured. */
  ttftMs?: number;
  /** Prompt tokens reused from the KV cache (llama.cpp `tokens_cached`). */
  cachedTokens?: number;
  /** Speculative decoding: tokens drafted / accepted in this reply (only when it was active). */
  draftTokens?: number;
  draftAccepted?: number;
  /** "CPU" / "GPU (...)" as reported by llama.cpp at load. */
  backend?: string;
}

export interface Attachment {
  /** 'text' (default, older files have no kind) = content goes into the prompt; 'image' = sent to a vision model. */
  kind?: 'text' | 'image';
  name: string;
  /** Text content that was added to the prompt (truncated if large). '' for images. */
  content: string;
  truncated: boolean;
  /** Real file path (no file://) of an image attachment, inside the vault media folder. */
  path?: string;
  mime?: string;
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
  /** This chat's own soul. Only used when `soulOverride` is true; otherwise the global soul (Settings) applies. */
  soul: ThreadSoul;
  /** true = this chat overrides the global soul (ThreadSoulModal). New chats follow the global soul. */
  soulOverride: boolean;
  messages: ChatMessage[];
  /** Never written to disk. */
  incognito: boolean;
  pinned: boolean;
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
    soulOverride: false,
    messages: [],
    incognito: !!opts.incognito,
    pinned: false,
  };
}

/** The soul that applies to this chat: its own override, or the global one. */
export function effectiveSoul(thread: Pick<ChatThread, 'soul' | 'soulOverride'>, global: ThreadSoul): ThreadSoul {
  return thread.soulOverride ? thread.soul : global;
}

const DAY_MS = 86_400_000;

/** Auto-purge rule: chats not updated for `days` days (pinned chats are always kept). days <= 0 = off. */
export function staleThreadIds(metas: Array<{ id: string; updatedAt: number; pinned?: boolean }>, days: number, now: number): string[] {
  if (!(days > 0)) return [];
  const cutoff = now - days * DAY_MS;
  return metas.filter((m) => !m.pinned && m.updatedAt < cutoff).map((m) => m.id);
}

/** Case-insensitive search over the title and every message. Returns a short snippet around the first hit, or null. */
export function threadMatch(thread: Pick<ChatThread, 'title' | 'messages'>, query: string): { snippet: string } | null {
  const q = query.trim().toLowerCase();
  if (!q) return { snippet: '' };
  if (thread.title.toLowerCase().includes(q)) return { snippet: thread.title };
  for (const m of thread.messages) {
    const i = m.text.toLowerCase().indexOf(q);
    if (i >= 0) {
      const start = Math.max(0, i - 30);
      return { snippet: `${start > 0 ? '…' : ''}${m.text.slice(start, i + q.length + 50).replace(/\s+/g, ' ').trim()}` };
    }
  }
  return null;
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
      const images = imagePaths(m.attachments);
      out.push(images.length ? { role: 'user', content: withAttachments(m.text, m.attachments), images } : { role: 'user', content: withAttachments(m.text, m.attachments) });
    } else if ((m.status === 'done' || m.status === 'stopped') && m.text.trim()) {
      out.push({ role: 'assistant', content: m.text });
    }
  }
  return out;
}

/** Paths of the image attachments (they go to the model as images, not as text). */
export function imagePaths(attachments?: Attachment[]): string[] {
  return (attachments ?? []).filter((a) => a.kind === 'image' && a.path).map((a) => a.path as string);
}

export function withAttachments(text: string, attachments?: Attachment[]): string {
  const texts = (attachments ?? []).filter((a) => a.kind !== 'image');
  if (texts.length === 0) return text;
  const blocks = texts.map(
    (a) => `[Attached file: ${a.name}${a.truncated ? ' (truncated)' : ''}]\n\`\`\`\n${a.content}\n\`\`\``,
  );
  return `${blocks.join('\n\n')}\n\n${text}`.trim();
}

export const MAX_ATTACHMENT_CHARS = 8000;

export function makeAttachment(name: string, content: string): Attachment {
  const truncated = content.length > MAX_ATTACHMENT_CHARS;
  return { name, content: truncated ? content.slice(0, MAX_ATTACHMENT_CHARS) : content, truncated };
}

/** An image for a vision model. `path` must be a real file path the engine can open (copy picker results into the vault first). */
export function makeImageAttachment(name: string, path: string, mime?: string): Attachment {
  return { kind: 'image', name, content: '', truncated: false, path: path.replace(/^file:\/\//, ''), ...(mime ? { mime } : {}) };
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
    // v1 files have no flag: v1 always used the chat's own soul, so keep that behaviour.
    soulOverride: typeof r.soulOverride === 'boolean' ? r.soulOverride : true,
    messages,
    incognito: false,
    pinned: r.pinned === true,
  };
}

/** Thread ids become file names: only allow a safe alphabet. */
export function isSafeThreadId(id: string): boolean {
  return /^[A-Za-z0-9_-]{3,80}$/.test(id);
}

/** Delete one message. */
export function withoutMessage(messages: readonly ChatMessage[], id: string): ChatMessage[] {
  return messages.filter((m) => m.id !== id);
}

/** Edit & resend: everything before `id` stays; `id` and everything after it is removed (and returned for Undo). */
export function truncateAt(messages: readonly ChatMessage[], id: string): { kept: ChatMessage[]; removed: ChatMessage[] } {
  const i = messages.findIndex((m) => m.id === id);
  if (i < 0) return { kept: [...messages], removed: [] };
  return { kept: messages.slice(0, i), removed: messages.slice(i) };
}

