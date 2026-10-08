# CHIWIWI v2 — where we are / what's next (resume from here)

Rule: fix, never strip (see memory `feedback-fix-dont-strip`). Plan: docs/PLAN-v2.md. APIs: docs/api/*.md.

## Done (committed b2de798, check green: 248/248, android export OK)
- Wave 1: 54-model verified library + download queue (W1), real engine/settings/soul/privacy/storage slots (W2),
  voice/attachments/biometric (W3), sharp "Temple" design system + preview/design-v2.html (W4).
- Installed: whisper.rn, buffer, @fugood/react-native-audio-pcm-stream, expo-speech, expo-local-authentication,
  expo-image-picker, expo-document-picker. Voice loaders in services/voice/native.ts enabled (unproven bundle until S1 wires it).

## In flight (wave 2, uncommitted until they report): S1 Chat, S2 Vault UI, S3 Settings
Results land in the worktree; commit after `npm run check` + `npx expo export --platform android`.

## Phase 3 — integration verify (1 agent, Sonnet)
- Parity checklist: every row of PLAN-v2 §2 + old screens (git 94b571d) has a working screen. Fix gaps, never delete.
- Zero `borderRadius` > 0 in src/ui; contrast ok; Android back works; no fake numbers (grep hard-coded stats).
- Open items: boot wiring (initSecurity, initVoicePrefs, refreshSpeechModels), routes registered, Metro bundles whisper.rn.

## Phase 4 — ship
1. Commit; fast-forward `main` (owner works on main only). Owner's main checkout `D:\1111-Works\CHIWIWI` must be updated
   (`git checkout -B main origin/main` style; avoid `reset --hard`, it is blocked by the harness).
2. New native deps => NEW APK required: `cd mobile; npx eas-cli@latest build -p android --profile development` (dev client, Metro over Wi-Fi)
   or `--profile preview` (standalone). EAS logged in as lengseang; free tier 15 builds/month. npm via PowerShell only.
3. Device smoke test: docs/audit/04-validation-core.md (17 steps) + voice, vision, download-resume, KV cache.

## Known risks / owner decisions
- Classic big+small speculative pairs unsupported by llama.rn 0.12.9 (MTP drafts only): shown with honest reason.
- Pure-JS SHA-256 slow on big models (11–30 min est.); kill switch `verifyMode: 'off'` in services/downloads.ts.
- Download vision projector by default? (adds 0.2–1.5 GB) Warn on non-commercial licenses? (defaults: yes / yes)
- Nothing has ever run on a phone: llama.rn 0.12.9 + Qwen3.5/Gemma 4 on RN 0.86 unverified.
- gh CLI token invalid: PRs must be made via web or after `gh auth login`.
