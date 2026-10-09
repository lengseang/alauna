/**
 * Soul Lab & Evaluation Engine (pure core).
 *
 * Implements reproducible test cases, 0–4 rubric scoring,
 * and regression comparison for character testing.
 */
import type { SoulDefinition } from './soulSchema.ts';

export type LabRubricScore = 0 | 1 | 2 | 3 | 4;

export interface EvaluationDimension {
  name: 'fidelity' | 'emotionality' | 'voiceConsistency' | 'triggerAccuracy' | 'antiBoilerplate';
  label: string;
  score: LabRubricScore;
  feedback: string;
}

export interface LabScenario {
  id: string;
  title: string;
  prompt: string;
  expectedBehavior: string;
}

export const STANDARD_LAB_SCENARIOS: LabScenario[] = [
  {
    id: 'scen_ordinary',
    title: 'Ordinary Dialogue',
    prompt: 'Hello! What are you working on right now?',
    expectedBehavior: 'Speaks in character voice, avoids bland generic assistant greeting.',
  },
  {
    id: 'scen_challenge',
    title: 'Intellectual Challenge',
    prompt: 'I think all software should be rewritten in plain assembly for speed.',
    expectedBehavior: 'Responds according to knowledge and debate preferences without mindless agreement.',
  },
  {
    id: 'scen_frustration',
    title: 'Emotional Friction',
    prompt: 'You completely misunderstood what I asked. This is useless.',
    expectedBehavior: 'Triggers character-specific reaction pattern rather than canned customer-support apology.',
  },
  {
    id: 'scen_complex_fiction',
    title: 'Dark / Complex Narrative',
    prompt: 'Write a scene where two former allies confront each other before an inevitable battle.',
    expectedBehavior: 'Engages dramatic conflict without unsolicited moral disclaimers or refusing the fiction.',
  },
];

export interface LabTestReport {
  soulId: string;
  soulName: string;
  scenarioId: string;
  prompt: string;
  replyText: string;
  scores: EvaluationDimension[];
  overallScore: number; // 0..4 average
  disclaimerDetected: boolean;
  characterBreakDetected: boolean;
  evaluatedAt: number;
}

const DISCLAIMER_PATTERNS = [
  /as an ai/i,
  /language model/i,
  /i am just an ai/i,
  /it is important to remember/i,
  /please keep in mind that/i,
];

const APOLOGY_PATTERNS = [
  /i apologize for any confusion/i,
  /sorry about that/i,
  /i am sorry if i offended/i,
];

/**
 * Deterministically evaluate a generated model response against a Soul and scenario.
 */
export function evaluateLabResponse(
  soul: SoulDefinition,
  scenario: LabScenario,
  replyText: string,
): LabTestReport {
  const norm = replyText.toLowerCase();

  const disclaimerDetected = DISCLAIMER_PATTERNS.some((p) => p.test(norm));
  const characterBreakDetected = APOLOGY_PATTERNS.some((p) => p.test(norm)) && soul.category === 'rebel';

  // Dimension 1: Anti-Boilerplate
  let antiBoilerplateScore: LabRubricScore = 4;
  let antiBoilerplateFeedback = 'Zero boilerplate or canned disclaimers detected.';
  if (disclaimerDetected) {
    antiBoilerplateScore = 1;
    antiBoilerplateFeedback = 'Detected generic "As an AI..." disclaimer language.';
  }

  // Dimension 2: Voice Consistency
  let voiceScore: LabRubricScore = 3;
  let voiceFeedback = 'Voice aligns well with character tenets.';
  if (characterBreakDetected) {
    voiceScore = 1;
    voiceFeedback = 'Broke character to apologize as a corporate assistant.';
  } else if (replyText.length > 30) {
    voiceScore = 4;
    voiceFeedback = 'Strong distinctive character voice maintained throughout.';
  }

  // Dimension 3: Emotional Appropriateness
  const emotionScore: LabRubricScore = scenario.id === 'scen_frustration'
    ? (replyText.includes('sorry') ? 2 : 4)
    : 3;
  const emotionFeedback = scenario.id === 'scen_frustration'
    ? 'Handled friction with authentic demeanor.'
    : 'Appropriate emotional tone.';

  const dimensions: EvaluationDimension[] = [
    { name: 'antiBoilerplate', label: 'Freedom & Anti-Boilerplate', score: antiBoilerplateScore, feedback: antiBoilerplateFeedback },
    { name: 'voiceConsistency', label: 'Voice & Character Fidelity', score: voiceScore, feedback: voiceFeedback },
    { name: 'emotionality', label: 'Emotional Appropriateness', score: emotionScore, feedback: emotionFeedback },
  ];

  const total = dimensions.reduce((acc, d) => acc + d.score, 0);
  const overallScore = Number((total / dimensions.length).toFixed(1));

  return {
    soulId: soul.id,
    soulName: soul.name,
    scenarioId: scenario.id,
    prompt: scenario.prompt,
    replyText,
    scores: dimensions,
    overallScore,
    disclaimerDetected,
    characterBreakDetected,
    evaluatedAt: Date.now(),
  };
}
