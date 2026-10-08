# Engine & data API (W2) — what the UI may use

Owner: W2. Paths under `mobile/src/`. Everything is observable (`useSyncExternalStore` hooks); every number comes from
llama.cpp, the file system or the OS. Verified by `npm run check` (247 tests: `settingsV2`, `engineV2`, `dataV2` +
the v1 suites) and `npx expo export --platform android`. Nothing here has run on a phone yet.

## 1. Settings v2 — `services/settings.ts` (schema `core/settingsModel.ts`)

```ts
useSettings(); settingsStore.getState();
updateSettings(patch)            // validated + clamped, saved after 250 ms
updateSettingsNow(patch)         // saved before it resolves
updateSection('compute', { threads: 6 })   // nested sections: compute|sampling|speculative|stt|tts|appearance|storage
resetSettings(section?)
```

| Field | Type / range | Read by |
|---|---|---|
| `archetype`, `pad`, `toneIntensity` (0.1..1), `customBackstory` | global Soul | chat.ts, soul.ts |
| `compute.backend` | `'cpu' \| 'gpu'` (GPU experimental, auto-fallback) | engineManager |
| `compute.nGpuLayers` 0..999, `threads` null\|1..16, `nCtx` null\|512..32768, `nBatch` 32..2048 | | engine load |
| `compute.flashAttn` `auto\|on\|off`, `cacheTypeK/V` `f16 f32 q8_0 q4_0 q4_1 iq4_nl q5_0 q5_1`, `useMmap`, `useMlock`, `kvSessionCache` | | engine load |
| `sampling` `{ temperature 0..2, topP, topK 0..200, minP, repeatPenalty 1..2 }` | base values, Soul nudges them | chat, preview |
| `speculative` `{ enabled, draftModelId: null\|'mtp'\|catalog id, nDraft 1..16, pMin 0..1 }`, `activePresetIndex` | | engine load |
| `stt` `{ model, vadThreshold 0..1 }`, `tts` `{ enabled, voiceId, rate 0.25..2, pitch 0.5..2 }` | | W3 voice |
| `offlineStrict` (default **on**), `incognitoDefault`, `biometricLock`, `autoPurgeDays` (0 = off .. 3650) | | networkGate, chat, W3, lifecycle |
| `appearance` `{ theme: system\|nyx\|helios, textScale 0.85..1.5, haptics, reducedMotion }` | | W4 theme |
| `storage.modelSlotId` | slot for new downloads (null = vault) | storage.ts |
| `computeNotice` | one-time explanation of an automatic change (GPU crash -> CPU) | Advanced screen |
| v1 `threads`, `useGpu`, `contextOverride` | read-only mirrors of `compute` (writing them still works) | old UI |

Migration: v1 files load as v2 (flat fields -> `compute`); W4's old `chiwiwi_theme.json` is imported once into `appearance`.

## 2. Engine — `services/engine.ts`

```ts
const s = useEngineStatus();   // EngineStatus (core/engineStatus.ts)
engine.mount(spec,{force}) / unmount() / stop() / isReady(id?) / supportsVision() / contextSize() / dismissCrashNotice()
runSelfTest(modelId?) ; recommendedModel()
useBackendDevices(); refreshBackendDevices(force?)  // { status, devices: NativeBackendDeviceInfo[], gpuAvailable, error }
modelHasVision(spec); companionPath(spec, 'mmproj'|'draft'); companionFileNames(spec); kvCacheDir()
```

`EngineStatus` adds to v1 (state, progress, backend, nCtx, lastTokPerSec, lastTokens, ttftMs, loadMs, warmupMs, ramEstimateMb, error*, headline):

| Field | Meaning |
|---|---|
| `devices`, `gpu`, `reasonNoGPU` | backends llama.cpp used, and its own reason when not GPU |
| `promptTokens`, `ctxUsed`, `cachedTokens` | last generation: prompt size, prompt+reply, tokens reused from KV |
| `fallbacks: string[]` | features switched off during the last load, each with the reason ("GPU failed (...): using CPU") |
| `speculative` | `{ requested, draftModelId, active, reason, draftTokens, acceptedTokens, acceptanceRate, specTokPerSec, baselineTokPerSec, speedup }` — counters are llama.cpp's `draft_tokens(_accepted)`; speed-up = measured chat tok/s with / without (persisted per model in `verified`) |
| `kvCache` | `{ enabled, status: off\|idle\|saved\|loaded\|error, tokens, ms, reason, coldTtftMs, warmTtftMs }` — first reply after load, send->first token incl. prefix work |
| `vision` | projector initialised and reports vision |

Load order: verify -> fit -> crash marker -> load (+ `initMultimodal` if the mmproj is downloaded) -> 5-token warm-up -> ready.
On a failed load/warm-up, experimental features are relaxed in order **speculative -> quantized KV -> GPU** and retried; a
damaged file / unknown architecture is never retried. A GPU failure is remembered for the session; a GPU *crash* (app
killed) switches `compute.backend` to CPU at next launch and sets `computeNotice`.

**Speculative = MTP only in llama.rn 0.12.9** (`rn-completion.cpp shouldUseMTP`): "Built-in" (`draftModelId` null/'mtp')
uses the catalog `draft` head if downloaded (Gemma 4), else the model's own nextn layers; a catalog draft model must share
`draftCompatible` and be an MTP head with the target's hidden size. Checked from GGUF headers before `initLlama`
(a mismatch would abort the process natively). Refused pairs load without it and show `speculative.reason`.

## 3. Chat — `services/chat.ts`

Unchanged v1 API plus: `sendMessage(text, attachments)` (image attachments: `makeImageAttachment(name, path)` from
`core/chatTypes.ts`; refused with `reason: 'no_vision'` when the model cannot see), `newChat(incognito = settings.incognitoDefault)`,
`renameThread(id,title)`, `setThreadPinned(id,pinned)` (pinned sort first, never auto-purged), `searchChats(query)` (title +
messages, `snippet`), `updateThreadSoul(soul)` (per-chat override), `clearThreadSoul()`, `currentSoul()`. `MessageStats` now has
`ttftMs, cachedTokens, draftTokens, draftAccepted, backend`. `ChatThread` has `pinned`, `soulOverride`.

## 4. Soul — `services/soul.ts`

`globalSoul()`, `setGlobalSoul(patch)`, `applyArchetype(key)`, `soulEffects(soul)` -> `{ descriptors, sampling }`,
`previewSoul(soul?, prompt?)` -> real 80-token generation with the loaded model, or `{ ok:false, reason:'no_model'|'busy'|'engine' }`.
Archetypes (`core/persona.ts ARCHETYPES`): empath, mentor, tactical, spark, cynic, visionary.
PAD -> sampling (k = intensity, a = arousal-0.5, d = dominance-0.5): temp += 0.4ak (0.1..1.5), top_p += 0.1ak, top_k *= 1+0.5ak,
repeat += 0.1dk (1..1.5); pleasure is prompt-only. Neutral PAD = your base sampling.

## 5. Memory vault — `services/memory.ts`

`useMemory()`, `addMemory`, `editMemory(id,text)`, `setMemoryPaused(id,bool)`, `deleteMemory`, `clearMemory`,
`useMemoryBudget()` / `getMemoryBudget()` -> `{ included, overBudget, paused, usedChars, maxChars (700), estimatedTokens, promptBlock }`
(`promptBlock` is byte-identical to what the system prompt contains).

## 6. Privacy & data — `services/privacy.ts`, `services/networkGate.ts`

`autoPurgeOldChats()` (runs at launch), `purgeChats()`, `purgeMemory()`, `purgeKvCache()`, `purgeMedia()`, `purgeAll()`
(chats+memory+KV+media; models and settings kept), `runIntegrityCheck({ models?, token? })` + `useIntegrity()` (chat/memory/
settings JSON; with `models:true` full SHA-256 of installed models via the Vault's `deepVerify`).
`networkGate.check(purpose, url?)` / `networkGate.fetch(url, init, purpose)` / `useNetworkGate()` — purposes
`'user-download' | 'metadata' | 'other'`; offline-strict allows only `'user-download'`.
`lifecycle.useBoot()` -> real boot stage `settings|storage|library|done` + `purgedChats`.

## 7. Storage slots — `services/storage.ts`, `services/storageSlots.ts`

`getStorageChoices()` (first run: internal path + real free/total), `listSlotRoots()`, `addFolderSlot(uri?)`, `addInternalSlot()`,
`removeSlot(id)` (refuses while it holds models), `setDownloadSlot(id)`, `downloadModelsDir()`, `locateModelFile(name)`,
`refreshSlots()` + `useStorageSlots()` -> `SlotInfo { usedBytes, modelBytes, modelFiles, freeBytes, totalBytes, available, isPrimary, isDownloadTarget }`,
`vaultUsage()` -> bytes for models/chats/memory/media/kvCache, `moveModel(spec, slotId, { verify:'sha256'|'size', onProgress, token })`
(copy -> size+GGUF+SHA-256 -> rename -> delete source; refuses a loaded model). Max 5 slots.

## Needs owner decision

1. **Speculative decoding with a separate small model (old presets, e.g. Qwen 0.8B drafting 4B) is not possible in llama.rn
   0.12.9**: only MTP heads/built-in MTP layers. Such pairs are kept selectable and show the reason. Real gain needs a
   newer llama.rn with `draft-simple` wired, or catalog MTP heads (W1 `draft`).
2. Free space of SD-card slots: `null` (expo-file-system only reports the internal volume). A tiny native module would fix it.
3. Defaults chosen: `offlineStrict` on, `kvSessionCache` on, `speculative` off, `autoPurgeDays` 0 (old app showed 30 — deleting
   chats by default is destructive), GPU off.
4. Done: appearance has one source of truth (Settings v2 `appearance`); `theme/prefs.ts` now reads/writes it
   (light = Helios, dark = Nyx), `useThemePref()` unchanged. Companion paths come from the Vault (`mmprojPath`/`draftPath`),
   `moveModel` moves every file of `installedFiles(spec)`, and model cards show `queued` (action: cancel).
5. Integrity check of models takes minutes per GB (pure-JS SHA-256 on Hermes, risk R2); `moveModel` defaults to SHA verify.
6. KV-session files and the GPU path are UNVERIFIED-device (contract-tested against the real llama.rn JS only).
