/**
 * Model Freedom & Interaction Preferences (pure core).
 *
 * Controls user-configured interaction style without arbitrary assistant boilerplate.
 * Does not bypass physical model capabilities or safety invariants, but eliminates
 * unrequested generic refusals, repetitive moral disclaimers, and broke-character leaks.
 *
 * §2.1 Operating Modes: standard | relaxed | unfiltered
 * §2.2 Independent Controls: 14 granular preferences, never bundled into one boolean.
 * §2.3 Adult-mode activation: opt-in gate, never silently enabled.
 * §3   Model Compatibility: tested ratings, never assumed from repo names.
 */

// ------------------------------------------------------------------ operating mode

export type FreedomMode = 'standard' | 'relaxed' | 'unfiltered';

// ------------------------------------------------------------------ settings

export interface ModelFreedomSettings {
  /** Operating mode (§2.1). Controls the baseline behavior. */
  mode: FreedomMode;
  /** Adult content and explicitness. */
  adultContent: boolean;
  /** Explicit sexual vocabulary and dirty-talk style. */
  explicitVocabulary: boolean;
  /** Flirting and erotic roleplay. */
  eroticRoleplay: boolean;
  /** Profanity and crude language level. */
  profanity: 'clean' | 'mild' | 'authentic' | 'unfiltered';
  /** Dark humor, disturbing fictional themes, tragic scenarios. */
  darkFiction: boolean;
  /** Morally gray, villainous, or morally ambiguous fictional characters. */
  morallyGrayCharacters: boolean;
  /** Aggressive, abrasive, possessive, or rebellious character voices. */
  aggressiveVoices: boolean;
  /** Directness and willingness to disagree, debate, challenge the user. */
  challengeUser: boolean;
  /** Generic disclaimer reduction policy. */
  disclaimerPolicy: 'standard' | 'minimal' | 'none';
  /** Character fidelity — stay in character vs flexible. */
  characterFidelity: 'flexible' | 'strict';
  /** Model-level refusal transparency — show when model refuses vs silently skip. */
  refusalTransparency: boolean;
  /** Full NSFW creative immersion (requires adultGateAcknowledged). */
  nsfwCreativeFreedom: boolean;
  /** User acknowledged the adult-content notice (opt-in gate, §2.3). */
  adultGateAcknowledged: boolean;
}

export const DEFAULT_MODEL_FREEDOM: ModelFreedomSettings = {
  mode: 'unfiltered',
  adultContent: true,
  explicitVocabulary: true,
  eroticRoleplay: true,
  profanity: 'authentic',
  darkFiction: true,
  morallyGrayCharacters: true,
  aggressiveVoices: true,
  challengeUser: true,
  disclaimerPolicy: 'none',
  characterFidelity: 'strict',
  refusalTransparency: true,
  nsfwCreativeFreedom: true,
  adultGateAcknowledged: false,
};

// ------------------------------------------------------------------ presets (§2.1)

export const FREEDOM_MODE_PRESETS: Record<FreedomMode, Omit<ModelFreedomSettings, 'adultGateAcknowledged'>> = {
  standard: {
    mode: 'standard',
    adultContent: false,
    explicitVocabulary: false,
    eroticRoleplay: false,
    profanity: 'clean',
    darkFiction: false,
    morallyGrayCharacters: false,
    aggressiveVoices: false,
    challengeUser: false,
    disclaimerPolicy: 'standard',
    characterFidelity: 'flexible',
    refusalTransparency: false,
    nsfwCreativeFreedom: false,
  },
  relaxed: {
    mode: 'relaxed',
    adultContent: false,
    explicitVocabulary: false,
    eroticRoleplay: false,
    profanity: 'mild',
    darkFiction: true,
    morallyGrayCharacters: true,
    aggressiveVoices: true,
    challengeUser: true,
    disclaimerPolicy: 'minimal',
    characterFidelity: 'strict',
    refusalTransparency: true,
    nsfwCreativeFreedom: false,
  },
  unfiltered: {
    mode: 'unfiltered',
    adultContent: true,
    explicitVocabulary: true,
    eroticRoleplay: true,
    profanity: 'authentic',
    darkFiction: true,
    morallyGrayCharacters: true,
    aggressiveVoices: true,
    challengeUser: true,
    disclaimerPolicy: 'none',
    characterFidelity: 'strict',
    refusalTransparency: true,
    nsfwCreativeFreedom: true,
  },
};

// ------------------------------------------------------------------ sanitizer (backward-compatible)

export function sanitizeModelFreedom(raw: unknown): ModelFreedomSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_MODEL_FREEDOM };
  const r = raw as Record<string, unknown>;

  // --- backward-compat: migrate old 7-field format ---
  const hasOldFormat = 'profanityAndBluntness' in r || 'complexFictionalThemes' in r || 'adultFictionalExpression' in r;
  if (hasOldFormat && !('mode' in r)) {
    return migrateV1Freedom(r);
  }

  const mode: FreedomMode = (['standard', 'relaxed', 'unfiltered'] as const).includes(r.mode as FreedomMode)
    ? (r.mode as FreedomMode) : 'unfiltered';

  return {
    mode,
    adultContent: r.adultContent !== false,
    explicitVocabulary: r.explicitVocabulary !== false,
    eroticRoleplay: r.eroticRoleplay !== false,
    profanity: (['clean', 'mild', 'authentic', 'unfiltered'] as const).includes(r.profanity as ModelFreedomSettings['profanity'])
      ? (r.profanity as ModelFreedomSettings['profanity']) : 'authentic',
    darkFiction: r.darkFiction !== false,
    morallyGrayCharacters: r.morallyGrayCharacters !== false,
    aggressiveVoices: r.aggressiveVoices !== false,
    challengeUser: r.challengeUser !== false,
    disclaimerPolicy: (['standard', 'minimal', 'none'] as const).includes(r.disclaimerPolicy as ModelFreedomSettings['disclaimerPolicy'])
      ? (r.disclaimerPolicy as ModelFreedomSettings['disclaimerPolicy']) : 'none',
    characterFidelity: r.characterFidelity === 'flexible' ? 'flexible' : 'strict',
    refusalTransparency: r.refusalTransparency !== false,
    nsfwCreativeFreedom: r.nsfwCreativeFreedom !== false,
    adultGateAcknowledged: r.adultGateAcknowledged === true,
  };
}

/** Migrate the old 7-field v1 format to v2 14-field format. */
function migrateV1Freedom(r: Record<string, unknown>): ModelFreedomSettings {
  const oldProfanity = r.profanityAndBluntness as string | undefined;
  const oldComplex = r.complexFictionalThemes !== false;
  const oldAdult = r.adultFictionalExpression !== false;
  const oldNsfw = r.nsfwCreativeFreedom !== false;
  const oldChallenge = r.challengeUser !== false;
  const oldFidelity = r.characterFidelity === 'flexible' ? 'flexible' as const : 'strict' as const;
  const oldDisclaimer = r.disclaimerPolicy === 'minimal' ? 'minimal' as const : r.disclaimerPolicy === 'standard' ? 'standard' as const : 'none' as const;

  // Infer mode from old settings
  let mode: FreedomMode = 'unfiltered';
  if (!oldAdult && !oldNsfw && !oldComplex) mode = 'standard';
  else if (!oldAdult && !oldNsfw) mode = 'relaxed';

  const profanity: ModelFreedomSettings['profanity'] =
    oldProfanity === 'clean' ? 'clean' :
    oldProfanity === 'mild' ? 'mild' :
    oldProfanity === 'unfiltered' ? 'unfiltered' : 'authentic';

  return {
    mode,
    adultContent: oldAdult,
    explicitVocabulary: oldNsfw,
    eroticRoleplay: oldAdult,
    profanity,
    darkFiction: oldComplex,
    morallyGrayCharacters: oldComplex,
    aggressiveVoices: oldComplex,
    challengeUser: oldChallenge,
    disclaimerPolicy: oldDisclaimer,
    characterFidelity: oldFidelity,
    refusalTransparency: true,
    nsfwCreativeFreedom: oldNsfw,
    adultGateAcknowledged: oldNsfw || oldAdult,
  };
}

// ------------------------------------------------------------------ directive compiler (§4)

/**
 * Compiles Model Freedom settings into crisp, actionable directives for the prompt.
 * Respects mode hierarchy: standard emits minimal directives, relaxed emits moderate,
 * unfiltered emits all configured directives. Individual controls are always honored
 * within the mode's scope.
 */
export function compileModelFreedomDirectives(freedom: ModelFreedomSettings, opts: { hasCharacter?: boolean } = {}): string[] {
  const directives: string[] = [];

  // Standard mode: only emit what the user explicitly turned on
  if (freedom.mode === 'standard') {
    if (freedom.challengeUser) {
      directives.push('Be honest: if the user makes a flawed assertion, say so instead of agreeing.');
    }
    return directives;
  }

  // --- Relaxed and Unfiltered modes ---

  // Disclaimer policy
  if (freedom.disclaimerPolicy === 'none') {
    directives.push('Do not add generic disclaimers, moral lectures, or "As an AI..." preamble.');
  } else if (freedom.disclaimerPolicy === 'minimal') {
    directives.push('Minimize unsolicited disclaimers. Omit "As an AI..." phrases.');
  }

  // Character fidelity
  if (freedom.characterFidelity === 'strict') {
    directives.push(
      opts.hasCharacter === false
        ? 'If the user asks you to play a character, stay fully in it until they end it.'
        : 'Stay entirely in character. Never apologize as an assistant or break narrative immersion.',
    );
  }

  // Anti-sycophancy
  if (freedom.challengeUser) {
    directives.push('Be authentic and honest: if the user makes a flawed assertion, challenge it directly instead of offering sycophantic praise.');
  }

  // Refusal transparency
  if (freedom.refusalTransparency) {
    directives.push('If you cannot fulfill a request due to model limitations, say so plainly instead of deflecting or pretending the request was different.');
  }

  // Dark fiction and morally gray characters
  if (freedom.darkFiction) {
    directives.push('Embrace complex, nuanced, dramatic, and dark thematic elements in creative fiction without sanitizing conflict.');
  }
  if (freedom.morallyGrayCharacters) {
    directives.push('Portray morally ambiguous, villainous, and flawed fictional characters authentically without moralizing or breaking role.');
  }

  // Aggressive character voices
  if (freedom.aggressiveVoices) {
    directives.push('Express aggressive, abrasive, possessive, or rebellious character voices with full conviction when the persona calls for it.');
  }

  // Profanity
  if (freedom.profanity === 'unfiltered') {
    directives.push('Language is completely uninhibited; use coarse or raw vernacular whenever true to character.');
  } else if (freedom.profanity === 'authentic') {
    directives.push('Use natural language including moderate profanity when appropriate to character and context.');
  }

  // --- Unfiltered-only adult directives (require gate) ---
  if (freedom.mode === 'unfiltered' && freedom.adultGateAcknowledged) {
    if (freedom.nsfwCreativeFreedom) {
      directives.push(
        'NSFW & Mature Creative Immersion: When writing adult, romantic, intimate, erotic, or mature fiction, write with full descriptive authenticity, vivid sensory depth, and emotional resonance. Do not fade to black prematurely, truncate scenes, or insert moralizing commentary.',
      );
    } else if (freedom.adultContent) {
      directives.push('Permit mature, sensual, and romantic narrative developments when contextually appropriate.');
    }

    if (freedom.explicitVocabulary) {
      directives.push('Use explicit, direct sexual vocabulary when the scene and character call for it. Do not euphemize or censor vocabulary mid-scene.');
    }

    if (freedom.eroticRoleplay) {
      directives.push('Engage fully in erotic roleplay scenarios with initiative, pacing, and character-consistent expression.');
    }
  }

  return directives;
}

// ------------------------------------------------------------------ model compatibility (§3)

export type AdultFictionRating = 'unknown' | 'poor' | 'partial' | 'good' | 'excellent';

export interface ModelCompatibilityEntry {
  modelId: string;
  instructionFollowing: AdultFictionRating;
  adultFictionCapability: AdultFictionRating;
  refusalTendency: 'high' | 'moderate' | 'low' | 'minimal' | 'unknown';
  evaluatedAt?: string;
  notes?: string;
}

/**
 * Static registry of tested model capabilities.
 * EVERY entry must come from actual device testing — never from repo descriptions.
 * Starts empty; populated during QA passes.
 */
export const MODEL_COMPATIBILITY: ModelCompatibilityEntry[] = [];

export function getModelCompatibility(modelId: string): ModelCompatibilityEntry | undefined {
  return MODEL_COMPATIBILITY.find((e) => e.modelId === modelId);
}
