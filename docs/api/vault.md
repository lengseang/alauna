# Vault API (W1): model library, queries, downloads

Owner: W1. Files: `mobile/src/core/catalog.ts` (types, aliases, queries, draft pairing), `mobile/src/core/catalogData.ts` (54 entries),
`mobile/src/core/fit.ts`, `mobile/src/core/downloadManager.ts`, `mobile/src/core/hf.ts`, `mobile/src/services/downloads.ts`,
`mobile/src/services/downloadPlatform.ts`, `mobile/src/services/modelLibrary.ts`, `mobile/src/services/hfClient.ts`,
`scripts/verify-catalog.mjs`. Tests: `test/catalog.test.ts`, `test/downloadQueue.test.ts`, `test/downloadManager.test.ts`.

Verified 2026-10-08: `node scripts/verify-catalog.mjs` = **Catalog OK (54 entries)**: every model, projector and draft file is ungated, exact LFS
size + sha256, `Range: bytes=0-3` answers 206 with the right total and `GGUF`; architecture present in the bundled llama.cpp (b10256);
`Image` tag <=> projector header has a vision encoder, `Voice` <=> audio encoder; context length and KV bytes read from each GGUF header.
Nothing here has run on a phone.

## 1. Library (`core/catalog.ts`)

```ts
import { MODEL_CATALOG, getModel, queryLibrary, libraryFacets, draftOptions, installSizeBytes, estimateModelRam,
         ALL_CAPABILITIES, CAPABILITY_INFO, normalizeCapability, MODEL_ID_ALIASES, type ModelSpec } from '../core/catalog.ts';
```

`ModelSpec` (all v1 fields kept): `id, name, family, paramsB, grade ('S'|'B'|'C'), role, priority, kvBytesPerToken, repo, filename, sizeBytes,
sha256, quantization, capabilities, thinking ('none'|'always'|'toggle'), contentPolicy ('Standard'|'Uncensored'), description` plus
`license, contextLength, chatTemplate, draftKey, mmproj?: HubFile, draft?: HubFile, published (YYYY-MM-DD)`.
`HubFile = { repo, filename, sizeBytes, sha256 }`.

- **Tags** `ModelCapability = 'Text' | 'Image' | 'Voice' | 'Code' | 'Reasoning' | 'Video'` (old app set + Reasoning). `CAPABILITY_INFO[tag]`
  = `{ label, meaning }` for chips/tooltips. `Video` is defined but carried by no entry (llama.rn takes images and audio only): show the
  chip with its `meaning`. `normalizeCapability('Vision'|'Audio'|...)` maps aliases.
- **Grade** is computed (`gradeFor`): estimated RAM at a 4096 context, C <= 2.5 GB, B <= 5 GB, S above. Counts today: see `libraryFacets()`.
- **Old ids** resolve through `getModel(id)` / `resolveModelId(id)`. `MODEL_ID_ALIASES`: `smollm3-1.7b -> smollm2-1.7b`,
  `smollm3-1.7b-uncensored -> deepseek-r1-1.5b-abliterated`, `smolvlm-uncensored -> smolvlm2-2.2b`, `phi-4-mini -> phi-4-mini-3.8b`.
  Every other id of the old app (94b571d), v1 (d919a34) and the 6-model catalog is still an id.

### Query
```ts
queryLibrary({
  search?: string,                       // every word must match name/family/id/repo/role/description/tags
  capabilities?: string[], match?: 'AND' | 'OR',   // default AND; 'ALL'/'ANY' accepted
  grades?: ('S'|'B'|'C')[],              // empty = all
  policy?: 'all' | 'Standard' | 'Uncensored',
  fitsPhone?: boolean, ramBytes?: number | null, nCtx?: number,   // drops 'too_heavy'; RAM unknown = no filter
  install?: 'all' | 'installed' | 'available', installedIds?: Iterable<string>,
  sort?: 'recommended' | 'name' | 'size_asc' | 'size_desc' | 'ram_asc' | 'ram_desc' | 'grade' | 'newest',
}): ModelSpec[]
```
`ramBytes` = `getDeviceProfile().totalRamBytes` (services/device.ts). When the filter includes Image/Voice, fit is judged with the projector in RAM.
`recommended` = best fit first, then `priority`. `size_*` sort by full install size (`installSizeBytes(spec, {vision?, draft?})`).
`libraryFacets()` -> counts per tag/grade/policy. Legacy `queryCatalog(CatalogQuery)` still works.
Fit per card: `fitFor(spec, ram)` / `FIT_LABEL` (core/fit.ts); with images: `estimateModelRam(spec, nCtx, { vision: true })` + `rateFit`.
`recommendModel(MODEL_CATALOG, ram)` unchanged contract (Qwen3.5 4B on 8-16 GB; entries with `priority: 0` are never recommended).

### Speculative pairs
`draftOptions(target, catalog?, installedIds?) -> ({ kind: 'mtp', file } | { kind: 'model', spec })[]`: the target's own MTP head first
(Gemma 4 E2B/E4B/12B), then same-`draftKey` models at most half its size, same content policy first, smallest first. `draftTargets(draft)` is the
inverse. W2's `planSpeculative` already validates by `draftKey`. The MTP head is installed with `downloads.start(spec, { draft: true })` and
found with `draftPath(spec)`.

## 2. Downloads (`services/downloads.ts`, core `DownloadManager`)

```ts
import { downloads, installModel, addCompanions, resumeAllDownloads, refreshDownloads,
         useDownloadState, useDownloadItems, useDownloadsHub } from '../services/downloads.ts';
```

One **install** = model + its image/audio projector (default) + optional MTP draft, tracked under the model id as ONE download.

| Call | Meaning |
|---|---|
| `downloads.start(spec, opts?)` / `installModel(id, opts?)` | start, **queue** (status `queued`), resume, or retry. `opts = { vision?: boolean (default true), draft?: boolean (default false), dir?: string }`. Options are remembered for later resumes |
| `addCompanions(spec, { vision, draft })` | on an installed model: downloads only what is missing (`state.missing`) |
| `downloads.pause(id)` / `cancel(spec, deletePartial = true)` / `remove(spec, { keepCompanions? })` | as before; also work on queued installs. `remove` keeps a projector another installed model shares |
| `downloads.pauseAll()` / `resumeAllDownloads()` | everything, in queue order |
| `downloads.moveInQueue(id, index)` / `downloads.queueOrder()` | reorder waiting installs (0 = next) |
| `downloads.setConcurrency(n)` | 1..4 parallel installs (default 1) |
| `refreshDownloads()` | at launch: reads disk, then continues installs that were running or queued when the app was killed (in order, with their options) |

`DownloadState` (per model id): v1 fields (`status, bytesWritten, totalBytes, speedBps, etaSec, error, retryable, note, verified, verifyFraction`)
+ `status: 'queued'`, `queuePosition` (1-based), `part` (`'model' | 'mmproj' | 'draft'` being transferred/verified), `parts[]`
(`{ kind, totalBytes, done }`), `missing` (on `completed`: companions not on the phone). Bytes, speed and ETA cover the whole install.
`verified` = every file of this install was SHA-256-checked in this download. `FILE_KIND_LABEL[kind]` = "model" / "image add-on" / "speed-up draft".

`useDownloadsHub()` -> `{ items, queue, concurrency, summary: { active, queued, paused, failed, bytesRemaining, speedBps, etaSec } }` for the Hub header.

Kept from v1 (tests still green): resume via Range after pause/kill, mandatory SHA-256 before rename (Hub hash first), pause never "completed",
bounded cancel/pause on a native task that never answers, 45 s stall watchdog, retry with backoff, 416 self-heal, HTML-error-page rejection.
New guarantees (tested): disk precheck counts companions **and** other running installs; a shared projector is downloaded once (file lock) and
not deleted while another model uses it; a damaged projector is deleted but the verified model is kept and Try again fetches only the projector.

**Storage slots** (W2 `services/storage.ts`): with no `dir`, files go next to an existing copy/partial (any slot, `locateModelFile`), else to
`downloadModelsDir()`. Pass `dir` = a slot's real models folder (`uriToPath(slotModelsDir(slot).uri)`) to target a slot. Free space comes from
`volumeSpace(dir)` (null on SD cards: the precheck is then skipped and a real ENOSPC becomes a retryable error).

## 3. Files on disk (`services/modelLibrary.ts`)

`modelPath(spec)`, `isInstalled(spec)`, `quickVerify(spec)`, `deepVerify(...)`, `installedBytes(specs)` (now includes companions),
`deleteModelFiles(spec)` as before, plus:
- `mmprojPath(spec)` / `draftPath(spec)` / `companionPath(spec, kind)`: real path of the downloaded companion or `null`.
- `companionLocalName(hubFile)` (core): companions are stored as `<owner>_<repo>.<file>` next to the model, because Hub names such as
  `mmproj-F16.gguf` repeat across repos (Qwen3.5 2B and 4B would overwrite each other).
- `installedFiles(spec)` -> `[{ kind, localName, path, bytes }]` (use it to move a model with its companions between slots).
- `modelFolder(spec)`: real folder of the model (any slot) or undefined.

## 4. Coordination needed (other owners)

- **W2 `services/engine.ts` `companionPath`** builds `joinPath(dir, mmproj.filename)`: wrong for the new naming (and collides). Replace with
  `mmprojPath(spec)` from modelLibrary. `modelHasVision`: use `spec.mmproj !== undefined` or `hasCapability(spec, 'Image')`.
- **W2 `storageSlots` move**: move `installedFiles(spec)` (model + companions), not only the model file.
- **W2 `core/modelStatus.ts`**: `deriveModelStatus` has no `queued` case (falls to "Not downloaded"); add `queued` (label
  `Queued #${queuePosition}`, actions pause/cancel) and show `missing` ("Add image support").
- **S2**: chips from `ALL_CAPABILITIES` + `CAPABILITY_INFO`; AND/OR toggle; grade chips; policy toggle; "Fits this phone"; sorts above; Hub from
  `useDownloadsHub()`; per-card `fitFor`; speculative picker from `draftOptions`.

## 5. Needs owner decision

1. **Voice tag** now means "the model understands recorded speech" (Gemma 4 E2B/E4B/12B and Qwen2.5-Omni 3B projectors have audio encoders,
   verified from their headers). The app's own whisper STT works with every model independently. Confirm this meaning.
2. **Video**: no model can take video through llama.rn 0.12.9; the tag is kept with an honest empty filter.
3. **Projector size**: the image/audio add-on is downloaded by default (Qwen3.5 4B +672 MB, Gemma 4 E2B +986 MB, Qwen2.5-Omni +1.5 GB).
   Option `vision: false` exists; choose the default for first-run setup (W2 `setupRecommended` currently passes no options = with projector).
4. **Licenses** shown per entry; non-commercial / custom: `qwen-research` (Qwen2.5 3B, Coder 3B, VL 3B, Omni 3B), `lfm1.0` (LFM2.5),
   `minicpm-model-license`, `gemma`, `llama3.x`. Decide whether to show a warning before download.
5. **Uncensored entries** (9, all real abliterated/Dolphin builds; `priority: 0`, never recommended). Old mislabels fixed: `qwen2.5-1.5b-uncensored`,
   `llama-3.2-3b-abliterated`, `gemma-4-12b-abliterated`, `huihui-qwen3-8b-abliterated` now point at real uncensored files; `smolvlm-uncensored`
   has no real counterpart (alias to standard SmolVLM2 2.2B).
6. **Qwen2.5-VL 3B Abliterated** uses the official Qwen2.5-VL 3B projector (its uploader ships none). Probably compatible (abliteration changes
   only language weights) but UNVERIFIED on device.
7. **Separate draft model** (non-MTP) speculative decoding: llama.rn 0.12.9 types list only `draft-mtp`; whether `model_draft` with a plain
   small model works must be proven on the phone (W2).
8. After an app restart, Resume of a paused install uses default options (projector included) even if it was started with `vision: false`
   (options persist only for running/queued installs). Ponytail ceiling; persist per-model options if it matters.
9. KV bytes for sliding-window models (Gemma 2/3/4) count every layer in full: RAM estimates are conservative (Gemma 4 12B rates too heavy on 12 GB).

## 6. Parity: old card -> v2 entry

| Old id (94b571d) | Old name / file problem | v2 |
|---|---|---|
| gemma-4-12b | "Gemma 2 (9B)", claimed Image/Voice | real Gemma 4 12B + projector + MTP; Gemma 2 9B is `gemma-2-9b` (text) |
| gemma-4-12b-abliterated | plain Gemma 2 9B Q4_K_S | Huihui Gemma 4 12B abliterated + projector |
| minicpm-v-2.6-8b | was Qwen2.5-VL 7B abliterated | real MiniCPM-V 2.6 + projector; Qwen2.5-VL 7B is `qwen2.5-vl-7b` |
| qwen2.5-vl-7b-abliterated | no projector | + projector |
| qwen3-8b | was Qwen2.5 7B | Qwen3 8B; Qwen2.5 7B is `qwen2.5-7b` |
| huihui-qwen3-8b-abliterated | was Qwen2.5 7B Q4_0 | Huihui Qwen3 8B abliterated v2; "Compact" Q4_0 is `qwen2.5-7b-q4_0` |
| gemma-4-e4b | was Gemma 2 2B with Image/Voice | Gemma 4 E4B + vision/audio projector + MTP; Gemma 2 2B is `gemma-2-2b` |
| qwen3.5-4b | was Qwen2.5 3B | Qwen3.5 4B (default) + projector; Qwen2.5 3B is `qwen2.5-3b` |
| phi-4-mini-3.8b | was Llama 3.2 3B | Phi-4 mini; Llama 3.2 3B is `llama-3.2-3b` |
| llama-3.2-3b-abliterated | plain Llama 3.2 3B Q4_0 | real abliterated build |
| qwen2.5-vl-3b / -abliterated | both the abliterated file, no projector | standard and abliterated, each with a projector |
| gemma-4-e2b | was Gemma 2 2B | Gemma 4 E2B + vision/audio projector + MTP |
| smollm3-1.7b | SmolLM2 1.7B | alias -> `smollm2-1.7b` |
| smollm3-1.7b-uncensored | standard DeepSeek R1 1.5B | alias -> `deepseek-r1-1.5b-abliterated`; standard is `deepseek-r1-1.5b` |
| qwen2.5-1.5b-uncensored | plain Q4_0 | real abliterated build |
| moondream2 | was SmolLM2 360M | real Moondream 2 (F16) + projector; SmolLM2 360M is `smollm2-360m` |
| smolvlm-uncensored | standard SmolVLM, no projector | alias -> `smolvlm2-2.2b` (+ projector); tiny `smolvlm-500m` added |
| llama-3.1-8b, dolphin-3.0-8b, smollm2-135m-nano, llama-3.2-1b, qwen2.5-1.5b | correct | kept |

New: qwen3.5-0.8b/2b/9b (+projectors), qwen3-4b-instruct-2507, qwen3-vl-2b/4b, qwen2.5-omni-3b, qwen2.5-coder-3b/7b, gemma-3-1b, gemma-3-4b (+projector),
lfm2.5-1.2b, lfm2.5-vl-1.6b, ministral-3-3b, hermes-3-llama-3.2-3b, dolphin-3.0-llama3.2-3b, smollm3-3b, qwen3-1.7b, qwen3-4b, deepseek-r1-7b,
huihui-qwen3.5-9b-abliterated. Re-verify any time: `node scripts/verify-catalog.mjs` (Windows OK; `--write` refills sizes/hashes/KV/context).
