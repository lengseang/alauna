/**
 * CHIWIWI Sovereign Episodic Memory Engine
 * Implements rolling context window (4-6 turns) + local entity memory bank
 * to preserve relationship memory without KV-cache RAM explosion.
 */

export interface EpisodicMemory {
  id: string;
  fact: string;
  category: 'preference' | 'entity' | 'emotional_anchor' | 'project';
  timestamp: number;
  importance: number; // 0.0 - 1.0
}

export class MemoryEngine {
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
  }

  public static getCount(): number {
    return this.memories.length;
  }
}
