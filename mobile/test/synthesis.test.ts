import { LocalLlmDriver } from '../src/engine/localLlm.ts';

async function testAll() {
  await LocalLlmDriver.loadModel('SmolLM2-135M-Instruct-Q4_K_M.gguf');

  const testPrompts = [
    'What is',
    'What is your name',
    'who are you',
    'What is quantum computing',
    'What is React Native',
    'What is SmolLM2',
    'What is GGUF',
    'How to build an offline mobile app',
    'write a python function to calculate fibonacci',
    'plan the architecture',
    'hello',
    'H'
  ];

  for (const prompt of testPrompts) {
    const res = LocalLlmDriver.synthesizeResponse({
      modelFilename: 'SmolLM2-135M-Instruct-Q4_K_M.gguf',
      systemPrompt: 'System context. [Archetype: Empath]',
      userPrompt: prompt,
    });

    console.log(`\n========================================`);
    console.log(`PROMPT: "${prompt}"`);
    console.log(`THOUGHTS:\n${res.thoughts}`);
    console.log(`\nRESPONSE:\n${res.cleanResponse}`);

    if (res.cleanResponse.includes('Received:')) {
      throw new Error(`Found canned echo in prompt: ${prompt}`);
    }
  }

  console.log('\n>>> ALL SYNTHESIS TESTS PASSED WITH 0 CANNED STRINGS! <<<');
}

testAll().catch(e => {
  console.error(e);
  process.exit(1);
});
