/**
 * CHIWIWI Sovereign Episodic Memory Engine
 * Implements rolling context window (4-6 turns) + local entity memory bank
 * to preserve relationship memory without KV-cache RAM explosion.
 */

import { MMKVCache, CACHE_KEYS } from './mmkvCache.ts';

let Paths: any, File: any, Directory: any;
try {
  const expoFs = require('expo-file-system');
  Paths = expoFs.Paths;
  File = expoFs.File;
  Directory = expoFs.Directory;
} catch {
  // In pure Node.js environments or tests where native module is unbundled
  Paths = { document: '' };
  File = class {
    exists = false;
    text() { return Promise.resolve('[]'); }
    write() { return Promise.resolve(); }
  };
  Directory = class {
    exists = true;
    create() {}
  };
}

export interface EpisodicMemory {
  id: string;
  fact: string;
  category: 'preference' | 'entity' | 'emotional_anchor' | 'project';
  timestamp: number;
  importance: number; // 0.0 - 1.0
}

export class MemoryEngine {
  private static getMemoryFile() {
    return Paths?.document ? new File(new Directory(Paths.document, 'vault'), 'memory.json') : null;
  }
  private static memories: EpisodicMemory[] = [
    {
      id: 'm1',
      fact: 'User prefers action-first execution and zero preambles.',
      category: 'preference',
      timestamp: Date.now() - 7200000,
      importance: 0.95,
    },
    {
      id: 'm2',
      fact: 'Project CHIWIWI is an on-device sovereign mobile AI agent with zero cloud dependency.',
      category: 'project',
      timestamp: Date.now() - 3600000,
      importance: 0.98,
    },
  ];
  private static isLoaded = false;

  public static async loadFromDisk(): Promise<void> {
    if (this.isLoaded) return;

    // Fast-path MMKV synchronous cache
    try {
      const cached = MMKVCache.getObject<EpisodicMemory[]>(CACHE_KEYS.EPISODIC_MEMORIES);
      if (Array.isArray(cached) && cached.length > 0) {
        this.memories = cached;
        this.isLoaded = true;
        return;
      }
    } catch {}

    try {
      const file = this.getMemoryFile();
      if (file && file.exists) {
        const text = await file.text();
        const data = JSON.parse(text) as EpisodicMemory[];
        if (Array.isArray(data)) {
          this.memories = data;
          try {
            MMKVCache.setObject(CACHE_KEYS.EPISODIC_MEMORIES, this.memories);
          } catch {}
        }
      }
    } catch {}
    this.isLoaded = true;
  }

  private static async persistToDisk(): Promise<void> {
    // Synchronously write to MMKV
    try {
      MMKVCache.setObject(CACHE_KEYS.EPISODIC_MEMORIES, this.memories);
    } catch {}

    try {
      if (!Paths?.document) return;
      const dir = new Directory(Paths.document, 'vault');
      if (!dir.exists) dir.create();
      const file = this.getMemoryFile();
      if (file) await file.write(JSON.stringify(this.memories, null, 2));
    } catch {}
  }

  /**
   * Save a new extracted memory fact into the local store.
   */
  public static addMemory(fact: string, category: EpisodicMemory['category'], importance = 0.8): EpisodicMemory {
    const memory: EpisodicMemory = {
      id: `mem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      fact,
      category,
      timestamp: Date.now(),
      importance,
    };
    this.memories.push(memory);
    this.persistToDisk();
    return memory;
  }

  /**
   * Retrieve top-N relevant episodic memories for a given context.
   */
  public static queryMemories(limit = 3): EpisodicMemory[] {
    return [...this.memories]
      .sort((a, b) => b.importance - a.importance)
      .slice(0, limit);
  }

  /**
   * Format relevant memories into a lean prompt injection block.
   */
  public static formatPromptContext(): string {
    const top = this.queryMemories(3);
    if (top.length === 0) return '';

    const lines = top.map(m => `- ${m.fact}`).join('\n');
    return `[EPISODIC RELATIONSHIP MEMORY]\n${lines}\n`;
  }

  /**
   * Prune active chat history to enforce the rolling window budget (max 6 turns).
   */
  public static pruneRollingWindow<T>(history: T[], maxTurns = 6): T[] {
    if (history.length <= maxTurns) return history;
    return history.slice(history.length - maxTurns);
  }

  /**
   * Clear all memories (User Sovereign Right).
   */
  public static clearAll(): void {
    this.memories = [];
    try {
      MMKVCache.delete(CACHE_KEYS.EPISODIC_MEMORIES);
    } catch {}
    this.persistToDisk();
  }

  public static getCount(): number {
    return this.memories.length;
  }
}
