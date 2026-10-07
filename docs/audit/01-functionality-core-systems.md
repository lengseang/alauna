# Audit 01 — Functionality and Core Systems

Scope: `mobile/src/{engine,services,types}`, `mobile/App.tsx` (logic), root `gateway.js orchestrator.js critic.js grounder.js humanizer.js`, README, `docs/*.md`.
Method: static read of every file in scope, `npm ci` + `npm test` + `tsc` + `expo-doctor`, plus scratch harnesses (outside the repo; no source edited) that run the real modules on Node.
Date: 2026-10-08. Branch: `claude/project-status-updates-0fdcb7`. Commit: `94b571d`.

## 0. Verdict in one paragraph

**There is no inference.** The app is a downloader and file manager wrapped around a hand-written if/else chatbot (`LocalLlmDriver.synthesizeResponse`). The model file is never opened for generation. A chat reply is identical whether the GGUF is downloaded or not. `package.json` and `package-lock.json` (592 packages) contain no llama.cpp, executorch, MLC, ONNX, whisper, Sherpa, or TTS/STT library. The "engine" layer (speculative decoding, KV cache, fallback pipeline) is a simulation or dead code. The UI reports 2.8x speedup, 86.4% acceptance and "GGUF On-Device" with no backing. What is real: HF model download (Android), file vault, thread persistence, SHA-256 routine, sentence chunker, PAD arithmetic.

## 1. Trace of one chat message (UI send to response)

Evidence run: `MobileOrchestrator.processTurnAsync(q, arch, pad, 'definitely-not-a-real-file.gguf')`, so the model file does not exist.

| # | Hop | file:line | Status | Note |
|---|---|---|---|---|
| 1 | User taps send, `handleSend` | `App.tsx:431` | REAL | UI state, optimistic bubbles. |
| 2 | Auto-init sandbox if unconfigured | `App.tsx:~436-447` | REAL | `StorageConfigService.useDefaultSandbox()`. |
| 3 | `isDownloaded` check | `App.tsx:500` | REAL but **cosmetic** | Result is used only to pick the badge string at `App.tsx:520`: `'GGUF On-Device'` vs `'Fast-Path'`. It does not change the generation path. |
| 4 | `MobileOrchestrator.processTurnAsync` | `orchestrator.ts:26` | REAL glue | Passes only the current `input`. **No chat history, no `compactedSummaries`, no `toneIntensity`, no `customBackstory`** reach the model (`orchestrator.ts:61-68`). |
| 5 | `routeDecision` (gateway) | `gateway.ts:18` | REAL | Regex classifier. Output is used only for the PAD delta and a UI badge. `rigor` is never consumed. |
| 6 | PAD evolution | `orchestrator.ts:36-53` | REAL math, **no effect** | EMA toward the archetype baseline. `dominance` is never updated. The result is injected as a string. |
| 7 | `MemoryEngine.formatPromptContext` | `memoryEngine.ts:131` | STUB | Always returns the 2 hard-coded seed facts (`memoryEngine.ts:41-56`). |
| 8 | `LocalLlmDriver.generateStream` | `localLlm.ts:756` | **FAKE** | Calls `synthesizeResponse` and replays a pre-built string word by word with `setTimeout(16)` (`localLlm.ts:767`). |
| 9 | `synthesizeResponse` | `localLlm.ts:251-750` | **FAKE** | About 500 lines of `if (lower.includes(...))` canned templates. No weights, no tokenizer, no sampler. |
| 10 | Compaction, then save | `App.tsx:547-551`, `vaultStorage.ts:263` | REAL, destructive | See §4. |
| 11 | Render | `App.tsx` | REAL | FlashList. |

Observed output, the model file does not exist and the reply still arrives:

| Input | Reply |
|---|---|
| `What is the capital of France?` | A full "### APIs (Application Programming Interfaces)" article. The cause is `conceptLower.includes('api')` matching "c**api**tal" (`localLlm.ts:479`). |
| `Write a haiku about the sea` | `I'm listening closely to your thoughts on *"Write a haiku..."*` (echo template, `localLlm.ts:701-726`). |
| `2+2?` | The same echo template. |
| `Translate "good night" to Khmer` | The same echo template. |
| `hello` with archetype `tactical`, and with `spark` | Both get the **Empath** greeting. `localLlm.ts:267-269` detects the persona by searching the system prompt for the words "tactical" and "spark". Those words never appear in `ARCHETYPES[*].systemPromptModifier`. Only "mentor" matches. |

TTFT of the fake stream is at least 16 ms because the first token awaits `setTimeout(16)`. Full replies take 1.3 to 6 s, so a "<15ms TTFT" cannot hold even for the simulation.

Other consequences:
- `resolveModelMetadata` returns `isGgufVerified: true` for any filename (`localLlm.ts:223`) and defaults to "SmolLM2 (135M) Nano".
- `loadModel` (`localLlm.ts:100`) sets `isInitialized = true` and returns `true` unconditionally. It only peeks at the first 32 bytes and never mounts anything.
- `formatPrompt` (ChatML/Llama-3) is not called by `generateStream`.
- Attachments (image/doc) are not read. The turn text becomes `'Analyze attached document/image'` (`App.tsx:504`) and gets a canned reply.

## 2. System-by-system

Expo Go column: "dev build" means native code outside Expo Go's bundled list (`node_modules/expo/bundledNativeModules.json`). `react-native-mmkv` and `react-native-nitro-modules` are **not** in that list.

| System | Purpose | Status | Wired into UI? | Expo Go / dev build |
|---|---|---|---|---|
| `engine/gateway.ts` (+ root `gateway.js`, an identical copy) | Regex intent router | REAL, trivial | Yes (orchestrator, badge, PAD delta) | OK |
| `engine/orchestrator.ts` | Prompt assembly, PAD update, call the LLM driver | REAL glue over a FAKE core | Yes | OK |
| `engine/localLlm.ts` | "On-device GGUF inference" | **FAKE** (canned if/else); header peek is real but pointless | Yes (App, Settings, voice) | OK, because nothing native exists |
| `engine/speculativeHarness.ts` | Speculative decoding | **FAKE** simulator (see §3) | **No.** Only tests import it. The UI numbers are hard-coded constants in `SettingsScreen.tsx:102-140` | n/a |
| `engine/kvCacheManager.ts` | KV-cache freezing | **FAKE.** Stores a JSON header plus the literal string `KV_DENSE_TENSOR_MOCK[...]` (`:186`). The hash is a 4x32-bit non-crypto mix. The checksum is never verified. | **No.** Only tests import it | n/a |
| `engine/fallbackPipeline.ts` | Tokenizer plus mount telemetry | **DEAD CODE** (never imported). Its imports lack `type` and the `.ts` extension. | No | n/a |
| `engine/voiceController.ts` | Voice turn loop | STUB. No mic, no STT, no TTS. It calls `processTurn` (sync canned) and then `generateStream` (a second canned synthesis). | Yes, via 3 hard-coded demo buttons: "Hello Chiwiwi!", "Who are you?", "System status…" (`App.tsx:1079-1091`) | OK |
| `services/voiceStreamer.ts` | Punctuation chunker | **REAL**, tested | Via the voice controller | OK |
| `services/memoryEngine.ts` | Episodic memory | STUB. 2 hard-coded seed facts. `addMemory` and `loadFromDisk` are **never called**. `pruneRollingWindow` is never called. | Prompt injection and the Settings "clear" button | MMKV falls back to in-memory in Expo Go |
| `services/modelManager.ts` | Model dir, integrity, delete, size | REAL. `canSafelyMountModel` always returns `safe:true` (`:309-320`). `downloadModel` and `createModelDownloader` are unused. | Yes | OK (expo-file-system is bundled) |
| `services/hfModelDownloader.ts` | HF resolve, resumable download, SHA-256 | **REAL core.** See §3 and §4 for the gaps. | Via `DownloadManager` | OK (DownloadTask is in expo-file-system 57) |
| `services/downloadManager.ts` | Global queue and state | REAL, with a **pause bug** (§4) | Yes (Downloads Hub) | OK. State persists via MMKV, so it is in-memory only in Expo Go. |
| `services/vaultStorage.ts` | Thread persistence (MMKV, primary dir, mirror) | REAL. Compaction is destructive. `MMKVCache.delete` is a no-op on MMKV v4. `saveIsolatedMedia` is unused. | Yes | OK |
| `services/storageConfig.ts` | Vault location and slots | REAL. SAF-to-POSIX conversion works only with "All files access". The `souls/` and `skills/` json files are written but **never read**. Slot sizes and counts are fabricated (`:379-381` assumes 105 MB per .gguf, `:443,454` use `Math.max(4, …)`). | Yes | OK |
| `services/storageUtils.ts` | SAF URI decoder | REAL, pure, tested | Via storageConfig | OK |
| `services/mmkvCache.ts` | Fast KV store | REAL wrapper. Falls back to `InMemoryStorage` silently. | Yes | **dev build required** (MMKV 4.3.2 is Nitro). In Expo Go it falls back to memory, so settings, active model and download state are lost on restart. |
| `services/hardwareProfiler.ts` | Device RAM and grade | **FAKE heuristic.** It guesses RAM from substrings of `Build.MODEL` ("ultra", "pro", "fe", "plus", "fold"). A real S23 Ultra reports `SM-S918B`, so it is profiled as **6 GB / grade B,C**. No `expo-device` and no real memory read. | Yes (text in Settings and the drawer) | OK |
| `types/soul.ts` + PAD engine | 6 archetypes, PAD vectors | Data REAL. Arithmetic REAL. **Effect on output is nil** (see §1 rows 6-9). | Yes | OK |
| `types/settings.ts` | 23-entry model DB | Data REAL, but see §3 claim 5 | Yes | OK |
| Settings toggles (`vulkanCompute`, `threadCount`, `flashAttention`, `biometricLock`, `autoPurgeDays`, `ttsEnabled`, `vadThreshold`, `sttEngine`) | "Advanced" panels | **COSMETIC.** Each appears 3 times in `SettingsScreen.tsx` and nowhere else. Not persisted, not consumed. | Yes | OK |
| Root `orchestrator/critic/grounder/humanizer.js` | Node "anti-hallucination" demo (symbol check against a file) | Works as a Node toy. Fails open: with no target path it returns `BYPASS_VERIFIER` and "All set". **Not used by the mobile app.** | No | n/a |
| Root `sync-notion.js` | Pushes docs to Notion | Unrelated dev tool | No | n/a |

## 3. README / docs claims

| # | Claim | Verdict | Proof |
|---|---|---|---|
| 1 | "100% Offline, On-Device GGUF Inference" | **FALSE** | No inference library in `package.json` or the lockfile. `synthesizeResponse` is canned. Replies are identical with a non-existent model file (§1). |
| 2 | "Gateway <0.1ms" | TRUE, trivial | 200k calls in Node/V8: mean 0.0006 ms, p99 0.0017 ms, one 6.7 ms outlier. Hermes not measured. It is 4 regexes, and it misroutes: "I have 500 dollars" is `DEEP_DEBUG`, "Explain failure modes of Bayesian priors" is `DEEP_DEBUG`. |
| 3 | "Speculative decoding 2.8x" | **FALSE** | `executeSpeculativeStep` draws from a fixed 20-word vocabulary and ignores the prompt (`speculativeHarness.ts:200-221`). It never runs a model. The latency is computed from hard-coded `tokPerSec` constants. A real run gives **3.97x to 4.39x at 100% acceptance** and the text `"accelerated optimal sovereign directly data in latency…"` for "capital of France". The comments say 1.8-2.5x, `ENTERPRISE_PLAN` says 18-24 tok/s, the UI says 2.8x / 86.4% (`SettingsScreen.tsx:116,982,1760,2099`). Bonus tokens are `undefined` in 4 of 4 steps, because `vocabularyPool[stepStart + 42]` indexes with a float (`:253,256`). |
| 4 | "KV-cache TTFT <15ms (from 1,500ms)" | **FALSE** | The cache holds a header and a mock string, and nothing consumes it. The manager is not imported by the app. The "<15 ms" test (`speculative_and_kv.test.ts`) times a `Map` lookup. The fake stream's TTFT is at least 16 ms. |
| 5 | "22-model vault" | **FALSE/PARTIAL** | 23 entries (the tests assert 23, the docs say 22), grades S/B/C = 8/6/9. Only **20 unique files**: 3 pairs are duplicates (`gemma-2-2b` x2, `Qwen2.5-VL-7B` x2, `Qwen2.5-VL-3B` x2). Mislabels: id `gemma-4-12b` is Gemma 2 9B, `smollm3-1.7b-uncensored` is DeepSeek-R1-Distill, "Moondream 2" is SmolLM2-360M (text only), the "Abliterated" Gemma/Llama entries are plain quant variants. "Image" and "Voice" capabilities are advertised but there is no vision or audio path and no mmproj download. **All 20 unique URLs return 302 then 200 on HEAD today** (no bytes downloaded), so the downloads themselves target real files. AND/OR filter logic exists (`SettingsScreen.tsx:558-579`). |
| 6 | "Pure-TS streaming SHA-256, no OOM" | **PARTIAL** | The engine is **correct**: 46 fuzz cases vs `node:crypto` (lengths 0 to 100k, boundaries 55-65, 119-128, chunk sizes 7/4096/4 MB) had 0 mismatches. It runs at about 35 MB/s on V8, so a 5 GB model takes about 2.5 min on V8 and likely much longer on Hermes, **blocking the JS thread**, because `readBytes` and `update` are synchronous. **It is never invoked in production.** `expectedSha256` is only checked if the caller passes it (`hfModelDownloader.ts:927`). Neither `DownloadManager` nor `ModelManager` passes it. The remote LFS hash fetched at `:865` is assigned and ignored. Verification errors other than a mismatch are swallowed (`:943-947`). The repo's own test vector for the pangram is wrong (`hfModelDownloader.test.ts`: expected `…b0565a855402e32d1632550`; the engine's `…bcb0082e4f8d…` is the real SHA-256 of that sentence). |
| 7 | "Byte-range HTTP resumption" | **PARTIAL** | Android: `DownloadTask.fromSavable({resumeData: String(startByte)})` works because the native Android `resumeData` is a byte offset (`FileSystemDownloadTask.kt`). **iOS**: `resumeData` is base64 NSURLSession data, so this throws `InvalidResumeData`. The fallback then sends `Range` through `File.downloadFileAsync`, which can overwrite the partial file with the 206 body. Pause marks the download "completed" (§4). |
| 8 | "~400 ms voice latency" | **FALSE** | No microphone, STT, VAD or TTS code or dependency. `expo-speech` and `expo-audio` are SDK modules but not in `package.json`. `onSentenceReady` only appends text to a transcript (`App.tsx:397`). The chunker is real; no latency is measured anywhere. `ARCHITECTURE.md` itself says 400-600 ms. |
| 9 | ".nomedia sandbox, no Gallery leak" | PARTIAL | `.nomedia` is written in models/media dirs (real). Chat attachments are **not** copied into the sandbox (`saveIsolatedMedia` is unused), so they stay at the picker's URI. Moot inside app-private storage anyway. |
| 10 | "Claude-style rolling compaction, lossless" | **FALSE** | `compactSession` keeps the last 4 messages and replaces the rest with `m.text.slice(0,100)…` lines (`vaultStorage.ts:281`). It is lossy and **deletes older messages from the thread**. The summaries are only counted in a banner (`App.tsx:679`) and never fed to a model. `pruneRollingWindow` is never called. |
| 11 | "3D PAD emotion + dual-tier customization" | PARTIAL | The PAD equation matches `ARCHITECTURE.md` §4, but `dominance` never changes, `toneIntensity` and `customBackstory` are never read, and two of four personas are never selected (§1). The storage UIs for per-chat and global souls exist. |
| 12 | "Build: passing" badge | **UNVERIFIABLE** | Static badge. No `.github/` and no CI config in the repo. |
| 13 | "Zero telemetry / zero cloud" | TRUE (trivially) | No analytics libraries. The only network calls are the two HF `fetch` calls (`hfModelDownloader.ts:428,509`) plus the download itself. |
| 14 | `ARCHITECTURE.md`: llama.cpp JSI, `react-native-llama`, Whisper.rn, Silero VAD, Piper/Sherpa-ONNX, OP-SQLite + sqlite-vec | **FALSE** | None are in `package.json` or the lockfile. No SQLite at all. "Bare Expo" is false (it is managed/CNG). "Reject <6 GB devices" and the "entity extractor" are not implemented. "Deterministic AST tool verification" has no tool executor in the app. |
| 15 | `ENTERPRISE_PLAN` gate: "tsc exit 0, 100% tests passing" | tsc TRUE. Tests **PARTIAL** | See §5. |

## 4. Bugs and dangerous things (ranked)

| Sev | Finding | Evidence |
|---|---|---|
| **CRIT** | No inference path. Product premise is unmet. | §0, §1 |
| **CRIT** | UI claims that are false: "GGUF On-Device" badge (`App.tsx:520`), "Model Verified & Mounted… active in RAM!" plus "Warm-up latency" (`SettingsScreen.tsx:485-493`, which times the canned stream), "2.8x acceleration active". | §1, §3 |
| **HIGH** | **Pause marks the download "completed 100%".** `HFModelDownloader.start()` returns normally with the `.chiwiwi_part` URI when paused (`:899-902`). `DownloadManager.startDownload` treats any return as success: it deletes the downloader, sets `completed/100%` (`downloadManager.ts:299-319`), and `SettingsScreen` shows the "Download Complete" alert (`:410-413`). Reproduced with the real `DownloadManager` and `HFModelDownloader` on an in-memory `expo-file-system` stub: mid-download 30% (3/10 MB), after pause `completed 100% 10/10MB`, with `activeDownloaders = 0`. Calling `startDownload` again does resume and finish. The stub models Expo's documented "`downloadAsync` resolves `null` on pause"; the same behavior was not exercised on a device. | harness in scratchpad |
| **HIGH** | **MMKV v4 API mismatch.** The wrapper calls `mmkv.delete(key)` (`mmkvCache.ts:143`). v4's spec only has `remove(key)` (`react-native-mmkv/src/specs/MMKV.nitro.ts:77`). The call throws and the wrapper swallows it. So `VaultStorage.deleteThread` leaves the thread blob in MMKV (`vaultStorage.ts:237`), and `MemoryEngine.clearAll`'s MMKV delete (`memoryEngine.ts:153`) is a no-op. Only the index entry is removed. | node_modules |
| **HIGH** | **Compaction destroys history** (claim 10). | `vaultStorage.ts:263-295` |
| **HIGH** | **Keyword matching hijacks answers** ("capital" returns the API article; "supercomputer" matches `'sup'` and replies with a greeting; "decode" matches `'code'`, "explanation" matches `'plan'`). | `localLlm.ts:346,479,564,637` |
| **HIGH** | **`MANAGE_EXTERNAL_STORAGE` is declared but never requested.** `app.json:50`. The app never sends the user to the special-access Settings page, so the SAF to `/storage/emulated/0/...` path always fails the writability test and silently falls back to the sandbox (`storageConfig.ts:149-163`). The folder picker is effectively cosmetic. The permission also blocks Play Store review and contradicts the "hermetic" privacy story. Also over-declared: `READ/WRITE_EXTERNAL_STORAGE`, `READ_MEDIA_VIDEO/AUDIO`, `READ_MEDIA_VISUAL_USER_SELECTED`, `CAMERA`, `RECORD_AUDIO` (no capture code), `POST_NOTIFICATIONS` (no notifications), `FOREGROUND_SERVICE_*` (no foreground service; downloads die with the process). iOS: `UIBackgroundModes: audio` with no audio code. | `app.json:35-50` |
| **HIGH** | **Hardware profiler mis-profiles the target device** (S23 Ultra is `SM-S918B`, so it gets 6 GB). It drives the displayed RAM and the "recommended model". | `hardwareProfiler.ts:45-56` |
| MED | SHA-256 never enforced (claim 6), and `verifyGGUFHeader` **fails open**: it returns `true` when `open`/`slice` is missing or on any exception (`:696,699`). Only 4 magic bytes are checked and no size check against `Content-Length`. | `hfModelDownloader.ts` |
| MED | iOS resume corrupts or restarts (claim 7). iOS also gets no `NSCameraUsageDescription` or photo strings because `expo-image-picker` is not in `app.json` plugins, yet `requestInitialPermissions` asks for camera and photos on launch (`App.tsx:172-188`), which would abort the app on iOS (static analysis, not run). | static |
| MED | Keep-awake is never released after a pause, because the downloader stays in the map, so the `size === 0` check never fires. | `downloadManager.ts:366-373` |
| MED | `startDownload` can be re-entered while an old `start()` promise is pending (pause then resume runs two flows on one downloader). Possible double finalize or a failed `move`. Not reproduced on a device. | `hfModelDownloader.ts:814-979` |
| MED | `initVault()` (config read, mkdir) runs on every `saveThread`, `loadThread` and `listAllThreads`. `listAllThreads` parses every chat file on every send. O(n) per message. | `vaultStorage.ts` |
| MED | `StorageConfigService` writes `souls/` and `skills/` JSON that nothing reads, and reports invented slot sizes. | `storageConfig.ts` |
| LOW | `app.json` has an invalid `splash` key (`expo-doctor`: "should NOT have additional property 'splash'"). Dependency drift: `@shopify/flash-list` 2.3.3 vs SDK 2.0.2, `react-native-keyboard-controller` 1.22.6 vs 1.21.9 (may not match the native version bundled in Expo Go), `expo` 57.0.26 vs ~57.0.27. | `npx expo-doctor` |
| LOW | NativeWind and Tailwind are configured (`metro.config.js`, `tailwind.config.js`, `global.css`) but there is **no `babel.config.js`**, and only unused `components/ui/*` use `className`. Dead weight. | `ls`, `grep` |
| LOW | No React error boundary. Any render exception white-screens the app. Also: `SafeAreaView` from `react-native` is deprecated (warns once). Imports mix `.ts`-suffixed and extensionless paths, and type-only names are imported as values in `fallbackPipeline.ts` and `downloadManager.ts`, which break under Node strip-types (so `npm test` cannot cover them). | `grep ErrorBoundary`, static |

## 5. Test and typecheck results (exact)

`cd mobile && npm ci --ignore-scripts` returned `added 592 packages in 30s`, exit 0. `node_modules` was missing beforehand and is git-ignored.

| Command | Result |
|---|---|
| `npm test` (mobile) | `# tests 33  # pass 33  # fail 0`, duration about 9.4 s. 5 files: `orchestrator.test.ts`, `vaultStorage.test.ts`, `modernStack.test.ts`, `../test/mobile.test.js`, `../test/enterprise.test.js`. |
| `npm test` (repo root) | `# tests 16  # pass 16  # fail 0`. `test/suite.test.js` passes only when run from the repo root. From `mobile/` it fails 2 of 5 because paths are relative to cwd. |
| `npx tsc --noEmit` (strict, `test/` excluded) | **exit 0**, no output, about 17.5 s. |
| `npx expo-doctor` | 19/21. Fails: `app.json` schema (`splash`), and 3 packages out of date (see §4 LOW). |

Test files **not in `npm test`**:

| File | Result |
|---|---|
| `test/hfModelDownloader.test.ts` | `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING` (imports `expo-file-system` TS source). With `expo-file-system` stubbed: 9 of 12 pass. The 2 SHA tests fail because the test's **expected hash is wrong**. The `getResumeState` test fails because of the stub (`Paths.document` is undefined). |
| `test/speculative_and_kv.test.ts` | Same import error. With the stub: 7/7 pass. The assertions are weak (`>= 0`, `> 0`, `summary.includes('speedup')`). |
| `test/orchestrator.test.js` | Stale: imports `src/engine/gateway.js`, which does not exist (`ERR_MODULE_NOT_FOUND`). |
| `test/synthesis.test.ts` | Passes. It is a script that prints canned replies and fails only if the text contains `Received:`. |

What the green tests prove: the 33 tests assert that the fake works. For example, `who are you?` must return text containing "CHIWIWI", and the thought text must contain "Context evaluation" (a fixed template, `localLlm.ts:734`). No test touches a real file system, device, native module or model. The suite verifies the simulation and gives no evidence of a working app.

## 6. Dead code and duplication

| Item | Evidence |
|---|---|
| `engine/speculativeHarness.ts` (405 lines), `engine/kvCacheManager.ts` (460), `engine/fallbackPipeline.ts` (256), `engine/index.ts` (barrel) | Imported only by tests or by each other. |
| `components/ui/*`, `components/GuardedButton.tsx`, `hooks/useGuardedAction.ts`, `lib/utils.ts` | Never imported by the app (only by `modernStack.test.ts`). |
| `HFModelResolver.fetchRepoMetadata/getRecommendedGGUF`, `HFModelDownloader.downloadModel`, `computeBufferSha256`, `verifyFileSha256` | No production caller. |
| `ModelManager.downloadModel/createModelDownloader/canSafelyMountModel`, `VaultStorage.saveIsolatedMedia`, `MemoryEngine.addMemory/loadFromDisk/pruneRollingWindow` | No caller. |
| Gateway logic duplicated | `gateway.js` (root) equals `mobile/src/engine/gateway.ts`. |
| Model data triplicated | `S23_MODEL_DATABASE`, `SPECULATIVE_PRESETS` (hard-coded numbers) and `SPECULATIVE_PAIRS` (a third copy of target/draft IDs and speeds). |
| `voiceController.processTurn` + `generateStream` | Synthesizes every reply twice. |
| `SettingsScreen.tsx` is 3,096 lines, `App.tsx` 1,870 | Out of scope here; see audit 02. |

## 7. Verdict per module

| Module | Verdict | Why / what to do |
|---|---|---|
| `engine/localLlm.ts` | **DELETE** the canned synthesizer. **REWRITE** as a thin adapter over a real native runtime (`llama.rn`, dev build), with GGUF load, token streaming, stop and abort. Keep `parseThinkingTags` (it is a useful pure function). | The fake is the root of the false "works" state. |
| `engine/orchestrator.ts` | **REWRITE** | Pass real chat history, the soul prompt (including `toneIntensity` and backstory) and compaction summaries. Remove the sync `processTurn` duplicate. |
| `engine/gateway.ts` + root `gateway.js` | **KEEP** (one copy), or **DELETE** and fold into the orchestrator | Harmless. Fix the misroutes or drop the `DEEP_DEBUG` digits. |
| `engine/speculativeHarness.ts` | **DELETE** | A simulator that produces fake benchmarks. llama.cpp has native speculative decoding if wanted. |
| `engine/kvCacheManager.ts` | **DELETE** | llama.cpp has native `save/load session state`. Do not hand-roll. |
| `engine/fallbackPipeline.ts` | **DELETE** | Dead. |
| `engine/voiceController.ts` | **REWRITE** later | Needs real STT/TTS (`expo-speech`, `expo-audio`, a Whisper binding). Delete the demo buttons. |
| `services/voiceStreamer.ts` | **KEEP** | Small, correct, tested. |
| `services/memoryEngine.ts` | **REWRITE** | Needs extraction, retrieval and a "forget" path. The seed facts must go. |
| `services/modelManager.ts` | **KEEP** (trim) | Remove `downloadModel`, `createModelDownloader`, the always-true `canSafelyMountModel`. |
| `services/hfModelDownloader.ts` | **KEEP, FIX** | Make `start()` return a result type (`paused` vs `completed`). Enforce the LFS SHA already fetched at `:865`. Make the GGUF check fail closed. Run SHA-256 off the hot path or in chunks with `await`. Gate the iOS resume path. |
| `services/downloadManager.ts` | **KEEP, FIX** | Fix pause-as-completed and the keep-awake leak. |
| `services/vaultStorage.ts` | **KEEP, FIX** | Make compaction non-destructive (summarize with the model, keep originals), use `MMKV.remove`, stop calling `initVault()` per op, drop the unused media helper or wire it. |
| `services/storageConfig.ts` | **REWRITE (trim)** | Default sandbox only. Drop the SAF to POSIX hack and `MANAGE_EXTERNAL_STORAGE`, the fake slot sizes and the unread soul/skill files. |
| `services/storageUtils.ts` | **DELETE** with the SAF hack | Pure, tested, but only needed for the removed feature. |
| `services/mmkvCache.ts` | **KEEP, FIX** | `delete` becomes `remove`. Needs a dev build. Fine to keep, or replace with `expo-sqlite/kv-store` to stay in Expo Go. |
| `services/hardwareProfiler.ts` | **REWRITE** | Read real RAM (`expo-device` `totalMemory`), drop model-name guessing. |
| `types/soul.ts` | **KEEP** | |
| `types/settings.ts` | **KEEP, FIX** | Dedupe 3 pairs, fix the mislabeled ids and names, drop the unsupported Image/Voice capabilities. |
| Root `orchestrator/critic/grounder/humanizer/sync-notion.js` | **DELETE** from this repo (or move to `tools/`) | Unrelated to the app, and the root tests only cover these. |
| Docs (`README.md`, `ARCHITECTURE.md`, `ENTERPRISE_PLAN.md`) | **REWRITE** | Describe what exists. Remove the unimplemented claims and the static "passing" badge. |

## 8. Smallest path to a real app

1. Add `llama.rn` (dev build via `eas build --profile development`). Wire `loadModel` to `initLlama({model: path})` and stream via `completion` callbacks.
2. Delete the fake synthesizer, speculative, KV and fallback modules, and the 2.8x/86.4%/"GGUF On-Device" strings.
3. Pass the real transcript and soul prompt. Fix pause, SHA, MMKV `remove`, compaction.
4. Strip the `app.json` permissions to `INTERNET` (plus mic/camera only when those features exist).
5. Keep `npm test` honest: run all test files, and make `npm test` fail if any file errors on import.

## 9. What was and was not verified

- Verified by execution on Node/V8: tests, tsc, expo-doctor, SHA-256 correctness, gateway latency, speculative output, canned replies, the pause bug (on an in-memory `expo-file-system` stub), HF URL reachability by HEAD (no downloads).
- Not verified: anything on a device or in Hermes (performance, iOS behavior, real download pause timing, MMKV at runtime, the permission flows). The MMKV `remove`/`delete` finding is from the installed v4.3.2 type spec; the Expo Go statement is from `bundledNativeModules.json` and was not tested in the Expo Go app.
