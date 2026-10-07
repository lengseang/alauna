import type { ModelSpec } from '../core/catalog.ts';
import type { EngineStatus } from '../core/engineStatus.ts';
import { formatPercent } from '../core/format.ts';
import type { Tone } from './Text';

export interface EngineLine {
  /** One honest line: what the AI is doing right now. */
  text: string;
  tone: Tone;
  /** Show the pulsing dot (work in progress). */
  busy: boolean;
  /** 'ready' only when the model loaded AND produced tokens in this session (proof of life). */
  kind: 'none' | 'not_downloaded' | 'idle' | 'loading' | 'ready' | 'generating' | 'error';
}

/** "CPU" / "GPU" from llama.cpp's backend description. */
export function backendShort(backend: string | null | undefined): string {
  return backend && /gpu/i.test(backend) ? 'GPU' : 'CPU';
}

/**
 * Pure mapping from the real engine status (services/engine.ts `useEngineStatus`) to the line shown under the model name
 * and in the model sheet. Nothing here is invented: every word comes from the engine or the model catalog.
 */
export function describeEngine(st: EngineStatus, spec: ModelSpec | undefined, installed: boolean): EngineLine {
  if (!spec) return { text: 'No model yet', tone: 'muted', busy: false, kind: 'none' };
  if (st.modelId === spec.id) {
    switch (st.state) {
      case 'loading':
        return { text: `Loading ${formatPercent(st.progress)}`, tone: 'accent', busy: true, kind: 'loading' };
      case 'warming':
        return { text: 'Testing first words', tone: 'accent', busy: true, kind: 'loading' };
      case 'generating':
        return { text: 'Generating', tone: 'accent', busy: true, kind: 'generating' };
      case 'ready':
        return { text: `Ready · ${backendShort(st.backend)}`, tone: 'accent', busy: false, kind: 'ready' };
      case 'error':
        return { text: 'Could not load', tone: 'danger', busy: false, kind: 'error' };
    }
  }
  if (!installed) return { text: 'Not downloaded', tone: 'danger', busy: false, kind: 'not_downloaded' };
  return { text: st.unloadedReason ? 'Unloaded to free memory' : 'Not loaded', tone: 'muted', busy: false, kind: 'idle' };
}
