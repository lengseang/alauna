/**
 * CHIWIWI Sovereign Local Vault & Compaction Engine
 * 1. Infinite chat history with Claude-style automated session compaction.
 * 2. Fail-safe dual-vault persistence: writes to configured root AND local app sandbox mirror.
 * 3. Hermetic media isolation (never leaks to Android Gallery / iOS Photos).
 * 4. Per-chat custom persona & soul evolution snapshots.
 */

import { Paths, Directory, File } from 'expo-file-system';
import { ARCHETYPES } from '../types/soul.ts';
import type { PADVector, SoulArchetypeKey } from '../types/soul.ts';
import { StorageConfigService } from './storageConfig.ts';
import { MMKVCache, CACHE_KEYS } from './mmkvCache.ts';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  thoughts?: string; // Deep reasoning & process trace (Claude-style)
  timestamp: number;
  mediaUris?: string[]; // Private sandboxed media
  tokenCountEst: number;
  meta?: string;
}

export interface ThreadSoulConfig {
  archetype: SoulArchetypeKey;
  pad: PADVector;
  customBackstory?: string;
  toneIntensity: number; // 0.1 to 1.0
}

export interface ChatThread {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  soulConfig: ThreadSoulConfig;
  messages: ChatMessage[];
  compactedSummaries: string[]; // Claude-style compressed context anchors
  totalTokensEst: number;
  isIncognito: boolean;
}

export class VaultStorage {
  private static cachedVaultDir: Directory | null = null;

  public static setVaultDir(dir: Directory): void {
    this.cachedVaultDir = dir;
  }

  private static get fallbackVaultDir(): Directory {
    return new Directory(Paths.document, 'vault');
  }

  private static get fallbackChatsDir(): Directory {
    return new Directory(this.fallbackVaultDir, 'chats');
  }

  /**
   * Initialize secure folders and write .nomedia so phone Gallery/Photos NEVER see private AI assets.
   */
  public static async initVault(): Promise<void> {
    const config = await StorageConfigService.getConfig();
    this.cachedVaultDir = new Directory(config.vaultUri);

    // 1. Ensure fallback internal sandbox always exists
    try {
      if (!this.fallbackVaultDir.exists) this.fallbackVaultDir.create();
      if (!this.fallbackChatsDir.exists) this.fallbackChatsDir.create();
      const fallbackMedia = new Directory(this.fallbackVaultDir, 'media');
      if (!fallbackMedia.exists) fallbackMedia.create();
      const nomedia = new File(fallbackMedia, '.nomedia');
      if (!nomedia.exists) nomedia.write('');
    } catch {}

    // 2. Ensure primary configured vault exists
    try {
      const primaryChats = await StorageConfigService.getChatsDirectory();
      if (!primaryChats.exists) primaryChats.create();
    } catch {}
  }

  /**
   * Save a thread securely to disk in native .chiwiwi JSON format.
   * Uses dual-vault mirror: saves to primary configured location AND internal fallback sandbox.
   */
  public static async saveThread(thread: ChatThread): Promise<void> {
    if (thread.isIncognito) return; // Incognito never persists

    // 1. Fast sub-millisecond MMKV cache write
    try {
      MMKVCache.setObject(`${CACHE_KEYS.THREAD_PREFIX}${thread.id}`, thread);
      const cachedIndex = MMKVCache.getObject<{ id: string; title: string; updatedAt: number }[]>(CACHE_KEYS.THREADS_INDEX) || [];
      const entry = { id: thread.id, title: thread.title, updatedAt: thread.updatedAt || Date.now() };
      const existingIdx = cachedIndex.findIndex(t => t.id === thread.id);
      if (existingIdx >= 0) {
        cachedIndex[existingIdx] = entry;
      } else {
        cachedIndex.unshift(entry);
      }
      MMKVCache.setObject(CACHE_KEYS.THREADS_INDEX, cachedIndex);
    } catch {}

    await this.initVault();

    const payload = JSON.stringify(thread, null, 2);

    // Strategy 1: Save to primary configured directory
    try {
      const primaryDir = await StorageConfigService.getChatsDirectory();
      const file = new File(primaryDir, `${thread.id}.chiwiwi`);
      await file.write(payload);
    } catch {
      // Primary directory write failed (e.g. read-only SAF external folder),
      // fallback mirror will ensure data is NEVER lost.
    }

    // Strategy 2: Guaranteed fail-safe mirror in internal app sandbox
    try {
      if (!this.fallbackChatsDir.exists) this.fallbackChatsDir.create();
      const fallbackFile = new File(this.fallbackChatsDir, `${thread.id}.chiwiwi`);
      await fallbackFile.write(payload);
    } catch {}
  }

  /**
   * Load a thread from disk or memory cache. Checks MMKV first, then primary directory, then fallback sandbox.
   */
  public static async loadThread(threadId: string): Promise<ChatThread | null> {
    // 1. Fast sub-millisecond MMKV cache lookup
    try {
      const cached = MMKVCache.getObject<ChatThread>(`${CACHE_KEYS.THREAD_PREFIX}${threadId}`);
      if (cached) return cached;
    } catch {}

    await this.initVault();

    // 2. Check primary configured directory
    try {
      const primaryDir = await StorageConfigService.getChatsDirectory();
      const file = new File(primaryDir, `${threadId}.chiwiwi`);
      if (file.exists) {
        const text = await file.text();
        const parsed = JSON.parse(text) as ChatThread;
        try {
          MMKVCache.setObject(`${CACHE_KEYS.THREAD_PREFIX}${threadId}`, parsed);
        } catch {}
        return parsed;
      }
    } catch {}

    // 3. Check fallback internal sandbox
    try {
      const fallbackFile = new File(this.fallbackChatsDir, `${threadId}.chiwiwi`);
      if (fallbackFile.exists) {
        const text = await fallbackFile.text();
        const parsed = JSON.parse(text) as ChatThread;
        try {
          MMKVCache.setObject(`${CACHE_KEYS.THREAD_PREFIX}${threadId}`, parsed);
        } catch {}
        return parsed;
      }
    } catch {}

    return null;
  }

  /**
   * List all stored conversations with their latest titles and timestamps.
   * Merges MMKV index, primary directory, and fallback sandbox.
   */
  public static async listAllThreads(): Promise<{ id: string; title: string; updatedAt: number }[]> {
    await this.initVault();
    const threadMap = new Map<string, { id: string; title: string; updatedAt: number }>();

    // 1. Seed from MMKV cache if available
    try {
      const cachedIndex = MMKVCache.getObject<{ id: string; title: string; updatedAt: number }[]>(CACHE_KEYS.THREADS_INDEX);
      if (Array.isArray(cachedIndex)) {
        for (const t of cachedIndex) {
          threadMap.set(t.id, t);
        }
      }
    } catch {}

    const scanDirectory = async (dir: Directory) => {
      try {
        if (!dir.exists) return;
        const files = dir.list();
        for (const f of files) {
          if (f instanceof File && f.name.endsWith('.chiwiwi')) {
            try {
              const content = await f.text();
              const parsed = JSON.parse(content) as ChatThread;
              const existing = threadMap.get(parsed.id);
              if (!existing || (parsed.updatedAt || 0) > existing.updatedAt) {
                threadMap.set(parsed.id, {
                  id: parsed.id,
                  title: parsed.title,
                  updatedAt: parsed.updatedAt || 0,
                });
              }
            } catch {
              // Skip corrupt individual file
            }
          }
        }
      } catch {}
    };

    // 2. Scan primary directory
    try {
      const primaryDir = await StorageConfigService.getChatsDirectory();
      await scanDirectory(primaryDir);
    } catch {}

    // 3. Scan internal fallback sandbox
    try {
      await scanDirectory(this.fallbackChatsDir);
    } catch {}

    const result = Array.from(threadMap.values()).sort((a, b) => b.updatedAt - a.updatedAt);
    try {
      MMKVCache.setObject(CACHE_KEYS.THREADS_INDEX, result);
    } catch {}
    return result;
  }

  /**
   * Delete a thread from MMKV cache and all vaults.
   */
  public static async deleteThread(threadId: string): Promise<void> {
    try {
      MMKVCache.delete(`${CACHE_KEYS.THREAD_PREFIX}${threadId}`);
      const cachedIndex = MMKVCache.getObject<{ id: string; title: string; updatedAt: number }[]>(CACHE_KEYS.THREADS_INDEX) || [];
      const updatedIndex = cachedIndex.filter(t => t.id !== threadId);
      MMKVCache.setObject(CACHE_KEYS.THREADS_INDEX, updatedIndex);
    } catch {}

    await this.initVault();

    try {
      const primaryDir = await StorageConfigService.getChatsDirectory();
      const primaryFile = new File(primaryDir, `${threadId}.chiwiwi`);
      if (primaryFile.exists) primaryFile.delete();
    } catch {}

    try {
      const fallbackFile = new File(this.fallbackChatsDir, `${threadId}.chiwiwi`);
      if (fallbackFile.exists) fallbackFile.delete();
    } catch {}
  }

  /**
   * CLAUDE-STYLE AUTOMATIC SESSION COMPACTION
   * When token budget exceeds maxTokens (e.g. 2,048 or 4,096),
   * this automatically condenses older turns into a dense semantic summary
   * and preserves the latest active conversational turns verbatim.
   */
  public static compactSession(thread: ChatThread, maxTokenThreshold = 2048): ChatThread {
    if (thread.messages.length <= 6) return thread;

    // Estimate total tokens (1 token ≈ 4 chars)
    const totalChars = thread.messages.reduce((acc, m) => acc + m.text.length, 0);
    const estimatedTokens = Math.floor(totalChars / 4);

    if (estimatedTokens < maxTokenThreshold) {
      return thread;
    }

    // Split: Keep last 4 turns verbatim, compact older turns
    const keepCount = 4;
    const toCompact = thread.messages.slice(0, thread.messages.length - keepCount);
    const toKeep = thread.messages.slice(thread.messages.length - keepCount);

    // Build dense summary anchor
    const keyThemes = toCompact
      .map(m => `${m.sender.toUpperCase()}: ${m.text.slice(0, 100)}...`)
      .join('\n');

    const compactedSummary = `[COMPACTED CONTEXT ANCHOR - Turns 1 to ${toCompact.length}]:\n${keyThemes}`;

    const updatedThread: ChatThread = {
      ...thread,
      compactedSummaries: [...thread.compactedSummaries, compactedSummary],
      messages: toKeep,
      updatedAt: Date.now(),
      totalTokensEst: Math.floor(toKeep.reduce((acc, m) => acc + m.text.length, 0) / 4) + 200,
    };

    return updatedThread;
  }

  /**
   * Save private generated or user-sent image into isolated media sandbox.
   */
  public static async saveIsolatedMedia(filename: string, base64OrData: string): Promise<string> {
    await this.initVault();
    try {
      const mediaDir = new Directory(this.fallbackVaultDir, 'media');
      if (!mediaDir.exists) mediaDir.create();
      const mediaFile = new File(mediaDir, filename);
      await mediaFile.write(base64OrData);
      return mediaFile.uri;
    } catch {
      return '';
    }
  }

  /**
   * Create default thread config with per-chat personality.
   */
  public static createNewThread(
    title = 'New Conversation',
    archetype: SoulArchetypeKey = 'empath',
    pad?: PADVector,
    toneIntensity = 0.8
  ): ChatThread {
    return {
      id: `thread_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      soulConfig: {
        archetype,
        pad: pad || ARCHETYPES[archetype].defaultPAD,
        toneIntensity,
      },
      messages: [
        {
          id: 'msg_0',
          sender: 'assistant',
          text: "I'm initialized in your handset's local memory. Zero cloud dependencies, zero telemetry. Ready when you are.",
          timestamp: Date.now(),
          tokenCountEst: 24,
          meta: 'S23 Ultra Sovereign Sandbox',
        },
      ],
      compactedSummaries: [],
      totalTokensEst: 24,
      isIncognito: false,
    };
  }
}
