# CHIWIWI Architecture

What is actually in the app (not a wish list; see `ROADMAP.md` for what is not built yet).

## 1. Shape

```
mobile/
  App.tsx                 shell: startup order, storage gate, routes, Android Back
  src/
    core/                 PURE logic. No React, no Expo. Unit-tested under plain Node.
    services/             adapters to the phone (files, device, llama.cpp, network) + app-wide stores
    ui/                   React Native screens and components
    components/Icons.tsx  SVG line icons
    hooks/useGuardedAction.ts
  test/                   node:test suites for everything in core/
scripts/                  verify-catalog.mjs (live Hub check), real-model-check.mjs (manual QA)
```

**Dependency rule:** `ui -> services -> core`. `core` never imports `services` or `ui`. Anything that
touches the phone is injected into core as a small interface, which is why the download state machine
and the engine lifecycle are tested with fakes (`DownloadPlatform`, `EngineDeps`).

State is held in tiny observable stores (`core/store.ts`) read in React with `useSyncExternalStore`.
There is no Redux/Context layer.

## 2. Startup (order matters)

`services/lifecycle.ts#bootstrap`:

1. `initSettings()` - load `chiwiwi_settings.json` (app-private).
2. `initStorage()` - load the saved vault location and **re-prove it is writable**.
3. `engine.noteStartup()` - if the last run died while loading a model, remember it (probable out-of-memory).
4. `onStorageReady()` - only now touch data inside the vault: refresh downloads, load memory, open chats.

`App.tsx` renders `OnboardingScreen` until storage is `ready`. Nothing else is reachable (ST-1/ST-2).

## 3. Storage (the vault)

Layout inside the chosen root (`<root>/` is either app-private `…/files/vault` or `<picked>/CHIWIWI`):

```
models/     *.gguf and *.gguf.part (resumable partials)
chats/      <threadId>.json
media/      (reserved)
memory.json
.nomedia    keeps gallery scanners out
```

App-private (never in the vault): `chiwiwi_storage_config.json`, `chiwiwi_settings.json`.

**Why a path, not just a picker.** The inference engine opens the model by a real file path.
`llama.rn` (checked in 0.12.9 and 0.13.0-rc) strips `file://` but has no `content://` support, and
Android's folder picker returns `content://`. So `core/paths.ts#safTreeUriToPath` maps the picked URI to
`/storage/...`, and `services/storage.ts#probeWritable` **proves** it by writing, reading back and deleting
a file. On Android 11+ that only succeeds with *All files access*; the UI walks the user to that screen
and re-checks automatically when they return. If they decline, **app storage** always works.

## 4. Downloads (`core/downloadManager.ts` + `services/downloadPlatform.ts`)

- Size and sha256 come from the Hub **repo-tree API** (`core/hf.ts`, `services/hfClient.ts`).
  (The old code used the CDN `etag`, which is not the file hash, and rejected good downloads.)
- States: `idle -> resolving -> downloading <-> paused -> finalizing -> completed`, or `error` (with `retryable`).
- **Resume:** Android native `DownloadTask.resume()` sends `Range: bytes=<offset>-`, truncates to the
  offset and appends the 206 body. The offset is the partial file's length, so resume survives app
  restarts. We never add our own `Range` to a fresh task (native `start()` would overwrite the file).
  Verified against the live CDN: 206 + correct `Content-Range`, and the joined bytes reproduce the published SHA-256.
  iOS has only in-memory resume data, so after a restart the partial is discarded (best effort).
- Auto-retry (4x, backoff) from the partial file on network errors; HTTP 4xx is permanent; 416 handled.
  A retry that moved the file forward by 8 MiB or more refills the budget, so a long download on a flaky network is not killed by four unrelated blips.
- **Stall watchdog:** the phone can freeze a backgrounded transfer without raising any error. If no new bytes arrive for 45 s
  (and the user has not paused), the native task is cancelled (the partial file stays) and the same retry path resumes from the partial.
  Tested with fakes (`downloadManager.test.ts`); the timing on a real phone is a device-only check in `QA_PLAN.md`.
- Free space is checked before starting (`Paths.availableDiskSpace`, same volume only).
- Final check: exact size == Hub size, GGUF magic, then atomic `rename` of `*.part`.
- Optional **deep verify** (full SHA-256 in pure JS, chunked with yields) from the model card.
- Only one active download; screen keeps awake while it runs. State lives in a singleton, not in a screen,
  so navigating away never pauses it.

## 4b. Model status (`core/modelStatus.ts`)

One pure function turns (download state, engine state, verified?) into the status and the list of
allowed actions on a model card, so every combination is tested and no card shows a dead button.

## 5. Engine (`core/engineManager.ts`, `services/llamaEngine.ts`)

`InferenceEngine { load, generate, stop, release }`, implemented by `LlamaEngine` over `llama.rn`
(llama.cpp via JSI). `llama.rn` is `require`d lazily so Expo Go / web shows a clear message instead of crashing.

`EngineManager.mount(spec)`: **verify file -> RAM fit check -> mark `pendingMountModelId` -> load -> test
generation -> Active + Verified**. A model is "Verified" only if it produced output. If the process is
killed while loading (out of memory), the marker is still set at next launch and the app says so and
does not auto-load that model again.

Decisions:
- **Chat template:** `completion({messages})` renders the model's own jinja template, so Llama, Qwen,
  Gemma and DeepSeek each get the right format (the old code applied one of two hard-coded templates, never used).
- **CPU by default on Android** (`devices: ['CPU']`). GPU is an explicit, experimental setting.
  The engine ships several CPU variants (`dotprod`, `i8mm`, `opencl`...) and picks one at runtime.
- **Context size** defaults from real RAM (`core/fit.ts`); users can override it.
- **Fit rating** = estimated RAM (file + KV cache + overhead) vs. real `totalMemory`; "too heavy" is refused unless forced.

## 6. Chat (`core/chatTurn.ts`, `core/thinking.ts`, `services/chat.ts`)

`runAssistantTurn` builds the prompt (system = persona + PAD style + user memories; sliding-window
history sized to the context), streams tokens, and splits raw output into **reasoning** and **answer**.

- Reasoning markup is parsed deterministically (`<think>`, a template that pre-opens the tag, partial tags
  while streaming, leaked control tokens). Verified against a real Qwen3 model (`scripts/real-model-check.mjs`).
- The **process panel** shows real phases (loading -> reading N tokens -> thinking -> writing) and the
  engine's own timings (tok/s, prompt ms). Nothing in it is invented.
- Updates are coalesced (~15 fps) so token streaming does not flood React.
- Failures become inline messages with an action; the app never fabricates a reply.
- Threads persist as JSON in `chats/`; a message that was streaming when the app died reloads as "stopped".
  Incognito threads are never written.

## 7. Persona and memory

`core/persona.ts` turns archetype + PAD (warmth/energy/directness) into plain style instructions in the
system prompt, so the sliders change the output (visible in Settings > Soul). Memory is a user-managed
list (`/remember ...` or Settings > Memory), capped so it cannot eat the context window.

## 8. Deliberate trade-offs

- **No Expo Router.** Navigation is a ~40-line stack (`ui/nav.ts`) with Android Back. Router would add
  native modules (screens/gestures) and build time for a 7-screen app.
- **No secure storage / encryption of chats.** The vault is plain files the user can open; the About
  screen says so.
- **Unused native modules removed** (Reanimated, Worklets, Gesture Handler, image/document pickers,
  linear-gradient) to shorten the native build.
- Text attachments only (read as text, 8,000-character cap). Images need a vision model + projector file; see roadmap.
