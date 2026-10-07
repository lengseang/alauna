# 04 - Validation of the non-UI layer (core, services, tests, build config)

Date 2026-10-08. Scope: `mobile/src/core/**`, `mobile/src/services/**`, `mobile/test/**`, `mobile/plugins/**`, `mobile/eas.json`, `scripts/**`, `docs/BUILDING.md`.
Method: read every file; read the installed `llama.rn` 0.12.9 and `expo-file-system` 57.0.7 sources (JS, C++, Kotlin); fetched the GGUF headers of the
catalog models from the Hub; ran everything that can run on a PC; wrote tests for every defect found and mutation-checked the important ones
(removing a fix makes its test fail). **Nothing here has run on a phone.** Anything that depends on the phone is tagged `UNVERIFIED-needs-device`.

## 0. Results (exact)

| Command | Result |
|---|---|
| `cd mobile && npm run check` (typecheck app, typecheck tests, unit tests) | **exit 0.** `# tests 164 # pass 164 # fail 0 # cancelled 0`, 12 s. (Was 96 on arrival.) |
| `npx expo export --platform android` | **exit 0.** `Android Bundled 851 modules`, Hermes bytecode `index-*.hbc` 2.1 MB. Proves the JS compiles under Metro/Hermes |
| `npx expo prebuild --platform android --no-install --clean` (config-plugin dry run, output deleted afterwards) | **exit 0.** Merged manifest: INTERNET, MANAGE_EXTERNAL_STORAGE, READ/WRITE_EXTERNAL_STORAGE (maxSdk 32), VIBRATE, `SYSTEM_ALERT_WINDOW` removed, `uses-native-library libOpenCL.so / libcdsprpc.so required=false` (llama.rn plugin). `gradle.properties`: `reactNativeArchitectures=arm64-v8a`, `newArchEnabled=true`, `hermesEnabled=true`, `org.gradle.caching=true`, `-Xmx3g`. Splash resources generated (light + night) |
| `npx expo-doctor` | **20/21.** One failure: `expo` is 57.0.26, SDK expects `~57.0.27` (patch). Lives in `package.json` (not in my ownership): run `npx expo install expo@~57.0.27` before the EAS build |
| `node scripts/verify-catalog.mjs` (on this Windows box) | **Catalog OK, 6/6**: repo ungated, exact size, LFS sha256, and a `Range: bytes=0-3` request on the real download URL answers 206 with the right total and the bytes `GGUF`. `--write` is idempotent |
| `scripts/real-model-check.mjs` | not run (needs `node-llama-cpp` and a 1 GB model) |
| Gradle / native build, install, run | not done (no SDK here, no phone) |

## 1. Verdict per module

`VERIFIED-test` = unit/contract/flow test with fakes, passing. `VERIFIED-read` = read against the installed sources and typechecked, no test. `UNVERIFIED-device` = needs the phone.

| Module | Verdict | Evidence / what is still open |
|---|---|---|
| `core/catalog` | VERIFIED-test + live Hub | 6 entries, real sha256, Range+magic checked today, architectures present in llama.cpp b10256 (`llama-arch.cpp`: `qwen3`, `qwen35`, `gemma4`). Whether each model *loads* on the S23U: UNVERIFIED-device |
| `core/fit` | VERIFIED-test; numbers UNVERIFIED-device | RAM comes from `expo-device` `totalMemory` (real OS value). KV bytes/token read from each GGUF header. Thresholds and 600 MB overhead are estimates, never measured |
| `core/engineManager` | VERIFIED-test (22) | load -> **warm-up of 5 tokens** -> ready; crash marker; release on background |
| `core/engineTypes` | VERIFIED-test | `diagnoseEngineError`: llama.cpp messages -> cause + fix |
| `core/engineStatus`, `selfTest`, `setup`, `memoryGuard` | VERIFIED-test | new in this pass |
| `core/downloadManager` | VERIFIED-test (35) against a fake platform | native behaviour: UNVERIFIED-device (read against Kotlin source, see 2.4) |
| `core/chatPrompt`, `chatTurn`, `chatTypes`, `thinking`, `persona`, `memory`, `markdown`, `settingsModel`, `modelStatus`, `hf`, `gguf`, `paths`, `format`, `speedMeter`, `store`, `sha256`, `atomicFile` | VERIFIED-test | `sha256` equals `node:crypto` for 0..300 byte lengths and awkward chunking; **speed on Hermes: UNVERIFIED-device** (risk R2) |
| `services/llamaEngine` | VERIFIED-test (9 contract tests on the REAL llama.rn JS, fake native layer) | what llama.cpp does with the parameters: UNVERIFIED-device |
| `services/chat`, `engine`, `settings`, `storage` (internal mode), `chatStore`, `memory`, `lifecycle`, `downloads` | VERIFIED-test (9 full-stack flow tests: real services + real llama.rn JS + in-memory file system + fake phone) | real expo-file-system / AppState behaviour: UNVERIFIED-device |
| `services/setup` | VERIFIED-read (core logic is tested) | |
| `services/downloadPlatform`, `modelLibrary` (`hashFile`, `deepVerify`) | VERIFIED-read | native resume, rename, time-sliced hashing: UNVERIFIED-device |
| `services/storage` (external folder, All-files-access, picker) | VERIFIED-read; path mapping VERIFIED-test | picker, permission screen, probe on shared storage: UNVERIFIED-device |
| `services/device`, `hfClient` | `hfClient` VERIFIED-test (fake fetch); `device` VERIFIED-read | `expo-device` field names checked in its type definitions |
| `eas.json`, `plugins/withGradleSpeed.js`, `app.json` plugins | VERIFIED by prebuild dry run + `config.test.ts` | an actual EAS build: not done |

## 2. What was verified, by topic

### 2.1 Every llama.rn call (task 1) - against the installed `llama.rn` 0.12.9 JS and C++

| Our call | Checked against | Result |
|---|---|---|
| `initLlama({ model, n_ctx, n_batch, n_ubatch, use_mlock, n_threads?, devices \| n_gpu_layers }, onProgress)` | `ContextParams` type (now enforced with `Pick<ContextParams,...>`), `initLlama` in `src/index.ts`, `parseCommonParams` in `cpp/jsi/JSIParams.cpp` | Names correct. `file://` stripped by llama.rn. **Progress is an integer 0..100** (`(int)(progress*100)`) and llama.rn calls it with 0 first and 100 last: we divide by 100. Defaults I confirmed: `n_parallel` 1 (so the whole `n_ctx` belongs to our one sequence), `kv_unified` false, `ctx_shift` false (a prompt >= `n_ctx` is refused with "Context is full"), `use_mmap` true, flash attention AUTO, `n_batch` 2048 / `n_ubatch` 512 -> we set 512/512 for phone-sized compute buffers |
| CPU only: `devices: ['CPU']` | `configureBackendDevices` / `buildDeviceOverrides` in `cpp/jsi/RNLlamaJSI.cpp`: matches `lm_ggml_backend_dev_name == "CPU"` | Correct. GPU opt-in sends `n_gpu_layers: 99` and no `devices` (README: OpenCL needs `n_gpu_layers > 0`) |
| `completion({ messages, n_predict, temperature, top_k, top_p, min_p, penalty_repeat, stop, jinja, enable_thinking, reasoning_format:'none' }, cb)` | `CompletionParams`, `completion()` in `src/index.ts` | Names correct. llama.rn renders the model's own jinja template (`getFormattedChat`), copies `chat_format`, grammar, `thinking_forced_open`, `additional_stops` into the native params. Callback gets `{ token }` (raw piece, special tokens included) |
| Result fields `tokens_evaluated`, `tokens_predicted`, `timings.prompt_ms/predicted_ms/predicted_per_second`, `interrupted`, `context_full` | `NativeCompletionResult` | Correct |
| `getFormattedChat(...).thinking_forced_open` | `isThinkingForcedOpen` in `RNLlamaJSI.cpp` | Correct: true when the generation prompt contains the thinking start tag with no later end tag |
| `stopCompletion()` | `index.ts` -> `llamaStopCompletion` | resolves the running `completion` with `interrupted: true` |
| `release()` | `llamaReleaseContext` | once per context; our adapter nulls its handle first so a second call is a no-op |
| `tokenize(formatted.prompt)` for exact prompt size | `index.ts` | used by `countPromptTokens` |
| Native log capture during load (`addNativeLogListener`, `toggleNativeLog`) | `index.ts`, `logToJsCallback` levels `error/warn/info` | needed because every load failure throws only `"Failed to load model"` |
| Android plugin `llama.rn` | `src/expo-plugin/withLlamaRN.ts` + prebuild dry run | adds two optional `uses-native-library` entries (harmless for CPU use); iOS parts are skipped |
| `arm64-v8a` only | `android/src/main/jniLibs` contains only `arm64-v8a` and `x86_64`; `RNLlama.java` picks the best of 7 arm64 variants by CPU features (dotprod, i8mm, hexagon+opencl) with a fallback chain | Correct: no armeabi-v7a library exists, so a 4-ABI build would compile for nothing |

Chat templates read from the real GGUF headers (Range requests, 16-24 MB each):
- **Qwen3.5** (0.8B/2B/4B/9B, arch `qwen35`, hybrid: attention only every 4th layer): generation prompt is `<|im_start|>assistant\n<think>\n` when `enable_thinking is true`, else `<think>\n\n</think>\n\n`. So with thinking on the output starts *inside* the reasoning and only contains `</think>`: our `thinkingForcedOpen` path is exactly right. History turns are rendered without reasoning. A system message must be first (we do that).
- **Qwen3-4B-Instruct-2507** (arch `qwen3`): plain ChatML, no thinking.
- **Gemma 4 E2B** (arch `gemma4`): turns end with `<turn|>` (EOS id 106), thinking is `<|channel>thought ... <channel|>` and only appears when `enable_thinking` injects `<|think|>`; we always send `enable_thinking:false` for this entry. Parser now understands those markers anyway.

### 2.2 Catalog (task 3)

All six: repo ungated, Apache-2.0, `resolve/main` answers `206`, `Content-Range` total equals the size, first bytes `GGUF`, LFS sha256 from the tree API. Estimates for a 12 GB S23U (`totalMemory` ~11.2 GB, context 4096):

| id | Role | File | Bytes | sha256 | Arch | KV B/token | Est. RAM | Fit |
|---|---|---|---|---|---|---|---|---|
| `qwen3.5-0.8b` | Smoke test | `unsloth/Qwen3.5-0.8B-GGUF` `Qwen3.5-0.8B-Q4_K_M.gguf` | 532,517,120 | `bd258782...dc517` | qwen35 | 12,288 | 1.21 GB | great |
| `qwen3.5-2b` | Fast | `unsloth/Qwen3.5-2B-GGUF` `Qwen3.5-2B-Q4_K_M.gguf` | 1,280,835,840 | `aaf42c8b...699223` | qwen35 | 12,288 | 2.00 GB | great |
| `qwen3.5-4b` | **Balanced (default)** | `unsloth/Qwen3.5-4B-GGUF` `Qwen3.5-4B-Q4_K_M.gguf` | 2,740,937,888 | `00fe7986...ef11a4` | qwen35 | 32,768 | 3.61 GB | great |
| `qwen3-4b-instruct-2507` | No-thinking (safe fallback) | `unsloth/Qwen3-4B-Instruct-2507-GGUF` `...-Q4_K_M.gguf` | 2,497,281,120 | `3605803b...c67e597` | qwen3 | 147,456 | 3.83 GB | great |
| `gemma-4-e2b` | Different family | `unsloth/gemma-4-E2B-it-GGUF` `gemma-4-E2B-it-Q4_K_M.gguf` | 3,106,738,272 | `740185b2...c34b8` | gemma4 | 40,000 (rounded up) | 4.03 GB | great |
| `qwen3.5-9b` | Max quality (needs 12 GB+) | `unsloth/Qwen3.5-9B-GGUF` `Qwen3.5-9B-Q4_K_M.gguf` | 5,680,522,464 | `03b74727...b7e8` | qwen35 | 32,768 | 6.70 GB | **tight** |

(Full hashes are in `mobile/src/core/catalog.ts`.) Recommendation by real RAM: 3.6 GB -> Qwen3.5 2B; 5.4 GB -> 2B; 7.3 GB -> **4B**; 11.2 GB -> **4B**; 15 GB -> 4B. The 9B is never recommended and rates "tight" on the 12 GB phone. The old recommender ("largest model rated ok") picked an 8B on this phone.

### 2.3 Device RAM
`services/device.ts` reads `expo-device` `totalMemory` (Android `ActivityManager.MemoryInfo.totalMem`), `supportedCpuArchitectures`, `platformApiLevel`: no model-name guessing (the old app profiled an S23U as 6 GB). `fit.ts` and `engineManager.contextSize()` consume that number. A "12 GB" phone reports ~11.2 GB; the test suite uses that. Whether `totalMemory` really returns ~11.2 GB on the S23U: UNVERIFIED-device (step 2 of the checklist prints it).

### 2.4 Downloads, adversarially

| Scenario | Result |
|---|---|
| Pause | Never "completed" (test). Native pause sets a flag and cancels the OkHttp call; the Kotlin read loop resolves `null` on both of its exits (`FileSystemDownloadTask.kt`) |
| **Cancel** | **Defect.** The Kotlin loop does `if (isCancelling) return` *without resuming the coroutine*, so the JS promise of a cancelled transfer may never settle (race: depends on whether the loop or the socket-close exception sees the flag first). `DownloadManager.cancel()` awaited it -> "Cancel" could hang forever and leak keep-awake. **Fixed**: bounded wait (`stopGraceMs`, 4 s) then the run is abandoned; same for Pause/Resume. Tests use a task that ignores pause and cancel |
| Resume via Range | Android `resume` truncates the file to the given offset and appends the 206 body; offset = partial file length, so it also survives app restarts; `Range: bytes=N-` equal to the file size gives 416, handled as "already complete". A 200 answer (server ignored Range) restarts from 0 natively. CDN behaviour confirmed again today: `Range: bytes=0-3` -> 206, `Content-Range: bytes 0-3/<size>` |
| Process kill / swipe away | Native thread dies with the process. **Added** `chiwiwi_downloads.json` (app-private): the ids of in-flight downloads; `refreshDownloads()` at startup calls `resumeInterrupted()` which continues only downloads that were running (never ones the user paused/cancelled) from the partial file. There is **no foreground service**, so a long download with the app in the background can be frozen or killed by Android; the 45 s no-bytes watchdog restarts a frozen transfer, the intent file restarts a killed one at the next launch |
| Network drop | 4 retries with 2/5/10/20 s backoff, budget refills after 8 MiB, HTTP 4xx permanent, 416 self-heals (existing tests) |
| Disk space | Pre-check = missing bytes + 50 MB, against `Paths.availableDiskSpace` (internal and `/storage/emulated/0` only; unknown elsewhere -> check skipped) |
| **SHA-256** | **Defect (audit 01 bug class, still present in the rebuild):** it only ran if the user tapped "Check file integrity". **Fixed**: `finalize()` now hashes the `.part` file (Hub hash first, catalog hash as fallback) and only then renames it; mismatch deletes the partial and reports a retryable error; progress/ETA are published; Pause/Cancel work during the check. Policy knob `verifyMode: 'always' \| 'off'` |
| GGUF magic + exact size | before the hash and before the rename (existing, kept) |
| Atomic install | `rename` of `.part` to the final name inside one directory; a kill between "delete old" and "rename" leaves a complete `.part` that the next Resume finalizes |

### 2.5 Engine lifecycle
- `mount`: verify file -> RAM fit -> crash marker written (and flushed) -> `release()` previous -> `initLlama` -> **warm-up generation (5 tokens)** -> only then `ready`. Every failure path releases the context, clears the marker and publishes `errorKind` + `errorFix`.
- Unload during a load no longer resurrects the model (B7). `releaseIdle` flips the state *before* the native release so a message sent at that instant reloads instead of hitting a dying context.
- Background: `MemoryGuard` (45 s after `AppState` = `background`, immediately on `memoryWarning`; never during a reply or load; `inactive` ignored). RN's Android `memoryWarning` delivery is not guaranteed; the background timer is the dependable path. JS timers while the process is frozen: they pause with the process (acceptable: a frozen process is the OS's problem anyway).
- Crash marker only detects kills **during loading**. A kill during generation or while backgrounded produces a cold start with no explanation (the chat itself is now safe, see B9).

### 2.6 Chat
- History is trimmed to `n_ctx - replyBudget` with a conservative estimator and then **re-trimmed with the model's exact token count** (`tokenize` of the template-rendered prompt) up to 3 rounds. Reply budget 40% of `n_ctx` (60% when thinking). System prompt + persona + memories come first; sliding window drops the oldest turns and tells the user.
- Stop: `stopCompletion()` -> partial text kept, status `stopped`. Regenerate replaces the last failed/stopped turn without duplicating the question (flow test).
- Thinking: `<think>`, `<thinking>`, Gemma 4 `<|channel>thought`, pre-opened block (from the template flag **and**, new, from a stray closing tag if the flag is missing); leaked control tokens stripped.
- Persistence: user message saved the moment it is sent, partial answer every 2 s, all JSON written atomically (tmp + rename, with recovery of a lone `.tmp`). Incognito is never written.

## 3. Bugs found and fixed (each has a test)

| # | Sev | Defect | Fix |
|---|---|---|---|
| B1 | high | `llama.rn` **pushes the template's extra stop strings into the `stop` array it is given**. We passed a module-level constant, so stops accumulated across calls and leaked from one model to the next | pass a fresh copy per call; contract test calls three times |
| B2 | high | A load failure surfaces only as `"Failed to load model"`: the user could not tell memory from a bad file from an unsupported architecture | capture llama.cpp error/warn lines during load (`EngineLoadError`), classify (`diagnoseEngineError`): `out_of_memory`, `bad_file`, `unsupported_model`, `file_access`, ... each with a fix sentence |
| B3 | high | "Cancel" (and possibly Pause) could wait forever on a native task that never settles | bounded wait + abandon (see 2.4) |
| B4 | high | SHA-256 was never enforced | mandatory in `finalize()` (2.4) |
| B5 | high | A download killed with the app needed the user to find it and press Resume | intent file + `resumeInterrupted()` |
| B6 | high | Recommender picked the largest "ok" model: Qwen3 8B (est. 6.2 GB) on the 12 GB phone | explicit `priority` per model, 4B default; per-model KV bytes from GGUF headers; thresholds 40/55/70% |
| B7 | med | `unmount()` during a load: the load finished afterwards and the model came back | `unmount` awaits the load |
| B8 | high | Token estimate `chars/3.2` under-counts Khmer, CJK, digits and code by 2-5x -> "Context is full" errors | conservative per-character estimator + exact recount with the model tokenizer (up to 3 trim rounds) |
| B9 | high | Killing the app mid-answer lost the whole turn, and non-atomic writes would have made frequent saves *less* safe | save at send + every 2 s + atomic writes (`core/atomicFile.ts`) for chats, settings, memory |
| B10 | med | Nothing released the model when the app went to the background or memory was low | `MemoryGuard` |
| B11 | med | `contextOverride` had no upper bound (a hand-edited `1e9` would allocate gigabytes) | clamp to 32768 |
| B12 | med | `scripts/verify-catalog.mjs` could not start on Windows (bare path to `import()`), and on Node < 22.18 needs a flag for `.ts` | `pathToFileURL`, self re-launch with the flag; also checks the real download URL |
| B13 | med | Parser: if the engine does not report a pre-opened `<think>` the reasoning leaked into the answer with a raw `</think>`; Gemma 4 thought channel and `<turn|>` leaked | stray close tag handled; Gemma 4 markers added |
| B14 | med | `eas.json` `development` profile did not set `developmentClient: true`: the APK would have no launcher to enter the Metro URL | set; test added |
| B15 | low | A card in `finalizing` had no buttons; with the SHA pass that can be minutes | Pause/Cancel offered |
| B16 | low | Old catalog: 21 entries incl. Llama/SmolLM/DeepSeek/uncensored variants, no roles | 6 entries with plain-language roles |
| B17 | info | `config.test.ts` asserted a black splash; the new theme ships a warm light splash + dark variant | test now asserts "dark variant is dark, light is not template white" |

## 4. ON-DEVICE SMOKE TEST (owner checklist, after installing the EAS development-client APK)

Prepare: PC runs `npx expo start --dev-client` (docs/BUILDING.md 1.8), phone on the same Wi-Fi, app opened from the launcher. If something fails, copy the **exact red/orange message** from the app and, for native crashes, `adb logcat | findstr /i "rnllama ggml llama ReactNativeJS"` (wireless adb, BUILDING 1.7).

| # | Do this | Expected | If not: how to read it |
|---|---|---|---|
| 1 | Launch the app | Splash then onboarding, no red screen. Metro terminal prints the bundle once | Red "Unable to load script": Metro unreachable (firewall, `--tunnel`). Red JS error: send the stack |
| 2 | Onboarding device card | Shows `Samsung SM-S918B`, Android 14 (or yours), **~11.2 GB RAM**, `arm64-v8a`; "best fit" = **Qwen3.5 4B**, context 4096 | RAM missing/wrong: `expo-device` returned null -> fit logic runs in "unknown" mode; report it |
| 3 | Choose **App storage** | Gate opens, Model Hub appears | Error text names the failing step (probe write/read) |
| 4 | Download **Qwen3.5 0.8B** (532 MB) | `Contacting Hugging Face` -> `Downloading` with MB, MB/s, ETA moving -> `Verifying the download (one time) N%` -> `Installed · Checksum OK` | Stuck at 0 with "No internet": network. `HTTP 4xx`: catalog entry stale (`node scripts/verify-catalog.mjs`). `does not match the official checksum`: corrupt file was deleted, tap Try again; if it repeats, report |
| 5 | **Note how long "Verifying" took** (stopwatch) | 532 MB: expect minutes, not seconds (pure JS on Hermes, risk R2). UI stays responsive, Pause works | If >10 min for this file: set `verifyMode: 'off'` in `services/downloads.ts` (one line) and tell me the time |
| 6 | Tap **Load & use** on the 0.8B | `Checking file` -> `Loading into memory N%` -> `Testing first words...` -> **Active · Verified** with `tok/s` and `TTFT` | Error card shows cause + fix: `not enough free memory` (close apps), `does not know this model type` (llama.rn too old for the arch: use Qwen3 4B Instruct), `damaged` (delete + redownload), `could not open the model file` (storage permission) |
| 7 | Tap **Test model** (Models screen) | `Passed`: answer text (e.g. "4"), TTFT in ms, tok/s, backend `CPU` | A warning "too slow" is information; `produced no tokens` = engine loads but cannot generate: native problem, send logcat |
| 8 | Chat: send "hello", then "what did I just say?" | Streaming text; second answer refers to the first; footer shows tok/s | Empty reply error: send the model + message. Garbled text: tokenizer/template problem, try Qwen3 4B Instruct |
| 9 | Press **Stop** during a long answer | Stops within ~1 s, message marked Stopped, text kept | Hang = native `stopCompletion` problem |
| 10 | Force-stop the app (swipe away) while an answer streams, reopen | The chat is there with your question; the unfinished answer shows **Stopped** | Question missing = save path broken (B9) |
| 11 | Download **Qwen3.5 4B** (2.7 GB), after ~20%: switch to another app for 3 min, come back | Progress continued, or "Connection lost - retrying", or Paused at N% and **resumes by itself** | Note which: continued / auto-resumed / needed manual Resume |
| 12 | During a download: press **Pause**, wait 10 s, **Resume**; then **Cancel** another one | Resume continues from the same byte (not 0); Cancel returns to "Not downloaded" within ~4 s, never spins | Cancel spinning > 5 s = B3 not fixed on this device |
| 13 | Force-stop the app mid-download, reopen | Card shows `Paused at N%` and the download restarts **by itself** (or after Resume) from that byte | Starts at 0% = Range resume not working: report |
| 14 | Load the 4B, chat, press Home, wait 1 min, reopen | Chip says the model was unloaded to save memory; next message reloads it (a few seconds) and answers | Crash banner on reopen = the OS killed the app (read "Last run died while loading" vs plain restart) |
| 15 | Airplane mode, chat | Works completely offline | Any network error here is a bug |
| 16 | Send a Khmer sentence (e.g. `សួស្តី តើអ្នកសុខសប្បាយជាទេ?`) and a 3-page paste | Answer arrives, or the app says older/long text was shortened. **No** "Context is full" | If it appears: report the model and text length |
| 17 | (Optional) Load Qwen3.5 9B | Rating **tight**, asks before loading, reply speed single-digit tok/s | OOM kill = expected on a busy phone; app shows the crash notice next launch |

Record for the report: phone, Android build, `tok/s` and `TTFT` of 0.8B and 4B, the "Verifying" time, and which of steps 11-14 behaved as expected.

## 5. Remaining risks

| ID | Risk | Why it matters | Mitigation / next step |
|---|---|---|---|
| R1 | `llama.rn` 0.12.9 on RN 0.86.3 + `qwen35`/`gemma4` loading has never been run by anyone I could find | The whole product | Smoke test steps 6-8. Fallback model: Qwen3 4B Instruct (`qwen3`, oldest arch). Fallback library: `0.13.0-rc.x` (open Adreno issues, CPU is unaffected) |
| R2 | **Pure-JS SHA-256 on Hermes is slow.** V8 does ~35 MB/s here; Hermes has no JIT. My estimate is 1.5-4 MB/s, i.e. 2.7 GB would verify for ~11-30 min and 5.7 GB for 25-60 min. **Not measured** (no Hermes VM runnable on this PC: `hermesc` here has no `-exec`) | "Download feels broken" if the verification stage is long | Step 5 measures it. Knob: `verifyMode` in `services/downloads.ts`. Proper fix = a 30-line native SHA-256 module (Kotlin `MessageDigest`), which needs an EAS build and was not added blind |
| R3 | No foreground service: Android may freeze/kill a long download when the app is not visible | Large models on slow links | Auto-resume at launch (done). A real fix needs `react-native-background-downloader` or a service (roadmap) |
| R4 | RAM fit and thresholds are estimates (600 MB overhead, KV from headers); `llama.rn` keeps a 160 MB prompt-state cache on hybrid models | A wrongly "great" model can still be OOM-killed | Crash marker + notice + `Test model`; measure with `ctx.bench()` later |
| R5 | `AppState.memoryWarning` may not fire on Android; JS timers stop while the process is frozen | Memory guard is best-effort | 45 s background timer is the main path |
| R6 | Samplers are generic (temp 0.7, top_p 0.9, top_k 40, min_p 0.05, repeat 1.1); Qwen3.5's own recommendation differs (thinking: 1.0/0.95/20, presence penalty) | Quality of long reasoning | Tune on the device after it runs |
| R7 | Qwen3.5 with thinking on may spend the whole 60% budget thinking | Empty visible answer | Notice exists ("spent its whole budget thinking"); thinking toggle in the UI |
| R8 | `expo` is one patch behind (`57.0.26` vs `~57.0.27`) | doctor red, may differ from Expo Go-less dev client expectations | `npx expo install expo@~57.0.27` before the build (package.json: UI/owner) |
| R9 | Storage, `settings`, `chatStore` real-device behaviour (SAF picker, All-files-access, rename semantics) is only covered by an in-memory fake | I/O bugs | Checklist steps 3, 10 |
| R10 | `listThreads()` parses every chat file on every refresh (O(n)); `storage_config` write is not atomic | Slow with hundreds of chats; tiny corruption window at first setup | Index file later |
| R11 | Docs outside my ownership are stale: `docs/ARCHITECTURE.md` (sections 4, 5: optional deep verify, test generation), `docs/AUDIT.md`, `docs/QA_PLAN.md`, `docs/REQUIREMENTS.md`, `docs/audit/00-master-spec.md` (gaps G-3..G-7, G-17 are now fixed) | Misleading handover | Sync pass; see `docs/SERVICES_API.md` for the current contracts |
| R12 | Thermal throttling / battery: no guard | Speed drops after minutes | Out of scope, noted |

## 6. Needed from other owners

- `mobile/package.json`: `npx expo install expo@~57.0.27` (doctor).
- UI: consume `useEngineStatus()`, `runSelfTest()`, `downloadAndLoad()` / `setupRecommended()`, `useSetup()`; show `DownloadState.verifyFraction`/`verified`; show `role` on model cards; show `engine unloadedReason`; handle `MountStage` rename `testing` -> `warming` (already compiles). Details in `docs/SERVICES_API.md`.
