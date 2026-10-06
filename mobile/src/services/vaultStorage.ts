/**
 * CHIWIWI Sovereign Local Vault & Compaction Engine
 * 1. Infinite chat history with Claude-style automated session compaction.
 * 2. Hermetic media isolation (never leaks to Android Gallery / iOS Photos).
 * 3. Per-chat custom persona & soul evolution snapshots.
 */

import { Paths, File, Directory } from 'expo-file-system';
import { PADVector, SoulArchetypeKey, ARCHETYPES } from '../types/soul';
import { StorageConfigService } from './storageConfig';

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

  private static get vaultDir(): Directory {
    if (this.cachedVaultDir) return this.cachedVaultDir;
    return new Directory(Paths.document, 'vault');
  }

  private static get chatsDir(): Directory {
    return new Directory(this.vaultDir, 'chats');
  }

  private static get mediaDir(): Directory {
    return new Directory(this.vaultDir, 'media');
  }

  /**
   * Initialize secure folders and write .nomedia so phone Gallery/Photos NEVER see private AI assets.
   */
  public static async initVault(): Promise<void> {
    const config = await StorageConfigService.getConfig();
    this.cachedVaultDir = new Directory(config.vaultUri);

    if (!this.vaultDir.exists) {
      try { this.vaultDir.create(); } catch {}
    }
    if (!this.chatsDir.exists) {
      try { this.chatsDir.create(); } catch {}
    }
    if (!this.mediaDir.exists) {
      try {
        this.mediaDir.create();
        const noMediaFile = new File(this.mediaDir, '.nomedia');
        if (!noMediaFile.exists) {
          noMediaFile.write('');
        }
      } catch {}
    }
  }

  /**
   * Save a thread securely to disk in native .chiwiwi JSON format.
   */
  public static async saveThread(thread: ChatThread): Promise<void> {
    if (thread.isIncognito) return; // Incognito never persists
    await this.initVault();

    const file = new File(this.chatsDir, `${thread.id}.chiwiwi`);
    await file.write(JSON.stringify(thread, null, 2));
  }

  /**
   * Load a thread from disk.
   */
  public static async loadThread(threadId: string): Promise<ChatThread | null> {
    await this.initVault();
    const file = new File(this.chatsDir, `${threadId}.chiwiwi`);
    if (!file.exists) return null;

    try {
      const text = await file.text();
      return JSON.parse(text) as ChatThread;
    } catch {
      return null;
    }
  }

  /**
   * List all stored conversations with their latest titles and timestamps.
   */
  public static async listAllThreads(): Promise<{ id: string; title: string; updatedAt: number }[]> {
    await this.initVault();
    const files = this.chatsDir.list();
    const threads: { id: string; title: string; updatedAt: number }[] = [];

    for (const f of files) {
      if (f instanceof File && f.name.endsWith('.chiwiwi')) {
        try {
          const content = await f.text();
          const parsed = JSON.parse(content) as ChatThread;
          threads.push({
            id: parsed.id,
            title: parsed.title,
            updatedAt: parsed.updatedAt,
          });
        } catch {
          // Skip corrupt file
        }
      }
    }

    return threads.sort((a, b) => b.updatedAt - a.updatedAt);
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
    const mediaFile = new File(this.mediaDir, filename);
    await mediaFile.write(base64OrData);
    return mediaFile.uri;
  }

  /**
   * Create default thread config with per-chat personality.
   */
  public static createNewThread(title = 'New Conversation', archetype: SoulArchetypeKey = 'empath'): ChatThread {
    return {
      id: `thread_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      soulConfig: {
        archetype,
        pad: ARCHETYPES[archetype].defaultPAD,
        toneIntensity: 0.8,
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
