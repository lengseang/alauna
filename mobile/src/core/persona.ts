/**
 * Persona ("Soul") -> system prompt. The PAD vector (Pleasure/Arousal/Dominance)
 * is turned into plain style instructions, so changing it really changes the
 * model's tone. (The old version only displayed the numbers.)
 */

export interface PADVector {
  /** Warmth, -1..1 */
  pleasure: number;
  /** Energy, 0..1 */
  arousal: number;
  /** Directness, 0..1 */
  dominance: number;
}

export type SoulArchetypeKey = 'empath' | 'mentor' | 'tactical' | 'spark';

export interface SoulArchetype {
  id: SoulArchetypeKey;
  name: string;
  description: string;
  defaultPAD: PADVector;
  prompt: string;
}

export const ARCHETYPES: Record<SoulArchetypeKey, SoulArchetype> = {
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

export interface SystemPromptInput {
  archetype: SoulArchetypeKey;
  pad: PADVector;
  /** 0.1 (subtle) .. 1 (strong). */
  toneIntensity?: number;
  backstory?: string;
  /** User-managed facts about the user (Settings -> Memory). */
  memories?: string[];
}

const MAX_BACKSTORY_CHARS = 600;
const MAX_MEMORY_CHARS = 700;

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

  const memories = (input.memories ?? []).map((m) => m.trim()).filter(Boolean);
  if (memories.length > 0) {
    let used = 0;
    const lines: string[] = [];
    for (const m of memories) {
      if (used + m.length > MAX_MEMORY_CHARS) break;
      used += m.length;
      lines.push(`- ${m}`);
    }
    if (lines.length > 0) parts.push(`Things the user told you to remember:\n${lines.join('\n')}`);
  }
  parts.push('Be accurate. If you are unsure, say so instead of guessing. Keep answers concise unless asked for detail.');
  return parts.join('\n');
}
