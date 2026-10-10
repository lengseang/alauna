# GEMINI-TASKS.md — instruction pack for the next updates

Read `GEMINI.md` first (hard rules). Foundation and backbone are done; you build features on top. One task = one small commit on `main`.

## Loop for every task
1. Read the task, then the files it names (do not scan the whole repo).
2. Make the smallest change that makes the feature REAL. Do not delete or hide anything.
3. Add or update a `node:test` test in `mobile/test/` for any new logic.
4. Run, from the repo root in PowerShell: `node scripts/gate.mjs` — it must print `GATE PASSED`.
   Then `cd mobile; npx expo export --platform android --output-dir $env:TEMP\exp` must succeed.
   If the catalog changed: `node scripts/verify-catalog.mjs` must exit 0.
5. If the gate legitimately needs a higher baseline (you ADDED models/routes), run `node scripts/gate.mjs --update` and commit `docs/BASELINE.json`.
   Never lower a baseline. If you think something must be removed, STOP and ask the owner.
6. Commit: `git add -A; git commit -m "<what and why>"`; `git push origin main`. Paste the gate output in your report.

## Where things live (backbone)
- Pure logic (tested under Node): `mobile/src/core/*` — catalog (`catalogData.ts`), downloads (`downloadManager.ts`), chat, soul, voice state machines.
- Side effects: `mobile/src/services/*` — engine (`engine.ts`, `llamaEngine.ts`), settings, storage slots, downloads wiring, voice, security.
- UI: `mobile/src/ui/*` (screens) and `mobile/src/theme/*` (tokens). Register screens in `mobile/src/ui/routes.tsx`. Use primitives from `docs/DESIGN.md`.
- API docs for each layer: `docs/api/vault.md`, `docs/api/engine.md`, `docs/api/voice-media-security.md`.

## Task queue (do in order; tick when the gate passes AND the owner confirms on the phone where marked)
### Fix-ups already known
- [x] T1 `chat.ts`: add real `deleteMessage(threadId, id)` and `truncateFrom(threadId, id)`; switch `ChatScreen` delete/edit-resend to them (currently a workaround via `renameThread`). Tests.
- [x] T2 Parallel-downloads setting: move `chiwiwi_downloads.json` pref into Settings v2 (`downloads.parallel`), apply at app start (boot stage), not only when the Vault opens. Tests.
- [x] T3 Remove duplicate settings `settings.stt`, `settings.tts`, `settings.biometricLock` OR make them the single source for the voice/security prefs (pick one, migrate old files). Tests.
- [x] T4 Expose `verifyMode` ('background' | 'always' | 'off') in Settings → Security & privacy with an honest description.
- [x] T5 Accessibility pass: `accessibilityLabel` on every icon-only button, text scale 1.3 does not clip, reduced motion respected, 48dp targets. Add a test that greps for `IconButton` without `label`.
- [x] T6 Helios (light) splash + adaptive icon: hand-tune colours from `docs/DESIGN.md` tokens; owner approves visually.
- [x] T7 Refresh stale docs: `docs/ARCHITECTURE.md`, `docs/QA_PLAN.md`, `docs/REQUIREMENTS.md`, `docs/audit/00-master-spec.md` to match v2 (read the code, do not guess).

- [x] T8 Add models (owner request 2026-10-09). Search Hugging Face and add REAL, verified GGUF entries to `mobile/src/core/catalogData.ts`:
  - Hermes 4 14B added (Q4_K_M 9.00 GB, `bartowski/NousResearch_Hermes-4-14B-GGUF`, verified; no 8B Hermes 4 exists upstream).
  - Mistral NeMo Instruct 12B added (Q4_K_M 7.48 GB, `bartowski/Mistral-Nemo-Instruct-2407-GGUF`, verified; Rocinante and abliterated NeMo already in catalog).
  - Dolphin 14B not found upstream; Dolphin 24B (14.33 GB) & Mistral Small 3.2 24B (14.33 GB) exceed 12 GB phone RAM (too large for phone, reported honestly).
  - Verified with `node scripts/verify-catalog.mjs`, `node scripts/gate.mjs`, and `mobile/test/catalog.test.ts`.

### Image generation (owner request 2026-10-10) — read `docs/api/image-engine.md` first (research, contracts, risks)
Context: the old Image Studio generator was FAKE (timed loop + procedural gradient); it is removed. Never reintroduce simulated progress or placeholder images. Every % shown must come from the native engine callback.
- [ ] T9 Native engine (needs a NEW dev-client APK; owner builds it). Local Expo module `mobile/modules/expo-sd-cpp` (Kotlin + JNI + CMake) wrapping stable-diffusion.cpp (pin the tag in the research doc; hide ggml symbols so it cannot clash with llama.rn; arm64 only). Implements the `LocalDiffusionEngine` interface in `core/imageGen` (load, generate with onProgress + AbortSignal, release); PNG written to cacheDir, path returned (no base64 over the bridge). CPU first. Wire `isNativeDiffusionEngineAvailable()` to a real check of the native module. Smoke test = research doc checklist; report seconds per step honestly.
- [ ] T10 Accurate defaults per model family (`core/imageGen/modelRegistry.ts`): LCM/Turbo/Lightning models use few steps (4-8), CFG 1.0-2.0, correct sampler/scheduler; plain SD1.5 uses 20-30 steps, CFG 6-8; SDXL per its card. Negative prompt defaults per family (quality + anatomy terms), clip-skip where applicable, VAE tiling for memory. Add the 135 MB LCM-LoRA path so the existing SD1.5 safetensors can run few-step. Fix registry gaps: `sd-turbo-q4`, `bk-sdm-small-q4`, `stable-diffusion-v1.5-q4` need real `hfRepo`/`hfFile` + sha256 or must be marked "unverified"; verify every file (size + sha256) like the LLM catalog.
- [ ] T11 Adaptive generation (`core/imageGen/adaptivePlanner.ts` already exists; extend, with tests): measure real seconds/step on this phone after the first image and store it per model+backend; then the planner picks resolution (384/512/640, multiples of 8), steps and batch to hit the user's time target (Fast ≤ 30 s / Balanced / Quality) within free RAM (use real device RAM + the loaded LLM's footprint; unload the LLM when needed and say so); fall back from OpenCL to CPU on failure with the reason shown; thermal/battery guard (lower steps when device is hot or battery < 15%); progressive preview every N steps only if the engine supports intermediate decode, otherwise show a plain progress bar.
- [ ] T12 Prompt accuracy flow: the loaded chat LLM (when available) can rewrite the user's short prompt into a detailed diffusion prompt + negative prompt (optional "Enhance prompt" toggle, shows the rewritten text for the user to edit before generating; never silent). Seed lock, variations (same prompt new seed), img2img later. Save prompt, seed, steps, cfg, model, timings with each gallery image and show them in the detail view ("Regenerate with same settings").
- [ ] T13 Flow and performance: generation runs off the UI thread; queue of requests; cancel works within one step; app-background safe (foreground notification is optional later); release the engine after N minutes idle; prevent double-start; clear error states for: model not installed, out of memory (suggest smaller size/steps), engine missing. Add tests for planner and queue logic; keep Image Studio tabs and model installer.

### UI/UX improvement pass (owner request 2026-10-10)
- [ ] T14 Audit every screen against `docs/DESIGN.md`: one primary action per screen, ≤4 icons per view, text ≥14sp, 48dp targets, sharp corners, both themes, text scale 1.3. Screens to review in order: Chat, Composer, Model Vault, Model detail, Downloads, Image Studio, Settings hub, Soul. Fix spacing/alignment/hierarchy issues; do not remove features. Provide before/after screenshots in the report (owner supplies them from the phone if you cannot run the app).
- [ ] T15 Motion polish: 60 fps native-driver transitions for drawer, sheets, route push/pop; skeletons for list loading; haptic on send/stop/download complete (respect the setting); reduced-motion respected everywhere.
- [ ] T16 Image Studio UX: simple default view (prompt box, model chip, Fast/Balanced/Quality segmented control, Generate), all advanced controls (steps, CFG, size, seed, negative prompt, sampler) behind one 'Advanced' section; gallery grid with long-press actions (share, favorite, delete with undo, regenerate); honest engine/model status banner.

### Needs the phone (owner reports results, you fix)
- [ ] P1 First load: Qwen3.5 0.8B → "Ready" → streams a reply with real tok/s. Fix whatever fails.
- [ ] P2 Download pause/resume/kill-app/resume; background verification finishing; mismatch path.
- [ ] P3 Vision (image + mmproj), voice mode (needs the NEW APK: includes `@fugood/react-native-audio-pcm-stream`), TTS voices, biometric lock.
- [ ] P4 KV session cache: measure cold vs warm time-to-first-token and show it in Advanced compute.
- [ ] P5 GPU backend (experimental) fallback to CPU shows the reason.

### Features backlog (ask the owner before starting any)
- Native SHA-256 module (fast, can run in a foreground service). Needs a new APK.
- Image tools (SD-Turbo / Real-ESRGAN) need an ONNX/diffusion engine; keep them listed as "not in this build" until one is integrated.
- Classic big+small speculative pairs: blocked by llama.rn 0.12.9 (MTP only). Re-check on upgrade.
- Cloud-free model search from Hugging Face inside the app (query HF API, add as custom entries with the same verification rules).

## Supervision (owner / Claude)
Before accepting any Gemini session: `git pull`, run `node scripts/gate.mjs`, run the Android export, open the diff for `routes.tsx`, `catalogData.ts`, `settingsModel.ts` and check nothing was removed. Reject sessions whose report says "done" without gate output.
