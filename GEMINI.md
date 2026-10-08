# GEMINI.md — read this first (also valid as AGENTS.md for any AI agent)

Project: CHIWIWI, an offline on-device LLM chat app. Expo SDK 57, React Native 0.86, llama.rn 0.12.9, target Galaxy S23 Ultra.
App code is in `mobile/`. Full task list: `docs/HANDOFF.md`. Design: `docs/DESIGN.md`. APIs: `docs/api/*.md`. Plan: `docs/PLAN-v2.md`.

## The owner's hard rules (broken before, do not repeat)
1. **Never remove a feature, setting, model, tag or screen to "simplify" or "fix".** Make it work, or keep it visible with an honest status
   ("Needs a vision model"). Removing things is the worst failure here. If something must go, ask the owner first.
2. **Nothing fake.** No canned replies, no hard-coded numbers ("2.8x", "Snapdragon NPU", "Thought for 1.2s"). Every number on screen
   comes from the engine, the file system or the device. If you cannot measure it, show "not measured yet".
3. **Sharp design.** `borderRadius` is always 0. One accent per theme. No rainbow. Themes: Nyx (dark, starry night, gold) and Helios (light, sun, bronze).
   Use the primitives in `mobile/src/ui` and tokens in `mobile/src/theme`; never hard-code colors or sizes in screens.
4. **Verify before saying done.** From `mobile/`, in PowerShell (not Git Bash; llama.rn's install script breaks there):
   `npm run check` (typecheck + tests, must be green) and `npx expo export --platform android --output-dir $env:TEMP\exp` (must bundle).
   Report the exact output. New logic gets a `node:test` test in `mobile/test/`.
5. **Work on `main`, small commits.** Do not rewrite history. Do not run `git reset --hard` or delete branches.
6. **Never invent model files.** Every catalog entry must resolve on Hugging Face with the right size and sha256:
   run `node scripts/verify-catalog.mjs`.

## Layers (keep them separate)
UI `mobile/src/ui` → services `mobile/src/services` → pure logic `mobile/src/core` (tested under Node) → native (llama.rn, whisper.rn, expo-*).
Core has no React Native imports. Services own side effects. UI never calls native modules directly.

## Commands
- Install: `cd mobile; npm ci` (PowerShell).
- Dev: `npx expo start --dev-client` (needs the dev-client APK; Expo Go cannot run this app).
- Cloud APK (no cable needed): `npx eas-cli@latest build -p android --profile development` (or `--profile preview` for standalone). Free tier: 15 builds/month, so batch native dependency changes.
- Catalog check: `node scripts/verify-catalog.mjs`.
