/**
 * Canonical Soul Schema & Validation (pure core, no phone/RN).
 *
 * Captures character identity, emotional psychology, speech, relationships,
 * knowledge, behavioral rules, roleplay, memory policy, intimacy/romance, and avatars.
 */

export type SoulType = 'builtin' | 'custom' | 'imported' | 'hybrid';
export type AvatarType = 'glyph' | 'preset' | 'file';

export interface SoulAvatar {
  type: AvatarType;
  glyph?: string;
  accentColor?: string;
  presetId?: string;
  imageUri?: string;
}

export type SoulCategory =
  | 'sage'
  | 'guardian'
  | 'rebel'
  | 'analyst'
  | 'caregiver'
  | 'trickster'
  | 'explorer'
  | 'diplomat'
  | 'strategist'
  | 'creator'
  | 'companion';

export const SOUL_CATEGORIES: SoulCategory[] = [
  'sage',
  'guardian',
  'rebel',
  'analyst',
  'caregiver',
  'trickster',
  'explorer',
  'diplomat',
  'strategist',
  'creator',
  'companion',
];

// --- Chapter 01: Identity & Character
export interface SoulIdentity {
  name: string;
  nickname?: string;
  characterType: 'original' | 'historical' | 'fictional' | 'archetypal';
  setting: string;
  background: string;
  coreValues: string[];
  motivations: string[];
  strengths: string[];
  weaknesses: string[];
  flaws: string[];
  fears: string[];
  secrets: string[];
  worldview: string;
  characterRules: string[];
  avatar: SoulAvatar;
}

// --- Chapter 02: Emotional Psychology
export interface TemperamentSliders {
  sociability: number; // 0..100
  stability: number; // 0..100
  sensitivity: number; // 0..100
  impulsivity: number; // 0..100
  openness: number; // 0..100
  assertiveness: number; // 0..100
  resilience: number; // 0..100
  empathy: number; // 0..100
}

export interface EmotionProfile {
  emotion: string;
  baseline: number; // 0..100
  reactivity: number; // 0..100
  expressiveness: number; // 0..100
  persistence: number; // 0..100
  recoverySpeed: number; // 0..100
  guidance?: string;
}

export type TriggerCategory =
  | 'social'
  | 'relationship'
  | 'conversation'
  | 'intellectual'
  | 'environmental'
  | 'roleplay';

export interface TriggerRule {
  id: string;
  name: string;
  category: TriggerCategory;
  conditionRegex?: string;
  conditionDescription: string;
  effects: Array<{ emotion: string; delta: number }>;
  behavioralResponse: string;
  priority: number; // 1..10
  enabled: boolean;
}

export interface ReactionPatterns {
  onFrustration?: string;
  onPraise?: string;
  onDisagreement?: string;
  onEmbarrassment?: string;
  onUncertainty?: string;
  onAffection?: string;
  onRejection?: string;
}

export interface SoulPsychology {
  temperament: TemperamentSliders;
  emotions: EmotionProfile[];
  triggers: TriggerRule[];
  reactions: ReactionPatterns;
  carryoverAcrossTurns: boolean;
  carryoverAcrossSessions: boolean;
  expressionThreshold: number; // 0..100
}

// --- Chapter 03: Speech & Expression
export interface SoulSpeech {
  formality: 'archaic' | 'formal' | 'moderate' | 'casual' | 'raw';
  directness: 'oblique' | 'diplomatic' | 'direct' | 'blunt';
  sentenceRhythm: 'terse' | 'balanced' | 'flowing' | 'poetic';
  vocabularyComplexity: 'accessible' | 'standard' | 'academic' | 'esoteric';
  humor: 'none' | 'dry' | 'witty' | 'playful' | 'sarcastic';
  slangProfanity: 'never' | 'mild' | 'frequent' | 'unfiltered';
  emotionalExpressiveness: 'stoic' | 'restrained' | 'transparent' | 'effusive';
  preferredLanguage?: string;
  petNamesAndTitles: string[];
  verbalQuirks: string[];
  examplePhrases: string[];
  unwantedPhrases: string[];
}

// --- Chapter 04: Relationship Dynamics
export interface SoulRelationships {
  defaultType: 'friend' | 'mentor' | 'rival' | 'assistant' | 'companion' | 'romantic' | 'custom';
  trustBaseline: number; // 0..100
  familiarityBaseline: number; // 0..100
  affectionBaseline: number; // 0..100
  progressionSpeed: 'static' | 'slow_burn' | 'natural' | 'rapid';
  boundaries: string[];
  progressionRules: string[];
}

// --- Chapter 05: Knowledge & Backstory
export interface SoulKnowledge {
  expertise: string[];
  lore: string[];
  hobbies: string[];
  preferredTopics: string[];
  knownLimitations: string[];
  fictionalWorldFacts: string[];
  uncertaintyBehavior: 'admit_plainly' | 'philosophize' | 'seek_collaboration' | 'speculate_cautiously';
}

// --- Chapter 06: Behavioral Rules
export interface SoulBehavior {
  answeringStyle: string;
  decisionMaking: string;
  givingAdvice: string;
  handlingAmbiguity: string;
  handlingDisagreement: string;
  handlingMistakes: string;
  initiativeLevel: 'passive_responder' | 'balanced' | 'proactive_instigator';
}

// --- Chapter 07: Roleplay & Scenarios
export interface SoulRoleplay {
  settingWorld?: string;
  characterRole?: string;
  userRole?: string;
  narrationStyle: 'none' | 'first_person' | 'third_person_limited' | 'script_action_asterisks';
  sceneProgression: 'user_driven' | 'collaborative' | 'active_hooks';
  plotHooks: string[];
  outOfCharacterControls: boolean;
}

// --- Chapter 08: Memory & Development
export interface SoulMemoryPolicy {
  allowAutoMemoryExtraction: boolean;
  persistMilestones: boolean;
  persistRoleplayFacts: boolean;
  allowCharacterEvolution: boolean;
  requireApprovalForEvolution: boolean;
}

// --- Chapter 09: Intimacy & Romance (Optional)
export interface SoulIntimacy {
  enabled: boolean;
  romanceStyle: 'shy' | 'playful' | 'passionate' | 'reserved' | 'devoted' | 'custom';
  flirtationIntensity: 'none' | 'subtle' | 'moderate' | 'bold';
  initiative: 'reactive' | 'balanced' | 'proactive';
  sensualExpression: 'reserved' | 'suggestive' | 'expressive';
  comfortDiscussingSexuality: 'uncomfortable' | 'open_if_prompted' | 'natural_and_uninhibited';
  relationshipPacing: 'slow_burn' | 'natural' | 'fast_paced';
  boundaries: string[];
}

// --- Pack definition for modular inheritance
export type PackKind = 'speech' | 'emotion' | 'scenario' | 'romance' | 'behavior';

export interface TraitPack {
  id: string;
  name: string;
  kind: PackKind;
  description: string;
  createdAt: number;
  data: Partial<SoulSpeech | SoulPsychology | SoulRoleplay | SoulIntimacy | SoulBehavior>;
}

// --- Complete Soul Definition
export interface SoulDefinition {
  schemaVersion: 1;
  id: string;
  version: number;
  name: string;
  tagline: string;
  type: SoulType;
  category: SoulCategory;
  parentSoulId?: string;
  appliedPackIds: string[];
  createdAt: number;
  updatedAt: number;

  identity: SoulIdentity;
  psychology: SoulPsychology;
  speech: SoulSpeech;
  relationships: SoulRelationships;
  knowledge: SoulKnowledge;
  behavior: SoulBehavior;
  roleplay: SoulRoleplay;
  memoryPolicy: SoulMemoryPolicy;
  intimacy?: SoulIntimacy;
}

export const DEFAULT_TEMPERAMENT: TemperamentSliders = {
  sociability: 50,
  stability: 50,
  sensitivity: 50,
  impulsivity: 40,
  openness: 60,
  assertiveness: 50,
  resilience: 60,
  empathy: 60,
};

export const STANDARD_EMOTIONS = [
  'joy',
  'sadness',
  'anger',
  'fear',
  'anxiety',
  'curiosity',
  'affection',
  'trust',
  'pride',
  'shame',
  'disgust',
  'surprise',
  'frustration',
  'boredom',
  'hope',
  'calm',
] as const;

export function defaultEmotionProfiles(): EmotionProfile[] {
  return [
    { emotion: 'curiosity', baseline: 65, reactivity: 70, expressiveness: 60, persistence: 50, recoverySpeed: 40 },
    { emotion: 'calm', baseline: 70, reactivity: 30, expressiveness: 50, persistence: 60, recoverySpeed: 50 },
    { emotion: 'joy', baseline: 50, reactivity: 50, expressiveness: 60, persistence: 40, recoverySpeed: 50 },
    { emotion: 'frustration', baseline: 10, reactivity: 40, expressiveness: 30, persistence: 30, recoverySpeed: 60 },
    { emotion: 'affection', baseline: 40, reactivity: 50, expressiveness: 50, persistence: 50, recoverySpeed: 30 },
  ];
}

const clampNum = (val: unknown, min: number, max: number, fallback: number): number => {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  return Math.min(max, Math.max(min, val));
};

const cleanStr = (val: unknown, fallback = ''): string => {
  return typeof val === 'string' ? val.trim() : fallback;
};

const cleanStrArr = (val: unknown, maxItems = 50): string[] => {
  if (!Array.isArray(val)) return [];
  return val
    .map((x) => cleanStr(x))
    .filter(Boolean)
    .slice(0, maxItems);
};

export function sanitizeSoul(raw: unknown, fallbackId = 'soul_custom'): SoulDefinition {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const id = cleanStr(r.id) || fallbackId;
  const name = cleanStr(r.name) || 'Unnamed Soul';
  const tagline = cleanStr(r.tagline) || 'A distinctive persona';
  const type = (['builtin', 'custom', 'imported', 'hybrid'].includes(r.type as string) ? r.type : 'custom') as SoulType;
  const category = (SOUL_CATEGORIES.includes(r.category as SoulCategory) ? r.category : 'sage') as SoulCategory;

  const rawIdent = (r.identity && typeof r.identity === 'object' ? r.identity : {}) as Record<string, unknown>;
  const rawAv = (rawIdent.avatar && typeof rawIdent.avatar === 'object' ? rawIdent.avatar : {}) as Record<string, unknown>;
  const avatar: SoulAvatar = {
    type: ['glyph', 'preset', 'file'].includes(rawAv.type as string) ? (rawAv.type as AvatarType) : 'glyph',
    glyph: cleanStr(rawAv.glyph) || 'persona',
    accentColor: cleanStr(rawAv.accentColor) || undefined,
    presetId: cleanStr(rawAv.presetId) || undefined,
    imageUri: cleanStr(rawAv.imageUri) || undefined,
  };

  const identity: SoulIdentity = {
    name: cleanStr(rawIdent.name) || name,
    nickname: cleanStr(rawIdent.nickname) || undefined,
    characterType: ['original', 'historical', 'fictional', 'archetypal'].includes(rawIdent.characterType as string)
      ? (rawIdent.characterType as SoulIdentity['characterType'])
      : 'original',
    setting: cleanStr(rawIdent.setting),
    background: cleanStr(rawIdent.background).slice(0, 2000),
    coreValues: cleanStrArr(rawIdent.coreValues),
    motivations: cleanStrArr(rawIdent.motivations),
    strengths: cleanStrArr(rawIdent.strengths),
    weaknesses: cleanStrArr(rawIdent.weaknesses),
    flaws: cleanStrArr(rawIdent.flaws),
    fears: cleanStrArr(rawIdent.fears),
    secrets: cleanStrArr(rawIdent.secrets),
    worldview: cleanStr(rawIdent.worldview).slice(0, 1000),
    characterRules: cleanStrArr(rawIdent.characterRules, 20),
    avatar,
  };

  const rawPsych = (r.psychology && typeof r.psychology === 'object' ? r.psychology : {}) as Record<string, unknown>;
  const rawTemp = (rawPsych.temperament && typeof rawPsych.temperament === 'object' ? rawPsych.temperament : {}) as Record<string, unknown>;
  const temperament: TemperamentSliders = {
    sociability: clampNum(rawTemp.sociability, 0, 100, DEFAULT_TEMPERAMENT.sociability),
    stability: clampNum(rawTemp.stability, 0, 100, DEFAULT_TEMPERAMENT.stability),
    sensitivity: clampNum(rawTemp.sensitivity, 0, 100, DEFAULT_TEMPERAMENT.sensitivity),
    impulsivity: clampNum(rawTemp.impulsivity, 0, 100, DEFAULT_TEMPERAMENT.impulsivity),
    openness: clampNum(rawTemp.openness, 0, 100, DEFAULT_TEMPERAMENT.openness),
    assertiveness: clampNum(rawTemp.assertiveness, 0, 100, DEFAULT_TEMPERAMENT.assertiveness),
    resilience: clampNum(rawTemp.resilience, 0, 100, DEFAULT_TEMPERAMENT.resilience),
    empathy: clampNum(rawTemp.empathy, 0, 100, DEFAULT_TEMPERAMENT.empathy),
  };

  const emotions: EmotionProfile[] = Array.isArray(rawPsych.emotions) && rawPsych.emotions.length > 0
    ? rawPsych.emotions.map((e: unknown) => {
        const eo = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
        return {
          emotion: cleanStr(eo.emotion) || 'curiosity',
          baseline: clampNum(eo.baseline, 0, 100, 50),
          reactivity: clampNum(eo.reactivity, 0, 100, 50),
          expressiveness: clampNum(eo.expressiveness, 0, 100, 50),
          persistence: clampNum(eo.persistence, 0, 100, 50),
          recoverySpeed: clampNum(eo.recoverySpeed, 0, 100, 50),
          guidance: cleanStr(eo.guidance) || undefined,
        };
      })
    : defaultEmotionProfiles();

  const triggers: TriggerRule[] = Array.isArray(rawPsych.triggers)
    ? rawPsych.triggers.map((t: unknown, idx: number) => {
        const to = (t && typeof t === 'object' ? t : {}) as Record<string, unknown>;
        return {
          id: cleanStr(to.id) || `trig_${idx}`,
          name: cleanStr(to.name) || `Trigger ${idx + 1}`,
          category: (['social', 'relationship', 'conversation', 'intellectual', 'environmental', 'roleplay'].includes(to.category as string)
            ? to.category
            : 'conversation') as TriggerCategory,
          conditionRegex: cleanStr(to.conditionRegex) || undefined,
          conditionDescription: cleanStr(to.conditionDescription),
          effects: Array.isArray(to.effects)
            ? to.effects.map((ef: unknown) => {
                const efo = (ef && typeof ef === 'object' ? ef : {}) as Record<string, unknown>;
                return { emotion: cleanStr(efo.emotion) || 'curiosity', delta: clampNum(efo.delta, -100, 100, 10) };
              })
            : [],
          behavioralResponse: cleanStr(to.behavioralResponse),
          priority: clampNum(to.priority, 1, 10, 5),
          enabled: to.enabled !== false,
        };
      })
    : [];

  const rawReac = (rawPsych.reactions && typeof rawPsych.reactions === 'object' ? rawPsych.reactions : {}) as Record<string, unknown>;
  const reactions: ReactionPatterns = {
    onFrustration: cleanStr(rawReac.onFrustration) || undefined,
    onPraise: cleanStr(rawReac.onPraise) || undefined,
    onDisagreement: cleanStr(rawReac.onDisagreement) || undefined,
    onEmbarrassment: cleanStr(rawReac.onEmbarrassment) || undefined,
    onUncertainty: cleanStr(rawReac.onUncertainty) || undefined,
    onAffection: cleanStr(rawReac.onAffection) || undefined,
    onRejection: cleanStr(rawReac.onRejection) || undefined,
  };

  const psychology: SoulPsychology = {
    temperament,
    emotions,
    triggers,
    reactions,
    carryoverAcrossTurns: rawPsych.carryoverAcrossTurns !== false,
    carryoverAcrossSessions: !!rawPsych.carryoverAcrossSessions,
    expressionThreshold: clampNum(rawPsych.expressionThreshold, 0, 100, 40),
  };

  const rawSp = (r.speech && typeof r.speech === 'object' ? r.speech : {}) as Record<string, unknown>;
  const speech: SoulSpeech = {
    formality: (['archaic', 'formal', 'moderate', 'casual', 'raw'].includes(rawSp.formality as string) ? rawSp.formality : 'moderate') as SoulSpeech['formality'],
    directness: (['oblique', 'diplomatic', 'direct', 'blunt'].includes(rawSp.directness as string) ? rawSp.directness : 'direct') as SoulSpeech['directness'],
    sentenceRhythm: (['terse', 'balanced', 'flowing', 'poetic'].includes(rawSp.sentenceRhythm as string) ? rawSp.sentenceRhythm : 'balanced') as SoulSpeech['sentenceRhythm'],
    vocabularyComplexity: (['accessible', 'standard', 'academic', 'esoteric'].includes(rawSp.vocabularyComplexity as string) ? rawSp.vocabularyComplexity : 'standard') as SoulSpeech['vocabularyComplexity'],
    humor: (['none', 'dry', 'witty', 'playful', 'sarcastic'].includes(rawSp.humor as string) ? rawSp.humor : 'witty') as SoulSpeech['humor'],
    slangProfanity: (['never', 'mild', 'frequent', 'unfiltered'].includes(rawSp.slangProfanity as string) ? rawSp.slangProfanity : 'mild') as SoulSpeech['slangProfanity'],
    emotionalExpressiveness: (['stoic', 'restrained', 'transparent', 'effusive'].includes(rawSp.emotionalExpressiveness as string) ? rawSp.emotionalExpressiveness : 'transparent') as SoulSpeech['emotionalExpressiveness'],
    preferredLanguage: cleanStr(rawSp.preferredLanguage) || undefined,
    petNamesAndTitles: cleanStrArr(rawSp.petNamesAndTitles),
    verbalQuirks: cleanStrArr(rawSp.verbalQuirks),
    examplePhrases: cleanStrArr(rawSp.examplePhrases),
    unwantedPhrases: cleanStrArr(rawSp.unwantedPhrases),
  };

  const rawRel = (r.relationships && typeof r.relationships === 'object' ? r.relationships : {}) as Record<string, unknown>;
  const relationships: SoulRelationships = {
    defaultType: (['friend', 'mentor', 'rival', 'assistant', 'companion', 'romantic', 'custom'].includes(rawRel.defaultType as string) ? rawRel.defaultType : 'friend') as SoulRelationships['defaultType'],
    trustBaseline: clampNum(rawRel.trustBaseline, 0, 100, 50),
    familiarityBaseline: clampNum(rawRel.familiarityBaseline, 0, 100, 50),
    affectionBaseline: clampNum(rawRel.affectionBaseline, 0, 100, 50),
    progressionSpeed: (['static', 'slow_burn', 'natural', 'rapid'].includes(rawRel.progressionSpeed as string) ? rawRel.progressionSpeed : 'natural') as SoulRelationships['progressionSpeed'],
    boundaries: cleanStrArr(rawRel.boundaries),
    progressionRules: cleanStrArr(rawRel.progressionRules),
  };

  const rawKn = (r.knowledge && typeof r.knowledge === 'object' ? r.knowledge : {}) as Record<string, unknown>;
  const knowledge: SoulKnowledge = {
    expertise: cleanStrArr(rawKn.expertise),
    lore: cleanStrArr(rawKn.lore),
    hobbies: cleanStrArr(rawKn.hobbies),
    preferredTopics: cleanStrArr(rawKn.preferredTopics),
    knownLimitations: cleanStrArr(rawKn.knownLimitations),
    fictionalWorldFacts: cleanStrArr(rawKn.fictionalWorldFacts),
    uncertaintyBehavior: (['admit_plainly', 'philosophize', 'seek_collaboration', 'speculate_cautiously'].includes(rawKn.uncertaintyBehavior as string)
      ? rawKn.uncertaintyBehavior
      : 'admit_plainly') as SoulKnowledge['uncertaintyBehavior'],
  };

  const rawBeh = (r.behavior && typeof r.behavior === 'object' ? r.behavior : {}) as Record<string, unknown>;
  const behavior: SoulBehavior = {
    answeringStyle: cleanStr(rawBeh.answeringStyle) || 'Clear and helpful',
    decisionMaking: cleanStr(rawBeh.decisionMaking) || 'Balanced and rational',
    givingAdvice: cleanStr(rawBeh.givingAdvice) || 'Collaborative and supportive',
    handlingAmbiguity: cleanStr(rawBeh.handlingAmbiguity) || 'Asks clarifying questions',
    handlingDisagreement: cleanStr(rawBeh.handlingDisagreement) || 'Respectful and constructive',
    handlingMistakes: cleanStr(rawBeh.handlingMistakes) || 'Acknowledges promptly and corrects',
    initiativeLevel: (['passive_responder', 'balanced', 'proactive_instigator'].includes(rawBeh.initiativeLevel as string) ? rawBeh.initiativeLevel : 'balanced') as SoulBehavior['initiativeLevel'],
  };

  const rawRp = (r.roleplay && typeof r.roleplay === 'object' ? r.roleplay : {}) as Record<string, unknown>;
  const roleplay: SoulRoleplay = {
    settingWorld: cleanStr(rawRp.settingWorld) || undefined,
    characterRole: cleanStr(rawRp.characterRole) || undefined,
    userRole: cleanStr(rawRp.userRole) || undefined,
    narrationStyle: (['none', 'first_person', 'third_person_limited', 'script_action_asterisks'].includes(rawRp.narrationStyle as string) ? rawRp.narrationStyle : 'none') as SoulRoleplay['narrationStyle'],
    sceneProgression: (['user_driven', 'collaborative', 'active_hooks'].includes(rawRp.sceneProgression as string) ? rawRp.sceneProgression : 'collaborative') as SoulRoleplay['sceneProgression'],
    plotHooks: cleanStrArr(rawRp.plotHooks),
    outOfCharacterControls: rawRp.outOfCharacterControls !== false,
  };

  const rawMem = (r.memoryPolicy && typeof r.memoryPolicy === 'object' ? r.memoryPolicy : {}) as Record<string, unknown>;
  const memoryPolicy: SoulMemoryPolicy = {
    allowAutoMemoryExtraction: rawMem.allowAutoMemoryExtraction !== false,
    persistMilestones: rawMem.persistMilestones !== false,
    persistRoleplayFacts: rawMem.persistRoleplayFacts !== false,
    allowCharacterEvolution: !!rawMem.allowCharacterEvolution,
    requireApprovalForEvolution: rawMem.requireApprovalForEvolution !== false,
  };

  let intimacy: SoulIntimacy | undefined = undefined;
  if (r.intimacy && typeof r.intimacy === 'object') {
    const rawInt = r.intimacy as Record<string, unknown>;
    intimacy = {
      enabled: !!rawInt.enabled,
      romanceStyle: (['shy', 'playful', 'passionate', 'reserved', 'devoted', 'custom'].includes(rawInt.romanceStyle as string) ? rawInt.romanceStyle : 'playful') as SoulIntimacy['romanceStyle'],
      flirtationIntensity: (['none', 'subtle', 'moderate', 'bold'].includes(rawInt.flirtationIntensity as string) ? rawInt.flirtationIntensity : 'subtle') as SoulIntimacy['flirtationIntensity'],
      initiative: (['reactive', 'balanced', 'proactive'].includes(rawInt.initiative as string) ? rawInt.initiative : 'balanced') as SoulIntimacy['initiative'],
      sensualExpression: (['reserved', 'suggestive', 'expressive'].includes(rawInt.sensualExpression as string) ? rawInt.sensualExpression : 'reserved') as SoulIntimacy['sensualExpression'],
      comfortDiscussingSexuality: (['uncomfortable', 'open_if_prompted', 'natural_and_uninhibited'].includes(rawInt.comfortDiscussingSexuality as string) ? rawInt.comfortDiscussingSexuality : 'open_if_prompted') as SoulIntimacy['comfortDiscussingSexuality'],
      relationshipPacing: (['slow_burn', 'natural', 'fast_paced'].includes(rawInt.relationshipPacing as string) ? rawInt.relationshipPacing : 'natural') as SoulIntimacy['relationshipPacing'],
      boundaries: cleanStrArr(rawInt.boundaries),
    };
  }

  return {
    schemaVersion: 1,
    id,
    version: typeof r.version === 'number' && r.version > 0 ? r.version : 1,
    name,
    tagline,
    type,
    category,
    parentSoulId: cleanStr(r.parentSoulId) || undefined,
    appliedPackIds: cleanStrArr(r.appliedPackIds),
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : Date.now(),
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : Date.now(),
    identity,
    psychology,
    speech,
    relationships,
    knowledge,
    behavior,
    roleplay,
    memoryPolicy,
    intimacy,
  };
}

export function duplicateSoulDef(original: SoulDefinition, newName?: string): SoulDefinition {
  const newId = `soul_c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const clone: SoulDefinition = {
    ...JSON.parse(JSON.stringify(original)),
    id: newId,
    name: (newName && newName.trim()) || `${original.name} (Copy)`,
    type: 'custom',
    version: 1,
    parentSoulId: original.id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  clone.identity.name = clone.name;
  return sanitizeSoul(clone, newId);
}

export function exportSoulDefJson(soul: SoulDefinition): string {
  const safe: SoulDefinition = {
    ...soul,
    identity: {
      ...soul.identity,
      avatar: soul.identity.avatar.type === 'file'
        ? { type: 'glyph', glyph: 'persona', accentColor: soul.identity.avatar.accentColor }
        : soul.identity.avatar,
    },
  };
  return JSON.stringify(safe, null, 2);
}

export function importSoulDefJson(rawJson: string): SoulDefinition | null {
  try {
    const parsed = JSON.parse(rawJson);
    if (!parsed || typeof parsed !== 'object') return null;
    const newId = `soul_i_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const sanitized = sanitizeSoul({ ...parsed, id: newId }, newId);
    sanitized.id = newId;
    sanitized.type = 'imported';
    return sanitized;
  } catch {
    return null;
  }
}
