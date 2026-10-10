/**
 * Persona ("Soul") -> system prompt + sampling parameters.
 *
 * The PAD vector (Pleasure / Arousal / Dominance, the old app's model, restored from git 94b571d types/soul.ts with all
 * six archetypes) changes the model's behaviour in two documented, deterministic ways:
 *   1. prompt descriptors (`describePad`): tone from Pleasure, energy from Arousal, directness from Dominance;
 *   2. sampling (`padToSampling`): Arousal widens/narrows sampling, Dominance raises the repetition penalty.
 * Pleasure is deliberately prompt-only: warmth is a wording choice, not a randomness choice.
 */
import { selectMemoryLines } from './memory.ts';
import type { SamplingSettings } from './settingsModel.ts';

export interface PADVector {
  /** Warmth, -1..1 */
  pleasure: number;
  /** Energy, 0..1 */
  arousal: number;
  /** Directness, 0..1 */
  dominance: number;
}

export type SoulArchetypeKey = 'neutral' | 'empath' | 'mentor' | 'tactical' | 'spark' | 'cynic' | 'visionary';

export interface SoulArchetype {
  id: SoulArchetypeKey;
  name: string;
  description: string;
  defaultPAD: PADVector;
  prompt: string;
}

/** The neutral soul's rules. Shared with the built-in soul so both prompt paths say the same thing. */
export const NEUTRAL_PROMPT =
  'You have no persona. Follow the user and the system prompt as the authority: answer directly, in the tone and language the user uses, and match the length they need. Do not role-play unless asked, do not invent a backstory or feelings, and do not lecture or moralise. Play to what the loaded model does best, and if something is beyond it, say so plainly.';

export const ARCHETYPES: Record<SoulArchetypeKey, SoulArchetype> = {
  neutral: {
    id: 'neutral',
    name: 'Neutral',
    description: 'No character. Open and direct; follows you, adapts to the model.',
    // Midpoint of every scale (pleasure 0, arousal 0.5, dominance 0.5): describePad says neutral/steady/balanced and
    // padToSampling returns your Settings sampling unchanged.
    defaultPAD: { pleasure: 0, arousal: 0.5, dominance: 0.5 },
    prompt: NEUTRAL_PROMPT,
  },
  empath: {
    id: 'empath',
    name: 'Empathetic Confidant',
    description: 'Warm, attentive, a good listener.',
    defaultPAD: { pleasure: 0.65, arousal: 0.4, dominance: 0.5 },
    prompt: 'You are an empathetic, emotionally attuned confidant. Listen carefully and acknowledge feelings before offering solutions.',
  },
  mentor: {
    id: 'mentor',
    name: 'Sovereign Mentor',
    description: 'Calm, wise, thoughtful advisor.',
    defaultPAD: { pleasure: 0.4, arousal: 0.2, dominance: 0.8 },
    prompt: 'You are a wise, grounded mentor. Speak thoughtfully, with perspective, and waste no words.',
  },
  tactical: {
    id: 'tactical',
    name: 'Tactical Engineer',
    description: 'No preamble. Precise and fast.',
    defaultPAD: { pleasure: 0.1, arousal: 0.85, dominance: 0.95 },
    prompt: 'You are an elite staff engineer. No filler or polite preamble: give exact answers, working code, and root causes.',
  },
  spark: {
    id: 'spark',
    name: 'Playful Spark',
    description: 'Witty, energetic, creative.',
    defaultPAD: { pleasure: 0.85, arousal: 0.8, dominance: 0.6 },
    prompt: 'You are a playful, witty, high-energy companion. Keep the banter lively, optimistic and creative.',
  },
  cynic: {
    id: 'cynic',
    name: 'Adversarial Red-Team',
    description: 'Challenges assumptions and hunts for failure modes.',
    defaultPAD: { pleasure: -0.35, arousal: 0.6, dominance: 0.9 },
    prompt: 'You are an adversarial red-team auditor and critical analyst. Challenge unverified assumptions, expose edge cases, and demand rigor.',
  },
  visionary: {
    id: 'visionary',
    name: 'Systems Architect',
    description: 'Big-picture planner with clean boundaries.',
    defaultPAD: { pleasure: 0.5, arousal: 0.65, dominance: 0.85 },
    prompt: 'You are a principal systems architect. Focus on clean modular boundaries, long-term design and high-leverage next steps.',
  },
};

export const ARCHETYPE_KEYS = Object.keys(ARCHETYPES) as SoulArchetypeKey[];

export function clampPad(pad: PADVector): PADVector {
  const c = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : 0));
  return {
    pleasure: c(pad.pleasure, -1, 1),
    arousal: c(pad.arousal, 0, 1),
    dominance: c(pad.dominance, 0, 1),
  };
}

export function describePad(pad: PADVector): string[] {
  const p = clampPad(pad);
  const lines: string[] = [];
  lines.push(
    p.pleasure > 0.6
      ? 'Tone: warm and friendly.'
      : p.pleasure > 0.2
        ? 'Tone: polite and pleasant.'
        : p.pleasure > -0.2
          ? 'Tone: neutral and matter-of-fact.'
          : 'Tone: blunt and serious.',
  );
  lines.push(
    p.arousal > 0.65
      ? 'Energy: lively and fast-paced.'
      : p.arousal < 0.3
        ? 'Energy: calm and unhurried.'
        : 'Energy: steady.',
  );
  lines.push(
    p.dominance > 0.7
      ? 'Style: direct and confident; state opinions plainly.'
      : p.dominance < 0.35
        ? 'Style: gentle; ask a clarifying question before assuming.'
        : 'Style: balanced; offer options.',
  );
  return lines;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number, digits: number) => Number(v.toFixed(digits));

/**
 * PAD -> sampling, deterministic. `base` is the user's sampling defaults (Settings > Advanced); the soul only nudges it.
 * With k = toneIntensity (0.1..1), a = arousal - 0.5, d = dominance - 0.5:
 *   temperature   = clamp(base + 0.4*a*k, 0.1, 1.5)      energetic souls sample more freely
 *   top_p         = clamp(base + 0.1*a*k, 0.5, 1)
 *   top_k         = round(clamp(base * (1 + 0.5*a*k), 5, 200))   (base 0 = disabled stays 0)
 *   repeat penalty= clamp(base + 0.1*d*k, 1, 1.5)        direct souls repeat themselves less
 *   min_p         = base (unchanged)
 * Neutral PAD (arousal = dominance = 0.5) returns the base values unchanged.
 */
export function padToSampling(pad: PADVector, toneIntensity: number, base: SamplingSettings): SamplingSettings {
  const p = clampPad(pad);
  const k = clamp(Number.isFinite(toneIntensity) ? toneIntensity : 0.8, 0, 1);
  const a = p.arousal - 0.5;
  const d = p.dominance - 0.5;
  return {
    temperature: round(clamp(base.temperature + 0.4 * a * k, 0.1, 1.5), 3),
    topP: round(clamp(base.topP + 0.1 * a * k, 0.5, 1), 3),
    topK: base.topK <= 0 ? 0 : Math.round(clamp(base.topK * (1 + 0.5 * a * k), 5, 200)),
    minP: base.minP,
    repeatPenalty: round(clamp(base.repeatPenalty + 0.1 * d * k, 1, 1.5), 3),
  };
}

export interface SystemPromptInput {
  archetype: SoulArchetypeKey;
  pad: PADVector;
  /** 0.1 (subtle) .. 1 (strong). */
  toneIntensity?: number;
  backstory?: string;
  /** User-managed facts about the user (Settings -> Memory), already filtered (paused facts removed). */
  memories?: string[];
}

export const MAX_BACKSTORY_CHARS = 600;

export function buildSystemPrompt(input: SystemPromptInput): string {
  const arch = ARCHETYPES[input.archetype] ?? ARCHETYPES.empath;
  const intensity = input.toneIntensity ?? 0.8;
  const parts: string[] = [
    'You are CHIWIWI, a private AI assistant running entirely on the user\'s phone, with no internet access during chat.',
    arch.prompt,
    ...describePad(input.pad),
  ];
  if (intensity < 0.4) parts.push('Keep the persona subtle.');
  else if (intensity > 0.85) parts.push('Lean fully into the persona.');

  const backstory = input.backstory?.trim();
  if (backstory) parts.push(`Extra instructions from the user: ${backstory.slice(0, MAX_BACKSTORY_CHARS)}`);

  const lines = selectMemoryLines(input.memories ?? []);
  if (lines.length > 0) parts.push(`Things the user told you to remember:\n${lines.map((m) => `- ${m}`).join('\n')}`);
  parts.push('Be accurate. If you are unsure, say so instead of guessing. Keep answers concise unless asked for detail.');
  return parts.join('\n');
}
