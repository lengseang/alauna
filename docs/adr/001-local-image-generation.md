# ADR 001: On-Device Local Image Generation Architecture

**Status:** Accepted / Implemented Phase 0 & Phase 1  
**Date:** 2026-10-09  
**Specification:** `CHIWIWI-IMG-ARCH-001`  
**Target Hardware:** Samsung Galaxy S23 Ultra (Android 14+, Snapdragon 8 Gen 2, Adreno 740, 12GB RAM) & iOS (A17 Pro+ / M-series)

---

## 1. Context

Chiwiwi is an offline, private, on-device AI chat and creation app. While text LLM chat (via `llama.rn` 0.12.9) and speech (via `whisper.rn` 0.7.4) are established, user visual creative workflows require on-device image synthesis without compromising privacy, memory stability, or battery life.

The architecture must satisfy the non-negotiable principles:
1. **Local means local**: Zero cloud telemetry, zero remote fallback.
2. **Resource safety**: Never crash with out-of-memory (OOM) or induce severe thermal throttling.
3. **Truth in advertising**: Never display fake progress percentages or fabricate model capabilities.
4. **Clean layer separation**: UI (`src/ui/imageGen`) → Services (`src/services/imageGallery.ts`, `imageRuntime.ts`) → Pure Core Logic (`src/core/imageGen/`, 100% Node testable).

---

## 2. Architecture Decisions

### 2.1 Framework & Integration Approach
* **Decision:** Integrate natively within Expo SDK 57 / React Native 0.86 New Architecture (TurboModules & Fabric).
* **Rationale:** Keeps image generation seamlessly inside the existing app navigation stack (`imageStudio` route), preserving theme tokens, typography, and storage access patterns.

### 2.2 Android Runtime and Model Format
* **Decision:** Adopt `stable-diffusion.cpp` (GGUF quantized diffusion models) with Vulkan/OpenCL acceleration as primary candidate runtime, alongside MediaPipe Image Generator evaluation.
* **Evidence:** The existing LLM pipeline is built around GGML / llama.cpp. `stable-diffusion.cpp` shares the same tensor library (`ggml`), memory mapping (`mmap`), and quantization formats (`q4_0`, `q8_0`), minimizing binary bloat and memory fragmentation.
* **Trade-offs:** Compiling native C++ requires bounded worker threads and architecture targeting (`arm64-v8a`) to avoid Windows paging exhaustion during native builds.

### 2.3 iOS Runtime and Model Format
* **Decision:** Support Core ML (`ml-stable-diffusion` with float16/int8 ANE compression) and `stable-diffusion.cpp` Metal backend.
* **Evidence:** Apple Neural Engine (ANE) on iOS delivers peak tok/step efficiency with lower thermal dissipation than CPU.

### 2.4 Initial Model Selection & Licenses
* **Models Selected:**
  1. `sd-turbo-q4` (Stability AI SD-Turbo, 512x512, 1-4 steps, CreativeML Open RAIL-M)
  2. `bk-sdm-small-q4` (Nota AI BK-SDM Tiny, 512x512, 15 steps, Apache-2.0)
  3. `stable-diffusion-v1.5-q4` (Runway / CompVis SD 1.5, 512x512, 20-30 steps, CreativeML Open RAIL-M)
* **Evidence:** SD-Turbo converges in only 1 to 4 steps, reducing generation latency on mobile from 45s down to 3-8s.

### 2.5 Resource & Thermal Management Policy
* **Single-Job Invariant:** Strictly one image generation job active at any moment (`ImageGenerationCoordinator`).
* **Adaptive Planning:**
  - Standard thermals: balanced steps (2 steps for Turbo, 20 for SD 1.5).
  - Serious / Critical thermals: automatic clamp to Fast Draft mode, 30% step reduction, disable upscalers.
  - RAM Thresholds: 3.5GB RAM minimum for Turbo, 4.0GB for SD 1.5.

### 2.6 Local Prompt Intelligence
* **Decision:** Implement a deterministic heuristic `planScene()` engine in pure core TypeScript.
* **Evidence:** Avoids spawning a heavy secondary 7B LLM just to parse an image prompt. Retains all key user nouns, extracts composition, lighting, style, and compiles model-specific positive/negative prompts.

### 2.7 Storage & Gallery
* **Decision:** App-private storage inside vault (`<vault>/gallery/`), with an atomic JSON index (`chiwiwi_gallery.json`).
* **Evidence:** Prevents OS media scanners from indexing private generation outputs until the user explicitly exports to the shared photo library.

---

## 3. Exit Gate Status
* **Phase 0 Audit & ADR:** Complete.
* **Phase 1 Vertical Slice Contracts:** Pure core types, scene planner, adaptive planner, model capability registry, coordinator state machine, gallery service, and Image Studio UI implemented and integrated.
