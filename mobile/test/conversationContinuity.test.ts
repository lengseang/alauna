import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isMessageCutOff,
  hasUnclosedCodeBlock,
  closeUnclosedMarkup,
  preparePriorTextForContinuation,
  stripContinuationPreamble,
  stripRedundantCodeFence,
  buildContextContinuityAnchor,
  CONTINUATION_DIRECTIVE,
} from '../src/core/conversationContinuity.ts';
import { buildPrompt } from '../src/core/chatPrompt.ts';
import { runAssistantTurn, type TurnInput } from '../src/core/chatTurn.ts';
import { getModel } from '../src/core/catalog.ts';
import type { GenerateParams, GenerateResult } from '../src/core/engineTypes.ts';
import type { ChatMessage } from '../src/core/chatTypes.ts';

const plain = getModel('qwen3-4b-instruct-2507')!;

function mockRes(over: Partial<GenerateResult> = {}): GenerateResult {
  return {
    text: '',
    promptTokens: 20,
    generatedTokens: 5,
    promptMs: 100,
    predictedMs: 500,
    tokensPerSecond: 10,
    interrupted: false,
    contextFull: false,
    thinkingForcedOpen: false,
    ...over,
  };
}

function streamer(chunks: string[], over: Partial<GenerateResult> = {}) {
  const seen: GenerateParams[] = [];
  const generate = async (p: GenerateParams): Promise<GenerateResult> => {
    seen.push(p);
    let acc = '';
    for (const c of chunks) {
      acc += c;
      p.onText(acc);
    }
    return mockRes({ text: acc, ...over });
  };
  return { generate, seen };
}

test('isMessageCutOff: identifies stopped status, contextFull, and token budget exhaustion', () => {
  // User messages never cut off
  assert.equal(isMessageCutOff({ role: 'user', text: 'hello' }), false);

  // Empty text cannot continue
  assert.equal(isMessageCutOff({ role: 'assistant', text: '' }), false);

  // Explicit stop or interrupt
  assert.equal(isMessageCutOff({ role: 'assistant', text: 'Here is', status: 'stopped' }), true);
  assert.equal(isMessageCutOff({ role: 'assistant', text: 'Here is', interrupted: true }), true);

  // Context full ceiling
  assert.equal(isMessageCutOff({ role: 'assistant', text: 'Here is the answer.', contextFull: true }), true);

  // Token budget hit
  assert.equal(isMessageCutOff({ role: 'assistant', text: 'Here is', generatedTokens: 512, maxTokens: 512 }), true);
  assert.equal(isMessageCutOff({ role: 'assistant', text: 'Here is', generatedTokens: 509, maxTokens: 512 }), true);

  // Clean finish
  assert.equal(isMessageCutOff({ role: 'assistant', text: 'Here is the answer.' }), false);
  assert.equal(isMessageCutOff({ role: 'assistant', text: 'Is this clear?' }), false);
  assert.equal(isMessageCutOff({ role: 'assistant', text: 'Done!' }), false);
  assert.equal(isMessageCutOff({ role: 'assistant', text: '**Important note**' }), false);
  assert.equal(isMessageCutOff({ role: 'assistant', text: '```ts\nconst x = 1;\n```' }), false);

  // Abrupt cutoffs mid-sentence or mid-word
  assert.equal(isMessageCutOff({ role: 'assistant', text: 'Here is the funct' }), true);
  assert.equal(isMessageCutOff({ role: 'assistant', text: 'To do this, first,' }), true);
});

test('hasUnclosedCodeBlock & closeUnclosedMarkup: detects and repairs unclosed code blocks', () => {
  assert.equal(hasUnclosedCodeBlock('Plain text without code'), false);
  assert.equal(hasUnclosedCodeBlock('```js\nconsole.log(1);\n```'), false);
  assert.equal(hasUnclosedCodeBlock('Here is code:\n```python\ndef add(a, b):\n    return a + b'), true);

  // Multiple blocks
  assert.equal(hasUnclosedCodeBlock('```js\n1\n```\ntext\n```py\n2\n```'), false);
  assert.equal(hasUnclosedCodeBlock('```js\n1\n```\ntext\n```py\n2'), true);

  // closeUnclosedMarkup
  const unclosed = '```ts\nconst x = 42;';
  assert.equal(closeUnclosedMarkup(unclosed), '```ts\nconst x = 42;\n```');

  const closed = '```ts\nconst x = 42;\n```';
  assert.equal(closeUnclosedMarkup(closed), closed);
});

test('preparePriorTextForContinuation: strips artificial fences when resuming', () => {
  const closedArtificially = '```python\ndef run():\n    pass\n```';
  // If text ended with \n``` and without that it was an unclosed code block:
  const prepared = preparePriorTextForContinuation(closedArtificially);
  assert.equal(prepared, '```python\ndef run():\n    pass');

  // Normal text without trailing fence remains untouched
  assert.equal(preparePriorTextForContinuation('Just some normal text'), 'Just some normal text');
});

test('stripContinuationPreamble: removes leading conversational filler on resume', () => {
  assert.equal(
    stripContinuationPreamble('Sure! Here is the continuation of the code:\ndef add(a, b):'),
    'def add(a, b):',
  );
  assert.equal(
    stripContinuationPreamble('Continuing from where I left off:\n\nresult = compute()'),
    'result = compute()',
  );
  assert.equal(
    stripContinuationPreamble('Here is the rest:\nreturn total'),
    'return total',
  );
  assert.equal(
    stripContinuationPreamble('def add(a, b):\n    return a + b'),
    'def add(a, b):\n    return a + b',
  );
});

test('stripRedundantCodeFence: strips duplicate opening fence when resuming inside a code block', () => {
  const priorWithOpenFence = 'Here is the code:\n```python\ndef calculate():\n';
  const continuationWithRedundantFence = '```python\n    return 42\n```';

  const cleaned = stripRedundantCodeFence(continuationWithRedundantFence, priorWithOpenFence);
  assert.equal(cleaned, '    return 42\n```');

  // When prior text did not leave an open fence, does not strip
  const priorClosed = 'Here is the code:\n```python\ndef calculate(): pass\n```';
  assert.equal(stripRedundantCodeFence(continuationWithRedundantFence, priorClosed), continuationWithRedundantFence);
});

test('buildContextContinuityAnchor: generates compact bounded summaries with hierarchical roots', () => {
  assert.equal(buildContextContinuityAnchor([]), null);

  const history = [
    { role: 'user' as const, content: 'I need to build an offline chat app called Chiwiwi' },
    { role: 'assistant' as const, content: 'Understood. We will use llama.rn and React Native.' },
    { role: 'user' as const, content: 'Now let us configure the storage vault' },
    { role: 'assistant' as const, content: 'Configured the vault at document directory.' },
    { role: 'user' as const, content: 'What about speech recognition?' },
    { role: 'assistant' as const, content: 'We integrated whisper.rn.' },
  ];

  const anchor = buildContextContinuityAnchor(history, 150);
  assert.ok(anchor);
  assert.ok(anchor.includes('[Context Continuity Anchor'));
  // Preserves original topic root
  assert.ok(anchor.includes('Chiwiwi'));
  // Preserves recent context
  assert.ok(anchor.includes('speech recognition'));
});

test('buildPrompt: injects context continuity anchor into effectiveSystem when history is pruned', () => {
  const history = [
    { role: 'user' as const, content: 'Question 1: Explain thermodynamics in depth. ' + 'Thermodynamics explores heat and work across systems. '.repeat(6) },
    { role: 'assistant' as const, content: 'Here is the full breakdown of thermodynamic principles across laws 0 through 3. '.repeat(6) },
    { role: 'user' as const, content: 'Question 2: Explain entropy. ' + 'Entropy describes unavailable thermal energy. '.repeat(6) },
    { role: 'assistant' as const, content: 'Entropy is a measure of molecular disorder and microstates. '.repeat(6) },
  ];

  // Tiny nCtx forces pruning
  const built = buildPrompt({
    system: 'You are an AI physics tutor.',
    history,
    userMessage: 'Question 3: Explain enthalpy.',
    nCtx: 256,
    replyBudget: 64,
  });

  assert.ok(built.droppedMessages > 0, 'Older messages should be dropped due to small context budget');
  assert.ok(built.continuityAnchor, 'Continuity anchor should be generated');
  const systemMsg = built.messages.find((m) => m.role === 'system');
  assert.ok(systemMsg);
  assert.ok(systemMsg.content.includes('[Context Continuity Anchor'));
  assert.ok(systemMsg.content.includes('thermodynamics'));
});

test('runAssistantTurn: continuation seamlessly merges tokens and tracks canContinue', async () => {
  const s = streamer(['def calculate(a, b):\n', '    return a + b\n']);
  const updates: Array<Partial<ChatMessage>> = [];
  let t = 0;

  const inp: TurnInput = {
    history: [
      { role: 'user', content: 'write a python function' },
      { role: 'assistant', content: 'Here is the code:\n```python\n' },
    ],
    userText: CONTINUATION_DIRECTIVE,
    attachments: [],
    spec: plain,
    nCtx: 2048,
    system: 'System prompt',
    thinkingEnabled: false,
    continuation: {
      priorText: 'Here is the code:\n```python\n',
    },
    generate: s.generate,
    now: () => (t += 1000),
    onUpdate: (p) => updates.push(p),
  };

  const outcome = await runAssistantTurn(inp);
  assert.equal(outcome.status, 'done');
  assert.ok(outcome.text.includes('Here is the code:\n```python\ndef calculate(a, b):\n    return a + b\n'));
  assert.ok(outcome.rawText?.includes('Here is the code:\n```python\ndef calculate(a, b):\n    return a + b\n'));
});

test('runAssistantTurn: cancellation resilience rescues streamed tokens on native abort error', async () => {
  const generateAborted = async (p: GenerateParams): Promise<GenerateResult> => {
    // Stream partial tokens before aborting
    p.onText('First partial answer line\n```ts\nconst val = 1;');
    throw new Error('Completion stopped');
  };

  const updates: Array<Partial<ChatMessage>> = [];
  let t = 0;

  const inp: TurnInput = {
    history: [],
    userText: 'Write code',
    attachments: [],
    spec: plain,
    nCtx: 2048,
    system: 'SYS',
    thinkingEnabled: false,
    generate: generateAborted,
    now: () => (t += 1000),
    onUpdate: (p) => updates.push(p),
  };

  const outcome = await runAssistantTurn(inp);
  // Status must be stopped, NOT error
  assert.equal(outcome.status, 'stopped');
  // Partial streamed text preserved
  assert.ok(outcome.rawText?.includes('First partial answer line'));
  // Unclosed markdown code fence cleanly repaired for display
  assert.ok(outcome.text.endsWith('\n```'));
  // canContinue is enabled
  assert.equal(outcome.canContinue, true);
  assert.equal(outcome.notice, 'Stopped by user.');
});
