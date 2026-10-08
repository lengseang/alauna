/** Settings shape + validation (pure; persistence is in services/settings.ts). */
import { ARCHETYPES, type PADVector, type SoulArchetypeKey } from './persona.ts';

export interface VerifiedInfo {
  at: number;
  tokensPerSecond: number;
  loadMs: number;
}

export interface Settings {
  archetype: SoulArchetypeKey;
  pad: PADVector;
  activeModelId: string | null;
  /** Models that loaded AND produced a test reply on this phone. */
  verified: Record<string, VerifiedInfo>;
  /** null = automatic (by RAM). */
  contextOverride: number | null;
  /** null = automatic (engine pins the big cores). */
  threads: number | null;
  /** Android: use the experimental GPU backend instead of CPU. */
  useGpu: boolean;
  /** Per-message thinking for hybrid reasoning models. */
  thinkingEnabled: boolean;
  /** Set while a model is loading; still set at next launch => the app was killed (out of memory). */
  pendingMountModelId: string | null;
}

/** Upper bound for a user-chosen context size (tokens). */
export const MAX_CONTEXT = 32768;

export const DEFAULT_SETTINGS: Settings = {
  archetype: 'empath',
  pad: { ...ARCHETYPES.empath.defaultPAD },
  activeModelId: null,
  verified: {},
  contextOverride: null,
  threads: null,
  useGpu: false,
  thinkingEnabled: true,
  pendingMountModelId: null,
};

/** Merge unknown/old/corrupt JSON into a valid Settings object. Never throws. */
export function sanitizeSettings(raw: unknown): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS, pad: { ...DEFAULT_SETTINGS.pad }, verified: {} };
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  if (typeof r.archetype === 'string' && r.archetype in ARCHETYPES) out.archetype = r.archetype as SoulArchetypeKey;
  if (r.pad && typeof r.pad === 'object') {
    const p = r.pad as Record<string, unknown>;
    if (typeof p.pleasure === 'number' && typeof p.arousal === 'number' && typeof p.dominance === 'number') {
      out.pad = { pleasure: p.pleasure, arousal: p.arousal, dominance: p.dominance };
    }
  }
  if (typeof r.activeModelId === 'string') out.activeModelId = r.activeModelId;
  if (r.verified && typeof r.verified === 'object') {
    for (const [k, v] of Object.entries(r.verified as Record<string, unknown>)) {
      const o = v as Partial<VerifiedInfo> | null;
      if (o && typeof o.at === 'number') {
        out.verified[k] = { at: o.at, tokensPerSecond: Number(o.tokensPerSecond) || 0, loadMs: Number(o.loadMs) || 0 };
      }
    }
  }
  // A hand-edited / corrupt value must not make llama.cpp allocate a gigantic KV cache (instant out-of-memory kill).
  if (typeof r.contextOverride === 'number' && Number.isFinite(r.contextOverride) && r.contextOverride >= 512) {
    out.contextOverride = Math.min(MAX_CONTEXT, Math.round(r.contextOverride));
  }
  if (typeof r.threads === 'number' && r.threads >= 1 && r.threads <= 16) out.threads = Math.round(r.threads);
  if (typeof r.useGpu === 'boolean') out.useGpu = r.useGpu;
  if (typeof r.thinkingEnabled === 'boolean') out.thinkingEnabled = r.thinkingEnabled;
  if (typeof r.pendingMountModelId === 'string') out.pendingMountModelId = r.pendingMountModelId;
  return out;
}
