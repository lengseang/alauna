# Audit: every control, every risky function

**Who and how.** This is a review by the same person who wrote the code, so it is weaker than an independent one.
It is a static read of the UI and services plus the unit tests. **No phone was involved**, so anything about real
touch, Android dialogs, permissions, or timing on a device is listed as *device* and is only proven by `docs/QA_PLAN.md`.
The two reviewer agents that were meant to do an independent pass died on a rate limit before reporting; the role
definitions you wrote (`.agents/agents/qa_orchestrator`, `system_architect_auditor`) can be pointed at this repo as a second opinion.

Verdicts: **OK** (read, nothing found), **FIXED** (defect found and fixed in this pass), **WARN** (works, small risk),
**DEVICE** (cannot be settled without a phone).

## 1. How controls are classified

| Class | Rule | Why |
|---|---|---|
| **G** guarded | `ui/Btn.tsx`: ignores a tap while busy or inside 350 ms, shows spinner/`busyLabel`, toasts a failing action | actions with side effects |
| **T** toggle | plain `Pressable`, only changes local UI state | a repeat tap is harmless |
| **N** navigation | plain `Pressable` calling `push()` (ignores a repeat of the current route) or `goBack()` (350 ms throttle) | idempotent |
| **D** destructive | always behind `confirm()` (one dialog at a time) | cannot be undone |

## 2. Control inventory

### Chat screen (`ui/ChatScreen.tsx`, `ThreadDrawer.tsx`, `MessageView.tsx`, `ThreadSoulSheet.tsx`)
| Control | Class | Guard / confirmation / failure handling | Verdict |
|---|---|---|---|
| Send | raw (async) | `canSend` disables it; **ref lock** swallows a second tap before re-render; failure restores the text and shows a notice; no model/storage -> alert with "Open Model Hub" | **FIXED** (A-1) |
| Stop | raw | disabled while the model is still loading; `stopGeneration()` is idempotent | OK |
| Attach file | raw (async) | max files, 1 MB limit, binary detection, try/catch -> notice | OK |
| Remove attachment (x) | T | local state | OK |
| Open menu / New chat / Soul / Settings / Model chip (header) | N / T | `push` dedupes; `newChat` is a no-op on a blank chat and refuses mid-reply | OK |
| Thinking on/off chip | T | persists via `updateSettings`; flipping twice is a no-op | OK |
| Suggestion chips | T | fill the input only | OK |
| Try again / Retry | G | disabled while a reply is running; `regenerate()` refuses when busy | OK |
| Copy | G | clipboard failure toasts | OK |
| Open Model Hub (empty state, error row) | G / N | idempotent | OK |
| Dismiss crash banner | G | clears a flag | OK |
| Thread: open | raw (async) | `openThread` refuses mid-reply, reports a corrupt file, refreshes the list | OK |
| Thread: delete (trash) | D | `confirm()`; **second dialog can no longer stack** | **FIXED** (A-3) |
| New chat / New incognito chat | G | refuses mid-reply with a notice | OK |
| Soul sheet: Cancel / Save, stepper +/-, archetype chips | G / T | steppers clamp and disable at the limits | OK |

### Model Hub (`ui/ModelsScreen.tsx`, `ModelCard.tsx`)
| Control | Class | Guard / confirmation / failure handling | Verdict |
|---|---|---|---|
| Download / Resume / Try again | G (600 ms) | the manager is idempotent; one active download; "too heavy" asks first; refusal reasons are alerts (no storage, another model downloading, no space) | OK |
| Pause | G | `pause()` safe when nothing is running | OK |
| Cancel | G + D | confirm, then deletes the partial | OK |
| Load & use | G | RAM check; "too heavy" asks first; concurrent `mount` calls are refused (tested); result toast or alert | OK |
| Unload | G | idempotent | OK |
| Delete | G + D | confirm; unloads first if loaded; clears the active model; cancels a running download | OK |
| Check file integrity | G | cancellable, progress bar, handles "Hub gave no checksum" | OK |
| Start chatting | G | `resetTo('chat')` | OK |
| Search, clear, size/capability/uncensored chips, sort | T | local state | OK |
| Storage row | N | `push` dedupes | OK |
| Which buttons exist per state | - | decided by one pure function (`core/modelStatus.ts`), tested for every state | OK |

### Onboarding / storage (`OnboardingScreen.tsx`, `StoragePicker.tsx`, `SettingsScreens.tsx` Storage)
| Control | Class | Guard / failure handling | Verdict |
|---|---|---|---|
| Continue | G | disabled on an unsupported device | OK |
| Back (step 2 -> 1) | G | hidden when storage is unavailable | OK |
| Choose folder | G (`busyLabel`) | picker cancel returns quietly; unmappable URI or failed write probe -> explanation; Android 11+ -> walks to All-files-access | DEVICE |
| Open Android settings | G | app re-checks by itself when it returns to the foreground | DEVICE |
| Use app storage | G | always works; no permission | DEVICE |
| Change location (Settings) | G | warns that files are not moved and the model unloads | DEVICE |
| Gate (no way past without a folder) | - | `App.tsx` renders onboarding until `storage.status === 'ready'`; the downloader also refuses (tested) | OK (logic) / DEVICE (Back key) |

### Settings (`SettingsScreens.tsx`, `SoulEditor.tsx`)
| Control | Class | Guard / failure handling | Verdict |
|---|---|---|---|
| Home rows (6) | N | `push` | OK |
| Back arrow (every screen) | N | **now throttled**; a double-tap used to skip two screens | **FIXED** (A-2) |
| Memory: Add / Enter key | G | disabled when empty; dedupe and limits in `core/memory.ts` (tested) | OK |
| Memory: forget one (x) | raw | no confirmation, immediate; one fact, easy to re-add | WARN (A-6) |
| Memory: Forget everything | G + D | confirm | OK |
| Advanced: context / threads chips | T | persisted; "Reload with these settings" applies them | OK |
| Advanced: GPU switch | raw | persisted; takes effect on reload (button right below); labelled experimental | OK |
| Advanced: Reload model | G | unload then mount; result toast | OK |
| Thinking switch | raw | persisted and used by the next turn (`chatTurn.test.ts`) | OK |
| Soul archetype / sliders | T / G | clamped; the prompt really changes (`chatTurn.test.ts`) | OK |
| About | - | read-only | OK |

### Global
| Item | Verdict |
|---|---|
| Android hardware Back: sheet/drawer -> previous screen -> minimise (`App.tsx`) | DEVICE |
| Foreground re-check of the storage folder (`AppState`) | DEVICE |
| Every failing guarded action produces a toast, never silence (`Btn` `onError`) | OK |
| No control exists for a feature that is not built (voice, vision, app lock were removed) | OK |

## 3. Risky functions (services and core)

| Area | What was checked | Verdict |
|---|---|---|
| Download state machine | pause/resume/retry/416/no space/truncated/HTML/oversized/cancel/refresh: 19 tests; **silent-stall watchdog and retry-budget refill: 4 more** (mutation-checked: the stall tests fail with the watchdog disabled) | OK |
| Resume offset on a real phone | uses the native `DownloadTask` resume (the same approach you reached on `main`); proven against the live CDN for the HTTP behaviour, **not** on a phone | DEVICE |
| Engine lifecycle | crash marker before load, verify file -> RAM fit -> load -> test reply; never fabricates (14 tests, plus a real Qwen3 run) | OK |
| Chat turn | streaming, thinking split, stop, history window, attachments, errors, persona, memory (16 tests) | OK |
| Persistence | corrupt or hostile JSON never crashes; a thread that was streaming at app death reloads as stopped | OK |
| Path mapping from the Android folder picker | hostile and odd URIs tested | OK (logic) / DEVICE (probe) |
| Catalog | 21 entries checked against the live Hub (existence, size, sha256, ungated) | OK |

## 4. Findings

| ID | Severity | Finding | Status |
|---|---|---|---|
| A-1 | medium | Double-tap on Send: both taps read the same input; the refused second send put the already-sent text back in the box | **FIXED** (`ChatScreen.tsx` ref lock) |
| A-2 | low | On-screen Back double-tap skipped two screens | **FIXED** (`goBack`, 350 ms) |
| A-3 | low | Double-tap on a chat's trash icon could stack two confirmation dialogs | **FIXED** (`confirm()` serialises) |
| A-4 | high | A backgrounded download can freeze without raising any error and then sat at "downloading" forever | **FIXED** (45 s no-bytes watchdog cancels and resumes from the partial; unit-tested) |
| A-5 | medium | Only 4 retries in total: a multi-GB download on a flaky network would die from unrelated blips | **FIXED** (budget refills after 8 MiB of progress) |
| A-6 | low | Deleting one memory fact has no confirmation or undo | WARN, left as is |
| A-7 | medium | **No automated UI tests.** The UI layer is verified by strict typecheck, the Metro bundle and manual QA only | OPEN. Suggested: scripted Maestro flows for `QA_PLAN` section 1 on an emulator/phone |
| A-8 | info | `eas.json` development profile asked for `expo-dev-client`, which the project does not include | **FIXED** (flag removed; debug APK loads JS from Metro) |
| A-9 | info | `docs/BUILDING.md` said llama.cpp is compiled for every CPU type and attributed 7m40s to the current code | **FIXED** (llama.rn ships the engine prebuilt; numbers relabelled) |
| A-11 | medium | The native launch splash was the Expo template **white** on a dark app (the top-level `splash` key is legacy in SDK 57 and was ignored; `expo-splash-screen` was not installed) | **FIXED** (plugin installed and configured: black, with the logo; verified in the generated Android project; look is DEVICE) |
| A-12 | low | Release APK declared `SYSTEM_ALERT_WINDOW` ("draw over other apps", an Expo template default) although docs promise "Storage, Internet, nothing else" | **FIXED** (blocked in `app.json`; verified with `aapt2` on a built APK; `config.test.ts`) |
| A-10 | info | The AGENTS rule says Btn for every button; icon buttons and chips are plain `Pressable` by design | **FIXED** (wording now matches the classification in section 1) |

## 5. Release gate

No row above is **OPEN** at medium or higher except A-7 (accepted for now), and every **DEVICE** row is covered by a numbered
step in `docs/QA_PLAN.md`. The release gate there still requires a human to run sections 1-3 on a phone.
