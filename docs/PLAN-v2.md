# CHIWIWI v2 — "Restore everything, make it real" plan

Date: 2026-10-08. Owner verdict on v1 rebuild: UI 2/10, functionality -9/10 because features were **removed**.
v2 rule: **the old Gemini app's full feature surface comes back, every item backed by a real implementation** on the
working llama.rn engine. Simplify presentation, never capability.

## 0. Non-negotiable rules (every agent)

1. **Parity, zero silent removals.** Every screen, control, setting, model entry and tag in the old app
   (git ref `94b571d`, read with `git show 94b571d:mobile/<path>`) and in the v1 rebuild (current HEAD) must exist in v2.
   If something truly cannot work on device, keep it visible with an honest state ("Needs a vision model", "GPU not
   supported on this phone: using CPU") and list it in your report under **Needs owner decision**. Never delete it.
2. **Real or labelled.** No canned text, no fake numbers, no hard-coded "Snapdragon NPU", "2.8x", "Thought for 1.2s".
   Every number on screen comes from the engine, the file system or the device.
3. **Design: sharp.** Corner radius 0 everywhere (buttons, cards, inputs, sheets, message blocks). Greek-temple grammar (§3).
4. **Ownership.** Edit only files you own (§4). Keep existing exports working (add, don't break); if a break is unavoidable,
   add a compat shim so the app still typechecks. Do not `git commit` (the orchestrator commits). Run npm/npx in the
   PowerShell tool (llama.rn postinstall breaks under Git Bash). Do not add dependencies; request them in your report.
   Work ONLY inside the worktree `D:\1111-Works\CHIWIWI\.claude\worktrees\project-status-updates-0fdcb7` (a hook blocks the base checkout).
5. **Done = verified.** `npm run check` (typecheck + tests) green for your area, new logic has node:test tests, and
   `npx expo export --platform android --output-dir <scratch>` bundles. Other agents edit concurrently: ignore transient
   type errors in files you do not own, but never leave errors in yours.

## 1. Engine capabilities confirmed in installed llama.rn 0.12.9 (`mobile/node_modules/llama.rn/lib/typescript`)

`initLlama({ model, model_draft | draft_model, n_ctx, n_threads, n_gpu_layers, devices, flash_attn_type: auto|on|off,
cache_type_k/v: f16|q8_0|q4_0…, use_mmap, use_mlock, lora… })`, `NativeSpeculativeConfig/Params` (speculative decoding),
`ctx.initMultimodal({ path: mmproj, use_gpu })` (vision), `ctx.saveSession / loadSession` (KV cache persistence),
`getBackendDevicesInfo()` (real CPU/GPU device list), `completion` streaming with timings, `stopCompletion`, `tokenize`, `bench`.
Installed for v2: `whisper.rn@0.7.4` (on-device STT + VAD), `expo-speech` (offline system TTS + voice list),
`expo-local-authentication` (biometric lock), `expo-image-picker`, `expo-document-picker`.

## 2. Feature parity map (old surface → v2 real implementation)

| # | Old surface / feature | v2 implementation | Owner |
|---|---|---|---|
| 1 | Splash boot HUD | Real boot stages: fonts → storage → library → settings → autoload model (actual progress, no fake timers) | S1 |
| 2 | Chat | Plain assistant text, square user block, thinking collapsible, real stats line (tok/s, tokens, TTFT, backend, draft acceptance %) | S1 |
| 3 | History drawer | New chat, New incognito chat, search, pin, rename, delete (undo), Settings | S1 |
| 4 | Attach sheet (camera / photos / files) | Images → multimodal (vision model + mmproj); text files → context. Honest notice if model has no vision | S1 + W3 + W2 |
| 5 | ThreadSoulModal (per-chat persona) | Per-chat override of global Soul (PAD + archetype + custom prompt) | S3 + W2 |
| 6 | Voice overlay | Real loop: whisper.rn STT (+VAD) → LLM stream → sentence-chunked expo-speech TTS; barge-in stops TTS | S1 + W3 |
| 7 | Storage first-run gate | Real: choose storage slot (internal default / SAF folder), shows free space | S3 + W2 |
| 8 | Settings hub (9 sub-screens) | Kept as hub with sections, real stack navigation + Android back | S3 |
| 9 | Soul (PAD meters, archetypes, voice preview, live simulation) | PAD → sampling (temp/top_p/repeat penalty) + prompt descriptors; live preview = real short generation with loaded model; voice preview = real TTS | S3 + W2 + W3 |
| 10 | Model Vault: 23 models, Grade S/B/C, capability tags Text/Image/Voice/Code/Video, policy Standard/Uncensored, search, AND/OR filters, sort | Full library ≥ 30 real entries (old 23 fixed + v1-era 21 at `d919a34` + current + new Qwen3.5/Gemma 4…), all tags kept + "Fits this phone" + Reasoning tag; every URL/size/sha verified on HF; vision entries carry mmproj | W1 + S2 |
| 11 | Downloads Hub (queue, pause/resume, background sync) | Real queue, speed/ETA, pause/resume/cancel, auto-resume after kill, SHA verify, companion files (mmproj/draft) | W1 + S2 |
| 12 | Speculative Turbo (dual-model presets) | Real speculative decoding via `model_draft`; validated target/draft pairs (same tokenizer family); real acceptance rate + measured speedup | W2 + W1 + S2 |
| 13 | Data & Storage (path, 5 slot cards, purge) | 5 real storage slots (internal + SAF folders), real used/free per slot, move model between slots, purge chats/memory/cache | W2 + S3 |
| 14 | Audio & Voice (STT/VAD/TTS) | whisper model choice (tiny/base, downloadable), VAD threshold, TTS on/off, voice list, rate, pitch, preview | W3 + S3 |
| 15 | Security & Privacy (biometric, retention, purge) | Biometric app lock, incognito default, auto-purge after N days, offline-strict (blocks all network except user-started downloads), integrity check (real SHA + JSON validation) | W3 + W2 + S3 |
| 16 | Advanced Compute (Vulkan, threads, flash-attn, telemetry) | Backend picker from `getBackendDevicesInfo` (CPU / GPU, experimental with auto-fallback), threads, n_ctx, batch, flash-attn auto/on/off, KV cache type, mmap/mlock, KV session cache; live telemetry from real device + engine | W2 + S3 |
| 17 | KV-cache "attention freezing" | Real: `saveSession` of persona/system-prompt prefix per model; `loadSession` on next load; measured TTFT before/after | W2 |
| 18 | Thinking parser | Keep v1 parser (Qwen3.5 / Gemma 4 / DeepSeek R1) | W2 |
| 19 | Memory vault | Facts list, add/edit/delete, pause, budget shown (how much reaches the prompt) | W2 + S3 |
| 20 | v1 additions | Proof-of-life status, warm-up "Ready", Test model, self-test, recommended model, atomic saves, memory guard: all kept | all |
| 21 | Appearance | Theme System / Nyx / Helios, text size, haptics, reduced motion | W4 + S3 |

## 3. Design concept — "Temple" (sharp, Greek, alive)

- Geometry: radius 0, 1px hairline rules, square 48dp controls, strict 4/8 grid, generous whitespace.
- Nyx (dark): night indigo, slow drifting star field, gold-leaf accent. Helios (light): warm marble/parchment, sun glow, bronze accent. One accent; no rainbow.
- Greek grammar used sparingly: Cinzel for screen titles + wordmark, a thin meander (Greek key) rule under section headers, roman-numeral section indices in Settings (I, II, III…).
- Proof-of-life motif: an "eclipse" ring (moon in Nyx, sun in Helios) that fills while loading and pulses softly while generating.
- Chat stays Claude/ChatGPT-like: no bubble for assistant text, square block for user, composer is a flat bar.

## 4. Agents and file ownership (paths under `mobile/` unless noted)

Wave 1 (parallel):
- **W1 Vault backend**: `src/core/catalog.ts`, `src/core/fit.ts`, `src/core/downloadManager.ts`, `src/core/hf.ts`, `src/core/gguf.ts`, `src/core/sha256.ts`, `src/services/downloads.ts`, `src/services/downloadPlatform.ts`, `src/services/hfClient.ts`, `src/services/modelLibrary.ts`, `scripts/verify-catalog.mjs` (repo root), catalog/download tests. API doc: `docs/api/vault.md`.
- **W2 Engine & data**: all other `src/core/*` and `src/services/*` (engine, chat, settings, persona, memory, storage, lifecycle, setup, selfTest…) + their tests. API doc: `docs/api/engine.md`.
- **W3 Voice, media, security**: new `src/services/voice/**`, `src/services/security.ts`, `src/services/attachments.ts`, new `src/core/voice*.ts`, `app.json` (plugins/permissions), tests. API doc: `docs/api/voice-media-security.md`.
- **W4 Design system**: `src/theme/**`, UI primitives in `src/ui/` (Text, Button, IconButton, Icon, Card, Row, Divider, Field, Notice, ProgressBar, Sheet, Toast, EmptyState, Motion, Ambient, Wordmark + new: Meander, Eclipse, Tag, Segmented, Slider, Switch, SectionHeader). `docs/DESIGN.md`, `preview/design-v2.html`.

Wave 2 (parallel, after wave 1): **S1 Chat** (chat, drawer, voice overlay, attach sheet, splash), **S2 Vault UI** (Model Vault, Downloads Hub, Speculative), **S3 Settings** (hub + Soul, Thread soul, Storage, Audio, Security, Advanced, Appearance, Memory, About).

Wave 3: integration verifier (parity checklist against §2 + old screens, check/export, adversarial review) → commit → fast-forward `main` → EAS dev build (new native deps need a new APK).
