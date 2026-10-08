# Services API for the UI

What a screen may import from `mobile/src/services/*` (and the types from `src/core/*`). Everything here is observable through
`useSyncExternalStore` hooks; no screen needs to read `core/` internals. All numbers are measured by the engine or clearly
labelled estimates. Verified by unit tests with fakes (`npm test`); nothing here has run on a phone yet (see
`docs/audit/04-validation-core.md`).

## 1. One engine status: `useEngineStatus()`

```ts
import { useEngineStatus, getEngineStatus } from '../services/engine.ts';
const s = useEngineStatus();           // re-renders on any change
```

| Field | Meaning |
|---|---|
| `state` | `'idle' \| 'loading' \| 'warming' \| 'ready' \| 'generating' \| 'error'` |
| `progress` | 0..1 while `loading`; 1 once loaded; 0 otherwise |
| `modelId`, `modelName` | model being loaded / loaded / that failed |
| `backend` | `"CPU"` or `"GPU (...)"` as reported by llama.cpp, `null` until loaded |
| `architecture` | GGUF architecture, e.g. `"qwen35"` |
| `nCtx` | context size in use |
| `lastTokPerSec`, `lastTokens`, `ttftMs` | measured on the most recent generation (the 1-5 token warm-up counts). `null` until a real generation happened. Never invented |
| `loadMs`, `warmupMs` | wall time of the last load / warm-up |
| `ramEstimateMb` | ESTIMATE for this model + context (file + KV + overhead). Label it "about"; `ramTotalMb` = what Android reports |
| `error`, `errorKind`, `errorFix` | plain cause and next step. `errorKind`: `unavailable \| out_of_memory \| bad_file \| unsupported_model \| file_access \| context_full \| busy \| no_output \| unknown` |
| `crashedModelId` | last run died while loading this model (show a banner; `engine.dismissCrashNotice()`) |
| `unloadedReason` | `'memory' \| 'background' \| null`: the model was released on purpose; it reloads on the next message |
| `headline` | one honest sentence for a status chip, e.g. `Ready - Qwen3.5 4B · CPU · 4096 ctx · 14.2 tok/s` |

**"ready" is proven.** The state machine is `idle -> loading(progress) -> warming -> ready`. `warming` is a real 1-5 token generation;
`ready` is only published after it produced tokens. A failure at any step becomes `error` with `errorKind` + `errorFix`, the model is
released and never marked verified. `generating` is set while a chat reply streams.

Raw machine (rarely needed): `useEngineState()`, `engine` (`mount(spec, {force?})`, `unmount()`, `stop()`, `isReady(id?)`, `contextSize()`,
`dismissCrashNotice()`).

## 2. "Test model": `runSelfTest(modelId?, { force? })`

```ts
import { runSelfTest } from '../services/engine.ts';
const r = await runSelfTest('qwen3.5-4b');   // loads the model first if needed (defaults: active model, then recommended)
```

Returns `SelfTestResult` (`core/selfTest.ts`):
`{ ok, modelId, text, tokens, ttftMs, tokPerSec, loadMs (null if it was already loaded), totalMs, backend, nCtx, reasons[], warnings[], fix, errorKind }`.

- Asks "What is 2 + 2? Reply with just the number." (thinking off, temperature 0), so `text` is the real model answer (reasoning markup removed).
- `ok` = the model produced readable text. `reasons` (why it failed) are plain sentences, `fix` is the next step.
- `warnings` = it works but: slower than 3 tok/s ("too slow for comfortable chat"), or the answer to 2 + 2 looked wrong.
- Show the numbers (TTFT, tok/s, backend) next to the button; they are the only honest speed claim the app can make.

## 3. First run in one call

```ts
import { recommendedModel } from '../services/engine.ts';
import { downloadAndLoad, setupRecommended, useSetup } from '../services/setup.ts';

const spec = recommendedModel();               // chosen from REAL device RAM (expo-device); 4B class on a 12 GB phone
const result = await downloadAndLoad('qwen3.5-4b');   // or: await setupRecommended()
```

`downloadAndLoad(modelId, { force? })` = download (or resume, or skip if installed) -> SHA-256 verify -> load -> warm-up proof.
Returns `SetupResult`:

```ts
{ ok: true, alreadyInstalled, tokensPerSecond }
{ ok: false, stage: 'download' | 'load', reason: 'paused' | 'cancelled' | 'error' | 'refused' | 'engine', message, fix?, retryable? }
```

- `reason: 'refused'` = could not start (no storage chosen, another download running). `'paused'`/`'cancelled'` are not errors: the user stopped it.
- Re-calling while the same model is in progress returns the same promise. A second model is refused while one is in progress.
- For a single "Getting ready" screen: `useSetup()` -> `{ modelId, stage: 'downloading' | 'verifying' | 'loading' | 'done' | null, result }`.
  Fine-grained numbers come from `useDownloadState(modelId)` and `useEngineStatus()`.

Recommendation rules (`core/fit.ts#recommendModel`): highest `priority` among models that rate `great`/`ok` on this phone; never an uncensored or <1B model;
unknown RAM -> the "Fast" model; nothing fits -> the smallest. Result: >= 7 GB phones get **Qwen3.5 4B** ("Balanced (default)"), 4-6 GB phones get Qwen3.5 2B.

## 4. Downloads: `services/downloads.ts`

```ts
import { downloads, useDownloadState, useDownloadItems, refreshDownloads } from '../services/downloads.ts';
```

`downloads.start(spec) / pause(id) / cancel(spec) / remove(spec) / stateOf(id) / refresh(specs) / resumeInterrupted(specs)`.
`useDownloadState(id)` returns:

| Field | Meaning |
|---|---|
| `status` | `idle \| resolving \| downloading \| paused \| finalizing \| completed \| error` |
| `bytesWritten`, `totalBytes`, `speedBps`, `etaSec` | live progress. During `finalizing` the same speed/ETA describe the checksum pass |
| `verifyFraction` | 0..1 while the SHA-256 check runs (`finalizing`). `undefined` otherwise |
| `verified` | on `completed`: the file matched the official SHA-256 |
| `note` | transient line, e.g. `Connection lost - retrying (2/4)...`, `Verifying the download (one time) 37%` |
| `error`, `retryable` | for `error`; `retryable` decides whether to offer Try again |

Guarantees (all unit-tested with a fake platform): pause is never "completed"; resume continues at the partial file's byte (Range);
retry with backoff on network errors; 45 s no-bytes watchdog; disk-space precheck; the file is only renamed to its final name
after size == Hub size, GGUF magic and SHA-256 (Hub hash first, catalog hash as fallback) all pass; a mismatch deletes the partial
and reports a retryable error; Cancel/Pause never wait forever on the native layer; a download that was running when the app was
killed resumes automatically at the next launch (`refreshDownloads()` -> `resumeInterrupted`); a download the user paused/cancelled does not.

`finalizing` can take minutes on a phone (pure-JS SHA-256 on Hermes: see risks R2 in `docs/audit/04-validation-core.md`). Show the
progress bar, and allow Pause/Cancel (`actionsFor('finalizing')` now returns `['pause', 'cancel']`). Kill-switch: `DownloadManagerOptions.verifyMode: 'off'` in `services/downloads.ts`.

## 5. Chat and lifecycle

- `services/chat.ts`: unchanged API (`sendMessage`, `regenerate`, `stopGeneration`, `useChatState`...). New behaviour: the user's message is saved the moment it is sent,
  the streaming answer is saved every ~2 s, and all JSON files are written atomically, so an app kill mid-answer keeps the question and the partial answer (reloads as "Stopped").
  The prompt is trimmed with the model's own tokenizer (exact), not a character guess.
- `services/lifecycle.ts`: `bootstrap()` (also installs the memory guard), `recheckStorage()`. The memory guard releases an idle model 45 s after the app goes to the background
  (never during a reply or a load; `inactive` does not count) and immediately on a memory warning. The UI may show `unloadedReason`; the next message reloads automatically.

## 6. Breaking changes since the previous UI code

| Change | Where |
|---|---|
| `MountStage` `'testing'` is now `'warming'` | `EngineState.stage` |
| `ModelSpec` has new required fields `role`, `priority`, `kvBytesPerToken` | `core/catalog.ts` |
| Catalog is 6 models, new ids: `qwen3.5-0.8b`, `qwen3.5-2b`, `qwen3.5-4b` (default), `qwen3-4b-instruct-2507`, `gemma-4-e2b`, `qwen3.5-9b`. No uncensored entries, no Llama/SmolLM/DeepSeek | `core/catalog.ts` |
| Role label for each card: `model.role` (`Smoke test`, `Fast`, `Balanced (default)`, `No-thinking (safe fallback)`, `Different family`, `Max quality (needs 12 GB+)`) | `core/catalog.ts` |
| `MountResult` failure now has `kind` and `fix`; `message` already contains both | `core/engineManager.ts` |
| `EngineState` gained `errorKind`, `errorFix`, `unloadedReason`, `loadMs`, `warmupMs`, `lastTokPerSec`, `lastTokens`, `ttftMs` | `core/engineManager.ts` |
| `DownloadState` gained `verified`, `verifyFraction` | `core/downloadManager.ts` |
| `actionsFor('finalizing')` is `['pause', 'cancel']` (was `[]`) | `core/modelStatus.ts` |
| Fit thresholds: great <= 40%, ok <= 55%, tight <= 70% of RAM (was 45/60/75) | `core/fit.ts` |
