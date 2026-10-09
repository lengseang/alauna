# CHIWIWI — Product Requirements (v2 "Temple")

This document specifies the testable requirements for CHIWIWI. **Every requirement has an ID and an acceptance check.**
The QA checklist (`docs/QA_PLAN.md`), Supervision Gate (`scripts/gate.mjs`), and automated test suite (`mobile/test/*`) enforce these requirements.

---

## 1. Product in one paragraph

CHIWIWI is a **private, sovereign, offline AI companion app for phones**. The user downloads an open-weight
GGUF model once, and from then on inference runs **entirely on-device** via `llama.rn` (llama.cpp JSI) — no account, no cloud, no telemetry. It is built on the **Temple** design system: razor-sharp geometry (`borderRadius: 0`), two ancient skies (Nyx dark with gold, Helios light with bronze), Cinzel and Inter typography, and absolute honesty (no fake numbers, no simulated delays).

## 2. The golden path (GP-1)

| # | Step | What the user sees |
|---|------|--------------------|
| 1 | **Install** the APK | Clean package, arm64 native libraries |
| 2 | **Open** app | Welcome screen displays real phone details (brand, model, RAM, CPU) and explains required permissions |
| 3 | **Configure storage** | Choose a folder or use app-private storage. App verifies write/read/delete access before proceeding |
| 4 | **Download a model** | Pick from 110 catalog entries. Real progress, speed (MB/s), ETA, and parts count; background verification |
| 5 | **Verify and mount** | "Checking file → Loading into RAM → Test reply" resulting in "Active · Verified" |
| 6 | **Open Chat** | Chat displays active model and live status via the animated Eclipse |
| 7 | **Chat → the AI replies** | Live reasoning process panel with token-by-token streaming, followed by clean Markdown answer |

**Acceptance (GP-1):** On a clean install, steps 1-7 complete without crashes, fake responses, or dead controls.

## 3. Functional requirements

### 3.1 Storage & Storage Slots (the "vault")
- **ST-1** If no storage location is configured, the app gates first launch and prevents download or chat.
- **ST-2** If a previously saved storage location becomes inaccessible, the app gates again with clear recovery choices.
- **ST-3** The user can manage storage slots (*Settings → Storage*), designating which slot receives new downloads.
- **ST-4** Models can be moved between storage slots (*moveToSlot*) with atomic copy, verification, and space auditing.
- **ST-5** Every candidate location must pass a write/read/delete probe before acceptance.
- **ST-6** Gallery apps are blocked from scanning model weights and chat media via `.nomedia`.

### 3.2 Permissions
- **PM-1** Permissions are requested on demand with plain-language explanations.
- **PM-2** Storage access is requested during onboarding; Microphone access is requested only upon entering Voice mode; Camera access is requested only upon tapping Camera in attachments.
- **PM-3** Denied permissions gracefully degrade with alternative options (e.g. app-private storage fallback).

### 3.3 Model Vault & Downloads
- **MD-1** Every catalog entry (110 models) resolves on Hugging Face with matching file size and sha256 (`scripts/verify-catalog.mjs`).
- **MD-2** Downloads produce real files on disk with genuine speed, remaining bytes, and ETA.
- **MD-3** Pause, resume, and cancel work reliably. Resuming appends to `.part` files via HTTP Range headers.
- **MD-4** Free storage space is verified prior to download start.
- **MD-5** Downloads support configurable verification modes (`verifyMode`: 'background' | 'always' | 'off').
- **MD-6** Multi-download queue supports user-configured concurrency (1..4 parallel downloads) and manual reordering (`moveInQueue`).
- **MD-7** Device RAM drives fit ratings (Runs great / OK / Tight / Too heavy) and context size recommendations.
- **MD-8** 9 distinct model status states are mapped without dead or unresponsive controls.

### 3.4 Model Verification and Mounting
- **MV-1** Mount loads model weights into RAM through `llama.rn`.
- **MV-2** After mounting, a test prompt is executed. Models are marked "Verified" only after producing output.
- **MV-3** The app never fabricates replies. If no model is mounted, Chat offers a button to open the Vault.

### 3.5 Chat & Reasoning
- **CH-1** Text streams token-by-token with updates coalesced to ~15 fps.
- **CH-2** Process panel shows genuine phases (*Loading → Reading prompt → Thinking → Writing*) and real engine telemetry (tok/s, TTFT ms).
- **CH-3** Reasoning blocks (`<think>`) are parsed and rendered in a collapsible section, leaving clean answer Markdown.
- **CH-4** Stop button halts generation immediately.
- **CH-5** Conversation history is maintained within the model's context window.
- **CH-6** Real message deletion (`deleteMessage`) and edit-resend (`truncateFrom`) without thread reloads.
- **CH-7** Multimodal attachments: text files and photos (with vision-capable models and `mmproj` projectors).
- **CH-8** Incognito chats remain in RAM and are never written to disk.

### 3.6 Voice & Audio
- **VO-1** On-device speech recognition via Whisper models (`whisper.rn`).
- **VO-2** Speech synthesis via Android native TTS with selectable voices and pitch/rate sliders.
- **VO-3** Voice loop state machine (`core/voiceLoop.ts`) manages idle, listening, transcribing, thinking, speaking.
- **VO-4** Barge-in interruption allows interrupting assistant speech by talking or tapping.

### 3.7 Persona ("Soul") & Memory
- **SO-1** 4 soul archetypes with bipolar PAD sliders (Pleasure, Arousal, Dominance) adjust system prompts and sampling hyperparameters.
- **SO-2** Live soul preview generates real model responses and reads them aloud using TTS.
- **SO-3** Long-term memory facts are injected into system prompts up to the configured budget (`memoryBudgetChars`).

### 3.8 Security & Privacy
- **SE-1** Optional biometric lock (`expo-local-authentication`) with configurable grace period.
- **SE-2** Granular purges: delete all chats, purge memory facts, purge KV cache, purge media, or full wipe (`purgeAll`).
- **SE-3** Zero telemetry: zero network requests during chat, reasoning, or speech processing.

### 3.9 Design System & Accessibility ("Temple")
- **DS-1** Sharp geometry: `borderRadius: 0` across all UI primitives.
- **DS-2** Two themes: Nyx (`#080A17` with `#E6C76A` gold) and Helios (`#FAF6EC` with `#8A5A00` bronze).
- **DS-3** Every icon-only button carries an explicit `accessibilityLabel`.
- **DS-4** Minimum 48dp touch targets across interactive controls.
- **DS-5** Text scaling up to 1.3x without layout clipping; maxFontSizeMultiplier 1.6.
- **DS-6** Reduced motion flag stops ambient loops and simplifies transitions.

---

## 4. Concepts Status (v2 Implementation)

| Concept | Status in v2 | Notes |
|---|---|---|
| Real on-device LLM inference | **Implemented** | `llama.rn 0.12.9` / llama.cpp via JSI |
| Multi-download queue & concurrency | **Implemented** | 1..4 parallel transfers, reordering, stall watchdog |
| Background verification | **Implemented** | `verifyMode`: background, always, off |
| Storage slots & multi-volume | **Implemented** | Internal, SD card, custom paths; `moveToSlot` |
| Claude-style reasoning view | **Implemented** | Real `<think>` parsing, live phases & tok/s |
| Soul archetypes + PAD vector | **Implemented** | Real prompt descriptors & sampling adjustments; live TTS preview |
| Episodic memory + budget | **Implemented** | Capped at `memoryBudgetChars` (default 2400) |
| Incognito chat | **Implemented** | In-memory only; never written to storage |
| Live voice mode (STT + TTS) | **Implemented** | Whisper STT, Android TTS, barge-in, `VoiceOverlay` |
| Vision / image understanding | **Implemented** | Projector files (`mmproj`) + `expo-image-picker` |
| Speculative decoding & MTP | **Implemented** | Multi-Token Prediction and draft/target pairs |
| KV session cache | **Implemented** | `saveSession` / `loadSession` |
| Biometric lock & Purge suite | **Implemented** | `expo-local-authentication`, granular data purges |
| Temple design system | **Implemented** | Radius 0, Nyx/Helios, 48dp targets, WCAG AA |
