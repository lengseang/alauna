#!/usr/bin/env node
/**
 * MANUAL QA: runs the app's real chat-turn logic (core/chatTurn.ts + core/thinking.ts + core/persona.ts)
 * against a REAL reasoning model on a laptop/CI machine, with thinking on and off.
 * It is not part of `npm test` because it needs a 1.1 GB model and a native llama.cpp binding.
 *
 *   mkdir /tmp/realmodel && cd /tmp/realmodel && npm init -y && npm i node-llama-cpp
 *   curl -L -o qwen3-1.7b.gguf "https://huggingface.co/unsloth/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q4_K_M.gguf?download=true"
 *   cp <repo>/scripts/real-model-check.mjs . && sed -i "s#/home/user/chiwiwi#<repo>#g" real-model-check.mjs
 *   node --experimental-strip-types real-model-check.mjs
 *
 * Expected: "ALL REAL-MODEL CHECKS PASSED" (phases reading -> thinking -> answering, clean answer, no tag leaks).
 * Note: node-llama-cpp must tokenize with special tokens enabled (model.tokenize(prompt, true)).
 */
import { getLlama, LlamaCompletion } from 'node-llama-cpp';
import { runAssistantTurn } from '/home/user/chiwiwi/mobile/src/core/chatTurn.ts';
import { getModel } from '/home/user/chiwiwi/mobile/src/core/catalog.ts';
import { buildSystemPrompt, ARCHETYPES } from '/home/user/chiwiwi/mobile/src/core/persona.ts';

const spec = getModel('qwen3-1.7b');
const llama = await getLlama();
const model = await llama.loadModel({ modelPath: './qwen3-1.7b.gguf' });
const context = await model.createContext({ contextSize: 2048 });
const completion = new LlamaCompletion({ contextSequence: context.getSequence() });

// Same contract as services/llamaEngine.ts, but backed by a real llama.cpp (Qwen3 ChatML template).
async function generate(p) {
  const system = p.messages.find((m) => m.role === 'system')?.content ?? '';
  let prompt = system ? `<|im_start|>system\n${system}<|im_end|>\n` : '';
  for (const m of p.messages.filter((x) => x.role !== 'system')) prompt += `<|im_start|>${m.role}\n${m.content}<|im_end|>\n`;
  prompt += '<|im_start|>assistant\n';
  if (!p.enableThinking) prompt += '<think>\n\n</think>\n\n'; // what the Qwen3 template does when thinking is off
  p.onStart?.({ thinkingForcedOpen: false });
  let acc = '', n = 0; const t0 = Date.now();
  await completion.generateCompletion(model.tokenize(prompt, true), { maxTokens: p.maxTokens, temperature: p.temperature, onTextChunk: (t) => { acc += t; n++; p.onText(acc); } });
  const ms = Date.now() - t0;
  return { text: acc, promptTokens: model.tokenize(prompt).length, generatedTokens: n, promptMs: 0, predictedMs: ms, tokensPerSecond: n / (ms / 1000), interrupted: false, contextFull: false, thinkingForcedOpen: false };
}

async function scenario(label, thinkingEnabled, question) {
  console.log(`\n===== ${label} =====\nQ: ${question}`);
  const phases = []; let leaks = 0;
  const out = await runAssistantTurn({
    history: [], userText: question, attachments: [], spec, nCtx: 2048, thinkingEnabled,
    system: buildSystemPrompt({ archetype: 'tactical', pad: ARCHETYPES.tactical.defaultPAD }),
    generate, now: () => Date.now(),
    onUpdate: (u) => {
      if (u.phase && phases.at(-1) !== u.phase) phases.push(u.phase);
      if (/<\/?think/i.test(u.text ?? '')) leaks++;
    },
  });
  console.log('phases seen      :', phases.join(' -> '));
  console.log('tag leaks in UI  :', leaks);
  console.log('status           :', out.status, '| think seconds:', out.thinkSeconds?.toFixed(1) ?? '-');
  console.log('reasoning (start):', JSON.stringify((out.reasoning ?? '').slice(0, 160)));
  console.log('ANSWER           :', JSON.stringify(out.text.slice(0, 300)));
  console.log('stats            :', JSON.stringify({ gen: out.stats.generatedTokens, tps: +out.stats.tokensPerSecond.toFixed(1), totalMs: out.stats.totalMs }));
  return { out, phases, leaks };
}

const a = await scenario('THINKING ON', true, 'What is 17 times 24? Explain briefly.');
const b = await scenario('THINKING OFF', false, 'Name three primary colours.');

let bad = 0; const check = (c, m) => { if (!c) { bad++; console.log('  CHECK FAILED:', m); } };
check(a.out.status === 'done', 'ON: status done');
check(a.phases.includes('thinking') && a.phases.at(-1) === 'answering', 'ON: went through thinking -> answering');
check((a.out.reasoning ?? '').length > 20, 'ON: real reasoning captured');
check(a.out.text.length > 0 && !/<\/?think/.test(a.out.text), 'ON: clean answer, no tags');
check(a.leaks === 0, 'ON: no tag ever leaked into the visible answer while streaming');
check(/408/.test(a.out.text + (a.out.reasoning ?? '')), 'ON: model actually got 17*24=408 (sanity)');
check(b.out.status === 'done' && !b.phases.includes('thinking'), 'OFF: never showed a thinking phase');
check(!b.out.reasoning && b.out.text.length > 0 && b.leaks === 0, 'OFF: clean direct answer');
console.log(bad === 0 ? '\nALL REAL-MODEL CHECKS PASSED' : `\n${bad} REAL-MODEL CHECK(S) FAILED`);
process.exit(bad === 0 ? 0 : 1);
