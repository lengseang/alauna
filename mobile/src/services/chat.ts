/**
 * Chat controller: the one place that turns "user pressed send" into
 * storage check -> model check -> (load model) -> streamed reply -> saved thread.
 *
 * It never fabricates a reply: every failure becomes an inline error message with
 * a next step (docs/REQUIREMENTS.md CH-7, MV-3).
 */
import { useSyncExternalStore } from 'react';
import { getModel } from '../core/catalog.ts';
import { runAssistantTurn } from '../core/chatTurn.ts';
import {
  DEFAULT_TITLE,
  makeAttachment,
  newId,
  newThread,
  titleFrom,
  toHistory,
  type Attachment,
  type ChatMessage,
  type ChatThread,
  type ThreadSoul,
} from '../core/chatTypes.ts';
import { parseRememberCommand } from '../core/memory.ts';
import { buildSystemPrompt } from '../core/persona.ts';
import { createStore } from '../core/store.ts';
import { engine } from './engine.ts';
import { deleteThreadFile, listThreads, loadThread, saveThread, type ThreadMeta } from './chatStore.ts';
import { addMemory, memoryStore } from './memory.ts';
import { isInstalled } from './modelLibrary.ts';
import { settingsStore } from './settings.ts';
import { isStorageReady } from './storage.ts';
import { showToast } from './toast.ts';

/** How often the in-progress answer is written to disk while it streams. */
const PARTIAL_SAVE_MS = 2000;

export interface ChatState {
  thread: ChatThread;
  threads: ThreadMeta[];
  sending: boolean;
  saveError: string | null;
}

function freshThread(incognito = false): ChatThread {
  const s = settingsStore.getState();
  return newThread(s.archetype, s.pad, { incognito });
}

export const chatStore = createStore<ChatState>({
  thread: newThread('empath', { pleasure: 0.65, arousal: 0.4, dominance: 0.5 }),
  threads: [],
  sending: false,
  saveError: null,
});

export function useChatState(): ChatState {
  return useSyncExternalStore(chatStore.subscribe, chatStore.getState);
}

export type SendResult =
  | { ok: true }
  | { ok: false; reason: 'empty' | 'busy' | 'no_storage' | 'no_model' | 'not_installed' | 'engine'; message: string };

// ------------------------------------------------------------------ helpers

export const showNotice = (text: string): void => showToast(text);

function setMessages(update: (messages: ChatMessage[]) => ChatMessage[], extra: Partial<ChatThread> = {}): void {
  chatStore.setState((s) => ({ thread: { ...s.thread, ...extra, messages: update(s.thread.messages) } }));
}

function patchMessage(id: string, patch: Partial<ChatMessage>): void {
  setMessages((ms) => ms.map((m) => (m.id === id ? { ...m, ...patch } : m)));
}

async function persist(refreshList = true): Promise<void> {
  const { thread } = chatStore.getState();
  if (thread.incognito || thread.messages.length === 0) return;
  try {
    await saveThread({ ...thread, updatedAt: Date.now() });
    chatStore.setState({ saveError: null });
    if (refreshList) void refreshThreadList();
  } catch (e) {
    chatStore.setState({ saveError: `Could not save this chat to your storage folder (${e instanceof Error ? e.message : 'unknown error'}).` });
  }
}

export async function refreshThreadList(): Promise<void> {
  if (!isStorageReady()) return;
  chatStore.setState({ threads: await listThreads() });
}

// ------------------------------------------------------------------ lifecycle

/** Call once the vault is ready: load history and open the latest chat (or a fresh one). */
export async function initChat(): Promise<void> {
  if (!isStorageReady()) return;
  const threads = await listThreads();
  chatStore.setState({ threads });
  if (threads.length > 0) {
    const latest = await loadThread(threads[0].id);
    if (latest) {
      chatStore.setState({ thread: latest });
      return;
    }
  }
  chatStore.setState({ thread: freshThread() });
}

export function canSwitchThread(): boolean {
  return !chatStore.getState().sending;
}

export function newChat(incognito = false): boolean {
  if (!canSwitchThread()) {
    showNotice('Wait for the reply to finish (or press Stop) first.');
    return false;
  }
  const { thread } = chatStore.getState();
  if (thread.messages.length === 0 && thread.incognito === incognito) return true; // already a blank chat
  chatStore.setState({ thread: freshThread(incognito) });
  return true;
}

export async function openThread(id: string): Promise<boolean> {
  if (!canSwitchThread()) {
    showNotice('Wait for the reply to finish (or press Stop) first.');
    return false;
  }
  const t = await loadThread(id);
  if (!t) {
    showNotice('That chat could not be opened.');
    await refreshThreadList();
    return false;
  }
  chatStore.setState({ thread: t });
  return true;
}

export async function removeThread(id: string): Promise<void> {
  const { thread } = chatStore.getState();
  if (thread.id === id && chatStore.getState().sending) {
    showNotice('Wait for the reply to finish (or press Stop) first.');
    return;
  }
  deleteThreadFile(id);
  if (thread.id === id) chatStore.setState({ thread: freshThread() });
  await refreshThreadList();
}

export function updateThreadSoul(soul: ThreadSoul): void {
  chatStore.setState((s) => ({ thread: { ...s.thread, soul } }));
  void persist();
}

export async function pickAttachmentFromText(name: string, content: string): Promise<Attachment> {
  return makeAttachment(name, content);
}

// ------------------------------------------------------------------ sending

export async function sendMessage(rawText: string, attachments: Attachment[] = []): Promise<SendResult> {
  const text = rawText.trim();
  if (!text && attachments.length === 0) return { ok: false, reason: 'empty', message: 'Type a message first.' };

  const fact = parseRememberCommand(text);
  if (fact !== null) {
    const r = addMemory(fact);
    showNotice(r.ok ? `Remembered: "${r.fact.text}"` : r.reason);
    return { ok: true };
  }

  if (chatStore.getState().sending) return { ok: false, reason: 'busy', message: 'Still answering. Wait or press Stop.' };
  if (!isStorageReady()) return { ok: false, reason: 'no_storage', message: 'Choose where CHIWIWI keeps its data first.' };

  const spec = getModel(settingsStore.getState().activeModelId);
  if (!spec) return { ok: false, reason: 'no_model', message: 'No model selected yet. Download one from the Model Hub.' };
  if (!isInstalled(spec)) {
    return { ok: false, reason: 'not_installed', message: `${spec.name} is not downloaded in the current storage folder. Download it from the Model Hub.` };
  }

  const userMessage: ChatMessage = { id: newId('u'), role: 'user', text, attachments: attachments.length ? attachments : undefined, createdAt: Date.now(), status: 'done' };
  return runTurn(userMessage, true);
}

/** Re-answer the last user message (after an error or Stop, or to get a different answer). */
export async function regenerate(): Promise<SendResult> {
  const { thread, sending } = chatStore.getState();
  if (sending) return { ok: false, reason: 'busy', message: 'Still answering.' };
  const ms = thread.messages;
  const last = ms[ms.length - 1];
  const prev = ms[ms.length - 2];
  if (!last || last.role !== 'assistant' || !prev || prev.role !== 'user') return { ok: false, reason: 'empty', message: 'Nothing to retry.' };
  setMessages((all) => all.slice(0, -2));
  return runTurn(prev, true);
}

async function runTurn(userMessage: ChatMessage, appendUser: boolean): Promise<SendResult> {
  const spec = getModel(settingsStore.getState().activeModelId);
  if (!spec) return { ok: false, reason: 'no_model', message: 'No model selected yet.' };

  const assistantId = newId('a');
  const needsLoad = !engine.isReady(spec.id);
  const priorHistory = toHistory(chatStore.getState().thread.messages);
  const wasBlank = chatStore.getState().thread.messages.length === 0;

  chatStore.setState({ sending: true });
  setMessages(
    (ms) => [
      ...ms,
      ...(appendUser ? [userMessage] : []),
      { id: assistantId, role: 'assistant', text: '', createdAt: Date.now(), status: 'streaming', phase: needsLoad ? 'loading' : 'reading' },
    ],
    wasBlank || chatStore.getState().thread.title === DEFAULT_TITLE ? { title: titleFrom(userMessage.text || userMessage.attachments?.[0]?.name || '') } : {},
  );
  // Save NOW: the user's message must survive an app kill / swipe-away / out-of-memory kill mid-answer.
  // (A message still "streaming" on disk reloads as "stopped"; see toPersistable.)
  void persist(false);

  try {
    if (needsLoad) {
      const mounted = await engine.mount(spec);
      if (!mounted.ok) {
        patchMessage(assistantId, { status: 'error', error: mounted.message, phase: 'done' });
        return { ok: false, reason: 'engine', message: mounted.message };
      }
    }

    const { thread } = chatStore.getState();
    const settings = settingsStore.getState();
    const system = buildSystemPrompt({
      archetype: thread.soul.archetype,
      pad: thread.soul.pad,
      toneIntensity: thread.soul.toneIntensity,
      backstory: thread.soul.customBackstory,
      memories: memoryStore.getState().facts.map((f) => f.text),
    });

    // Coalesce token updates (~15 fps) so long answers do not flood React with renders.
    let pending: Partial<ChatMessage> | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastSaved = Date.now();
    const flush = () => {
      timer = null;
      if (pending) {
        patchMessage(assistantId, pending);
        pending = null;
        // Throttled partial save (every ~2 s) so a kill mid-answer keeps what was already written.
        if (Date.now() - lastSaved >= PARTIAL_SAVE_MS) {
          lastSaved = Date.now();
          void persist(false);
        }
      }
    };

    const outcome = await runAssistantTurn({
      history: priorHistory,
      userText: userMessage.text,
      attachments: userMessage.attachments ?? [],
      spec,
      nCtx: engine.state.nCtx || engine.contextSize(),
      system,
      thinkingEnabled: settings.thinkingEnabled,
      generate: (p) => engine.generate(p),
      countPromptTokens: (messages, thinking) => engine.countPromptTokens(messages, thinking),
      now: () => Date.now(),
      onUpdate: (patch) => {
        pending = { ...(pending ?? {}), ...patch };
        if (!timer) timer = setTimeout(flush, 66);
      },
    });
    if (timer) clearTimeout(timer);
    pending = null;
    patchMessage(assistantId, outcome);
    return outcome.status === 'error' ? { ok: false, reason: 'engine', message: outcome.error ?? 'Generation failed.' } : { ok: true };
  } finally {
    chatStore.setState({ sending: false });
    await persist();
  }
}

export async function stopGeneration(): Promise<void> {
  await engine.stop();
}
