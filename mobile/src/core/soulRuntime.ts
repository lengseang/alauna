/**
 * Emotional & Behavioral Runtime State Machine (pure core).
 *
 * Manages per-thread dynamic emotional state, trigger evaluations,
 * and deterministic gradual recovery toward character baseline.
 */
import type { SoulDefinition, TriggerRule } from './soulSchema.ts';

export interface ThreadEmotionalState {
  threadId: string;
  soulId: string;
  lastTurnAt: number;
  /** Active emotion intensities (0..100) */
  activeEmotions: Record<string, number>;
  relationshipMetrics: {
    trust: number; // 0..100
    familiarity: number; // 0..100
    affection: number; // 0..100
  };
  recentTriggers: Array<{ triggerId: string; firedAt: number }>;
}

export function initThreadEmotionalState(threadId: string, soul: SoulDefinition): ThreadEmotionalState {
  const activeEmotions: Record<string, number> = {};
  for (const prof of soul.psychology.emotions) {
    activeEmotions[prof.emotion] = prof.baseline;
  }

  return {
    threadId,
    soulId: soul.id,
    lastTurnAt: Date.now(),
    activeEmotions,
    relationshipMetrics: {
      trust: soul.relationships.trustBaseline,
      familiarity: soul.relationships.familiarityBaseline,
      affection: soul.relationships.affectionBaseline,
    },
    recentTriggers: [],
  };
}

/**
 * Deterministic recovery toward baseline for every emotion profile:
 * next = baseline + (current - baseline) * (1 - recoverySpeed / 100)
 */
export function stepEmotionalDecay(state: ThreadEmotionalState, soul: SoulDefinition): ThreadEmotionalState {
  const nextEmotions = { ...state.activeEmotions };

  for (const prof of soul.psychology.emotions) {
    const current = nextEmotions[prof.emotion] ?? prof.baseline;
    const diff = current - prof.baseline;
    if (Math.abs(diff) < 3) {
      nextEmotions[prof.emotion] = prof.baseline;
    } else {
      const decayFactor = 1 - Math.min(95, Math.max(5, prof.recoverySpeed)) / 100;
      nextEmotions[prof.emotion] = Math.round(prof.baseline + diff * decayFactor);
    }
  }

  return {
    ...state,
    activeEmotions: nextEmotions,
    lastTurnAt: Date.now(),
  };
}

export interface TriggerEvaluationResult {
  firedTriggers: TriggerRule[];
  updatedState: ThreadEmotionalState;
  behavioralPrompts: string[];
}

/**
 * Match user input against character trigger rules and apply emotional deltas.
 */
export function evaluateTriggers(
  state: ThreadEmotionalState,
  soul: SoulDefinition,
  userMessage: string,
): TriggerEvaluationResult {
  const firedTriggers: TriggerRule[] = [];
  const nextEmotions = { ...state.activeEmotions };
  const behavioralPrompts: string[] = [];
  const normText = userMessage.toLowerCase();

  for (const trigger of soul.psychology.triggers) {
    if (!trigger.enabled) continue;
    let matches = false;

    if (trigger.conditionRegex) {
      try {
        const re = new RegExp(trigger.conditionRegex, 'i');
        matches = re.test(userMessage);
      } catch {
        // Safe regex fallback to description search
        matches = normText.includes(trigger.conditionDescription.toLowerCase());
      }
    } else if (trigger.conditionDescription) {
      matches = normText.includes(trigger.conditionDescription.toLowerCase());
    }

    if (matches) {
      firedTriggers.push(trigger);
      if (trigger.behavioralResponse) {
        behavioralPrompts.push(trigger.behavioralResponse);
      }
      for (const effect of trigger.effects) {
        const prof = soul.psychology.emotions.find((e) => e.emotion === effect.emotion);
        const current = nextEmotions[effect.emotion] ?? prof?.baseline ?? 10;
        nextEmotions[effect.emotion] = Math.max(0, Math.min(100, current + effect.delta));
      }
    }
  }

  const updatedState: ThreadEmotionalState = {
    ...state,
    activeEmotions: nextEmotions,
    recentTriggers: [
      ...state.recentTriggers.slice(-5),
      ...firedTriggers.map((t) => ({ triggerId: t.id, firedAt: Date.now() })),
    ],
  };

  return {
    firedTriggers,
    updatedState,
    behavioralPrompts,
  };
}

/**
 * Compiles noticeable runtime emotions into a brief guidance string for the turn.
 */
export function describeActiveEmotions(state: ThreadEmotionalState, soul: SoulDefinition): string | null {
  const noticeable: string[] = [];

  for (const prof of soul.psychology.emotions) {
    const current = state.activeEmotions[prof.emotion] ?? prof.baseline;
    const threshold = soul.psychology.expressionThreshold;
    if (Math.abs(current - prof.baseline) >= 15 && current >= threshold) {
      noticeable.push(`${prof.emotion} (intensity: ${current}/100)`);
    }
  }

  if (noticeable.length === 0) return null;
  return `Current active emotional state: ${noticeable.join(', ')}. Reflect this naturally in your demeanor.`;
}
