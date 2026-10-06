import test from 'node:test';
import assert from 'node:assert/strict';
import { route } from '../gateway.js';
import { groundFile } from '../grounder.js';
import { verifyCitations } from '../critic.js';
import { executeDecision } from '../orchestrator.js';

test('Gateway routes shorthand in < 1ms', () => {
  const res = route('H');
  assert.equal(res.category, 'SPEED_RUN');
  assert.ok(res.latencyMs < 1);
});

test('Gateway routes error logs to DEEP_DEBUG', () => {
  const res = route('Uncaught TypeError: cannot read properties of undefined at app.js:12');
  assert.equal(res.category, 'DEEP_DEBUG');
});

test('Grounder extracts symbols from self', () => {
  const g = groundFile('./gateway.js');
  assert.equal(g.ok, true);
  assert.ok(g.symbols.includes('route'));
});

test('Critic catches hallucinated symbol', () => {
  const g = groundFile('./gateway.js');
  const audit = verifyCitations({ referencedSymbols: ['nonExistentSymbolXYZ'] }, g);
  assert.equal(audit.valid, false);
  assert.ok(audit.violations[0].includes('Hallucinated symbol'));
});

test('Orchestrator rejects ungrounded proposal with human voice', () => {
  const res = executeDecision('fix this function', './gateway.js', {
    referencedSymbols: ['fakeFunction']
  });
  assert.equal(res.status, 'REJECTED_HALLUCINATION');
  assert.ok(typeof res.humanMessage === 'string');
  assert.ok(res.humanMessage.includes('Hold up'));
});
