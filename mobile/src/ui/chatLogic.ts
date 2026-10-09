/** Pure helpers behind the chat screens (no React, no react-native): unit-tested in test/chatUi.test.ts. */
import type { ChatMessage, MessageStats } from '../core/chatTypes.ts';
export { withoutMessage, truncateAt } from '../core/chatTypes.ts';

/** The stats line under a reply. Every part is a number llama.cpp measured for THIS reply; missing = left out. */
export function statsParts(st: MessageStats): string[] {
  const parts: string[] = [];
  if (st.tokensPerSecond > 0) parts.push(`${st.tokensPerSecond.toFixed(1)} tok/s`);
  parts.push(`${st.generatedTokens} tokens`);
  if (st.ttftMs !== undefined && st.ttftMs > 0) parts.push(`first token ${(st.ttftMs / 1000).toFixed(1)}s`);
  if (st.backend) parts.push(/gpu/i.test(st.backend) ? 'GPU' : 'CPU');
  if (st.cachedTokens && st.cachedTokens > 0) parts.push(`${st.cachedTokens}${st.promptTokens ? `/${st.promptTokens}` : ''} cached`);
  if (st.draftTokens && st.draftTokens > 0) parts.push(`draft ${Math.round(((st.draftAccepted ?? 0) / st.draftTokens) * 100)}% accepted`);
  return parts;
}

export type EngineLineKind = 'none' | 'not_downloaded' | 'idle' | 'loading' | 'ready' | 'generating' | 'error';
export type EclipseLook = 'idle' | 'loading' | 'ready' | 'busy' | 'error';

/** Engine line -> the Eclipse proof-of-life disc. */
export function eclipseFor(kind: EngineLineKind): EclipseLook {
  switch (kind) {
    case 'loading':
      return 'loading';
    case 'ready':
      return 'ready';
    case 'generating':
      return 'busy';
    case 'error':
      return 'error';
    default:
      return 'idle';
  }
}

// ------------------------------------------------------------------ boot

/** services/lifecycle BootStage (null = not started). */
export type BootStageName = 'settings' | 'storage' | 'library' | 'done' | null;
export type BootStepState = 'done' | 'active' | 'pending';
export interface BootStep {
  key: 'fonts' | 'security' | 'settings' | 'storage' | 'library' | 'voice' | 'model';
  label: string;
  state: BootStepState;
}
export interface BootFlags {
  /** lifecycle.useBoot().stage */
  stage: BootStageName;
  /** security prefs read (and lock engaged if on) */
  security: boolean;
  /** voice prefs read */
  voice: boolean;
  /** the last model is being auto-loaded; null = nothing to load */
  model: { name: string; done: boolean; progress: number } | null;
}

const RANK: Record<string, number> = { settings: 0, storage: 1, library: 2, done: 3 };

/**
 * Real boot steps, in the order they run. Fonts are always done (the theme waits for them before anything renders);
 * settings -> storage -> library run in sequence (lifecycle.bootstrap); app lock and voice prefs run alongside.
 * `fraction` counts finished steps (plus the model's real load progress), never time.
 */
export function bootSteps(f: BootFlags): { steps: BootStep[]; fraction: number; finished: boolean } {
  const rank = f.stage ? RANK[f.stage] : -1;
  const seq = (n: number): BootStepState => (rank > n ? 'done' : rank === n || (rank < 0 && n === 0) ? 'active' : 'pending');
  const steps: BootStep[] = [
    { key: 'fonts', label: 'Fonts', state: 'done' },
    { key: 'security', label: 'App lock', state: f.security ? 'done' : 'active' },
    { key: 'settings', label: 'Settings', state: seq(0) },
    { key: 'storage', label: 'Storage', state: seq(1) },
    { key: 'library', label: 'Chats, memory and models', state: seq(2) },
    { key: 'voice', label: 'Voice', state: f.voice ? 'done' : 'active' },
  ];
  if (f.model) steps.push({ key: 'model', label: `Loading ${f.model.name}`, state: f.model.done ? 'done' : rank >= 3 ? 'active' : 'pending' });
  const done = steps.filter((s) => s.state === 'done').length;
  const partial = f.model && !f.model.done && rank >= 3 ? Math.max(0, Math.min(1, f.model.progress)) : 0;
  return { steps, fraction: (done + partial) / steps.length, finished: done === steps.length };
}
