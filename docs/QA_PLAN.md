# QA Plan

**Rule: no release unless every row in sections 1-3 passes on a real phone.**
Anything marked *device-only* cannot be proven by the automated tests (they have no phone).

## 0. What is already verified without a phone

| Check | How | Result when this plan was written |
|---|---|---|
| Strict typecheck, app + tests | `cd mobile && npm run check` | clean |
| Unit tests (96) | `npm test` | all pass |
| JS compiles for Android (Metro/Hermes) | `npx expo export --platform android` | OK |
| Native app compiles (React Native 0.86 + llama.rn) | `expo prebuild` + `gradlew :app:assembleRelease` | OK: 3m38s (current code, arm64 only, 4 vCPUs); see docs/BUILDING.md for what each number includes |
| Download resume works against the real CDN | HTTP 206 + `Content-Range`; two parts re-joined = published SHA-256 | OK |
| Catalog is real | `node scripts/verify-catalog.mjs` | 21/21 files exist, ungated, exact size + sha256 |
| Reasoning panel logic on a REAL model | `scripts/real-model-check.mjs` (Qwen3 1.7B) | thinking on: reading -> thinking -> answering, clean answer; off: direct |

## 1. Golden path on a clean install (GP-1) - *device-only*

Use a phone that has never had the app (or "Clear storage"). Use a small model first (**SmolLM2 360M**, 271 MB) so each run is fast.

| # | Do this | Expect |
|---|---|---|
| 1 | Install APK, open | A **black** splash with the CHIWIWI logo (no white flash), then the **welcome** screen. The launcher icon is the CHIWIWI logo and is not clipped by round/squircle masks. It names *your* phone (brand/model), Android version, RAM, CPU. No S23 anywhere. |
| 2 | Read "What CHIWIWI needs" | Lists Storage, Internet, "Nothing else". No microphone/camera prompt appears anywhere. |
| 3 | Tap Continue | "Where should CHIWIWI keep its data?" with **Choose a folder** and **Use app storage**. There is no way past this screen except choosing. Android Back does not skip it. |
| 4a | Tap **Use app storage** | Moves on immediately (no permission). |
| 4b | (separate run) Tap **Choose a folder**, pick e.g. Documents | "One more step" card; **Open Android settings** opens *All files access* for CHIWIWI. Turn it on, press Back: the app re-checks **by itself** and continues. A `CHIWIWI` folder now exists inside the picked folder. |
| 4c | (separate run) Choose a folder, but do NOT grant access | The card stays; **Use app storage** still works as a fallback. |
| 5 | After storage is accepted | App opens the **Model Hub** automatically. Header shows your device + RAM and a **Recommended** badge. |
| 6 | Tap **Download** on SmolLM2 360M | Status "Contacting Hugging Face...", then a **progress bar with MB/s and ETA**, bytes counting up. Screen stays on. |
| 7 | While downloading, press Back, open Chat, come back | The download **kept running** (state not lost). |
| 8 | When it finishes | "Installed · Load it to verify" (green). A file `SmolLM2-360M-Instruct-Q4_K_M.gguf` (~271 MB) exists in `<storage>/models`. |
| 9 | Tap **Load & use** | Status goes "Checking file..." -> "Loading into memory N%" -> "Testing a reply..." -> **"Active · Verified"** and a toast with tok/s. |
| 10 | Tap **Start chatting**, send "hello" | Process panel: "Reading your message..." then "Writing the answer..." with a live answer streaming in. Final: clean text, a tok/s summary. |
| 11 | Send a second message referring to the first ("what did I just say?") | Answer shows it saw the earlier message (history is used). |
| 12 | Close the app fully, reopen | Goes straight to Chat (storage remembered); previous chat is there; model shows "loads on first message"; first send loads it automatically. |

## 2. Download robustness - *device-only*

| Scenario | Expect |
|---|---|
| Pause, then Resume | Continues from the same byte count (not 0%). Final file size equals the size shown in the Hub. |
| Airplane mode mid-download | Note "Connection lost - retrying (n/4)...", then an error with **Try again** (never "100%"). Turn network on, tap Try again: resumes. |
| Kill the app mid-download, reopen | Model card shows **Paused at N%** ("Partial download found"). Resume finishes it. |
| Fill the phone's storage, start a big model | Refused up front: "Not enough free space: X needed, Y available." Nothing is written. |
| Cancel | Confirmation; partial file deleted; card returns to "Not downloaded". |
| Tap Download many times quickly | One download only (button is guarded; second model says "Another model is still downloading"). |
| Press Home (or open another app) mid-download, wait 2+ minutes, come back | The bar is still moving or shows "Connection lost - retrying"; it is never frozen at a fixed number. (A transfer with no new bytes for 45 s is cancelled and resumed from the partial file automatically.) |
| Switch Wi-Fi to mobile data (or back) mid-download | Brief "retrying", then continues from the same byte count. |
| Delete an installed model | Confirmation, file removed, space reclaimed, status resets. |
| **Check file integrity** on an installed model | Progress bar (slow on phones), then "Checksum matches the official file." |

## 3. Chat behaviour - *device-only*

| Scenario | Expect |
|---|---|
| Model too big for the phone (e.g. Gemma 4 12B on a 8 GB phone) | Card says "Too heavy for this phone"; Download asks to confirm; Load refuses/explains instead of crashing. |
| Load a heavy model that gets the app killed | Next launch: red banner "CHIWIWI closed while loading X ... ran out of memory"; that model is not auto-loaded. |
| **Stop** during a long answer | Answer stops, kept, marked "Stopped". Send works again. |
| Reasoning model (Qwen3 4B, thinking on) on "What is 17 x 24?" | Panel: "Thinking... Ns" with the real reasoning text (collapsible), then "Thought for Ns" and a clean answer **without** `<think>`. Toggle **Thinking off**: direct answer. |
| DeepSeek-R1 Distill 1.5B | Always shows reasoning first (chip says it always thinks). |
| Long answer with a list and code | Rendered as list / code block, not raw `**` and backticks. Chat auto-scrolls; scrolling up stops auto-scroll. |
| Attach a `.txt`/code file and ask to summarise | Chip shows the file; answer uses its content. A PDF/image is rejected with a clear message. |
| `/remember I live in Phnom Penh`, then ask "where do I live?" | Toast "Remembered..."; answer uses it. Settings > Memory lists it; deleting removes it. |
| Incognito chat | Banner "not saved"; after closing, it is not in History. |
| Change personality (Warmth/Energy/Directness) | Tone of replies visibly changes; Settings > Soul shows the exact instructions sent. |
| Chat longer than the context window | Notice "N older messages did not fit..." on the reply; nothing is deleted from the visible chat. |
| Force-stop the app while it is answering, reopen | That reply reloads as "Stopped" (never a spinner forever). |

## 4. Storage change - *device-only*

| Scenario | Expect |
|---|---|
| Settings > Storage > Change | Warning that files are not moved and the loaded model will unload; picker as in onboarding. |
| Revoke "All files access" in Android settings, return to the app | Gate screen "The saved folder is not accessible any more..."; **Use app storage** recovers. |
| Remove the SD card used as the folder | Same as above. |

## 5. Phone coverage - *device-only*

Run section 1 on at least: a 4 GB phone, a 6-8 GB phone, a 12 GB+ phone, Android 10 and Android 14+.
Expected differences: recommended model and fit labels change with RAM; Android 10 asks the classic
storage permission instead of *All files access*; a 4 GB phone offers the small models as "Runs great"
and the 8B models as "Too heavy".

## 6. Automated coverage map

| Requirement | Automated check |
|---|---|
| ST-1 / ST-2 gate | `downloadManager.test.ts` ("refuses to start when the storage folder is not configured"); gate itself is UI (`App.tsx`) - device row 3 |
| ST-5 probe, path mapping | `core.test.ts` (SAF mapping incl. hostile URIs, URI round-trips); probe is device-only |
| PM-2 minimal permissions | `config.test.ts` (also checks the built APK has no overlay permission) |
| MD-1 links real | `scripts/verify-catalog.mjs` (weekly in CI) + `core.test.ts` catalog integrity |
| MD-2..MD-5 download | `downloadManager.test.ts` (23 scenarios: pause/resume/retry/416/no space/truncated/HTML/oversized/cancel/refresh, silent-stall watchdog, retry-budget refill) |
| MD-6 fit | `core.test.ts` (4/6/8/12/16 GB phones) |
| MD-7 status | `modelStatus.test.ts` |
| MD-8 truthful catalog | `core.test.ts` (unique files, no vision/voice badges, family matches name) |
| MV-1..MV-3 mount/verify/never fabricate | `engineManager.test.ts` (14 scenarios) |
| CH-2/CH-3 process + clean output | `chatTurn.test.ts`, `core.test.ts` (thinking + markdown), `real-model-check.mjs` |
| CH-4 stop, CH-5 history, CH-6 persistence, CH-7 errors | `chatTurn.test.ts`, `engineManager.test.ts` |
| DV-1/DV-2 device awareness | `core.test.ts` (fit/context); detection itself is device-only |
| UX-1 guarded buttons | `ui/Btn.tsx` guards every action with side effects; plain `Pressable` is used only where a repeat tap is harmless or confirms first (full list and verdicts in `docs/AUDIT.md`); behaviour is device-only |
| BD-1..BD-3 build | `config.test.ts` (arm64), `.github/workflows` |

## 7. Release gate checklist

- [ ] `npm run check` green in CI
- [ ] `npx expo export --platform android` green
- [ ] `node scripts/verify-catalog.mjs` green
- [ ] Sections 1-3 pass on a real phone (record phone model + Android version here)
- [ ] No row in `docs/AUDIT.md` is marked FIX/BLOCKER
