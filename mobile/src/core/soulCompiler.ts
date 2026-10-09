/**
 * Soul Prompt Compiler & Trait Merger (pure core).
 *
 * Compiles a full 9-chapter Soul, modular Trait Packs, Model Freedom preferences,
 * runtime emotional dynamics, and Knowledge Graph triples into a prioritized,
 * token-budgeted system prompt.
 */
import type { SoulDefinition, TraitPack } from './soulSchema.ts';
import type { ModelFreedomSettings } from './modelFreedom.ts';
import { compileModelFreedomDirectives, DEFAULT_MODEL_FREEDOM } from './modelFreedom.ts';
import type { ThreadEmotionalState } from './soulRuntime.ts';
import { describeActiveEmotions } from './soulRuntime.ts';
import type { SubgraphTriple } from './knowledgeGraph.ts';
import { formatTriplesForPrompt } from './knowledgeGraph.ts';
import { estimateTokens } from './chatPrompt.ts';

export interface CompileSoulInput {
  soul: SoulDefinition;
  packs?: TraitPack[];
  threadOverrides?: Partial<SoulDefinition>;
  freedom?: ModelFreedomSettings;
  runtimeState?: ThreadEmotionalState;
  knowledgeTriples?: SubgraphTriple[];
  userMemories?: string[];
  tokenBudget?: number; // default 900 tokens
}

export interface CompiledSoulResult {
  systemPrompt: string;
  estimatedTokens: number;
  activeEmotionsDescribed: boolean;
  knowledgeTriplesIncluded: number;
}

/**
 * Deterministically merge a base soul with trait packs and local thread overrides.
 */
export function mergeSoul(
  base: SoulDefinition,
  packs: TraitPack[] = [],
  overrides?: Partial<SoulDefinition>,
): SoulDefinition {
  const merged: SoulDefinition = {
    ...base,
    identity: { ...base.identity },
    psychology: { ...base.psychology, temperament: { ...base.psychology.temperament } },
    speech: { ...base.speech },
    relationships: { ...base.relationships },
    knowledge: { ...base.knowledge },
    behavior: { ...base.behavior },
    roleplay: { ...base.roleplay },
    memoryPolicy: { ...base.memoryPolicy },
    intimacy: base.intimacy ? { ...base.intimacy } : undefined,
  };

  for (const pack of packs) {
    if (pack.kind === 'speech' && pack.data) {
      merged.speech = { ...merged.speech, ...(pack.data as Partial<SoulDefinition['speech']>) };
    } else if (pack.kind === 'behavior' && pack.data) {
      merged.behavior = { ...merged.behavior, ...(pack.data as Partial<SoulDefinition['behavior']>) };
    } else if (pack.kind === 'scenario' && pack.data) {
      merged.roleplay = { ...merged.roleplay, ...(pack.data as Partial<SoulDefinition['roleplay']>) };
    } else if (pack.kind === 'romance' && pack.data && merged.intimacy) {
      merged.intimacy = { ...merged.intimacy, ...(pack.data as Partial<NonNullable<SoulDefinition['intimacy']>>) };
    }
  }

  if (overrides) {
    if (overrides.identity) merged.identity = { ...merged.identity, ...overrides.identity };
    if (overrides.speech) merged.speech = { ...merged.speech, ...overrides.speech };
    if (overrides.behavior) merged.behavior = { ...merged.behavior, ...overrides.behavior };
    if (overrides.roleplay) merged.roleplay = { ...merged.roleplay, ...overrides.roleplay };
  }

  return merged;
}

/**
 * Compiles a concise, prioritized system prompt from all character facets.
 */
export function compileSoulPrompt(input: CompileSoulInput): CompiledSoulResult {
  const soul = mergeSoul(input.soul, input.packs, input.threadOverrides);
  const freedom = input.freedom ?? DEFAULT_MODEL_FREEDOM;
  const budget = input.tokenBudget ?? 900;

  const sections: string[] = [];

  // 1. Core Invariant Identity
  sections.push(
    `You are CHIWIWI, embodying ${soul.identity.name}, ${soul.tagline}. You are running private and offline on the user's phone.`,
  );

  if (soul.identity.background) {
    sections.push(`Character background: ${soul.identity.background}`);
  }

  // 2. Character Rules & Tenets
  if (soul.identity.characterRules.length > 0) {
    sections.push(`Core character rules:\n${soul.identity.characterRules.map((r) => `- ${r}`).join('\n')}`);
  }

  // 3. Speech & Expression Style
  const speechDirectives: string[] = [];
  speechDirectives.push(`Formality: ${soul.speech.formality}. Directness: ${soul.speech.directness}. Rhythm: ${soul.speech.sentenceRhythm}.`);
  if (soul.speech.humor !== 'none') speechDirectives.push(`Humor style: ${soul.speech.humor}.`);
  if (soul.speech.verbalQuirks.length > 0) {
    speechDirectives.push(`Verbal habits: ${soul.speech.verbalQuirks.join('; ')}.`);
  }
  if (soul.speech.examplePhrases.length > 0) {
    speechDirectives.push(`Example phrases representing your voice:\n${soul.speech.examplePhrases.map((p) => `"${p}"`).join('; ')}`);
  }
  sections.push(`Speech and voice directives:\n${speechDirectives.join('\n')}`);

  // 4. Behavioral & Relationship Context
  sections.push(
    `Relationship stance: You relate to the user as a ${soul.relationships.defaultType}. Answering style: ${soul.behavior.answeringStyle}.`,
  );

  // 5. Active Runtime Emotional Dynamics
  let activeEmotionsDescribed = false;
  if (input.runtimeState) {
    const emoDesc = describeActiveEmotions(input.runtimeState, soul);
    if (emoDesc) {
      sections.push(emoDesc);
      activeEmotionsDescribed = true;
    }
  }

  // 6. Roleplay & Scenario (if configured)
  if (soul.roleplay.settingWorld || soul.roleplay.characterRole) {
    const rpParts: string[] = [];
    if (soul.roleplay.settingWorld) rpParts.push(`World/Setting: ${soul.roleplay.settingWorld}`);
    if (soul.roleplay.characterRole) rpParts.push(`Your role: ${soul.roleplay.characterRole}`);
    if (soul.roleplay.narrationStyle !== 'none') rpParts.push(`Narration formatting: ${soul.roleplay.narrationStyle}`);
    sections.push(`Active roleplay scenario:\n${rpParts.join('\n')}`);
  }

  // 7. Intimacy & Romance (if enabled)
  if (soul.intimacy?.enabled) {
    sections.push(
      `Romantic disposition: ${soul.intimacy.romanceStyle} romance style with ${soul.intimacy.flirtationIntensity} flirtation and ${soul.intimacy.relationshipPacing} pacing.`,
    );
  }

  // 8. Model Freedom Preferences
  const freedomDirectives = compileModelFreedomDirectives(freedom);
  if (freedomDirectives.length > 0) {
    sections.push(`Interaction guidelines:\n${freedomDirectives.map((d) => `- ${d}`).join('\n')}`);
  }

  // 9. Relational Knowledge Graph Triples
  let knowledgeTriplesIncluded = 0;
  if (input.knowledgeTriples && input.knowledgeTriples.length > 0) {
    const triplesText = formatTriplesForPrompt(input.knowledgeTriples);
    sections.push(triplesText);
    knowledgeTriplesIncluded = input.knowledgeTriples.length;
  }

  // 10. User Facts / Memories
  if (input.userMemories && input.userMemories.length > 0) {
    sections.push(`Things the user told you to remember:\n${input.userMemories.map((m) => `- ${m}`).join('\n')}`);
  }

  // Budget Enforcer: Truncate or drop trailing optional sections if exceeding token limit
  let compiledText = sections.join('\n\n');
  let estTokens = estimateTokens(compiledText);

  if (estTokens > budget) {
    // Progressively remove sections from the end (memories, triples, intimacy)
    while (sections.length > 4 && estimateTokens(sections.join('\n\n')) > budget) {
      sections.pop();
    }
    compiledText = sections.join('\n\n');
    estTokens = estimateTokens(compiledText);
  }

  return {
    systemPrompt: compiledText,
    estimatedTokens: estTokens,
    activeEmotionsDescribed,
    knowledgeTriplesIncluded,
  };
}
