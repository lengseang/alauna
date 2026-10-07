/**
 * "Test model": loads the model if needed, then makes it answer one fixed question and reports what really
 * happened - the text, time to first token, tokens per second - with a pass/fail and plain-language reasons.
 * UI: the Models screen's "Test model" button. All side effects are injected, so it is unit-tested with a fake engine.
 */
import type { ModelSpec } from './catalog.ts';
import type { EngineManager, MountResult } from './engineManager.ts';
import type { EngineErrorKind } from './engineTypes.ts';
import { diagnoseEngineError } from './engineTypes.ts';
import { parseThinking } from './thinking.ts';

export const SELF_TEST_PROMPT = 'What is 2 + 2? Reply with just the number.';
/** Below this the model is "working but too slow for comfortable chat". */
export const SLOW_TOKENS_PER_SECOND = 3;

export interface SelfTestResult {
  ok: boolean;
  modelId: string;
  /** The visible answer (reasoning markup removed). */
  text: string;
  tokens: number;
  ttftMs: number | null;
  tokPerSec: number | null;
  /** Load + warm-up time when this test had to load the model, else null. */
  loadMs: number | null;
  totalMs: number;
  backend: string | null;
  nCtx: number;
  /** Why it failed. Empty when ok. */
  reasons: string[];
  /** Works, but worth knowing (slow, unexpected answer). */
  warnings: string[];
  /** What to do about a failure. */
  fix: string | null;
  errorKind: EngineErrorKind | null;
}

export interface SelfTestDeps {
  engine: Pick<EngineManager, 'state' | 'isReady' | 'mount' | 'generate'>;
  now(): number;
}

function failed(spec: ModelSpec, partial: Partial<SelfTestResult> & { reasons: string[] }, startedAt: number, deps: SelfTestDeps): SelfTestResult {
  return {
    ok: false,
    modelId: spec.id,
    text: '',
    tokens: 0,
    ttftMs: null,
    tokPerSec: null,
    loadMs: null,
    totalMs: deps.now() - startedAt,
    backend: null,
    nCtx: deps.engine.state.nCtx,
    warnings: [],
    fix: null,
    errorKind: null,
    ...partial,
  };
}

export async function runSelfTest(spec: ModelSpec, deps: SelfTestDeps, opts: { force?: boolean } = {}): Promise<SelfTestResult> {
  const { engine } = deps;
  const startedAt = deps.now();
  let loadMs: number | null = null;

  if (!engine.isReady(spec.id)) {
    const m: MountResult = await engine.mount(spec, { force: opts.force });
    if (!m.ok) return failed(spec, { reasons: [m.message], fix: m.fix ?? null, errorKind: m.kind ?? null }, startedAt, deps);
    loadMs = m.loadMs + m.warmupMs;
  }

  let raw = '';
  let result;
  try {
    result = await engine.generate({
      messages: [{ role: 'user', content: SELF_TEST_PROMPT }],
      maxTokens: 48,
      temperature: 0,
      enableThinking: false,
      onText: (t) => {
        raw = t;
      },
    });
  } catch (e) {
    const d = diagnoseEngineError(e);
    return failed(spec, { reasons: [d.message], fix: d.fix, errorKind: d.kind, loadMs }, startedAt, deps);
  }

  const parsed = parseThinking(result.text || raw);
  const text = (parsed.answer || parsed.reasoning).trim();
  const tokPerSec = result.tokensPerSecond || (result.predictedMs > 0 ? (result.generatedTokens * 1000) / result.predictedMs : 0) || null;
  const info = engine.state.info;

  const reasons: string[] = [];
  if (result.generatedTokens <= 0) reasons.push('The model produced no tokens.');
  else if (!text) reasons.push('The model produced tokens but no readable text.');
  if (result.interrupted) reasons.push('The test was interrupted before it finished.');

  const warnings: string[] = [];
  if (reasons.length === 0) {
    if (!/\b4\b|four/i.test(text)) warnings.push(`The answer to 2 + 2 looked wrong ("${text.slice(0, 40)}"). The engine works, but this model may be weak.`);
    if (tokPerSec !== null && tokPerSec < SLOW_TOKENS_PER_SECOND) {
      warnings.push(`Only ${tokPerSec.toFixed(1)} tokens per second: too slow for comfortable chat. Try a smaller model or a smaller context.`);
    }
  }

  return {
    ok: reasons.length === 0,
    modelId: spec.id,
    text,
    tokens: result.generatedTokens,
    ttftMs: result.ttftMs ?? null,
    tokPerSec: tokPerSec === null ? null : Number(tokPerSec.toFixed(1)),
    loadMs,
    totalMs: deps.now() - startedAt,
    backend: info?.backend ?? null,
    nCtx: engine.state.nCtx,
    reasons,
    warnings,
    fix: reasons.length > 0 ? 'Try another model, or delete this one and download it again.' : null,
    errorKind: reasons.length > 0 ? 'no_output' : null,
  };
}
