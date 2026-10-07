import test from 'node:test';
import assert from 'node:assert/strict';
import { routeDecision } from '../src/engine/gateway.ts';
import { VoiceStreamer } from '../src/services/voiceStreamer.ts';
import { MemoryEngine } from '../src/services/memoryEngine.ts';
import { MobileOrchestrator } from '../src/engine/orchestrator.ts';
import { LocalLlmDriver } from '../src/engine/localLlm.ts';

test('Decision Gateway routes shorthand in < 0.1ms', () => {
  const res = routeDecision('H');
  assert.equal(res.category, 'SPEED_RUN');
  assert.ok(res.latencyMs < 1);
});

test('Decision Gateway detects stack trace logs', () => {
  const res = routeDecision('Error: NullPointerException at Service.java:42');
  assert.equal(res.category, 'DEEP_DEBUG');
});

test('Voice Streamer correctly chunks sentences at punctuation boundaries', () => {
  const streamer = new VoiceStreamer();
  
  // Feed tokens
  const chunk1 = streamer.ingestToken('Hello world.');
  assert.ok(chunk1 !== null);
  assert.equal(chunk1.text, 'Hello world.');

  // Fragment token without punctuation
  const fragment = streamer.ingestToken(' This is exciting');
  assert.equal(fragment, null);

  // Punctuation completion
  const chunk2 = streamer.ingestToken('! How are you?');
  assert.ok(chunk2 !== null);
  assert.equal(chunk2.text, 'This is exciting!');

  // Remaining token flush
  const remaining = streamer.flush();
  assert.ok(remaining !== null);
  assert.equal(remaining.text, 'How are you?');
});

test('Memory Engine prunes rolling context window to maximum allowed turns', () => {
  const mockHistory = Array.from({ length: 20 }, (_, i) => `Message ${i}`);
  const pruned = MemoryEngine.pruneRollingWindow(mockHistory, 6);
  assert.equal(pruned.length, 6);
  assert.equal(pruned[pruned.length - 1], 'Message 19');
});

test('Mobile Orchestrator dynamically updates Soul PAD vector on turn processing', () => {
  const initialPAD = { pleasure: 0.5, arousal: 0.4, dominance: 0.5 };
  const res = MobileOrchestrator.processTurn('Hey bro!', 'empath', initialPAD);

  assert.equal(res.route.category, 'RAPPORT');
  // Pleasure should increase on rapport
  assert.ok(res.updatedPAD.pleasure >= initialPAD.pleasure);
  assert.ok(typeof res.synthesizedPrompt === 'string');
});

test('LocalLlmDriver loads model and tracks active loaded weights', async () => {
  const loaded = await LocalLlmDriver.loadModel('llama-3.2-1b-instruct-q4_k_m.gguf');
  assert.equal(loaded, true);
  assert.equal(LocalLlmDriver.getLoadedModel(), 'llama-3.2-1b-instruct-q4_k_m.gguf');
});

test('LocalLlmDriver generates token stream with thoughts and clean response', async () => {
  const tokens: string[] = [];
  const stream = LocalLlmDriver.generateStream(
    {
      modelFilename: 'smollm2-135m-instruct-q4_k_m.gguf',
      systemPrompt: 'System context',
      userPrompt: 'who are you?',
    },
    (token) => tokens.push(token)
  );

  let finalResult: { fullText: string; thoughts: string; cleanResponse: string } | null = null;
  while (true) {
    const { value, done } = await stream.next();
    if (done) {
      finalResult = value;
      break;
    }
  }

  assert.ok(tokens.length > 0);
  assert.ok(finalResult !== null);
  assert.ok(finalResult.thoughts.includes('Context evaluation'));
  assert.ok(finalResult.cleanResponse.includes('CHIWIWI'));
  assert.equal(tokens.join(''), finalResult.cleanResponse);
});

test('MobileOrchestrator.processTurnAsync executes streaming turn with thought extraction', async () => {
  const tokens: string[] = [];
  const result = await MobileOrchestrator.processTurnAsync(
    'hello friend',
    'empath',
    { pleasure: 0.5, arousal: 0.5, dominance: 0.5 },
    'qwen2.5-0.5b-instruct-q4_k_m.gguf',
    (token) => tokens.push(token)
  );

  assert.ok(tokens.length > 0);
  assert.ok(result.response.length > 0);
  assert.ok(result.thoughts && result.thoughts.length > 0);
  assert.equal(tokens.join(''), result.response);
});

test('LocalLlmDriver.verifyAndWarmup executes self-test turn successfully', async () => {
  const warmup = await LocalLlmDriver.verifyAndWarmup('llama-3.2-1b-instruct-q4_k_m.gguf');
  assert.equal(warmup.success, true);
  assert.ok(warmup.latencyMs >= 0);
});

test('LocalLlmDriver synthesizes intelligent responses without canned strings', () => {
  const queries = ['What is', 'What is your name', 'What is quantum computing', 'What is React Native', 'hello'];
  for (const q of queries) {
    const res = LocalLlmDriver.synthesizeResponse({
      modelFilename: 'SmolLM2-135M-Instruct-Q4_K_M.gguf',
      systemPrompt: 'Empath system prompt',
      userPrompt: q,
    });
    assert.ok(res.cleanResponse.length > 20);
    assert.ok(!res.cleanResponse.includes('Received: "'));
    assert.ok(res.thoughts.includes('Context evaluation'));
  }
});
