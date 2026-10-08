/**
 * Shared test harness: runs the REAL llama.rn JavaScript (node_modules/llama.rn/lib/commonjs) under Node with a fake
 * native layer, and stubs the phone-only packages (`react-native`, `expo-file-system`, `expo-device`, ...) so the real
 * `src/services/*` modules can be imported. Import this file FIRST in a test (it registers the module hooks), then
 * dynamically import the app modules. Needs Node >= 22.15 (`module.registerHooks`).
 */
import { createRequire, registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const stubsDir = dirname(fileURLToPath(import.meta.url));
const root = join(stubsDir, '..', '..');
const require_ = createRequire(import.meta.url);

const STUBS: Record<string, string> = {
  'react-native': 'react-native.cjs',
  'expo-file-system': 'expo-file-system.cjs',
  'expo-device': 'expo-device.cjs',
  'expo-intent-launcher': 'misc.cjs',
  'expo-keep-awake': 'misc.cjs',
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    const stub = STUBS[specifier];
    if (stub) return { url: pathToFileURL(join(stubsDir, stub)).href, format: 'commonjs', shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
// llamaEngine.ts calls a bare require('llama.rn'), which Metro provides; here it resolves the real package.
(globalThis as unknown as { require: NodeRequire }).require = require_;

// ---- fake native layer (what the .so installs on `global`)
type Call = unknown[];
export const calls: Record<string, Call[]> = {};
const log = (name: string, args: Call) => { (calls[name] ??= []).push(args); };
export const callsOf = (name: string): Call[] => calls[name] ?? [];

export interface NativeBehavior {
  initError?: Error;
  initLogLines?: Array<[string, string]>;
  tokens: string[];
  formatted: Record<string, unknown>;
  result: Record<string, unknown>;
  tokenCount: number;
  /** Called after the first token of a completion was delivered, while the reply is still "streaming". */
  midStream?: () => void;
  /** Called at the start of a completion, before any token. */
  onCompletionStart?: (params: Record<string, unknown>) => void;
}
export const behavior: NativeBehavior = { tokens: ['Hel', 'lo'], formatted: {}, result: {}, tokenCount: 7 };
let nativeLogHandler: ((level: string, text: string) => void) | null = null;

export const fakeModel = {
  desc: 'Qwen3.5 4B Q4_K_M',
  size: 2_740_937_888,
  nEmbd: 2560,
  nParams: 4_205_751_296,
  is_recurrent: false,
  is_hybrid: true,
  chatTemplates: { llamaChat: true, jinja: { default: true, defaultCaps: { tools: true, toolCalls: true, systemRole: true, parallelToolCalls: false }, toolUse: false } },
  metadata: { 'general.architecture': 'qwen35' },
  isChatTemplateSupported: true,
};

export function resetNative(): void {
  for (const k of Object.keys(calls)) delete calls[k];
  behavior.initError = undefined;
  behavior.initLogLines = undefined;
  behavior.tokens = ['Hel', 'lo'];
  behavior.formatted = {};
  behavior.result = {};
  behavior.midStream = undefined;
  behavior.onCompletionStart = undefined;
  behavior.tokenCount = 7;
}

export function installFakeJsi(): void {
  const src = readFileSync(join(root, 'node_modules', 'llama.rn', 'lib', 'commonjs', 'index.js'), 'utf8');
  const keys = [...(/jsiBindingKeys = \[([^\]]+)\]/.exec(src)?.[1] ?? '').matchAll(/'(llama\w+)'/g)].map((m) => m[1]);
  assert.ok(keys.length >= 38, 'found the list of JSI bindings llama.rn insists on');
  const g = globalThis as unknown as Record<string, unknown>;
  for (const k of keys) g[k] = (...args: Call) => { log(k, args); return Promise.resolve(undefined); };

  g.llamaInitContext = async (contextId: number, params: Record<string, unknown>, progress?: (p: number) => void) => {
    log('llamaInitContext', [contextId, params]);
    for (const [lvl, text] of behavior.initLogLines ?? []) nativeLogHandler?.(lvl, text);
    if (behavior.initError) throw behavior.initError;
    progress?.(0); progress?.(40); progress?.(100);
    return { gpu: false, devices: ['CPU'], reasonNoGPU: 'GPU devices disabled by user', model: fakeModel, androidLib: 'rnllama_jni_v8_2_dotprod_i8mm', systemInfo: '' };
  };
  g.llamaToggleNativeLog = async (enabled: boolean, handler?: (l: string, t: string) => void) => {
    log('llamaToggleNativeLog', [enabled]);
    nativeLogHandler = enabled ? (handler ?? null) : null;
  };
  g.llamaGetBackendDevicesInfo = async () => JSON.stringify([{ backend: 'CPU', type: 'cpu', deviceName: 'CPU', maxMemorySize: 0 }]);
  g.llamaGetFormattedChat = async (contextId: number, messagesJson: string, tmpl: unknown, params: Record<string, unknown>) => {
    log('llamaGetFormattedChat', [contextId, JSON.parse(messagesJson), tmpl, params]);
    return { prompt: '<|im_start|>user\nhi<|im_end|>\n<|im_start|>assistant\n', chat_format: 1, ...behavior.formatted };
  };
  g.llamaCompletion = async (contextId: number, params: Record<string, unknown>, onToken?: (d: { token: string }) => void) => {
    log('llamaCompletion', [contextId, params, { stopSnapshot: [...((params.stop as string[]) ?? [])] }]);
    behavior.onCompletionStart?.(params);
    let first = true;
    for (const t of behavior.tokens) {
      onToken?.({ token: t });
      await Promise.resolve();
      if (first) { first = false; behavior.midStream?.(); }
    }
    return {
      text: behavior.tokens.join(''), content: '', reasoning_content: '', tool_calls: [], chat_format: 1,
      tokens_predicted: behavior.tokens.length, tokens_evaluated: 12, interrupted: false, context_full: false,
      timings: { prompt_ms: 80, predicted_ms: 200, predicted_per_second: 9.5, prompt_n: 12, predicted_n: behavior.tokens.length, cache_n: 0, prompt_per_token_ms: 0, prompt_per_second: 0, predicted_per_token_ms: 0 },
      ...behavior.result,
    };
  };
  g.llamaTokenize = async (_id: number, text: string) => { log('llamaTokenize', [text]); return { tokens: new Array(behavior.tokenCount).fill(1), has_media: false, bitmap_hashes: [], chunk_pos: [], chunk_pos_media: [] }; };
  g.llamaStopCompletion = async (id: number) => { log('llamaStopCompletion', [id]); };
  g.llamaReleaseContext = async (id: number) => { log('llamaReleaseContext', [id]); };
}
installFakeJsi();
