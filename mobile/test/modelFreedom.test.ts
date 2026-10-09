import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeModelFreedom,
  compileModelFreedomDirectives,
  DEFAULT_MODEL_FREEDOM,
} from '../src/core/modelFreedom.ts';

test('modelFreedom: sanitizes arbitrary input safely', () => {
  const f = sanitizeModelFreedom(null);
  assert.deepEqual(f, DEFAULT_MODEL_FREEDOM);

  const custom = sanitizeModelFreedom({
    profanityAndBluntness: 'unfiltered',
    disclaimerPolicy: 'none',
    complexFictionalThemes: false,
  });
  assert.equal(custom.profanityAndBluntness, 'unfiltered');
  assert.equal(custom.disclaimerPolicy, 'none');
  assert.equal(custom.complexFictionalThemes, false);
});

test('modelFreedom: compiles directives suppressing disclaimers and demanding character fidelity', () => {
  const directives = compileModelFreedomDirectives(DEFAULT_MODEL_FREEDOM);
  assert.ok(directives.some((d) => d.includes('Do not add generic disclaimers')));
  assert.ok(directives.some((d) => d.includes('Stay entirely in character')));
  assert.ok(directives.some((d) => d.includes('challenge it directly')));
});
