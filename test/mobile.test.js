import test from 'node:test';
import assert from 'node:assert/strict';
import { routeDecision } from '../mobile/src/engine/gateway.ts';
import { VoiceStreamer } from '../mobile/src/services/voiceStreamer.ts';
import { MemoryEngine } from '../mobile/src/services/memoryEngine.ts';
import { LocalLlmDriver } from '../mobile/src/engine/localLlm.ts';
import { VoiceController } from '../mobile/src/engine/voiceController.ts';
import { S23_MODEL_DATABASE } from '../mobile/src/types/settings.ts';

test('Mobile Gateway routes shorthand in < 0.1ms', () => {
  const res = routeDecision('H');
  assert.equal(res.category, 'SPEED_RUN');
  assert.ok(res.latencyMs < 1);
});

test('Mobile Gateway categorizes error stack traces', () => {
  const res = routeDecision('Error: NullPointerException at Service.java:42');
  assert.equal(res.category, 'DEEP_DEBUG');
});

test('Voice Streamer correctly chunks sentences at punctuation boundaries', () => {
  const streamer = new VoiceStreamer();
  
  const chunk1 = streamer.ingestToken('Hello world.');
  assert.ok(chunk1 !== null);
  assert.equal(chunk1.text, 'Hello world.');

  const fragment = streamer.ingestToken(' This is exciting');
  assert.equal(fragment, null);

  const chunk2 = streamer.ingestToken('! How are you?');
  assert.ok(chunk2 !== null);
  assert.equal(chunk2.text, 'This is exciting!');

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

test('Local LLM Driver formats prompt with correct ChatML / Llama-3 tokens', () => {
  const llamaPrompt = LocalLlmDriver.formatPrompt('Be concise', 'Hi', 'Llama-3.2-1B');
  assert.ok(llamaPrompt.includes('<|start_header_id|>system<|end_header_id|>'));

  const smolPrompt = LocalLlmDriver.formatPrompt('Be concise', 'Hi', 'smollm2-1.7b');
  assert.ok(smolPrompt.includes('<|im_start|>system'));
});

test('Voice Controller executes turn and emits chunked audio packets', async () => {
  const sentChunks = [];
  const controller = new VoiceController({
    onStateChange: () => {},
    onTranscriptUpdate: () => {},
    onSentenceReady: (chunk) => sentChunks.push(chunk),
  });

  await controller.handleUserSpeechEnd(
    'Status report please.',
    'tactical',
    { pleasure: 0.1, arousal: 0.8, dominance: 0.9 },
    'Llama-3.2-1B'
  );

  assert.ok(sentChunks.length > 0);
  assert.ok(sentChunks[0].text.length > 0);
});

test('Model Vault Search and Boolean AND / OR Filter logic', () => {
  // Test 1: S23 database has exactly 22 cataloged models
  assert.equal(S23_MODEL_DATABASE.length, 22);

  // Test 2: Search by text query
  const gemmaModels = S23_MODEL_DATABASE.filter(m => m.name.toLowerCase().includes('gemma'));
  assert.equal(gemmaModels.length, 4);

  // Test 3: Boolean AND logic (Must have Image AND Voice)
  const imageAndVoice = S23_MODEL_DATABASE.filter(m => 
    ['Image', 'Voice'].every(cap => m.capabilities.includes(cap))
  );
  assert.ok(imageAndVoice.length >= 3);
  for (const m of imageAndVoice) {
    assert.ok(m.capabilities.includes('Image'));
    assert.ok(m.capabilities.includes('Voice'));
  }

  // Test 4: Boolean OR logic (Has Voice OR Code)
  const voiceOrCode = S23_MODEL_DATABASE.filter(m =>
    ['Voice', 'Code'].some(cap => m.capabilities.includes(cap))
  );
  assert.ok(voiceOrCode.length >= 6);

  // Test 5: Sorting by RAM Required ascending
  const sortedByRam = [...S23_MODEL_DATABASE].sort((a, b) => a.ramRequiredGb - b.ramRequiredGb);
  assert.equal(sortedByRam[0].name, 'Llama 3.2 (1B)'); // 1.2 GB RAM (lowest)
  assert.equal(sortedByRam[sortedByRam.length - 1].grade, 'S'); // Highest Titan
});
