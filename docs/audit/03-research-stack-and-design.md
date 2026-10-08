# 03 - Research: stack (no-cable path, llama.rn, downloads) + design tokens

Date: 2026-10-08. Project: Expo `~57.0.26`, RN `0.86.3`, device Galaxy S23 Ultra (SD 8 Gen 2 for Galaxy, 12 GB). No source edited. Everything below was fetched today; `[unverified]` = inference, not tested on device.

---

## 1. No-cable path (Expo)

**Expo Go cannot run this app, with or without llama.rn.** Expo Go ships a fixed native-module set ([docs](https://docs.expo.dev/workflow/customizing.md)). `react-native-mmkv` and `react-native-nitro-modules` (already in `package.json`) are absent from SDK 57's `bundledNativeModules.json` ([source](https://raw.githubusercontent.com/expo/expo/sdk-57/packages/expo/bundledNativeModules.json)), so a dev build is required today regardless. `expo-dev-client` is NOT yet in `package.json` (SDK 57 pin: `~57.0.19`).

### Recommended path (zero cable, zero Android Studio)
```bash
cd mobile
npx expo install expo-dev-client
npm i llama.rn@0.12.9 --save-exact          # NOT `expo install llama.rn`: npm dist-tag "latest" = 0.13.0-rc.7 (a release candidate) [inference]
npx expo install @kesha-antonov/react-native-background-downloader   # optional, see sec 3; put in build #1
# app.json -> "plugins": ["expo-file-system", "llama.rn", "@kesha-antonov/react-native-background-downloader"]
npx expo-doctor
git add -A && git commit -m "native deps for dev client"      # EAS builds from git
npx eas-cli@latest login                                       # once; eas-cli latest = 24.11.0 (2026-10-05)
npx eas-cli@latest build --platform android --profile development
```
1. CLI prints a QR + URL (also on the expo.dev build page). Open on the phone -> download APK -> allow "install unknown apps" for that browser -> install. ([create-a-build](https://docs.expo.dev/develop/development-builds/create-a-build/))
2. PC: `npx expo start --dev-client`, phone and PC on same Wi-Fi, open the CHIWIWI dev client, scan QR / type URL. Flags: `--tunnel` (ngrok; for firewalls "common for Windows users" / AP isolation), `--localhost`, `--clear`. ([CLI](https://docs.expo.dev/more/expo-cli/)) Fallback: phone hotspot, or allow Node on Windows *Private* network firewall.
3. JS/TS edits hot-reload over Wi-Fi, no rebuild. Only a native dependency / app.json plugin change costs a new build.

### eas.json
Existing `development` profile (`developmentClient: true`, `distribution: internal`) is already correct: APK is the default when either is set ([eas.json ref](https://docs.expo.dev/eas/json/)). Optional explicitness:
```json
"development": { "developmentClient": true, "distribution": "internal", "android": { "buildType": "apk" } }
```
Existing `preview` (internal + apk) = standalone build, no Metro needed; use it for "install and just use". Internal-build URLs are unauthenticated by default, 32-char UUID ([internal distribution](https://docs.expo.dev/build/internal-distribution.md)).

### Free-tier limits (https://expo.dev/pricing.md, https://docs.expo.dev/billing/faq.md)
- 15 Android + 15 iOS builds / month, **low-priority queue, "wait times of 90+ minutes" at peak**, 45-min build timeout, 1 concurrent build. Quota resets 1st of next month; **no overage on Free, builds just stop** (billing FAQ). `large` resource class not on Free. Max 50 pending builds/platform ([limitations](https://docs.expo.dev/build-reference/limitations.md)). Paid: Starter $19 + $45 credit, high priority, 2h timeout.
- `eas build --local` is **not supported on Windows** (WSL untested) ([local builds](https://docs.expo.dev/build-reference/local-builds/)).
- Consequence: build #1 must contain *every* native dep (dev-client, llama.rn, downloader). Use `--no-wait` and go do something else. Run from the main checkout or confirm the git worktree archives correctly `[unverified]`.

### Wireless adb (Android 11+, optional: only needed for native crash logs via logcat)
([Android docs](https://developer.android.com/tools/adb)) Need platform-tools only, not Android Studio. Developer options are enabled by tapping Build number 7x (no cable).
```bash
# Phone: Developer options > Wireless debugging ON (same Wi-Fi) > "Pair device with pairing code" (shows ip:pairport + 6-digit code)
adb pair <ip>:<pairport>          # type the code
adb connect <ip>:<port>           # port from the main Wireless-debugging screen (differs from pairport)
adb devices
adb logcat | findstr /i "rnllama llama ggml ReactNativeJS"    # llama.cpp SIGSEGV/SIGABRT only show here
adb install -r chiwiwi.apk        # alternative to the QR download
```
JS `console.log` already streams to the Metro terminal over Wi-Fi without adb.

---

## 2. On-device GGUF library

**Pick: `llama.rn` (mybigday).** MIT, 1051 stars, last push 2026-10-07. ([repo](https://github.com/mybigday/llama.rn), [README](https://raw.githubusercontent.com/mybigday/llama.rn/main/README.md), [API docs](https://github.com/mybigday/llama.rn/tree/main/docs/API))

| item | fact |
|---|---|
| Versions | stable **0.12.9** (2026-08-04, llama.cpp b10256); npm `latest` tag = **0.13.0-rc.7** (2026-10-05, rc since 2026-08-10). Pin the stable. ([npm](https://registry.npmjs.org/llama.rn), [releases](https://github.com/mybigday/llama.rn/releases)) |
| RN 0.86 / New Arch | v0.10+ requires New Architecture; RN >= 0.82 is New-Arch-only ([RN 0.82](https://reactnative.dev/blog/2025/10/08/react-native-0.82)) so satisfied. Android bridgeless JSI bug (#354, reported on 0.12.1) closed "fixed in newer version". RN 0.87 iOS break (#384) irrelevant (Android only). No RN-0.86-specific report found; peerDeps are `*`. Repo example app is RN 0.82. **Treat 0.86 as untested until build #1 runs** `[unverified]`. |
| Expo plugin | `"llama.rn"` in `plugins`; defaults are fine. On main: `enableOpenCLAndHexagon` (default true; adds optional `libOpenCL.so` + `libcdsprpc.so` to manifest, `required=false`), `enableEntitlements`/`forceCxx20` are iOS-only. ([plugin src](https://raw.githubusercontent.com/mybigday/llama.rn/main/src/expo-plugin/withLlamaRN.ts)). Postinstall downloads prebuilt native libs from the matching GitHub release (EAS has network: ok). Proguard: `-keep class com.rnllama.** { *; }` (only if minifying). Android ABI arm64-v8a only matters. |
| Load | `const ctx = await initLlama({ model: 'file://'+path, n_ctx, n_threads, n_gpu_layers, devices, use_mmap, use_mlock, flash_attn_type: 'auto'\|'on'\|'off', cache_type_k/v: 'f16'\|'q8_0'\|'q4_0'... }, onProgress?)` |
| Stream | `await ctx.completion({ messages:[{role,content}], n_predict, stop, temperature, top_k, top_p, enable_thinking, reasoning_format:'none'\|'auto'\|'deepseek' }, (d)=>{ d.token; d.content; d.reasoning_content })` -> `{ text, content, reasoning_content, timings, ... }` |
| Stop | `await ctx.stopCompletion()` |
| Tokenize | `const { tokens } = await ctx.tokenize(text)`; `ctx.detokenize(tokens)` -> `{content}` |
| Other | `ctx.release()`, `releaseAllLlama()`, `ctx.bench(pp,tg,pl,nr)`, `getBackendDevicesInfo()`, `loadLlamaModelInfo(path)`, `saveSession/loadSession`, `ctx.gpu`, `ctx.reasonNoGPU`, `ctx.devices` |

Alternatives, rejected: `@react-native-ai/llama` is a Vercel-AI-SDK wrapper over llama.rn `^0.10.1`, stale since 2026-02 ([npm](https://registry.npmjs.org/@react-native-ai/llama)); `react-native-executorch` 0.10.5 and `cactus-react-native` 1.13.1 use their own formats, not GGUF; MediaPipe wrappers last updated 2025-05 / 2024-10.

### GPU / NPU on SD 8 Gen 2 (Adreno 740, Hexagon v73): default to CPU
- llama.rn: OpenCL = "Adreno 700+", `n_gpu_layers > 0`, README says "limited to Q4_0 / Q6_K". Hexagon = "Experimental, SM8450+", opt-in `devices: ['HTP0']`, `n_gpu_layers > 0`.
- llama.cpp OpenCL doc lists verified Adreno **750/810/830/840**; 740 is not listed ([OPENCL.md](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/docs/backend/OPENCL.md)). Hexagon examples use q4_0/q8_0/mxfp4 ([snapdragon README](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/docs/backend/snapdragon/README.md)); one NPU session ~3.5 GB VA.
- Open bugs on this exact family: #386 wrong OpenCL decode on Adreno **730** (S22U) with Q4_K_M (rc.2; workaround env `LM_GGML_OPENCL_MM_KQ_GQA_R4_IMG=0`); #389 SIGABRT at load on OpenCL+Q4_K_M and HTP+q4_0 KV (rc.3). Both are v0.13 rc reports; none found for 0.12.9 but also no positive S23U report.
- **Decision:** ship `n_gpu_layers: 0` (CPU, i8mm/dotprod build) as default; expose "GPU (experimental)" toggle that only works with `*-Q4_0.gguf`, auto-falls-back to CPU on init error, and shows `ctx.gpu`/`reasonNoGPU`. Reverse if: `ctx.bench()` shows OpenCL >= 1.5x CPU tok/s with identical greedy output on a fixed prompt.
- Samsung Exynos crashes (#336, #350) don't apply: S23 Ultra is Snapdragon.

### Memory on 12 GB (heuristics `[unverified]`, measure with `bench()`)
- Budget one resident model: file size + KV + ~0.7 GB < ~5 GB. KV f16 ~ 150 KB/token for a Qwen3-4B-class GQA model (36 layers x 8 KV heads x 128 dim x 2 x 2 B) => 4096 ctx ~ 0.6 GB; `cache_type_k/v:'q8_0'` + `flash_attn_type:'on'` halves it.
- Start: `n_ctx 4096, n_batch 512, n_threads 4, use_mmap true, use_mlock false` (README example uses mlock true; on Android a 3-5 GB mlock may fail or evict other apps). Release the context on background/low-memory.
- One third-party benchmark (low confidence): SD 8 Gen 2 ~12-18 tok/s on ~3B Q4_K_M, CPU ([ertas.ai](https://www.ertas.ai/blog/llm-android-benchmarks-snapdragon-tensor)). No S23 Ultra + llama.rn number found; get your own from `ctx.bench()` and show it in-app.

### Models (all verified today: HF API listing + `resolve/main` 302 -> 200, Content-Length equals size; none gated; all Apache-2.0)
Download URL pattern: `https://huggingface.co/<repo>/resolve/main/<file>`

| tier | repo | file | size | note |
|---|---|---|---|---|
| smoke test | `unsloth/Qwen3.5-0.8B-GGUF` | `Qwen3.5-0.8B-Q4_K_M.gguf` | 0.533 GB (532,517,120 B) | first end-to-end test; downloads in seconds |
| fast | `unsloth/Qwen3.5-2B-GGUF` | `Qwen3.5-2B-Q4_K_M.gguf` | 1.281 GB (1,280,835,840 B) | |
| **default** | `unsloth/Qwen3.5-4B-GGUF` | `Qwen3.5-4B-Q4_K_M.gguf` | 2.741 GB (2,740,937,888 B) | arch `qwen35` (hybrid), thinking model -> use `enable_thinking`/`reasoning_format` |
| no-think safe | `unsloth/Qwen3-4B-Instruct-2507-GGUF` | `Qwen3-4B-Instruct-2507-Q4_K_M.gguf` | 2.497 GB (2,497,281,120 B) | older arch `qwen3`, lowest risk; also has `-Q4_0.gguf` 2.376 GB for the GPU toggle |
| other family | `unsloth/gemma-4-E2B-it-GGUF` | `gemma-4-E2B-it-Q4_K_M.gguf` | 3.107 GB (3,106,738,272 B) | arch `gemma4`; "E2B" = 4.65 B total params with per-layer embeddings; `ggml-org/gemma-4-E2B-it-GGUF` `gemma-4-E2B-it-Q4_0.gguf` 2.841 GB if you want Q4_0 |
| ceiling (opt-in) | `unsloth/Qwen3.5-9B-GGUF` | `Qwen3.5-9B-Q4_K_M.gguf` | 5.681 GB (5,680,522,464 B) | fits 12 GB only with ctx <= 4096 and other apps closed; expect single-digit tok/s `[unverified]`; warn before download |

Not recommended: Gemma-4 E4B (4.6-5.2 GB, same pressure as 9B tier for less quality), Q8_0/BF16 anything. `qwen35`/`gemma4` support depends on llama.rn 0.12.9's llama.cpp b10256 (Aug 2026) - both archs exist in llama.cpp by then, but confirm with the 0.8B smoke test and keep Qwen3-4B-Instruct-2507 as fallback.

---

## 3. Downloads (multi-GB, survive app switch)

| | `expo-file-system` 57.0.7 (installed) | `@kesha-antonov/react-native-background-downloader` 4.6.3 |
|---|---|---|
| API | `File.createDownloadTask(url, dest, {headers,onProgress,signal})`, `downloadAsync/pauseAsync/resumeAsync`, `task.savable()` + `DownloadTask.fromSavable()` | `createDownloadTask({id,url,destination,headers}).begin().progress().done().error()`, `getExistingDownloadTasks()`, `setConfig` |
| Resume | yes (pause/resume + persisted savable state) | yes, HTTP Range; server must support (HF/CDN does) |
| Background | **Android ignores `sessionType`**; iOS-only background session. JS task is not restored after process kill ([SDK 57 docs](https://docs.expo.dev/versions/v57.0.0/sdk/filesystem.md)) | DownloadManager + UIDT jobs (Android 14+, mandatory minimal notification) + foreground-service fallback; **reattach after kill**; on Android 16+ uses its own downloader `[verify on device]` ([README](https://raw.githubusercontent.com/kesha-antonov/react-native-background-downloader/main/README.md), [platform notes](https://raw.githubusercontent.com/kesha-antonov/react-native-background-downloader/main/docs/PLATFORM_NOTES.md)) |
| Expo | works in Go and dev builds | **dev build only**, plugin `@kesha-antonov/react-native-background-downloader` (SDK 50+, RN >= 0.70). Project has `react-native-mmkv` 4.x: plugin auto-skips its own MMKV; set `skipMmkvDependency: true` explicitly to avoid duplicate classes. HF redirects to CDN: use `maxRedirects: 10`. |

Note: `react-native-executorch` 0.10.5 lists this library as a peer dependency, which is a mild maturity signal.

**Decision:** put the downloader in build #1 (a native dep added later costs a scarce build slot), but keep the current `expo-file-system` path as the working default. Switch Android downloads to the native downloader only if the field test (start 2.7 GB, switch apps 5 min, lock screen) fails with `expo-file-system`. Always verify GGUF magic + `Content-Length` after completion (already done in commit 6a016bf). Reverse if: expo-file-system survives the 5-min app-switch test on S23U with One UI battery optimisation on.

---

## 4. Design: Nyx (dark) / Helios (light), single accent hue = gold

Concept: same gold in both themes - "starlight" at night, "sunlight" by day. No second hue. All ratios computed with the WCAG 2.x relative-luminance formula (script run today).

| token | DARK (Nyx/Selene) | LIGHT (Helios/Apollo) |
|---|---|---|
| bg | `#0A0D1C` | `#FBF6EA` |
| surface | `#141935` | `#F3EBD5` |
| border (decorative hairline) | `#2E3660` | `#CDBE98` |
| borderStrong (input boundary, WCAG 1.4.11) | `#5F6AA0` | `#8F7F55` |
| text | `#EEF0FA` | `#2B2417` |
| muted | `#9EA7CB` | `#675B40` |
| accent | `#E6C76A` | `#8A5A00` |
| onAccent | `#0A0D1C` | `#FFFFFF` |
| danger | `#FF8B8B` | `#B3261E` |

Contrast (AA text = 4.5, UI/large = 3.0):

| pair | DARK | LIGHT |
|---|---|---|
| text / bg | 17.00 | 14.24 |
| text / surface | 15.14 | 12.91 |
| muted / bg | 8.13 | 6.19 |
| muted / surface | 7.25 | 5.61 |
| accent / bg | 11.72 | 5.50 |
| accent / surface | 10.44 | 4.98 |
| onAccent / accent | 11.72 | 5.93 |
| danger / bg | 8.57 | 6.06 |
| danger / surface | 7.64 | 5.50 |
| borderStrong / bg | 3.73 | 3.65 |
| borderStrong / surface | 3.32 | 3.31 |
| border / bg (decorative only, fails 3:1 by design) | 1.67 | 1.71 |

All text pairs pass AA; borderStrong passes 3:1. Use `border` only for dividers, never as the only cue for an interactive control. Light bg is warm ivory, not pure white (same logic as the cream canvas `#faf9f5` that third-party teardowns report for Claude's UI, [getdesign.md](https://getdesign.md/design-md/claude/preview); unofficial).

**Type (free, `@expo-google-fonts`, all OFL, verified on npm):** `Inter` for all UI/chat text (`@expo-google-fonts/inter` 0.4.2: `Inter_400Regular`, `Inter_600SemiBold`), `Cinzel` only for the wordmark / empty-state title (`@expo-google-fonts/cinzel` 0.4.2: `Cinzel_600SemiBold`; caps-only Roman inscription feel, Latin only, never body). Optional Greek-script support: `@expo-google-fonts/gfs-didot`. Load with `useFonts` + `SplashScreen.preventAutoHideAsync()` ([Expo fonts](https://docs.expo.dev/develop/user-interface/fonts/)); or embed via `expo-font` config plugin (dev build, which we have anyway). Two weights of Inter + one of Cinzel keeps APK size and complexity down.

### Simple-UI patterns (cited)
1. **Composer is the whole app.** One screen = message list + one composer: text field, one round primary button. The model chip/chevron lives next to the input, as in PocketPal AI ("load model from chat via chevron by the chat input") ([README](https://github.com/a-ghorbani/pocketpal-ai)). Move model list, downloads, settings behind one menu button.
2. **Send becomes Stop.** While generating, the primary button swaps to Stop (-> `ctx.stopCompletion()`); on failure remove the streaming cursor and offer Retry ([Smashing, J. Pambou, 2026-05-01](https://www.smashingmagazine.com/2026/05/designing-stable-interfaces-streaming-content/)).
3. **Scroll-lock streaming.** Auto-scroll only while the user is within ~60 px of the bottom; stop when they scroll up; show a floating "latest" button (same Smashing article). Batch token updates to once per frame (FlashList + throttled setState); respect reduce-motion by showing the full message at once.
4. **No assistant bubble.** Assistant text full-width on `bg`, only the user message gets a `surface` bubble (accent only on the send button and links). Fewer boxes, long markdown readable, one accent. Design judgement, no external source.
5. **Big targets, few icons.** Max 4 icons in the main view (menu, new chat, model, send/stop). Every tappable >= 48x48 dp with >= 8 dp spacing ([Android Accessibility Help](https://support.google.com/accessibility/android/answer/7101858?hl=en)); WCAG 2.2 AA floor is 24 CSS px ([SC 2.5.8](https://www.w3.org/TR/WCAG22/#target-size-minimum)).
6. **On-device honesty footer.** Tiny muted line under finished replies: `18 tok/s - 2.7 GB model` (PocketPal exposes tokens/s and memory on its benchmark page; here inline and muted). Feed from `result.timings`.

---

## Risks / open items
1. llama.rn 0.12.9 on RN 0.86.3 untested by anyone I could find; build #1 is the test. Fallback: 0.13.0-rc.7 (newer llama.cpp b11457-era fixes, but rc and has open OpenCL/HTP issues).
2. `qwen35`/`gemma4` model load on 0.12.9 unverified; smoke test with 0.8B first, fall back to Qwen3-4B-Instruct-2507.
3. Free-tier queue can be 90+ min; one failed build burns 1 of 15.
4. App's `app.json` has `userInterfaceStyle: "dark"` and black backgrounds; light theme needs `"automatic"` (not changed here).
5. Android 16 + background downloader behaviour needs a real-device check.
