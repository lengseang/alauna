/**
 * Prompt & Scene Planner (pure core).
 *
 * Feature ID: CHIWIWI-IMG-ARCH-001 §5.3
 * Converts natural-language intent into a compact, structured scene representation
 * using deterministic parsing heuristics and model-family prompt serializations.
 * Operates 100% offline without relying on cloud LLMs.
 */

import type {
  GenerationGoal,
  GenerationRequest,
  SceneComposition,
  SceneConstraints,
  SceneEnvironment,
  SceneLighting,
  ScenePlan,
  SceneStyle,
  SceneSubject,
} from './types.ts';

// ------------------------------------------------------------------ Goal Presets

const GOAL_COMPOSITION_DEFAULTS: Record<GenerationGoal, Partial<SceneComposition>> = {
  portrait: { framing: 'close-up', cameraAngle: 'eye level', subjectPlacement: 'centered' },
  character: { framing: 'medium shot', cameraAngle: 'eye level', subjectPlacement: 'centered' },
  landscape: { framing: 'wide shot', cameraAngle: 'eye level', subjectPlacement: 'horizon balanced' },
  product: { framing: 'medium shot', cameraAngle: 'eye level', subjectPlacement: 'centered studio' },
  illustration: { framing: 'medium shot', cameraAngle: 'eye level', subjectPlacement: 'dynamic' },
  abstract: { framing: 'wide shot', cameraAngle: 'eye level', subjectPlacement: 'distributed' },
  general: { framing: 'medium shot', cameraAngle: 'eye level', subjectPlacement: 'natural' },
};

const GOAL_LIGHTING_DEFAULTS: Record<GenerationGoal, SceneLighting> = {
  portrait: { type: 'soft studio portrait lighting', mood: 'intimate and clear' },
  character: { type: 'cinematic key light with subtle rim lighting', mood: 'expressive' },
  landscape: { type: 'natural atmospheric golden hour light', mood: 'expansive' },
  product: { type: 'clean commercial studio diffused lighting', mood: 'crisp' },
  illustration: { type: 'harmonious stylized lighting', mood: 'vibrant' },
  abstract: { type: 'contrasting ambient gradient light', mood: 'evocative' },
  general: { type: 'natural ambient lighting', mood: 'balanced' },
};

// ------------------------------------------------------------------ Deterministic Scene Planner

export function planScene(request: GenerationRequest): ScenePlan {
  const prompt = request.prompt.trim();
  const goal = request.goal;

  // 1. Extract style hints from prompt
  const styleFamily = detectStyleFamily(prompt, goal);
  const style: SceneStyle = {
    family: styleFamily,
    strength: styleFamily === 'photorealistic' ? 'dominant' : 'moderate',
  };

  // 2. Extract subjects
  const subjectList = extractSubjects(prompt);

  // 3. Extract environment details
  const environment = extractEnvironment(prompt);

  // 4. Composition based on goal + explicit hints
  const baseComp = GOAL_COMPOSITION_DEFAULTS[goal] || GOAL_COMPOSITION_DEFAULTS.general;
  const composition: SceneComposition = {
    framing: detectFraming(prompt) ?? baseComp.framing ?? 'medium shot',
    cameraAngle: detectCameraAngle(prompt) ?? baseComp.cameraAngle ?? 'eye level',
    subjectPlacement: baseComp.subjectPlacement,
  };

  // 5. Lighting
  const lighting = detectLighting(prompt) ?? GOAL_LIGHTING_DEFAULTS[goal];

  // 6. Constraints: preserve must-include nouns, avoid unwanted artifacts
  const mustInclude = subjectList.map((s) => s.description).filter(Boolean);
  const avoid = ['watermarks', 'distorted text', 'blurry artifacts'];
  if (request.negativePrompt) {
    avoid.push(...request.negativePrompt.split(',').map((s) => s.trim()).filter(Boolean));
  }

  const constraints: SceneConstraints = {
    mustInclude,
    avoid,
  };

  return {
    schemaVersion: 1,
    userPrompt: prompt,
    goal,
    subject: subjectList,
    environment,
    composition,
    lighting,
    style,
    constraints,
  };
}

// ------------------------------------------------------------------ Model-Aware Serialization

export interface SerializedPrompt {
  positivePrompt: string;
  negativePrompt?: string;
}

export function serializePromptForModel(
  scene: ScenePlan,
  modelFamily: 'stable-diffusion' | 'sd-turbo' | 'flux' | 'bksdm' | 'custom',
): SerializedPrompt {
  const subjectStr = scene.subject.map((s) => s.description).join(', ');
  const envStr = scene.environment.details.length > 0 ? `in ${scene.environment.details.join(', ')}` : '';
  const lightingStr = scene.lighting.type ? `${scene.lighting.type}` : '';
  const framingStr = `${scene.composition.framing}, ${scene.composition.cameraAngle}`;
  const styleStr = scene.style.family !== 'general' ? `${scene.style.family} style` : '';

  let positivePrompt = '';

  switch (modelFamily) {
    case 'sd-turbo':
      // Turbo models perform best with concise, punchy natural descriptions
      positivePrompt = [scene.userPrompt, styleStr].filter(Boolean).join(', ');
      break;

    case 'flux':
      // Flux prefers detailed narrative prose rather than tag soups
      positivePrompt = [
        subjectStr,
        envStr,
        framingStr,
        lightingStr,
        styleStr,
      ]
        .filter(Boolean)
        .join('. ');
      break;

    case 'bksdm':
    case 'stable-diffusion':
    default:
      // SD 1.5/2.1 standard structured token weighting
      positivePrompt = [
        subjectStr || scene.userPrompt,
        styleStr,
        envStr,
        framingStr,
        lightingStr,
      ]
        .filter(Boolean)
        .join(', ');
      break;
  }

  const negativePrompt = scene.constraints.avoid.length > 0
    ? scene.constraints.avoid.join(', ')
    : undefined;

  return {
    positivePrompt: positivePrompt.trim() || scene.userPrompt,
    negativePrompt,
  };
}

// ------------------------------------------------------------------ Parsing Heuristics

function detectStyleFamily(prompt: string, goal: GenerationGoal): string {
  const p = prompt.toLowerCase();
  if (p.includes('anime') || p.includes('manga')) return 'anime';
  if (p.includes('oil painting') || p.includes('watercolor') || p.includes('acrylic')) return 'painterly fine art';
  if (p.includes('cyberpunk') || p.includes('sci-fi') || p.includes('futuristic')) return 'cinematic sci-fi';
  if (p.includes('pixel art')) return 'pixel art';
  if (p.includes('sketch') || p.includes('line art') || p.includes('drawing')) return 'line illustration';
  if (p.includes('photo') || p.includes('photograph') || p.includes('hyperrealistic') || goal === 'portrait' || goal === 'product') {
    return 'photorealistic';
  }
  if (goal === 'illustration') return 'contemporary digital illustration';
  if (goal === 'abstract') return 'abstract geometric composition';
  return 'balanced aesthetic';
}

function extractSubjects(prompt: string): SceneSubject[] {
  // Simple heuristic: clean punctuation and take first meaningful clause
  const cleaned = prompt.replace(/[.,;!?]+$/, '').trim();
  return [
    {
      description: cleaned,
      attributes: [],
      priority: 1,
    },
  ];
}

function extractEnvironment(prompt: string): SceneEnvironment {
  const p = prompt.toLowerCase();
  const envKeywords = ['room', 'forest', 'street', 'beach', 'mountain', 'city', 'studio', 'sky', 'space', 'ocean', 'indoor', 'outdoor'];
  const found = envKeywords.filter((k) => p.includes(k));
  return {
    details: found,
  };
}

function detectFraming(prompt: string): SceneComposition['framing'] | null {
  const p = prompt.toLowerCase();
  if (p.includes('close-up') || p.includes('portrait')) return 'close-up';
  if (p.includes('wide shot') || p.includes('landscape') || p.includes('panorama')) return 'wide shot';
  if (p.includes('macro')) return 'macro';
  return null;
}

function detectCameraAngle(prompt: string): SceneComposition['cameraAngle'] | null {
  const p = prompt.toLowerCase();
  if (p.includes('low angle')) return 'low angle';
  if (p.includes('high angle')) return 'high angle';
  if (p.includes('top-down') || p.includes('bird eye')) return 'top-down';
  return null;
}

function detectLighting(prompt: string): SceneLighting | null {
  const p = prompt.toLowerCase();
  if (p.includes('golden hour') || p.includes('sunset')) {
    return { type: 'warm golden hour sun', mood: 'warm and nostalgic' };
  }
  if (p.includes('neon') || p.includes('cyber')) {
    return { type: 'vibrant neon rim light', mood: 'dramatic and moody' };
  }
  if (p.includes('studio') || p.includes('soft light')) {
    return { type: 'soft diffused studio lighting', mood: 'clean and balanced' };
  }
  return null;
}
