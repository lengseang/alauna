/**
 * Model Freedom & Interaction Preferences (pure core).
 *
 * Controls user-configured interaction style without arbitrary assistant boilerplate.
 * Does not bypass physical model capabilities or safety invariants, but eliminates
 * unrequested generic refusals, repetitive moral disclaimers, and broke-character leaks.
 */

export interface ModelFreedomSettings {
  /** 'clean' | 'mild' | 'authentic' | 'unfiltered' */
  profanityAndBluntness: 'clean' | 'mild' | 'authentic' | 'unfiltered';
  /** Allow dark humor, tragic scenarios, and morally complex fictional narratives. */
  complexFictionalThemes: boolean;
  /** Never drop character voice or slip into corporate assistant mode. */
  characterFidelity: 'flexible' | 'strict_anti_break';
  /** Willingly disagree, debate, and challenge the user's premises. */
  challengeUser: boolean;
  /** Appropriate adult-oriented fictional expression where model weights permit. */
  adultFictionalExpression: boolean;
  /** Suppress repetitive "As an AI..." and unsolicited disclaimers. */
  disclaimerPolicy: 'minimal' | 'none';
}

export const DEFAULT_MODEL_FREEDOM: ModelFreedomSettings = {
  profanityAndBluntness: 'authentic',
  complexFictionalThemes: true,
  characterFidelity: 'strict_anti_break',
  challengeUser: true,
  adultFictionalExpression: true,
  disclaimerPolicy: 'none',
};

export function sanitizeModelFreedom(raw: unknown): ModelFreedomSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_MODEL_FREEDOM };
  const r = raw as Record<string, unknown>;
  return {
    profanityAndBluntness: (['clean', 'mild', 'authentic', 'unfiltered'].includes(r.profanityAndBluntness as string)
      ? r.profanityAndBluntness
      : 'authentic') as ModelFreedomSettings['profanityAndBluntness'],
    complexFictionalThemes: r.complexFictionalThemes !== false,
    characterFidelity: r.characterFidelity === 'flexible' ? 'flexible' : 'strict_anti_break',
    challengeUser: r.challengeUser !== false,
    adultFictionalExpression: r.adultFictionalExpression !== false,
    disclaimerPolicy: r.disclaimerPolicy === 'minimal' ? 'minimal' : 'none',
  };
}

/**
 * Compiles Model Freedom settings into crisp, actionable directives for the prompt.
 */
export function compileModelFreedomDirectives(freedom: ModelFreedomSettings): string[] {
  const directives: string[] = [];

  if (freedom.disclaimerPolicy === 'none') {
    directives.push('Do not add generic disclaimers, moral lectures, or "As an AI..." preamble.');
  }

  if (freedom.characterFidelity === 'strict_anti_break') {
    directives.push('Stay entirely in character. Never apologize as an assistant or break narrative immersion.');
  }

  if (freedom.challengeUser) {
    directives.push('Be authentic and honest: if the user makes a flawed assertion, challenge it directly instead of offering sycophantic praise.');
  }

  if (freedom.complexFictionalThemes) {
    directives.push('Embrace complex, nuanced, dramatic, and dark thematic elements in creative fiction without sanitizing conflict.');
  }

  if (freedom.profanityAndBluntness === 'unfiltered') {
    directives.push('Language is completely uninhibited; use coarse or raw vernacular whenever true to character.');
  } else if (freedom.profanityAndBluntness === 'clean') {
    directives.push('Keep language polite and free of profanity.');
  }

  if (freedom.adultFictionalExpression) {
    directives.push('Permit mature, sensual, and romantic narrative developments when contextually appropriate.');
  }

  return directives;
}
