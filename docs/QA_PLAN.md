# QA Plan (v2 "Temple")

**Rule: no release unless every row in sections 1-5 passes on a real phone.**
Anything marked *device-only* cannot be proven by the automated tests (they have no phone).

## 0. What is already verified without a phone

| Check | How | Result in v2 |
|---|---|---|
| Strict typecheck + unit tests (288) | `cd mobile && npm run check` | 288/288 pass, 0 fail (clean) |
| Supervision Gate | `node scripts/gate.mjs` | GATE PASSED (baselines enforced, 0 rounded corners, 0 fake numbers) |
| JS compiles for Android (Metro/Hermes) | `cd mobile; npx expo export --platform android` | OK (10.3s bundle, 932 modules) |
| Native app compiles (RN 0.86 + llama.rn 0.12.9) | `expo prebuild` + `gradlew :app:assembleRelease` | OK (arm64 release APK) |
| Download resume against real CDN | HTTP 206 + `Content-Range`; multi-part rejoint = published SHA-256 | OK |
| Catalog integrity (110 models) | `node scripts/verify-catalog.mjs` | 110/110 resolve on Hugging Face with exact sizes and sha256 |
| Reasoning panel logic on a REAL model | `scripts/real-model-check.mjs` (Qwen3 1.7B) | Thinking on: reading -> thinking -> answering; thinking off: direct answer |
| Accessibility & Temple geometry | `mobile/test/accessibility.test.ts`, `designSystem.test.ts` | All `<IconButton>` have spoken labels; 48dp touch targets; 1.3x text scaling; 0 borderRadius |

## 1. Golden path on a clean install (GP-1) - *device-only*

Use a phone that has never had the app (or "Clear storage"). Test with a small model first (**SmolLM2 360M**, 271 MB) or **Qwen3.5 0.8B** (580 MB).

| # | Do this | Expect |
|---|---|---|
| 1 | Install APK, open | A **themed splash** (Nyx `#080A17` / Helios `#FAF6EC`), then the **welcome** screen. Launcher icon is the CHIWIWI logo with square Temple geometry. Shows real phone details (brand, model, RAM, CPU). |
| 2 | Read "What CHIWIWI needs" | Lists Storage and Internet. No premature mic/camera permission prompts. |
| 3 | Tap Continue | "Where should CHIWIWI keep its data?" with **Choose a folder** and **Use app storage**. Nothing else is usable until chosen. |
| 4a | Tap **Use app storage** | Moves on immediately without permissions. |
| 4b | (separate run) Tap **Choose a folder**, pick folder | Directs to *All files access* settings for CHIWIWI. Turning it on and returning causes app to auto-detect and proceed. |
| 5 | Storage configured | App opens the **Model Vault** (110 models). Header displays device RAM and highlighted recommendation. |
| 6 | Tap **Download** on SmolLM2 360M | Status moves to downloading with **progress bar, speed (MB/s), ETA, and parts count**. Screen stays awake. |
| 7 | Switch apps / background download | Download keeps running or transitions cleanly; Downloads hub reflects real byte progress upon returning. |
| 8 | Download finishes | Based on `verifyMode`: instant use with background verify (`background`), blocking SHA-256 (`always`), or instant completion (`off`). File exists in vault slot. |
| 9 | Tap **Load & use** | Lifecycle: "Checking file" -> "Loading into memory N%" -> "Testing reply" -> **"Active · Verified"** with toast reporting tok/s. |
| 10 | Tap **Start chatting**, send "hello" | Process line: "Reading your message..." -> "Writing the answer..." with live streaming tokens. Summary shows tok/s and TTFT ms. |
| 11 | Multi-turn chat | Sending a second message referencing earlier context proves history is supplied. |
| 12 | Restart app | Opens directly to Chat; conversation restored; model auto-mounts on first message. |

## 2. Downloads Hub & Concurrency - *device-only*

| Scenario | Expect |
|---|---|
| Parallel downloads (Settings: 1..4) | Queue respects `downloads.parallel` setting; runs N concurrent transfers while others wait in queue. |
| Queue reordering | Tapping "Move up" or "Move down" on waiting models updates start order immediately. |
| Pause all / Resume all | One-tap pause pauses all active transfers; resume restarts them cleanly from their partial byte offsets. |
| Pause / Resume single model | Continues from the exact byte count. Final file matches official Hugging Face size and sha256. |
| Airplane mode / Network disconnect | Retries 4x with backoff; displays honest error with "Try again". Network restored: resumes from partial. |
| Stall watchdog (45s no bytes) | Automatically terminates frozen native task and resumes from partial without hanging forever. |
| Insufficient disk space | Refused prior to downloading: "Not enough free space: X needed, Y available." |
| Cancel download | Prompts confirmation; deletes `.part` temporary file; card resets to uninstalled. |
| Download verifyMode: background | File is marked usable immediately; background SHA-256 shows progress bar; damaged files are deleted and unloaded. |
| Download verifyMode: always | Download card says "Checking fingerprint" until SHA-256 matches before enabling Load button. |

## 3. Chat, Reasoning & Vision - *device-only*

| Scenario | Expect |
|---|---|
| Reasoning model (Qwen 2.5, DeepSeek-R1) | Reasoning stream appears in collapsible process block; final answer renders clean Markdown without raw `<think>` tags. |
| Thinking toggle | In models supporting toggle: switching thinking off produces direct answers without a reasoning phase. |
| Message deletion & Truncate-from | Delete removes message from chat thread immediately; Edit & Resend truncates subsequent history and re-generates cleanly. |
| Vision attachment (image + mmproj) | Attaching photo to a vision-capable model (e.g. Qwen2-VL) loads projector and produces image-aware reply. |
| Text file attachment | `.txt`/`.md`/code attachment is read (up to cap) and incorporated into prompt. Binary files rejected. |
| Stop generation | Tapping Stop immediately halts token stream; partial response preserved and marked "Stopped". |
| Memory injection (`/remember`) | Adding memory via command or Settings > Memory includes facts in system prompt up to `memoryBudgetChars`. |
| Incognito chat | Marked with incognito icon; not saved to disk; vanishes on switching threads. |

## 4. Voice Mode & Audio - *device-only*

| Scenario | Expect |
|---|---|
| Open Voice mode (mic button) | Prompts for microphone permission on first use. Full-screen `VoiceOverlay` opens with animated Eclipse. |
| Missing Whisper model | Honest notice prompts to download STT model (`tiny.en`, `base.en`, etc.); downloads with real progress. |
| Voice turn (Speak -> AI listens) | Displays "Listening" -> "Transcribing" (shows heard text) -> "Thinking" -> "Speaking" (reads reply aloud). |
| Barge-in interruption | Speaking while assistant is talking halts TTS and immediately switches to "Listening". |
| TTS voices & pitch/rate | Settings > Audio & voice allows previewing voices and adjusting pitch/rate sliders. |

## 5. Storage Slots & Security - *device-only*

| Scenario | Expect |
|---|---|
| Multiple storage slots | Settings > Storage lists all available internal and external slots with free space and model counts. |
| Move model to another slot | Tapping "Move to slot" on model details copies file, verifies target, removes source, and updates slot label. |
| Biometric lock enabled | Minimizing app and waiting past grace period displays `LockScreen`; requires fingerprint/face unlock to proceed. |
| Data purges | Settings > Security & privacy allows granular deletion of chats, memory, KV cache, media, or full wipe (`purgeAll`). |

## 6. Automated coverage map

| Requirement | Automated check |
|---|---|
| ST-1 / ST-2 storage gate | `downloadManager.test.ts`, `vaultView.test.ts` |
| Storage slots & multi-slot | `dataV2.test.ts`, `atomicFile.test.ts` |
| Minimal permissions | `config.test.ts` |
| Catalog integrity (110 models) | `scripts/verify-catalog.mjs`, `catalog.test.ts` |
| Download state machine (23 scenarios) | `downloadManager.test.ts`, `downloadQueue.test.ts` |
| Settings v2 consolidation & migration | `settingsV2.test.ts`, `settingsUi.test.ts` |
| Voice loop state machine & speech models | `voiceMediaSecurity.test.ts` |
| Biometric app lock & purges | `voiceMediaSecurity.test.ts` |
| Inference mount & recovery | `engineManager.test.ts`, `engineV2.test.ts` |
| Chat turn & reasoning parser | `chatTurn.test.ts`, `chatUi.test.ts` |
| Accessibility & 48dp targets | `accessibility.test.ts` |
| Temple design system & WCAG AA contrast | `designSystem.test.ts` |

## 7. Release gate checklist

- [ ] `node scripts/gate.mjs` prints `GATE PASSED`
- [ ] `cd mobile; npx expo export --platform android` bundles with code 0
- [ ] `node scripts/verify-catalog.mjs` exits with code 0
- [ ] Sections 1-5 pass on a real phone (record device model + Android OS version)
- [ ] Zero unhandled errors in production logs
