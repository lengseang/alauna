import test from 'node:test';
import assert from 'node:assert/strict';
import {
  enhancePromptWithLLM,
  parseEnhancedPromptResponse,
  PROMPT_ENHANCER_SYSTEM_PROMPT,
} from '../src/core/imageGen/promptEnhancer.ts';

test('promptEnhancer: parses POSITIVE and NEGATIVE sections accurately', () => {
  const sample = `
POSITIVE: Highly detailed portrait of an ancient sorceress, glowing runic tattoos, flowing silver hair, volumetric torchlight, 85mm lens
NEGATIVE: blurry, deformed hands, low quality, extra fingers, text
`;
  const result = parseEnhancedPromptResponse(sample);
  assert.equal(
    result.positive,
    'Highly detailed portrait of an ancient sorceress, glowing runic tattoos, flowing silver hair, volumetric torchlight, 85mm lens',
  );
  assert.equal(result.negative, 'blurry, deformed hands, low quality, extra fingers, text');
});

test('promptEnhancer: parses output when NEGATIVE is omitted or multi-line', () => {
  const sampleOnlyPositive = `
POSITIVE: Majestic cybernetic tiger prowling through a neon cyberpunk rainforest, rain slicked ground, reflections
`;
  const result = parseEnhancedPromptResponse(sampleOnlyPositive);
  assert.ok(result.positive.includes('cybernetic tiger'));
  assert.equal(result.negative, '');

  const sampleFallback = 'A serene Japanese garden with cherry blossoms, wooden bridge, soft morning mist';
  const resultFallback = parseEnhancedPromptResponse(sampleFallback);
  assert.equal(resultFallback.positive, sampleFallback);
});

test('promptEnhancer: reports honest error when no LLM is ready', async () => {
  const mockEngine = {
    state: { status: 'unmounted' as const },
    isReady: () => false,
    generate: async () => {
      throw new Error('Engine not ready');
    },
  };

  const res = await enhancePromptWithLLM(mockEngine as any, 'A cozy cabin');
  assert.equal(res.ok, false);
  assert.ok(res.message?.includes('No chat model is loaded'));
});

test('promptEnhancer: enhances prompt using loaded model generate output', async () => {
  const mockEngine = {
    state: { status: 'ready' as const },
    isReady: () => true,
    generate: async (params: any) => {
      assert.equal(params.messages[0].content, PROMPT_ENHANCER_SYSTEM_PROMPT);
      assert.equal(params.messages[1].content, 'A red sports car');
      return {
        text: 'POSITIVE: Crimson aerodynamic sports car speeding on coastal highway, sunset golden reflections, high detail motion blur\nNEGATIVE: blurry, bad wheels, distorted',
        generatedTokens: 25,
        predictedMs: 500,
        tokensPerSecond: 50,
      };
    },
  };

  const res = await enhancePromptWithLLM(mockEngine as any, 'A red sports car');
  assert.equal(res.ok, true);
  assert.ok(res.positivePrompt?.includes('Crimson aerodynamic sports car'));
  assert.ok(res.negativePrompt?.includes('blurry, bad wheels'));
  assert.equal(res.tokensGenerated, 25);
});
