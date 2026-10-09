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
  effectiveSoul,
  imagePaths,
  makeAttachment,
  newId,
  newThread,
  titleFrom,
  toHistory,
  truncateAt,
  withoutMessage,
  type Attachment,
  type ChatMessage,
  type ChatThread,
  type ThreadSoul,
} from '../core/chatTypes.ts';
import { activeFactTexts, parseRememberCommand } from '../core/memory.ts';
import { buildSystemPrompt, padToSampling } from '../core/persona.ts';
import { createStore } from '../core/store.ts';
import { engine, modelHasVision } from './engine.ts';
import {
  deleteAllThreadFiles,
  deleteThreadFile,
  listThreads,
  loadThread,
  saveThread,
  searchThreads,
  sortThreads,
  updateThreadFile,
  type ThreadMeta,
} from './chatStore.ts';
import { addMemory, memoryStore } from './memory.ts';
import { isInstalled } from './modelLibrary.ts';
import { settingsStore } from './settings.ts';
import { globalSoul } from './soul.ts';
import { isStorageReady } from './storage.ts';
import { showToast } from './toast.ts';
import { compileSoulPrompt } from '../core/soulCompiler.ts';
import { getBuiltInSoul } from '../core/builtInSouls.ts';
import { getActiveSoul, updateThreadRuntimeOnTurn } from './soulStore.ts';
import { queryGraphContext } from './graphStore.ts';
import { CONTINUATION_DIRECTIVE, preparePriorTextForContinuation } from '../core/conversationContinuity.ts';

export type { ThreadMeta } from './chatStore.ts';

/** How often the in-progress answer is written to disk while it streams. */
const PARTIAL_SAVE_MS = 2000;

export interface ChatState {
  thread: ChatThread;
  threads: ThreadMeta[];
  sending: boolean;
  saveError: string | null;
}

/** A blank chat that follows the global soul. Incognito by default when Settings > Security says so. */
function freshThread(incognito: boolean = settingsStore.getState().incognitoDefault): ChatThread {
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
  | { ok: false; reason: 'empty' | 'busy' | 'no_storage' | 'no_model' | 'not_installed' | 'no_vision' | 'engine'; message: string };

const NO_VISION =
  'This model cannot see images. Load a vision model (one that comes with an image projector) or remove the image and send the text.';

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
  if (thread.incognito) return;
  try {
    if (thread.messages.length === 0) {
      deleteThreadFile(thread.id);
    } else {
      await saveThread({ ...thread, updatedAt: Date.now() });
    }
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

/** Search every saved chat (title + messages). Empty query = the full list. Each result has a `snippet`. */
export async function searchChats(query: string): Promise<ThreadMeta[]> {
  if (!isStorageReady()) return [];
  return searchThreads(query);
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

/** Start a blank chat. `incognito` defaults to Settings > Security "Incognito by default". */
export function newChat(incognito: boolean = settingsStore.getState().incognitoDefault): boolean {
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

/** Give the open chat its own soul (overrides the global one for this chat only). */
export function updateThreadSoul(soul: ThreadSoul): void {
  chatStore.setState((s) => ({ thread: { ...s.thread, soul, soulOverride: true } }));
  void persist();
}

/** The open chat follows the global soul again. */
export function clearThreadSoul(): void {
  chatStore.setState((s) => ({ thread: { ...s.thread, soulOverride: false } }));
  void persist();
}

/** The soul the open chat really uses (its override, or the global soul). */
export function currentSoul(): ThreadSoul {
  return effectiveSoul(chatStore.getState().thread, globalSoul());
}

export async function renameThread(id: string, title: string): Promise<boolean> {
  const clean = title.replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!clean) return false;
  const { thread } = chatStore.getState();
  if (thread.id === id) {
    chatStore.setState({ thread: { ...thread, title: clean } });
    if (thread.incognito || thread.messages.length === 0) return true;
    await persist();
    return true;
  }
  const ok = (await updateThreadFile(id, (t) => ({ ...t, title: clean }))) !== null;
  await refreshThreadList();
  return ok;
}

/** Pinned chats sort first and are never auto-purged. */
export async function setThreadPinned(id: string, pinned: boolean): Promise<boolean> {
  const { thread } = chatStore.getState();
  if (thread.id === id) {
    chatStore.setState({ thread: { ...thread, pinned } });
    if (!thread.incognito && thread.messages.length > 0) await persist();
    else chatStore.setState((s) => ({ threads: sortThreads(s.threads.map((m) => (m.id === id ? { ...m, pinned } : m))) }));
    return true;
  }
  const ok = (await updateThreadFile(id, (t) => ({ ...t, pinned }))) !== null;
  await refreshThreadList();
  return ok;
}

/** Delete one message by id from the active chat or a chat file on disk. */
export async function deleteMessage(threadId: string, id: string): Promise<boolean> {
  const { thread } = chatStore.getState();
  if (thread.id === threadId) {
    const next = withoutMessage(thread.messages, id);
    if (next.length === thread.messages.length) return false;
    chatStore.setState({ thread: { ...thread, messages: next } });
    await persist();
    return true;
  }
  const ok = (await updateThreadFile(threadId, (t) => ({ ...t, messages: withoutMessage(t.messages, id) }))) !== null;
  await refreshThreadList();
  return ok;
}

/** Truncate a thread at message id: removes message id and all following messages. Returns the removed messages (e.g. for Undo). */
export async function truncateFrom(threadId: string, id: string): Promise<ChatMessage[]> {
  const { thread } = chatStore.getState();
  if (thread.id === threadId) {
    const { kept, removed } = truncateAt(thread.messages, id);
    if (removed.length === 0) return [];
    chatStore.setState({ thread: { ...thread, messages: kept } });
    await persist();
    return removed;
  }
  let removed: ChatMessage[] = [];
  const updated = await updateThreadFile(threadId, (t) => {
    const r = truncateAt(t.messages, id);
    removed = r.removed;
    return { ...t, messages: r.kept };
  });
  await refreshThreadList();
  return updated !== null ? removed : [];
}

/** Restore messages into a thread (used for Undo after delete or edit/resend). */
export async function restoreMessages(threadId: string, messages: ChatMessage[]): Promise<boolean> {
  const { thread } = chatStore.getState();
  if (thread.id === threadId) {
    chatStore.setState({ thread: { ...thread, messages } });
    await persist();
    return true;
  }
  const ok = (await updateThreadFile(threadId, (t) => ({ ...t, messages }))) !== null;
  await refreshThreadList();
  return ok;
}

/** Purge support: forget every chat (files are deleted by the caller) and open a blank one. */
export async function resetAllChats(): Promise<number> {
  const removed = deleteAllThreadFiles();
  chatStore.setState({ thread: freshThread(), threads: [] });
  return removed;
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

  if (imagePaths(attachments).length > 0 && !modelHasVision(spec)) return { ok: false, reason: 'no_vision', message: NO_VISION };

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

/** Continue generating the last cut-off or stopped assistant message seamlessly. */
export async function continueGeneration(): Promise<SendResult> {
  const { thread, sending } = chatStore.getState();
  if (sending) return { ok: false, reason: 'busy', message: 'Still answering.' };
  const ms = thread.messages;
  const last = ms[ms.length - 1];
  if (!last || last.role !== 'assistant') return { ok: false, reason: 'empty', message: 'No reply to continue.' };
  if (!last.canContinue && last.status !== 'stopped') return { ok: false, reason: 'empty', message: 'This reply is already complete.' };

  const spec = getModel(settingsStore.getState().activeModelId);
  if (!spec) return { ok: false, reason: 'no_model', message: 'No model selected yet.' };
  if (!isInstalled(spec)) return { ok: false, reason: 'not_installed', message: `${spec.name} is not installed.` };

  const priorText = preparePriorTextForContinuation(last.rawText ?? last.text);
  const priorReasoning = last.reasoning;
  const priorHistory = toHistory(
    ms.map((m) => (m.id === last.id ? { ...m, text: priorText, status: 'stopped' as const } : m)),
  );

  chatStore.setState({ sending: true });
  patchMessage(last.id, { status: 'streaming', phase: 'answering', canContinue: false });
  void persist(false);

  try {
    const needsLoad = !engine.isReady(spec.id);
    if (needsLoad) {
      const mounted = await engine.mount(spec);
      if (!mounted.ok) {
        patchMessage(last.id, { status: 'error', error: mounted.message, phase: 'done' });
        return { ok: false, reason: 'engine', message: mounted.message };
      }
    }

    const settings = settingsStore.getState();
    const threadSoul = effectiveSoul(thread, globalSoul(settings));
    const activeDefinition = thread.soulOverride && thread.soul.archetype
      ? (getBuiltInSoul(thread.soul.archetype) ?? getActiveSoul())
      : getActiveSoul();

    const graphTriples = queryGraphContext(priorText, { maxTriples: 4, maxHops: 1 });
    const compiled = compileSoulPrompt({
      soul: activeDefinition,
      threadOverrides: thread.soulOverride
        ? {
            identity: {
              ...activeDefinition.identity,
              characterRules: threadSoul.customBackstory ? [threadSoul.customBackstory] : activeDefinition.identity.characterRules,
            },
          }
        : undefined,
      freedom: settings.freedom,
      runtimeState: undefined,
      knowledgeTriples: graphTriples,
      userMemories: activeFactTexts(memoryStore.getState().facts),
    });

    const system = compiled.systemPrompt;
    const sampling = padToSampling(threadSoul.pad, threadSoul.toneIntensity, settings.sampling);
    await engine.preparePrefix(system, settings.thinkingEnabled && spec.thinking !== 'none');

    let pending: Partial<ChatMessage> | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastSaved = Date.now();
    const flush = () => {
      timer = null;
      if (pending) {
        patchMessage(last.id, pending);
        pending = null;
        if (Date.now() - lastSaved >= PARTIAL_SAVE_MS) {
          lastSaved = Date.now();
          void persist(false);
        }
      }
    };

    const outcome = await runAssistantTurn({
      history: priorHistory,
      userText: CONTINUATION_DIRECTIVE,
      attachments: [],
      spec,
      nCtx: engine.state.nCtx || engine.contextSize(),
      system,
      thinkingEnabled: settings.thinkingEnabled,
      sampling,
      backend: engine.state.info?.backend,
      continuation: {
        priorText,
        priorReasoning,
      },
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
    patchMessage(last.id, outcome);
    return outcome.status === 'error' ? { ok: false, reason: 'engine', message: outcome.error ?? 'Continuation failed.' } : { ok: true };
  } finally {
    chatStore.setState({ sending: false });
    await persist();
  }
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

    if (imagePaths(userMessage.attachments).length > 0 && !engine.supportsVision()) {
      const why = engine.state.info?.multimodalError ? ` (${engine.state.info.multimodalError})` : '';
      patchMessage(assistantId, { status: 'error', error: `${NO_VISION}${why}`, phase: 'done' });
      return { ok: false, reason: 'no_vision', message: NO_VISION };
    }

    const { thread } = chatStore.getState();
    const settings = settingsStore.getState();
    const threadSoul = effectiveSoul(thread, globalSoul(settings));
    const activeDefinition = thread.soulOverride && thread.soul.archetype
      ? (getBuiltInSoul(thread.soul.archetype) ?? getActiveSoul())
      : getActiveSoul();

    const { state: runtimeState, behavioralPrompts } = updateThreadRuntimeOnTurn(thread.id, activeDefinition, userMessage.text);
    const graphTriples = queryGraphContext(userMessage.text, { maxTriples: 4, maxHops: 1 });

    const compiled = compileSoulPrompt({
      soul: activeDefinition,
      threadOverrides: thread.soulOverride
        ? {
            identity: {
              ...activeDefinition.identity,
              characterRules: threadSoul.customBackstory ? [threadSoul.customBackstory] : activeDefinition.identity.characterRules,
            },
          }
        : undefined,
      freedom: settings.freedom,
      runtimeState,
      knowledgeTriples: graphTriples,
      userMemories: activeFactTexts(memoryStore.getState().facts),
    });

    const system = behavioralPrompts.length > 0
      ? `${compiled.systemPrompt}\n\nImmediate turn behavioral directives:\n${behavioralPrompts.map((b) => `- ${b}`).join('\n')}`
      : compiled.systemPrompt;
    const sampling = padToSampling(threadSoul.pad, threadSoul.toneIntensity, settings.sampling);
    // KV session cache: restore (or evaluate + save) the system-prompt prefix before the reply. Never throws.
    await engine.preparePrefix(system, settings.thinkingEnabled && spec.thinking !== 'none');

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
      sampling,
      backend: engine.state.info?.backend,
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
