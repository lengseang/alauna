# CHIWIWI — Product Requirements (restructured from the original prompts)

This file turns the original, scattered instructions given to Gemini into one
clean, testable spec. **Every requirement has an ID and an acceptance check.**
The QA checklist (`docs/QA_PLAN.md`) and the automated tests refer to these IDs.

> **Source note.** Sections 1-3 are restructured directly from the prompt text
> you pasted (reproduced in the Appendix). Section 6 (concepts) comes from the
> earlier `ARCHITECTURE.md` / `README.md` / `ENTERPRISE_PLAN.md`. Where I had to
> *infer* something, it is marked **[inferred]** so you can correct it.
> If you have other old prompts, paste them and they get merged here.

---

## 1. Product in one paragraph

CHIWIWI is a **private, offline AI chat app for phones**. The user downloads a
GGUF language model once, and from then on the AI runs **entirely on the phone**
— no account, no cloud, no telemetry. It must work on **any reasonably modern
phone, not only one device**, and it must **show the user's real device**
(name, RAM) and recommend models that fit it.

## 2. The golden path (the flow that MUST work end to end)

This is the single most important requirement. The app is **not shippable** until
a new user can do all seven steps without anything failing:

| # | Step | What the user sees |
|---|------|--------------------|
| 1 | **Install** the app | — |
| 2 | **Open** it, **allow the permissions** it needs | Welcome screen shows *their* device (brand, model, RAM) and explains each permission |
| 3 | **Pick where data is stored** (folder) | A location picker. Nothing else is usable until this is done |
| 4 | **Download a model** from the Model Hub | Real progress, speed, ETA; pause/resume/cancel |
| 5 | **App verifies the model works** | "Checking file → Loading into memory → Test reply" then a green "Verified" |
| 6 | **Open Chat** | Chat shows which model is active and its status |
| 7 | **Chat → the AI replies** | Live "thinking/process" panel, then a clean answer |

**Acceptance (GP-1):** on a clean install, steps 1-7 complete with no crash, no
empty download, no fake reply, and no dead button.

## 3. Functional requirements

### 3.1 Storage location (the "vault")
- **ST-1** On first launch, if no storage location is configured, the app shows
  the location picker and **blocks everything else** (no download, no chat).
- **ST-2** The same rule applies on every later launch: if the saved location is
  missing or no longer accessible, the app **gates again** instead of failing silently.
- **ST-3** The user can **change the location any time** from *Settings → Storage*
  (the "folder selection toggle"). Changing it never deletes files.
- **ST-4** Models, chat history, memory and media all live in the chosen location.
- **ST-5** The location must be **verified writable** (a real write/read test)
  before the app accepts it. A location that fails is rejected with a clear reason.
- **ST-6** Gallery apps must not index the vault (`.nomedia`).

> **Platform fact that shaped the design:** the on-device AI engine (llama.cpp)
> can only open models by a **real file path**; Android's folder picker returns a
> `content://` link that the engine cannot read. So an external folder needs
> *All files access* (Android 11+) / storage permission (Android 8-10), and there is
> always an **App private storage** option that needs no permission. See
> `docs/ARCHITECTURE.md` §Storage.

### 3.2 Permissions
- **PM-1** Permissions are requested **in the onboarding flow, before the folder
  picker**, each with a plain-language reason.
- **PM-2** The app only asks for permissions a shipped feature actually uses
  (storage access; internet for downloads). **[inferred]** Camera / microphone /
  notifications are **not** requested yet because voice, camera and download
  notifications are not implemented — asking for them would be dishonest.
- **PM-3** If a permission is denied the app explains what is lost and offers the
  fallback (e.g. app private storage). It never just breaks.

### 3.3 Model Hub (download)
- **MD-1** Every model link is **tested against Hugging Face** (`scripts/verify-catalog.mjs`).
- **MD-2** Tapping *Download* produces a **real file** in the vault with **real
  progress** (bytes, MB/s, ETA). No "empty download".
- **MD-3** Pause, resume and cancel work. **Resume continues from the partial
  file** (never restarts or corrupts). Leaving the screen does **not** stop a download.
- **MD-4** Download is **refused with a clear message** if there is not enough free space.
- **MD-5** A finished download is verified: exact size from Hugging Face, GGUF
  header check. An optional **deep SHA-256 check** is available.
- **MD-6** The Hub shows **device-aware fit** for every model (Great / OK / Tight /
  Too heavy) from the phone's real RAM, and highlights a recommended model.
- **MD-7** Each model shows a **status**: Not downloaded · Downloading · Paused ·
  Verifying · Installed · Loading · **Active** · Error.
- **MD-8** The catalog contains only **truthful** entries: correct names, no
  duplicates, no capability the app cannot deliver (no fake vision/voice badges).

### 3.4 Model verification and mounting
- **MV-1** "Mount" really loads the model into RAM through the inference engine.
- **MV-2** After loading, the app runs a **test generation**. A model is marked
  **Verified** only if it produced a reply. Failures show the real error.
- **MV-3** The app **never fabricates** a reply. If no model is loaded, chat says
  so and offers *Download / Load a model*.

### 3.5 Chat (like Claude and other chatbots)
- **CH-1** The reply **streams token by token**.
- **CH-2** A **process panel** shows what the AI is really doing: *Loading model →
  Reading prompt (N tokens) → Thinking → Answering*, and for reasoning models the
  **real reasoning text**, collapsible. Nothing in it is invented.
- **CH-3** The final **output is clean**: reasoning is separated from the answer;
  basic Markdown (paragraphs, lists, bold, inline/ block code) is rendered.
- **CH-4** A **Stop** button interrupts generation.
- **CH-5** The AI sees the **conversation history** (sliding window sized to the
  model's context), not only the last message.
- **CH-6** Chat history is saved in the vault and survives restarts.
- **CH-7** Errors are shown inline with an action (Retry / Open Model Hub).

### 3.6 Device awareness (broad, not one phone)
- **DV-1** The app reads the **real device**: brand, model, Android version, CPU
  architecture, total RAM — and shows it instead of any hard-coded phone name.
- **DV-2** RAM drives **model fit ratings**, the **recommended model**, and the
  **default context length**.
- **DV-3** Unsupported hardware (e.g. 32-bit only) gets a clear message.

### 3.7 Interaction quality (the "no spam button" rule)
- **UX-1** **Every** button has a defined action, a busy/disabled state, and
  guards against double-tap.
- **UX-2** Every async action shows progress and a recoverable error.
- **UX-3** There is **no dead or placebo control**: a setting that does nothing is
  removed or labelled *Coming soon*. Settings that exist are **persisted** and
  actually applied.
- **UX-4** Android Back works (closes sheet → previous screen → exit).

### 3.8 Build and delivery
- **BD-1** Build only the **arm64** architecture (all current phones) — the main
  cause of multi-hour builds was compiling four CPU architectures of llama.cpp.
- **BD-2** A fast local/CI path exists and is documented (`docs/BUILDING.md`).
- **BD-3** CI runs typecheck + tests on every push.

## 4. Roles requested in the prompt, and how they are covered

The prompt asked to *"assign one more orchestrator for QA"*, *"one more for system
design and code auditor"*, and asked *"do we need to hire new agent?"*.

**Answer: no new permanent agents are needed.** Two review *roles* are enough, and
both are now concrete, repeatable artifacts instead of vague personas:

| Role | Responsibility | Where it lives |
|------|----------------|----------------|
| **QA orchestrator** | Check every function, component and page "to the bone"; no unshippable build | `docs/QA_PLAN.md` (per-screen/per-button checklist) + `mobile/test/*` + CI |
| **System design & code auditor** | For every function/button: what input it needs, what events it fires, what guards it has; works with QA | `docs/AUDIT.md` (control inventory) + the same CI |

An independent reviewer pass was run over the finished work (see `docs/AUDIT.md`).

## 5. Non-functional requirements
- **NF-1 Privacy:** zero network calls during chat. The only network use is model
  download from Hugging Face (and the catalog check). No analytics.
- **NF-2 Honesty:** the UI never claims something that is not true (no "GGUF
  On-Device" badge on canned text, no fake speed-ups, no fake security toggles).
- **NF-3 Performance:** UI thread stays responsive during download and
  verification; heavy work is chunked.
- **NF-4 Devices:** Android 8+ (API 26+) arm64. iOS builds are best-effort, not verified.

## 6. Concepts from earlier docs — status

These came from the earlier architecture docs. They are **kept as goals** but are
**not implemented** in this version, and the UI no longer pretends they are.

| Concept | Status | Notes |
|---|---|---|
| Real on-device LLM inference | **Done** (llama.rn / llama.cpp) | Needs a native build, not Expo Go |
| Resumable HF downloader + verification | **Done** | Rebuilt; old version corrupted resumed files and rejected good files |
| Model Hub with search / grade / filters | **Done** (truthful catalog) | |
| Claude-style thinking/process view | **Done** (real stages + real reasoning) | |
| Soul archetypes + PAD emotional vector | **Done, simplified** | PAD now steers the system prompt (real effect); no fake per-turn drift |
| Episodic memory | **Done, simplified** | User-managed facts injected into prompts; no auto-extraction yet |
| Incognito chat | **Done** | Not saved to disk |
| Live voice (STT/VAD/TTS) | **Roadmap** | Needs whisper.rn + TTS; removed the fake overlay |
| Vision / image understanding | **Roadmap** | Needs `mmproj` download + `initMultimodal` |
| Speculative decoding (draft+target) | **Roadmap** | llama.rn exposes it; needs a vocabulary-compatible pair |
| KV-cache freeze (`saveSession`) | **Roadmap** | llama.rn exposes `saveSession/loadSession` |
| Intent gateway tiers | **Dropped for now** | Regex router misrouted common text |
| Biometric lock, auto-purge | **Roadmap** | Removed placebo toggles |

## Appendix — the original prompt (verbatim)

> heyo this the app is a shell without a body, every connected to ai does not works, have we reached the functionality check yet, the app download without storage permission and then it not works it's must be a not a bug but your mistake, so the plan is to review everything from the bottom of the well until the sky reach the moon, anyway assign one more orchestrator for QA handle all the quality and check every function every component every page to the bone be strict about this you can't ship a not working product so, also one more for system design and code auditor every function every button every ui ux function they have what they need what example a button need event of each click not a no guard button will spam everything and bad overall and have to works closely with QA, plus do we need to hire new agent?, the app will not focusing solely on my device it has to be broad, detecting by device show their device instead.
> btw also i tested and the functionality of each and every function are not working even the chat, so for the chat do it like claude and other chatbot showing the process of the ai thinking and running, the output should be clean, the model download bro it's not working, it just show empty download without real thing happening the model has no status of using and the model must first download so right now have you test the download link if it works, when click download on app it show downloading but no file (also before user to use the app they must use a place to store all the datas including model, the idea is when user open the app we check if user has set the folder location yet if not open location picking, this also apply to all the user that no have the folder picker otherwise no running, also the folder selection toggle also should be in storage setting.), let's check the flow, so user installed app then open app as user to allow all the permission then app ask user to pick and set folder directory, then user can go to download model then user can install model, app verify the model works, then user go to chat user chat then ai reply. got it? make sure it will run like that
> how about you restructure these random historic prompt then use it to fix and implement above gemini and make the app usable fit the requirements and my goal product, also if the build process could be faster that's good too right now it took hours to just build one app. I trust you now la
