# CHIWIWI Architecture (v2 "Temple")

What is actually in the app (verified against the codebase; see `ROADMAP.md` for deferred items).

## 1. Shape

```
mobile/
  App.tsx                 shell: startup order, theme provider, lock screen, storage gate, routes, Android Back
  src/
    core/                 PURE logic. No React, no Expo. Unit-tested under plain Node.
                          (catalog, fit, downloadManager, chatTurn, persona, memory, voiceLoop, settingsModel, sha256)
    services/             adapters to phone (files, storageSlots, llama.rn, whisper.rn, tts, downloads, security) + stores
    theme/                Temple design system: tokens, Nyx & Helios palettes, WCAG contrast verification, theme hooks
    ui/                   React Native screens and primitives (radius 0, 48dp targets, Cinzel/Inter type ramp)
  test/                   node:test suites for core logic, theme, settings, downloads, voice, and accessibility
scripts/                  gate.mjs (supervision), verify-catalog.mjs (live HF check), real-model-check.mjs (manual QA)
```

**Dependency rule:** `ui -> services -> core`. `core` never imports `services` or `ui`. Anything that touches the phone is injected into core as a pure interface, which is why the download state machine, voice reducer, and engine lifecycle are tested with fakes (`DownloadPlatform`, `EngineDeps`).

State is held in observable stores (`core/store.ts`) read in React with `useSyncExternalStore`.

## 2. Startup & Lifecycle (order matters)

`services/lifecycle.ts#bootstrap`:

1. `initSettings()` - load `chiwiwi_settings.json` (Settings v2 single source of truth). Migrates legacy voice/security configs and syncs download concurrency (`downloads.setConcurrency`).
2. `initStorage()` - load saved vault location, discover storage slots (`services/storageSlots.ts`), and **re-prove writable**.
3. `checkAppLock()` - if biometric lock is enabled and grace period elapsed, prompt via `expo-local-authentication`.
4. `engine.noteStartup()` - if the last run died while mounting a model, note it (prevents crash loop on OOM).
5. `onStorageReady()` - touch data inside the vault: refresh downloads hub, load memory facts, restore chat threads.

`App.tsx` renders `OnboardingScreen` until storage is `ready`. Nothing else is reachable (ST-1/ST-2).

## 3. Storage & Storage Slots (`services/storage.ts`, `services/storageSlots.ts`)

Layout inside each storage slot root:

```
models/     *.gguf, mmproj-*.gguf, *.gguf.part (resumable partials)
chats/      <threadId>.json
media/      cached vision attachments
memory.json user-managed long-term memory facts
.nomedia    keeps gallery scanners out
```

App-private files (outside the vault): `chiwiwi_settings.json`, `chiwiwi_storage_config.json`.

**Storage Slots:**
- Supports multiple volumes: App-private internal storage, Primary external storage, Secondary external (SD card), and custom user-picked directories.
- Each slot reports capacity, free space, and installed model bytes.
- Models can be moved between slots (`moveToSlot`) with atomic copy, verify, delete, and cancellation tokens.
- Downloads are routed to the designated default download slot.

**File Paths vs SAF:** The engine opens models by real filesystem paths. Android folder pickers return `content://` URIs. `core/paths.ts#safTreeUriToPath` maps picked URIs to `/storage/...`, and `services/storage.ts#probeWritable` proves access by write/read/delete probe. On Android 11+ this uses *All files access*; if declined, **App storage** always works without permissions.

## 4. Downloads Hub (`core/downloadManager.ts`, `services/downloads.ts`)

- **Multi-download queue:** Concurrency (1..4 parallel transfers) configured in Settings v2 (`downloads.parallel`) and applied at boot.
- **Queue reordering:** Users can prioritize waiting models with `moveInQueue`.
- **Live telemetry:** Aggregated and per-file speed (bytes/sec), bytes remaining, ETA, and parts tracking.
- **Pause & Resume:** Native `DownloadTask.resume()` sends `Range: bytes=<offset>-`, appending to the partial file. Resume survives app restarts.
- **Auto-retry:** 4x exponential backoff on network failures; budget refills after 8 MiB of progress.
- **Stall watchdog:** 45 s timeout with zero incoming bytes automatically triggers retry to survive phone background freezes.
- **Integrity verification:** Exact size matches Hugging Face, GGUF magic header check, followed by atomic rename from `.part`.
- **Verification modes:** Configured in Settings → Security & privacy (`verifyMode`):
  - `background`: Usable immediately; SHA-256 completes in background (corrupt files deleted and unloaded).
  - `always`: Blocks until SHA-256 fingerprint matches Hugging Face.
  - `off`: Skips post-download SHA-256 computation.

## 5. Model Status & Vault (`core/modelStatus.ts`, `core/catalog.ts`)

- One pure state function maps download state, engine state, and verification into 9 explicit states and allowed actions.
- Catalog contains 110 verified Hugging Face entries across grades C (<=2B), B (2-4B), S (7B+), Coding, Reasoning, Vision, and Uncensored.
- Every model link resolves on Hugging Face with matching size and sha256 (`scripts/verify-catalog.mjs`).

## 6. Inference Engine (`core/engineManager.ts`, `services/llamaEngine.ts`)

`InferenceEngine { load, generate, stop, release }` implemented over `llama.rn 0.12.9`:

- **Jinja chat templates:** `completion({messages})` renders each model's native template (Qwen, Llama, Gemma, DeepSeek).
- **Multimodal vision:** Supports vision models via projector files (`clipModelPath` / mmproj) with `expo-image-picker`.
- **CPU & GPU backends:** CPU by default with runtime ISA detection (`dotprod`, `i8mm`, `opencl`); experimental GPU toggle with honest fallback reporting.
- **Memory budget & fit rating:** Real device RAM (`expo-device`) drives fit ratings and context length (`nCtx`).
- **MTP / Speculative execution:** Supports Multi-Token Prediction and draft/target speculative pairs where compatible.
- **KV session cache:** Exposes `saveSession` and `loadSession` for warm-start prompt evaluation.

## 7. Chat (`core/chatTurn.ts`, `core/thinking.ts`, `services/chat.ts`)

- **Token streaming:** Coalesced at ~15 fps to preserve 60 fps UI responsiveness.
- **Deterministic reasoning parser:** Extracts `<think>` and `<thinking>` blocks while streaming.
- **Telemetry:** Real engine timings: time-to-first-token (TTFT), tokens per second (tok/s), prompt tokens.
- **Message operations:** Native `deleteMessage(threadId, id)` and `truncateFrom(threadId, id)` for branching and edit-resend.
- **Attachments:** Text files and images (for vision-capable models) with size caps and binary sniffing guards.
- **Incognito threads:** In-memory only; never written to disk.

## 8. Persona ("Soul") & Memory (`core/persona.ts`, `core/memory.ts`, `services/soul.ts`)

- **PAD emotional vector:** Pleasure, Arousal, Dominance bipolar sliders (-1..1) generate prompt descriptors and dynamic sampling adjustments (temperature, top-p, top-k, repeat penalty).
- **Archetypes:** Empathetic Confidant, Sovereign Mentor, Tactical Engineer, Playful Spark.
- **Live preview:** Loaded model generates a test response with soul parameters; TTS speaks the reply.
- **Memory budget:** Long-term facts in `<vault>/memory.json` injected into system prompts up to configurable budget (`memoryBudgetChars`, default 2,400 chars).

## 9. Voice & Audio (`core/voiceLoop.ts`, `services/voice/`)

- Pure state machine reducer: `idle -> listening -> transcribing -> thinking -> speaking -> listening`.
- **STT:** On-device Whisper models (`whisper.rn`) downloaded from Hugging Face (`tiny.en`, `base.en`, `small.en`, and multilingual).
- **TTS:** Native speech synthesis with voice selection, rate (0.25..3), and pitch (0.25..3) controls.
- **Barge-in:** Speaking can be interrupted by user voice activity or manual tap.
- **Voice Overlay:** Full-screen UI with animated Eclipse status and live transcript streaming.

## 10. Security, Privacy & App Lock (`services/security/`, `services/privacy.ts`)

- **Biometric lock:** `expo-local-authentication` gate with configurable grace period (0s, 1m, 5m, 15m).
- **Purge controls:** Granular deletion of chats, memory, KV cache, media attachments, or full factory reset (`purgeAll`).
- **Zero telemetry:** Zero external network requests during chat or inference. Network is used only for user-initiated model downloads.

## 11. Design System ("Temple", `mobile/src/theme/`, `mobile/src/ui/`)

- **Sharp geometry:** `borderRadius: 0` across all UI primitives.
- **Dual skies:**
  - **Nyx (dark):** Background `#080A17`, surface `#0F1329`, gold accent `#E6C76A`.
  - **Helios (light):** Background `#FAF6EC`, surface `#F3ECDB`, bronze accent `#8A5A00`.
- **Typography:** Inter (400/600) for body and UI; Cinzel (600) for headers and wordmark.
- **Accessibility:** 48dp minimum touch targets, WCAG AA contrast (4.5:1 text, 3:1 borders), text scaling up to 1.3x, and reduced motion respected throughout animations.
