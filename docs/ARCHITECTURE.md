# CHIWIWI Mobile: Sovereign On-Device Emotional AI Agent

## 1. Executive Summary
CHIWIWI is an offline-first, on-device mobile AI agent. It runs local quantized models (GGUF via llama.cpp JSI) directly on user handsets, eliminating cloud subscriptions, external APIs, and privacy leaks. It pairs an affective "Souls" engine for emotional nuance with a full-duplex offline voice pipeline.

## 2. Core Pillars
- **Zero Cloud Dependence**: 100% on-device inference for LLM, STT, and TTS.
- **Affective Souls Engine**: Continuous PAD (Pleasure-Arousal-Dominance) emotional state vector driving dynamic voice tone and response cadence.
- **Live Voice Loop**: Silero VAD + Whisper.rn (STT) -> Local LLM -> Sherpa-ONNX/Piper (TTS).
- **Deterministic Tool Verification**: AST and schema-checked tool execution prevents parameter hallucinations.

## 3. Technology Matrix
- **Mobile Stack**: React Native (Bare Expo) + Hermes Engine + JSI
- **LLM Runtime**: react-native-llama (Metal on iOS / Vulkan & OpenCL on Android)
- **Target Quantizations**: Llama-3.2-1B-Instruct (Q4_K_M), SmolLM2-1.7B (Q4_K_M)
- **Audio Processing**: Silero VAD + Whisper.rn + Piper TTS
- **Storage & Vector Memory**: OP-SQLite with sqlite-vec extension

## 4. Emotional State Transition Equation
State vector S = [P, A, D] decays toward baseline across turns:
S(t+1) = lambda * S(t) + (1 - lambda) * S(baseline) + delta(input)

## 5. Privacy & Security Invariant
Zero outbound network calls during chat or voice execution. User data, chat logs, and vector memory remain strictly inside the OS application sandbox.

## 6. Resolved Production Architecture Decisions (Grill-Me Signoff)
1. **Device Tiering & RAM Protection**: Hardware-based model gating. 1B (SmolLM2 / Llama-3.2-1B) on 6-8GB devices; 3B on flagship >=12GB devices only. Strict app rejection on <6GB RAM to avoid OS Jetsam/LMK eviction.
2. **Streaming Audio Pipelining**: Punctuation-level chunking. LLM streams tokens; first punctuation mark fires on-device neural TTS immediately. Perceived conversational latency reduced to 400-600ms.
3. **Decoupled Dual-Track Function Calling**: Deterministic Gateway runs outside the LLM in JavaScript/C++. Zero LLM JSON generation. Small 1B models only narrate verified execution results.
4. **Hybrid Episodic Memory System**: Active LLM KV-cache capped strictly at 4-6 turns. Background entity extractor stores long-term facts in local SQLite-vec; top-3 facts dynamically injected based on semantic relevance.
