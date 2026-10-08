# Roadmap

Everything here is **not built yet**. The UI does not pretend otherwise (the old version showed fake
controls for several of these; they were removed).

## Next, in order of value

1. **Live voice.** Offline speech-to-text (whisper.rn or similar) + text-to-speech + voice activity
   detection, chunked at sentence boundaries. Needs microphone permission, model downloads for the
   speech models, and a real audio pipeline. The old "voice overlay" only replayed fixed phrases.
2. **Vision.** Download the model's `mmproj` projector file next to the model and call
   `initMultimodal`. Qwen2.5-VL / Gemma 3 / Qwen3-VL need it; the old catalog advertised "Vision" without it.
3. **Background downloads.** A foreground service with a notification so multi-GB downloads survive the
   screen being off or the app being swiped away (needs `expo-notifications`/a service + permission).
   Today a download continues while the app is merely in the background and recovers by itself if the phone froze it
   (stall watchdog), but it is not guaranteed to run once Android kills the app.
4. **Automatic memory.** Extract facts from chats with the model itself (user-approved) instead of manual entry.
5. **Speculative decoding.** `llama.rn` supports a draft model; needs a *vocabulary-compatible* pair
   (the old pairs were not compatible) and a measured benefit on phones.
6. **Prompt cache.** `saveSession` / `loadSession` to skip re-reading a long system prompt.
7. **App lock** (biometric) and **encrypted chats**.
8. **iOS verification.** Code paths exist (Metal, no SAF) but nothing has been run on iOS.
9. **Chat search / export / rename.**

## Housekeeping to decide

- **License.** `README` says Apache-2.0 but there is no root `LICENSE`; `mobile/LICENSE` is the Expo
  template's MIT (c) 650 Industries. Pick the license and add the matching file.
- **Work on `main` that is not on this branch** (Downloads Hub, sovereign splash screen, soul customizer, NativeWind/MMKV): see
  "Reconciling with `main`" below.
- `preview/index.html` is a static design mock (not the app). Keep as a mock or delete.
- The root `*.js` files (`gateway.js`, `grounder.js`, `critic.js`, `humanizer.js`, `orchestrator.js`,
  `sync-notion.js`) are an unrelated "anti-hallucination" dev-tool experiment; they are not used by the app.
- Android release signing for Google Play (the CI APK uses the debug key); Play also restricts
  *All files access*, so a Play build should ship app-storage-only or justify the permission.

## Reconciling with `main`

`main` was developed on the old architecture after this branch was cut. It still has the canned-answer
`LocalLlmDriver.synthesizeResponse` (no `llama.rn` in its `package.json`), the old `SettingsScreen`, NativeWind, MMKV, and four-CPU builds,
so it cannot be merged file-for-file without bringing the fake engine back. What is worth carrying over, and its status:

| From `main` | Decision |
|---|---|
| Native `Range` resume via `DownloadTask.fromSavable`, canonical HF URL, 416 self-heal, GGUF magic check | **Already here** (same technique; verified against the live CDN) |
| "App-switch" download re-sync | Replaced by a stall watchdog (`core/downloadManager.ts`), which also fixes the silent-freeze case |
| Universal thinking parser | **Already here, stronger** (`core/thinking.ts`: streaming, partial tags, real timings, tested on a real model) |
| `.agents/` QA and auditor role definitions | **Copied** |
| App icon / splash artwork | **Ported**: the logo is the launcher icon (padded so round masks do not clip it) and the black native splash (`expo-splash-screen`) |
| Animated "Sovereign" splash screen (JS) | Not ported: hard-codes "Snapdragon 8 Gen 2" and scripted boot text that does not reflect real work. Port the look with real stage names if wanted |
| Soul customizer (1,175 lines) | Not ported yet: review against `ui/SoulEditor.tsx`, port the parts that are better |
| Downloads Hub (queue controls) | Not ported: this app runs one download at a time by design; revisit if queueing is wanted |
| NativeWind, MMKV, Nitro, keyboard-controller, flash-list | Not ported: unused or replaceable, and each adds native build time |
