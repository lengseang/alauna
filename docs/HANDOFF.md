# HANDOFF — what is built, what is left (for the next AI or developer)

Read `GEMINI.md` (rules) first. Status date: 2026-10-08. Nothing has ever run on a real phone.

## Built (tested under Node, bundles for Android)
- Library: 54 verified models, tags, filters, sort, fit-to-phone (`core/catalog*.ts`, `services/modelLibrary.ts`).
- Downloads: queue, resume after kill, SHA-256 verify, companions (vision projector / draft) (`core/downloadManager.ts`, `services/downloads.ts`).
- Engine: llama.rn load with warm-up "Ready", compute settings, fallbacks, vision, KV session cache, speculative (MTP only), self-test (`services/engine.ts`, `llamaEngine.ts`).
- Data: settings v2, Soul (PAD → sampling), memory, threads, incognito, auto-purge, offline gate, storage slots, integrity check.
- Voice/media/security: TTS, STT (whisper.rn), attachments, biometric lock (`services/voice/*`, `attachments.ts`, `security.ts`).
- Design system "Temple": `src/theme`, `src/ui` primitives, stack navigation, `preview/design-v2.html`.
- Screens (wave 2, may be partly done — check `git log` and `docs/NEXT-PHASES.md`): Chat, Model Vault, Downloads, Speculative, Settings hub + sub-screens.

## Task list, in order (tick when verified)
### A. Make it run on the phone (highest value)
1. [ ] Build the dev-client APK (see commands in GEMINI.md), install on the phone, run `npx expo start --dev-client`.
2. [ ] Walk the 17-step smoke test in `docs/audit/04-validation-core.md`. Start with Qwen3.5 0.8B (smallest).
3. [ ] Fix anything that fails. Read the status line under the model name and `adb logcat` equivalent (Expo dev menu → logs) for the error.
4. [ ] Confirm: model loads and says "Ready", a chat streams tokens, tok/s shown is real, Test model passes.
5. [ ] Confirm download pause/resume/kill-app/resume, SHA verify time on a 2.7 GB model (pure-JS SHA may take 11-30 min; if too slow write a small native hash module or keep `verifyMode: 'off'` for large files and say so in the UI).

### B. Parity audit (cannot remove anything)
6. [ ] Compare against `docs/PLAN-v2.md` §2 row by row and against the old app (`git show 94b571d:mobile/App.tsx`, `.../SettingsScreen.tsx`). Every row needs a working screen. Add what is missing; do not delete.
7. [ ] Grep for fakes: hard-coded stats, canned text, `setTimeout` pretending to load.
8. [ ] Grep `borderRadius` in `mobile/src` — must be 0 (or absent).

### C. Features that need proof on device
9. [ ] Vision: load a vision model + projector, send an image.
10. [ ] Voice: install a whisper model, speak, hear the reply; test barge-in (speaker echo may self-trigger; setting can disable it).
11. [ ] KV session cache: measure cold vs warm time-to-first-token.
12. [ ] GPU backend (experimental): try, confirm automatic CPU fallback if it fails.
13. [ ] Speculative: only MTP-capable models run; classic big+small pairs are shown with a reason (llama.rn 0.12.9 limit). Re-check when llama.rn updates.

### D. Polish and release
14. [ ] Accessibility pass: labels on every icon-only button, font scale 1.3, reduced motion, 48dp targets.
15. [ ] Hand-tune the Helios (light) splash logo and app icon.
16. [ ] Update stale docs: `ARCHITECTURE.md`, `QA_PLAN.md`, `REQUIREMENTS.md`, `docs/audit/00-master-spec.md`.
17. [ ] Release build: `--profile production`; set versionCode; keep `arm64-v8a` only.

## Known limits and owner decisions pending
- Vision projector downloads by default (+0.2–1.5 GB)? Default yes. Licence warning on non-commercial models? Default yes.
- Voice tag means "model has an audio encoder" (Gemma 4, Qwen2.5-Omni). Video tag exists, no model uses it yet.
- SD-card slot free space is shown as unknown (no API without native code).
- `gh` CLI token is invalid on the owner's PC; make PRs on the website or after `gh auth login`.
