# CHIWIWI

[![CI](https://github.com/lengseang/chiwiwi/actions/workflows/ci.yml/badge.svg)](https://github.com/lengseang/chiwiwi/actions/workflows/ci.yml)

**A private AI chat app that runs entirely on your phone.** You download a model once from Hugging Face;
after that, chatting uses no internet, no account and no analytics.

It works on any 64-bit Android phone (it reads your real device and RAM and recommends models that fit),
not on one specific phone.

## How it works for a user

1. Install and open. The welcome screen shows **your** phone and what the app needs.
2. **Choose where to keep data** (a folder you pick, or private app storage). Nothing works until you do.
3. **Model Hub:** pick a model that fits your phone and download it (progress, speed, ETA, pause/resume).
4. The app **verifies** it: file check, load into memory, and a real test reply.
5. **Chat.** Replies stream in, with a live "what is the AI doing" panel (reading, thinking, writing) and a clean final answer.

## What is real, what is not

| | |
|---|---|
| Real on-device inference (llama.cpp via llama.rn) | Yes |
| Resumable, verified model downloads | Yes |
| 21 models checked against the live Hugging Face Hub | Yes |
| Device-aware fit ratings, context size | Yes |
| Streaming chat with real reasoning view, history, stop, retry, attachments (text files), memory, incognito | Yes |
| Voice conversation, image understanding, speculative decoding, app lock | **Not built** - see [docs/ROADMAP.md](docs/ROADMAP.md) |
| Tested on a physical phone | **Not yet by the automated pipeline** - run [docs/QA_PLAN.md](docs/QA_PLAN.md) sections 1-3 |

Automated checks (typecheck, 96 unit tests, Android JS bundle, a successful native Android build, a live
catalog check, and a run against a real Qwen3 model) are listed in [docs/QA_PLAN.md](docs/QA_PLAN.md).

## Quick start (developers)

```bash
cd mobile
npm ci
npm run check        # strict typecheck (app + tests) + 96 unit tests, ~5 s
npx expo export --platform android   # compile the JS
```

The app contains native code, so it needs a real build (it cannot run in Expo Go):
see **[docs/BUILDING.md](docs/BUILDING.md)**: run live on your phone over a USB cable with no rebuild per code change,
arm64-only release builds (3m38s measured on 4 vCPUs), and a GitHub Actions workflow with no queue.

## Repository map

```
mobile/                 the app (Expo SDK 57, React Native 0.86, llama.rn)
  src/core/             pure logic, unit-tested under Node
  src/services/         phone adapters + app-wide stores
  src/ui/               screens and components
  test/                 node:test suites
scripts/                verify-catalog.mjs, real-model-check.mjs
docs/                   REQUIREMENTS, ARCHITECTURE, BUILDING, QA_PLAN, AUDIT, ROADMAP
.github/workflows/      CI + APK build
preview/index.html      static design mock (not the app)
```

| Doc | What it answers |
|---|---|
| [REQUIREMENTS](docs/REQUIREMENTS.md) | What the product must do (the original prompts, restructured, with IDs) |
| [ARCHITECTURE](docs/ARCHITECTURE.md) | How it is built and why |
| [BUILDING](docs/BUILDING.md) | How to build fast |
| [QA_PLAN](docs/QA_PLAN.md) | How to prove it works, on a phone |
| [AUDIT](docs/AUDIT.md) | Every control and function reviewed |
| [ROADMAP](docs/ROADMAP.md) | What is not built yet |

## Privacy

Chat never touches the network. The only network use is the Model Hub downloading from `huggingface.co`.
Chats, memory and models are plain files in the storage folder you chose (not encrypted).

## License

Not finalised: see the housekeeping note in [docs/ROADMAP.md](docs/ROADMAP.md).
