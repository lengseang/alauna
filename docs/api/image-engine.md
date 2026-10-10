# On-device image engine: options, model fit, integration plan

Date: 2026-10-10. Target: Expo SDK 57 / RN 0.86.3 (New Arch), Galaxy S23 Ultra (SD 8 Gen 2, Adreno 740, 12 GB), offline, EAS builds only.
Every version, size and URL below was fetched on 2026-10-10. Anything marked **(est.)** is my extrapolation, not a measurement. Nothing here has been run on the phone.

## 0. Starting point (repo facts)

- `mobile/src/core/imageGen/modelRegistry.ts` already has `runtimeId: 'sd-cpp'` on every entry. Most entries point at GGUF files, which is the stable-diffusion.cpp (sd.cpp) format.
- Three SD1.5 entries (DreamShaper v8, AbsoluteReality v1.8.1, CyberRealistic v5) are fp16 `.safetensors`. sd.cpp loads these directly.
- `llama.rn 0.12.9` is already in the app, so the dev-client and prebuild pipeline exists. There is no `android/` folder; EAS prebuilds it. RN 0.86's NDK is `27.1.12297006` (`node_modules/react-native/gradle/libs.versions.toml`).
- Registry gaps found: `sd-turbo-q4`, `bk-sdm-small-q4` and `stable-diffusion-v1.5-q4` have no `hfRepo`/`hfFile`, and their SHA-256 values cannot be tied to a real file. All ten entries that do have `hfRepo`/`hfFile` resolve to real files with the sizes stated in the registry (checked via the HF tree API).

## 1. Engine options

| | (a) stable-diffusion.cpp | (b) ONNX Runtime RN | (c) MediaPipe Image Generator | (d) Local Dream engine (QNN NPU / MNN) | (e) ExecuTorch (`react-native-executorch`) |
|---|---|---|---|---|---|
| Source | https://github.com/leejet/stable-diffusion.cpp, MIT, 7.6k stars, release `master-951-f89d9b1` published 2026-10-09 | https://www.npmjs.com/package/onnxruntime-react-native 1.24.3 (2026-03-05), MIT | https://developers.google.com/edge/mediapipe, Apache-2.0 (`@mediapipe/tasks-genai` 0.10.29 is the LLM package, not this) | https://github.com/xororz/local-dream, v2.8.1 (2026-07-12), 3.6k stars, **CC BY-NC 4.0** | https://www.npmjs.com/package/react-native-executorch 0.10.5 (2026-10-06), MIT |
| npm package for RN? | **No official one.** Closest: https://github.com/gauthamvr/expo-ondevice-diffusion (MIT, 2026-08, 0 stars, not on npm, ships **no binaries**, spawns `sd-server`/`local-dream` as child processes). `@qvac/diffusion-cpp` 0.28.0 is Bare-runtime only, not RN. | Yes, but it is only an ORT binding. No SD pipeline: you write the CLIP tokenizer, scheduler and VAE glue yourself. https://github.com/zraisan/native-onnx says full `generate()` is not supported yet. | No RN wrapper found. Android Tasks API only. | No library. Off Grid (https://github.com/alichherawalla/off-grid-mobile-ai, MIT RN app) wraps it in `LocalDreamModule.kt`, which spawns the binary as a subprocess with an HTTP server on `localhost:18081` and SSE progress. | Yes. `useTextToImage` / `createSdxsTextToImage`. |
| Model formats | GGUF (f16, q8_0, q5, q4_0, q4_1, K-quants) and `.safetensors`/`.ckpt` converted at load time. SD1.x, SD2.x, SD-Turbo, SDXL, SDXL-Turbo, SD3, FLUX. LoRA supported (incl. LCM-LoRA). Reuses most of the app's files. | ONNX only (e.g. `onnxruntime/sd-turbo`: UNet 1.73 GB, text enc. 0.68 GB, VAE 0.1 GB). Existing GGUF/safetensors unusable. | SD1.5-architecture only, converted with a Google script to its own format. Existing files unusable without conversion. | SD1.5 (all backends) and SDXL (NPU needs 8 Gen 3+). Own packs: QNN `.bin` zips ~1.03 to 1.07 GB for `8gen2` (https://huggingface.co/xororz/sd-qnn), MNN zips ~1.19 GB (https://huggingface.co/xororz/sd-mnn, only 5 models). Existing files unusable. | `.pte` only. One model: SDXS-512 DreamShaper (XNNPACK fp32 1.76 GB; Vulkan fp16 0.88 GB exists on HF but docs list only XNNPACK/CoreML). Custom `.pte` export possible. |
| RN integration effort | **3-5 days** to first image (own Expo module + JNI over the C API), +1-2 days OpenCL tuning. | 1-2+ weeks (write the whole pipeline in TS/C++), plus a custom ORT build for any NPU path. | 1 week (Kotlin module + model conversion), still SD1.5 only. | 2-3 days if you copy Off Grid's module pattern, but you must extract `.so` files from a release APK. | **~1 day** (install, config, call). |
| Expo config plugin | Yes, small: manifest `<uses-native-library android:name="libOpenCL.so" android:required="false"/>`, `minSdk`/ABI props (ABI already `arm64-v8a`). | Needs the package's plugin/autolink only. | Gradle dep + module. | Manifest + jniLibs + QNN assets copy. | Package plugin; needs New Arch (we have it) and peers `react-native-worklets`, `react-native-blob-util`. |
| APK size | ~25 MB uncompressed for `libsd-server.so` per expo-ondevice-diffusion docs; expect ~8-15 MB compressed. | ORT mobile ~10-20 MB **(est.)** | GPU delegate libs, ~10-20 MB **(est.)** | Local Dream's whole APK is 56.7 MB (includes UI); core `.so` + QNN libs are the bulk. | ExecuTorch libs, tens of MB **(est.)** |
| Speed on S23 Ultra, 512x512 | **No S23U figure exists.** Anchors: sd.cpp OpenCL on **Adreno 830** (8 Elite, faster than our 740): SD1.x 13.4 s/it, SD2.x 4.6 s/it (cfg>1, i.e. 2 UNet passes), https://github.com/leejet/stable-diffusion.cpp/issues/747. Adreno 740 **(est.)** is 1.5-2x slower. Few-step SD-Turbo/LCM at cfg 1 (1 pass/step), 4 steps: **~20-60 s (est.)**. A 20-step SD1.5 image: **minutes (est.)**. SDXL: multi-minute. | CPU/XNNPACK only in the stock RN build; **slow, minutes (est.)**. | "as little as about 15 s" on high-end devices per the Google blog (no device/step count given). Only SD1.5. | **NPU: 5-10 s per image** on 8 Gen 2/3 (Off Grid README); CPU/MNN ~15 s. Qualcomm's own demo: SD1.5, 20 steps, <15 s on 8 Gen 2. Best by 10x. | BK-SDM-Tiny (old docs): 256px, 10 steps, 16.6 s OnePlus 12 / 18.8 s Galaxy S24. SDXS-512 is 1-step; no published Android number; **~5-20 s (est.)**. |
| RAM | SD1.5 512 q4_0 ~2.0 GB (1.5 with flash attn) per sd.cpp docs. SDXL 512: 2.2 GB (Q2_K) to 6.9 GB (fp16) per Local Diffusion. FLUX Q2_K 512: ~4.5 GB. | 3+ GB for fp16/fp32 SD **(est.)** | ~2-3 GB **(est.)** | ~1-2 GB (NPU pack) | BK-SDM 256: 2.9 GB; 512: 6.7 GB on Android (0.6.x docs). SDXS unknown. |
| Negative prompt / CFG / seed | All yes | Yours to build | Prompt, iterations, seed | Yes (negative, CFG, DPM scheduler) | **No negative, no CFG**, seed only |
| License risk | Clean (MIT). Model licenses (OpenRAIL) are separate. | Clean | Clean | **NonCommercial.** Shipping its `.so` in a commercial app is not permitted by the licence; it also needs proprietary Qualcomm QNN `.so` files. Fine only if CHIWIWI stays personal/non-commercial. | Clean (MIT); model is openrail++ |
| Maintenance risk | Very active (daily commits) but **API churns** (pin a tag). Biggest single risk: Android speed. | Active, but wrong tool for SD on phones. | Image Generator is labelled "early, experimental"; the sibling LLM API went maintenance-only in 2026. No deprecation notice found for the image task, but unconfirmed. | One maintainer, no stable API; CLI flags can change (expo-ondevice-diffusion has a check script for that). | Active (1.7k stars, pushed daily). Fixed model, so it cannot serve the registry. |
| New APK needed | Yes | Yes | Yes | Yes | Yes |

(e) MNN-diffusion and Apple/CoreML: not relevant, skipped. Note `expo-ondevice-diffusion` is the only existing RN glue for sd.cpp+local-dream, but it is a 2-week-old, 0-star, vendor-only repo whose own README rates the sd.cpp CPU path at "minutes"; use it as a design reference, do not depend on it.

### Verdict

1. **Phase 1 (recommended): stable-diffusion.cpp, in-process, via our own local Expo module.** MIT, accepts the GGUF/safetensors files the app already knows, has a real C API with a progress callback and `sd_cancel_generation`. Honest limit: on S23 Ultra it is only comfortable for few-step models (SD-Turbo, LCM, DMD2, SDXS, Lightning). 20-step SD1.5 and any SDXL/FLUX are "go make tea" speed.
2. **Phase 2 (optional, only if the owner accepts the NC licence and SD1.5-only):** add Local Dream's engine as a second backend behind the same TS interface for the NPU speed (5-10 s). Models are separate ~1 GB downloads (e.g. `DreamShaperV8_qnn2.28_8gen2.zip` 1.03 GB, `AbsoluteReality_qnn2.28_8gen2.zip` 1.05 GB).
3. **Fallback if sd.cpp proves too slow in the smoke test:** `react-native-executorch` SDXS-512 (1 step) for a ~1-day working "draft" generator. It cannot run the registry models.

Decision record: 2026-10-10 · sd.cpp in-process Expo module first · because license-clean, reuses existing files, hardest part is a CMake build · reverse-if the smoke test shows SD-Turbo 4-step 512² takes >60 s warm on the S23U on both CPU and OpenCL, then go straight to Phase 2 or the ExecuTorch fallback · confidence: medium (speed unmeasured; build feasibility high).

## 2. Model fit with sd.cpp (registry vs reality)

sd.cpp loads one of two layouts. **Single-file** checkpoints (`-m`) contain CLIP + UNet + VAE. **UNet-only** GGUFs (ComfyUI-GGUF style, `--diffusion-model`) need CLIP/VAE files supplied separately. The registry has no field for companion files; add one (`companions: {clipL, clipG, t5xxl, vae}`).

| Registry id | File (verified exists, size) | Runs on sd.cpp? | Needs |
|---|---|---|---|
| `dreamshaper-v8`, `absolutereality-v1.8`, `cyberrealistic-v5-sd15` | `.safetensors` fp16, 2.13 GB each | **Yes, as-is** (single file, SD1.x). 20 steps = slow. | For fast use add LCM-LoRA: https://huggingface.co/latent-consistency/lcm-lora-sdv1-5 `pytorch_lora_weights.safetensors` 134.6 MB (openrail++), then 4-8 steps, cfg 1, sampler `lcm` (per sd.cpp `docs/lcm.md`). Turns three existing downloads into few-step models for +135 MB. Quality vs a fused LCM checkpoint is unmeasured. |
| `dreamshaper-7-lcm-f16` | `darkmaniac7/TokForge-DreamShaper-LCM-GGUF` `dreamshaper-7-lcm-f16.gguf` 2.13 GB | **Yes**, single file, card gives sd.cpp command: `lcm` sampler+scheduler, 6 steps, cfg 1.5, 512². Best fit today. Smaller `-q4` repo: `darkmaniac7/TokForge-DreamShaper-LCM-GGUF-q4` `dreamshaper-7-lcm-q4_0.gguf` 1.63 GB. | nothing |
| `cyberrealistic-pony-v12-q4` | `Green-Sky/CyberRealisticPony-GGUF` `CyberRealisticPony_V12.7-vae_f16-q4_0.gguf` 2.60 GB | **Yes**, made for sd.cpp, VAE merged. But SDXL, card recommends 36 steps at 832x1216: **impractical on-device**. | nothing |
| `realvisxl-v5-q4`, `cyberrealistic-xl-v4-q4` | `hum-ma/SDXL-models-GGUF` `RealVisXL_V5.0-Q4_0.gguf`, `cyberrealistic-xl-v4-sdxl-Q4_0.gguf` 1.49 GB each | **Unverified.** These are UNet-only ComfyUI-GGUF files (repo README says they are for city96's ComfyUI nodes). Off Grid's maintainers state community quants of this kind "fail `get sd version from file`" with plain `-m`. Try `--diffusion-model`. | Same repo: `clip/clip_l.safetensors` 247 MB, `clip/clip_g.safetensors` 1.39 GB, `vae/xlVAEC_c91.safetensors` 167 MB. SDXL speed is poor regardless. |
| `illustrious-xl-q4` | `calcuis/illustrious` `fast-illustrious-q4_0.gguf` 1.46 GB | **Unverified**, same UNet-only situation. | Same repo: `illustrious_clip_g.safetensors` 1.39 GB, `illustrious_clip_l.safetensors` 247 MB, plus an SDXL VAE (e.g. fp16-fix). Slow. |
| `pony-diffusion-v6-xl-q8` | `morikomorizz/Pony-Diffusion-V6-XL-GGUF` `pony_diffusion_v6_xl_Q8_0.gguf` 2.74 GB | **Unverified**, UNet-only. | Same repo: `pony_clip_g.safetensors` 1.39 GB, `pony_clip_l.safetensors` 246 MB, `pony_VAE_SDXL.safetensors` 335 MB. Slow. |
| `flux1-schnell-q2` | `city96/FLUX.1-schnell-gguf` `flux1-schnell-Q2_K.gguf` 4.01 GB | Loads in principle (`--diffusion-model`, documented in sd.cpp `docs/sd.md`), but needs `clip_l`, a `t5xxl` (several GB), and `ae` VAE; ~4.5 GB+ RAM at 512 even at Q2_K, 4 steps of a 12B DiT on a phone. **Not recommended for this device.** | clip_l, t5xxl, ae.safetensors (exact files not verified) |
| `sd-turbo-q4` | no `hfRepo`/`hfFile` in registry (1.68 GB, SHA unverifiable) | Replace with `Green-Sky/SD-Turbo-GGUF` `sd_turbo-f16-q8_0.gguf` 2.02 GB (card: cfg 1, ~8 steps, 512² only; 4 steps also works in practice **(est.)**) | licence is Stability Community (`other`) |
| `bk-sdm-small-q4`, `stable-diffusion-v1.5-q4` | no source in registry | No file to verify. SD1.5 runnable via the DreamShaper-class safetensors above. Drop or source these. | |

### Best few-step options (all single-file, sd.cpp-ready, verified to exist)

1. **DreamShaper 8 LCM Q4_0**: `haven-ai-companion/dreamshaper8-lcm-gguf` `DreamShaper8_LCM_q4_0.gguf` 1.63 GB (q8_0 1.80 GB). SD1.5, `lcm` sampler, 4-8 steps, cfg ~2, CreativeML OpenRAIL-M. Default pick; Q4_0 is the type sd.cpp's Adreno OpenCL path is tuned for.
2. **RealVisXL V5.0 Lightning Q4_K**: `offgrid-ai/realvisxl-v5.0-lightning-GGUF` `realvisxl-v5.0-lightning-Q4_K.gguf` 2.80 GB. SDXL Lightning, `euler`, 4-6 steps, cfg 1-1.5, openrail++. Photoreal quality tier; expect minutes at 1024², try 768. Converted with sd.cpp itself, so it loads with plain `-m`. Q4_K is not the Adreno-optimised type, so likely CPU-bound.
3. **DreamShaper XL v2 Turbo Q4_K**: `offgrid-ai/dreamshaper-xl-v2-turbo-GGUF` `dreamshaper-xl-v2-turbo-Q4_K.gguf` 2.80 GB. SDXL Turbo-style, few steps, openrail++. Same speed caveat.
4. **SDXS-512 (1 step)**: `concedo/sdxs-512-tinySDdistilled-GGUF` `sdxs-512-tinySDdistilled_Q8_0.gguf` 683 MB, openrail++. Speed floor / "instant draft" option. Card details unread; test quality before shipping.
5. **SD-Turbo**: `Green-Sky/SD-Turbo-GGUF` `sd_turbo-f16-q8_0.gguf` 2.02 GB. Fastest per step in sd.cpp-on-Adreno data (SD2.x-class), but SD2.1's training data was NSFW-filtered, so it is **not** an uncensored finetune.
Also seen: `mrfatso/DMD2-dreamshaper-v1-5-GGUF` (`...-q4_0.gguf` 1.58 GB; no model card, no licence, so untrusted until tested).

"Uncensored" here only means: sd.cpp has no safety checker, and the finetune is known to render adult content. I did not generate or review any output.

## 3. Integration plan (sd.cpp, in-process)

### 3.1 TypeScript contract (what the app calls)

```ts
export interface ImageEngine {
  load(modelPath: string, opts?: {
    companions?: { clipL?: string; clipG?: string; t5xxl?: string; vae?: string; taesd?: string };
    lora?: { path: string; scale: number }[];
    backend?: 'auto' | 'cpu' | 'opencl';   // default 'auto' = opencl if device has Adreno, else cpu
    threads?: number;                       // default = performance cores (4 on 8 Gen 2)
  }): Promise<void>;
  generate(
    p: { prompt: string; negative?: string; steps: number; width: number; height: number;
         seed: number; cfg: number; sampler?: 'euler' | 'euler_a' | 'lcm' | 'dpm++2m'; },
    onProgress: (step: number, total: number) => void,
    signal?: AbortSignal,
  ): Promise<string>;                        // absolute path of a PNG in cacheDir
  release(): Promise<void>;
}
```
`signal.abort` calls native `cancel()`; promise rejects with `AbortError`. One model resident at a time; `load` implicitly releases.

### 3.2 Native side

Create a **local Expo module** at `mobile/modules/chiwiwi-sd/` (Expo autolinks `./modules` by default; scaffold with `npx create-expo-module@latest --local`, then delete the iOS/web parts).

- `android/build.gradle`: `defaultConfig { ndk { abiFilters "arm64-v8a" } externalNativeBuild { cmake { arguments "-DANDROID_STL=c++_shared", "-DANDROID_PLATFORM=android-30" ; cppFlags "-O3" } } }`, `externalNativeBuild { cmake { path "src/main/cpp/CMakeLists.txt"; version "3.22.1" } }`. NDK comes from RN's `rootProject.ext.ndkVersion` (27.1.12297006).
- `CMakeLists.txt`: `FetchContent_Declare(sdcpp GIT_REPOSITORY https://github.com/leejet/stable-diffusion.cpp GIT_TAG master-951-f89d9b1 GIT_SUBMODULES_RECURSE TRUE)` (pins the tag verified above; ggml is its submodule). Options: `-DSD_BUILD_EXAMPLES=OFF -DGGML_OPENMP=OFF -DGGML_BACKEND_DL=OFF -DBUILD_SHARED_LIBS=OFF`. Link our `libchiwiwi_sd.so` with `-Wl,-z,max-page-size=16384` (16 KB pages; NDK r27 needs it explicit) and `-fvisibility=hidden -Wl,--exclude-libs,ALL` so our ggml copy cannot collide with the ggml inside `llama.rn`.
- **Phase 1a is CPU-only** (`SD_OPENCL=OFF`): gets a green EAS build and a first image with the least moving parts. **Phase 1b** turns on `-DSD_OPENCL=ON`; that needs OpenCL headers and an ICD-loader `libOpenCL.so` at build time (sd.cpp `docs/build.md` "Build with OpenCL (for Adreno GPU)": Adreno only, mostly Q4_0-tuned). Pull `KhronosGroup/OpenCL-Headers` and `OpenCL-ICD-Loader` via FetchContent/ExternalProject, as `expo-ondevice-diffusion`'s `Dockerfile.sd-server.full` does. Check CPU-arch flags (dotprod/i8mm) against the pinned ggml's CMake options; I did not verify the option name.
- `jni.cpp` (~120 lines) over `include/stable-diffusion.h`:
  - `nativeLoad`: `sd_ctx_params_init`, set `model_path` **or** `diffusion_model_path` + `clip_l_path`/`clip_g_path`/`t5xxl_path`/`vae_path`/`taesd_path`, `n_threads`, `diffusion_flash_attn`, `enable_mmap`, `backend` (string), then `new_sd_ctx`.
  - `nativeGenerate`: `sd_img_gen_params_init`; set prompt, negative_prompt, width, height, seed, `sample_params` (steps, cfg, sampler/scheduler), `vae_tiling_params` on; `sd_set_progress_callback` -> JNI `AttachCurrentThread` -> Kotlin lambda; `generate_image(...)`; return RGB bytes of `sd_image_t`; free.
  - `nativeCancel`: `sd_cancel_generation(ctx, SD_CANCEL_ALL)`; call `SD_CANCEL_RESET` at the start of each generate.
  - `nativeRelease`: `free_sd_ctx`.
- Kotlin `ChiwiwiSdModule.kt` (expo-modules-core 57.0.21): `AsyncFunction("load")`, `AsyncFunction("generate")` (runs on `Dispatchers.Default`), `Function("cancel")`, `AsyncFunction("release")`, `Events("onProgress")`. Convert RGB bytes to PNG with `Bitmap` + `compress(PNG)` into `cacheDir` and return the path (avoids base64 over the bridge).
- Config plugin `plugins/withSdModule.js` (add to `app.json` `plugins`): inject `<uses-native-library android:name="libOpenCL.so" android:required="false"/>` into the `<application>` manifest (needed on Android 12+ for apps to load the vendor OpenCL library). Keep `buildArchs: ["arm64-v8a"]` as already set.

### 3.3 Build with EAS (no local Windows build)

1. `cd mobile && git add modules plugins app.json && git commit` (EAS builds the committed tree). No new npm dependency for Phase 1; `expo-modules-core` is already transitive.
2. `eas build -p android --profile development` (existing profile, debug APK, dev client, cache key `chiwiwi-dev-cache`). First run compiles ggml/sd.cpp for arm64 only; expect a long first build, then cached.
3. Download APK from the EAS build page, `adb install -r`. Use the **development** profile for iteration; only run `preview` (release APK, `assembleRelease`) at the end because release uses R8-off settings already in `app.json` but compiles C++ with different flags.
4. If Gradle fails to fetch CMake 3.22.1 on the EAS image, pin the version or install via `sdkmanager` in an `eas-build-pre-install` hook. I could not test this.

### 3.4 Smoke test on the phone

Use a dev-client APK, `adb logcat -s chiwiwi-sd:V` (log sd.cpp lines through `sd_set_log_callback`), and `adb shell dumpsys meminfo com.chiwiwi.sovereign` between steps.
1. App boots with the module linked and **llama.rn still works** (load a small GGUF chat model, send one message). This catches ggml symbol collisions first.
2. `load` DreamShaper8 LCM Q4_0 on **CPU**. Record load seconds and RSS.
3. Generate 512x512, 4 steps, cfg 1.5, `lcm`, fixed seed. PNG opens, not black/noise. Record total s and s/step (first run cold, second run warm).
4. Same seed twice gives the same image (determinism).
5. Cancel mid-run: returns within one step, no crash, a following generate works.
6. Switch backend to **OpenCL** (Phase 1b): same prompt, compare s/step and image. Watch for black image (VAE decode OOM on Adreno; fixes exist upstream in PR #1932, use `taesd` + VAE tiling) and for `max mem alloc size` warnings.
7. Add the LCM-LoRA to the existing DreamShaper v8 safetensors, 4 steps: compare with item 3.
8. UNet-only SDXL GGUF with companions (RealVisXL Q4_0): confirm it loads at all; if "get sd version" fails, mark those registry entries unsupported and use the offgrid-ai Lightning files.
9. 10 consecutive generations: RAM stable, temperature/throttling (s/step drift), no LMK kill. Then load the LLM and image model together to learn the real combined RAM.
10. Screen off / app backgrounded mid-generation: does it survive? (May need a foreground service.)
Pass bar: step 3 under ~30 s warm on at least one backend. If not met see the reverse-if above.

### 3.5 Risks

- **Speed is the main risk and is unmeasured.** Everything fast-looking above comes from other hardware (Adreno 830) or other engines (QNN NPU).
- sd.cpp master moves daily and has no stable ABI; pin the tag and bump deliberately. Re-check header field names on every bump.
- Two ggml copies in one process (`llama.rn` + ours): mitigated with hidden visibility, but untested. Two OpenCL contexts or two big models resident at once may OOM; plan to release the LLM before image generation, or at minimum test it.
- ComfyUI-style UNet-only SDXL/Pony/Illustrious GGUFs may not load, and need extra downloads. Treat as unsupported until step 8 passes.
- OpenCL on Adreno is "experimental", Adreno-7xx-only, VAE-decode OOM and blank-image bugs are in the issue tracker. CPU path must remain a working fallback.
- In-process native OOM or segfault kills the whole app (expo-ondevice-diffusion avoids this by running a child process). Accepted trade-off for progress callbacks and cancel; revisit if crashes appear.
- Thermal throttling on repeated runs; long jobs may need a foreground service.
- Licences: OpenRAIL-M / openrail++ use restrictions travel with each model; SD-Turbo is Stability Community licence; Local Dream is CC BY-NC (Phase 2 only, not shippable commercially, depends on extracted binaries plus proprietary Qualcomm libs).
- Registry hygiene: three entries have no source file, and `downloadSizeBytes`/SHA need re-checking for any file we swap in.

## 4. Phase 2 sketch (NPU, optional)

Mirror Off Grid's `LocalDreamModule.kt` (MIT): spawn `libstable_diffusion_core.so` (extracted from the `LocalDream_armv8a_2.8.1.apk` release, along with the QNN libs) as a child process on localhost, POST `/generate`, read SSE progress, convert the returned RGB to PNG. Pick the `8gen2` pack for the S23 Ultra. Backend is chosen by the model folder contents (`unet.bin` = NPU, `unet.mnn` = CPU/MNN). Same `ImageEngine` interface, `load(dirPath)`. Hand the owner the licence decision before any work starts.

## Summary (<=8 lines)

- Recommended path: stable-diffusion.cpp (MIT, tag `master-951-f89d9b1`) in-process through our own local Expo module (Kotlin + JNI + CMake), CPU first, Adreno OpenCL second. No suitable npm package exists.
- Default model: DreamShaper 8 LCM Q4_0 (1.63 GB, `haven-ai-companion/dreamshaper8-lcm-gguf`) at 4-8 steps; existing SD1.5 safetensors become few-step by adding the 135 MB LCM-LoRA. Heavy SDXL/FLUX registry entries are impractical or unverified on this phone.
- Effort: about 3-5 days to the first real image on CPU, plus 1-2 days for OpenCL tuning and smoke tests. NPU backend (Local Dream) would be another 2-3 days.
- Owner must: approve a new dev-client APK via `eas build -p android --profile development`, run the smoke-test checklist on the S23 Ultra and report s/step, and decide whether CHIWIWI is strictly non-commercial (Local Dream's CC BY-NC licence gates Phase 2).
- Biggest unknown: real S23 Ultra speed. Reverse-if SD-Turbo/LCM 4-step 512² exceeds 60 s warm.
