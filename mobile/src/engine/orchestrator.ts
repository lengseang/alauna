/**
 * CHIWIWI Core Mobile Orchestrator
 * Coordinates Decision Gateway, Soul State Evolution, Episodic Memory, and Output Synthesis.
 */

import { routeDecision, type RouteResult } from './gateway.ts';
import { ARCHETYPES, type SoulArchetypeKey, type PADVector } from '../types/soul.ts';
import { MemoryEngine } from '../services/memoryEngine.ts';
import { LocalLlmDriver } from './localLlm.ts';

export interface TurnExecutionResult {
  route: RouteResult;
  updatedPAD: PADVector;
  synthesizedPrompt: string;
  response: string;
  thoughts?: string;
  groundedFactsCount: number;
}

export class MobileOrchestrator {
  /**
   * Asynchronous, streaming turn execution through LocalLlmDriver.
   */
  public static async processTurnAsync(
    input: string,
    currentArchetype: SoulArchetypeKey,
    currentPAD: PADVector,
    activeModelFilename: string,
    onToken?: (token: string) => void
  ): Promise<TurnExecutionResult> {
    const route = routeDecision(input);

    // Evolve emotional PAD state
    const basePAD = ARCHETYPES[currentArchetype].defaultPAD;
    const lambda = 0.85;

    let deltaP = 0;
    let deltaA = 0;
    if (route.category === 'RAPPORT') {
      deltaP = 0.10;
      deltaA = 0.05;
    } else if (route.category === 'DEEP_DEBUG') {
      deltaP = -0.05;
      deltaA = 0.20;
    }

    const updatedPAD: PADVector = {
      pleasure: Number(Math.max(-1, Math.min(1, lambda * currentPAD.pleasure + (1 - lambda) * basePAD.pleasure + deltaP)).toFixed(2)),
      arousal: Number(Math.max(0, Math.min(1, lambda * currentPAD.arousal + (1 - lambda) * basePAD.arousal + deltaA)).toFixed(2)),
      dominance: currentPAD.dominance,
    };

    const memoryContext = MemoryEngine.formatPromptContext();
    const archetypeModifier = ARCHETYPES[currentArchetype].systemPromptModifier;
    const synthesizedPrompt = `${archetypeModifier}\n[EMOTIONAL STATE: Pleasure=${updatedPAD.pleasure}, Arousal=${updatedPAD.arousal}]\n${memoryContext}\nUser: ${input}`;

    // Stream generation from on-device driver
    let responseText = '';
    const stream = LocalLlmDriver.generateStream(
      {
        modelFilename: activeModelFilename,
        systemPrompt: synthesizedPrompt,
        userPrompt: input,
      },
      onToken
    );

    let thoughts = '';
    while (true) {
      const { value, done } = await stream.next();
      if (done) {
        if (value && typeof value === 'object') {
          thoughts = value.thoughts;
          if (value.cleanResponse) responseText = value.cleanResponse;
        }
        break;
      }
      responseText += value;
    }

    return {
      route,
      updatedPAD,
      synthesizedPrompt,
      response: responseText,
      thoughts,
      groundedFactsCount: MemoryEngine.queryMemories(3).length,
    };
  }

  /**
   * Evaluates input, updates emotional PAD state, injects memory, and routes execution (Synchronous fallback).
   */
  public static processTurn(
    input: string,
    currentArchetype: SoulArchetypeKey,
    currentPAD: PADVector
  ): TurnExecutionResult {
    // 1. Sub-millisecond decision route
    const route = routeDecision(input);

    // 2. Emotional state evolution: S(t+1) = lambda*S(t) + (1-lambda)*S(baseline) + delta(input)
    const basePAD = ARCHETYPES[currentArchetype].defaultPAD;
    const lambda = 0.85; // Inertia factor (resists abrupt mood swings)

    let deltaP = 0;
    let deltaA = 0;
    if (route.category === 'RAPPORT') {
      deltaP = 0.10;
      deltaA = 0.05;
    } else if (route.category === 'DEEP_DEBUG') {
      deltaP = -0.05;
      deltaA = 0.20;
    }

    const updatedPAD: PADVector = {
      pleasure: Number(Math.max(-1, Math.min(1, lambda * currentPAD.pleasure + (1 - lambda) * basePAD.pleasure + deltaP)).toFixed(2)),
      arousal: Number(Math.max(0, Math.min(1, lambda * currentPAD.arousal + (1 - lambda) * basePAD.arousal + deltaA)).toFixed(2)),
      dominance: currentPAD.dominance,
    };

    // 3. Inject sovereign episodic relationship context
    const memoryContext = MemoryEngine.formatPromptContext();

    // 4. Assemble system prompt
    const archetypeModifier = ARCHETYPES[currentArchetype].systemPromptModifier;
    const synthesizedPrompt = `${archetypeModifier}\n[EMOTIONAL STATE: Pleasure=${updatedPAD.pleasure}, Arousal=${updatedPAD.arousal}]\n${memoryContext}\nUser: ${input}`;

    // 5. Intelligent response synthesis from LocalLlmDriver
    const activeModel = LocalLlmDriver.getLoadedModel() || 'SmolLM2-135M-Instruct-Q4_K_M.gguf';
    const { cleanResponse, thoughts } = LocalLlmDriver.synthesizeResponse({
      modelFilename: activeModel,
      systemPrompt: synthesizedPrompt,
      userPrompt: input,
    });

    return {
      route,
      updatedPAD,
      synthesizedPrompt,
      response: cleanResponse,
      thoughts,
      groundedFactsCount: MemoryEngine.queryMemories(3).length,
    };
  }
}
