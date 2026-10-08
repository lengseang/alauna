/**
 * Model library: types, grades, old-id aliases, search/filter/sort, speculative-draft pairing.
 * The entries themselves live in catalogData.ts (every file there is verified against the live Hub by
 * `node scripts/verify-catalog.mjs`). Pure TypeScript, no platform imports.
 *
 * Rules for an entry:
 *  - The name, id and file must describe the same model (the old app had "Moondream 2" pointing at SmolLM2 360M).
 *  - A capability tag must be deliverable by THIS app: 'Image' needs an `mmproj` whose header has a vision encoder,
 *    'Voice' needs an `mmproj` with an audio encoder (llama.rn `initMultimodal`), 'Reasoning' needs a thinking mode.
 *    'Video' stays defined for parity with the old app, but no entry carries it: llama.rn takes images and audio, not video.
 *  - `contentPolicy: 'Uncensored'` only for models that really are abliterated / refusal-free upstream.
 *  - The architecture must exist in the llama.cpp bundled with llama.rn 0.12.9 (b10256); the verify script checks it.
 */
import { MODEL_DATA } from './catalogData.ts';
import { defaultContext, estimateRamBytes, fitFor, rateFit, type FitRating } from './fit.ts';

export type ModelGrade = 'S' | 'B' | 'C';

/** Old-app tag set (Text/Image/Voice/Code/Video) + Reasoning. */
export type ModelCapability = 'Text' | 'Image' | 'Voice' | 'Code' | 'Reasoning' | 'Video';

export const ALL_CAPABILITIES: readonly ModelCapability[] = ['Text', 'Image', 'Voice', 'Code', 'Reasoning', 'Video'];

/** What each tag means in this app (for chips, tooltips and empty states). */
export const CAPABILITY_INFO: Record<ModelCapability, { label: string; meaning: string }> = {
  Text: { label: 'Text', meaning: 'Chat in text.' },
  Image: { label: 'Image', meaning: 'Understands photos you attach (needs its image add-on, downloaded with the model).' },
  Voice: { label: 'Voice', meaning: 'Understands recorded speech directly (audio add-on). Every model can also use the app voice input/output.' },
  Code: { label: 'Code', meaning: 'Reasonably good at writing and explaining code.' },
  Reasoning: { label: 'Reasoning', meaning: 'Can think step by step before answering (shown in a collapsible block).' },
  Video: { label: 'Video', meaning: 'No model can watch video on this phone yet: the engine accepts images and audio only. Kept so the filter exists.' },
};

/** Accepts the old/alternative tag names used by UI code ("Vision" = "Image", "Audio" = "Voice"). */
export function normalizeCapability(tag: string): ModelCapability | null {
  const t = tag.trim().toLowerCase();
  if (t === 'vision' || t === 'image' || t === 'images' || t === 'photo') return 'Image';
  if (t === 'audio' || t === 'voice' || t === 'speech') return 'Voice';
  return ALL_CAPABILITIES.find((c) => c.toLowerCase() === t) ?? null;
}

export type ThinkingMode =
  /** The app never asks this model to think (no reasoning phase is used). */
  | 'none'
  /** Reasoning model that always thinks first (e.g. DeepSeek-R1 distills). */
  | 'always'
  /** Hybrid model; thinking can be switched on/off per message. */
  | 'toggle';

/** Plain-language job of the model, shown on its card. */
export type ModelRole =
  | 'Smoke test'
  | 'Fast'
  | 'Balanced (default)'
  | 'No-thinking (safe fallback)'
  | 'Different family'
  | 'Max quality (needs 12 GB+)'
  | 'Tiny'
  | 'Small & quick'
  | 'All-rounder'
  | 'Vision'
  | 'Voice + vision'
  | 'Coding'
  | 'Reasoning'
  | 'Uncensored'
  | 'Heavy (16 GB phones)';

/** Chat template family of the GGUF's own template (informational: llama.rn always renders the file's own template). */
export type ChatTemplate =
  | 'chatml'
  | 'qwen3.5'
  | 'llama3'
  | 'gemma'
  | 'gemma4'
  | 'phi4'
  | 'deepseek-r1'
  | 'mistral'
  | 'lfm2'
  | 'smollm3'
  | 'smolvlm'
  | 'vicuna';

/** One file on the Hub. */
export interface HubFile {
  repo: string;
  /** Path inside the repo (may contain a folder, e.g. `MTP/...`). */
  filename: string;
  /** Exact LFS size in bytes. */
  sizeBytes: number;
  /** LFS sha256 (downloads are verified against it). */
  sha256: string;
}

export interface ModelSpec {
  id: string;
  name: string;
  family: string;
  /** Parameter count in billions (display + RAM heuristics). Total parameters, including embeddings. */
  paramsB: number;
  /** S/B/C by estimated RAM need on a phone (C <= 2.5 GB, B <= 5 GB, S above) - see `gradeFor`. Never hand-typed. */
  grade: ModelGrade;
  role: ModelRole;
  /** Higher = preferred by `recommendModel` when it fits the phone. 0 = never auto-recommended. */
  priority: number;
  /**
   * f16 KV-cache bytes per context token, from the GGUF header (attention layers x KV heads x (key+value length) x 2 B).
   * Hybrid models (Qwen3.5, LFM2, Gemma 4 shared-KV layers) only count the layers that really keep a cache.
   */
  kvBytesPerToken: number;
  repo: string;
  filename: string;
  /** Exact size in bytes of the GGUF file. */
  sizeBytes: number;
  /** LFS sha256 of the GGUF. */
  sha256: string;
  quantization: string;
  capabilities: ModelCapability[];
  thinking: ThinkingMode;
  contentPolicy: 'Standard' | 'Uncensored';
  description: string;
  /** License id from the model card (e.g. `apache-2.0`, `gemma`, `llama3.2`, `qwen-research`). */
  license: string;
  /** Trained context length from the GGUF header (the app uses a smaller context sized to the phone). */
  contextLength: number;
  chatTemplate: ChatTemplate;
  /** Same key = same tokenizer, so one can draft for the other in speculative decoding. */
  draftKey: string;
  /** Vision/audio projector (llama.rn `initMultimodal({ path })`). Installed together with the model by default. */
  mmproj?: HubFile;
  /** Dedicated draft head for speculative decoding (Gemma 4 MTP). Optional download. */
  draft?: HubFile;
  /** Short hashtag that says what makes this model special (e.g. '#NativeMultimodal'). Shown on cards. */
  uniqueTag: string;
  /** One honest sentence: the job this model is best at. */
  bestFor: string;
  /** Date the GGUF repo appeared on the Hub (YYYY-MM-DD), used by "newest" sorting. */
  published: string;
}

/** What catalogData.ts stores (grade is computed). */
export type ModelData = Omit<ModelSpec, 'grade'>;

// -------------------------------------------------------------------- grade

const GB = 1e9;
/** RAM estimate used for the grade: text use at a 4096-token context, the context a 12 GB phone gets. */
export function gradeFor(spec: Pick<ModelSpec, 'sizeBytes' | 'paramsB' | 'kvBytesPerToken'>): ModelGrade {
  const ram = estimateRamBytes(spec, 4096);
  if (ram <= 2.5 * GB) return 'C';
  if (ram <= 5 * GB) return 'B';
  return 'S';
}

export const MODEL_CATALOG: ModelSpec[] = MODEL_DATA.map((d) => ({ ...d, grade: gradeFor(d) }));

// -------------------------------------------------------------------- ids

/**
 * Ids from the old app (git 94b571d) and the v1 rebuild (d919a34) that no longer name an entry. Every other old id is
 * still a catalog id. Saved settings/chats that reference an alias keep working through `getModel`.
 */
export const MODEL_ID_ALIASES: Readonly<Record<string, string>> = {
  /** Old card "SmolLM2 (1.7B)" (no SmolLM3 1.7B exists; the file was SmolLM2 1.7B). */
  'smollm3-1.7b': 'smollm2-1.7b',
  /** Old card "DeepSeek R1 Distill (1.5B)" marked Uncensored: now a real abliterated build. */
  'smollm3-1.7b-uncensored': 'deepseek-r1-1.5b-abliterated',
  /** Old card "SmolVLM Uncensored": no uncensored SmolVLM exists; the file was the standard SmolVLM. */
  'smolvlm-uncensored': 'smolvlm2-2.2b',
  /** v1 id. */
  'phi-4-mini': 'phi-4-mini-3.8b',
};

const BY_ID = new Map(MODEL_CATALOG.map((m) => [m.id, m]));

export function resolveModelId(id: string): string {
  return MODEL_ID_ALIASES[id] ?? id;
}

export function getModel(id: string | null | undefined): ModelSpec | undefined {
  return id ? BY_ID.get(resolveModelId(id)) : undefined;
}

/** Marketing-free one-line summary used in chat headers. */
export function shortName(spec: ModelSpec): string {
  return `${spec.name} · ${spec.quantization}`;
}

export function hasCapability(spec: Pick<ModelSpec, 'capabilities'>, tag: ModelCapability | string): boolean {
  const c = normalizeCapability(tag);
  return c !== null && spec.capabilities.includes(c);
}

/** Bytes on disk for a full install: the model, its image/audio add-on (if `vision`), its draft head (if `draft`). */
export function installSizeBytes(spec: ModelSpec, opts: { vision?: boolean; draft?: boolean } = {}): number {
  const vision = opts.vision ?? true;
  return spec.sizeBytes + (vision && spec.mmproj ? spec.mmproj.sizeBytes : 0) + (opts.draft && spec.draft ? spec.draft.sizeBytes : 0);
}

/** RAM estimate including the projector when images/audio are used (the projector stays in memory while loaded). */
export function estimateModelRam(spec: ModelSpec, nCtx: number, opts: { vision?: boolean } = {}): number {
  return estimateRamBytes(spec, nCtx) + (opts.vision && spec.mmproj ? spec.mmproj.sizeBytes : 0);
}

// -------------------------------------------------------------------- library query

export type LibrarySort = 'recommended' | 'name' | 'size_asc' | 'size_desc' | 'ram_asc' | 'ram_desc' | 'grade' | 'newest';

export interface LibraryQuery {
  /** Case-insensitive; every word must appear in name, family, id, repo, role, description or a tag. */
  search?: string;
  /** Capability tags ("Vision"/"Audio" accepted as aliases). Empty = no capability filter. */
  capabilities?: readonly string[];
  /** 'AND' (all tags) or 'OR' (any tag). Default 'AND'. 'ALL'/'ANY' accepted for the old API. */
  match?: 'AND' | 'OR' | 'ALL' | 'ANY';
  /** Empty or undefined = every grade. */
  grades?: readonly ModelGrade[];
  policy?: 'all' | 'Standard' | 'Uncensored';
  /** Keep only models rated great/ok/tight for `ramBytes`. Ignored when RAM is unknown (nothing can be judged). */
  fitsPhone?: boolean;
  /** Total RAM the OS reports (expo-device `totalMemory`). */
  ramBytes?: number | null;
  /** Context used for RAM estimates (default: sized to the phone). */
  nCtx?: number;
  install?: 'all' | 'installed' | 'available';
  installedIds?: Iterable<string>;
  sort?: LibrarySort;
}

const GRADE_ORDER: Record<ModelGrade, number> = { S: 0, B: 1, C: 2 };
const FIT_ORDER: Record<FitRating, number> = { great: 0, ok: 1, tight: 2, unknown: 3, too_heavy: 4 };

function haystack(m: ModelSpec): string {
  return `${m.name} ${m.family} ${m.id} ${m.repo} ${m.role} ${m.description} ${m.capabilities.join(' ')} ${m.contentPolicy} ${m.quantization}`.toLowerCase();
}

/** Search, multi-filter and sort the library. Pure: the caller passes RAM and the installed ids. */
export function queryLibrary(q: LibraryQuery = {}, catalog: readonly ModelSpec[] = MODEL_CATALOG): ModelSpec[] {
  const words = (q.search ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  const caps = (q.capabilities ?? []).map(normalizeCapability).filter((c): c is ModelCapability => c !== null);
  const any = q.match === 'OR' || q.match === 'ANY';
  const grades = q.grades && q.grades.length > 0 ? new Set(q.grades) : null;
  const installed = new Set(q.installedIds ?? []);
  const ram = q.ramBytes && q.ramBytes > 0 ? q.ramBytes : null;
  const nCtx = q.nCtx ?? defaultContext(ram);
  // Images/audio keep the projector in memory, so judge fit with it when the user filters for them.
  const vision = caps.includes('Image') || caps.includes('Voice');
  const fit = (m: ModelSpec): FitRating => {
    if (!ram) return 'unknown';
    return vision ? rateFit(estimateModelRam(m, nCtx, { vision: true }), ram) : fitFor(m, ram, nCtx);
  };

  const out = catalog.filter((m) => {
    if (words.length > 0) {
      const h = haystack(m);
      if (!words.every((w) => h.includes(w))) return false;
    }
    if (caps.length > 0) {
      const ok = any ? caps.some((c) => m.capabilities.includes(c)) : caps.every((c) => m.capabilities.includes(c));
      if (!ok) return false;
    }
    if (grades && !grades.has(m.grade)) return false;
    if (q.policy && q.policy !== 'all' && m.contentPolicy !== q.policy) return false;
    if (q.install === 'installed' && !installed.has(m.id)) return false;
    if (q.install === 'available' && installed.has(m.id)) return false;
    if (q.fitsPhone && ram) {
      const r = fit(m);
      if (r === 'too_heavy') return false;
    }
    return true;
  });

  const ramOf = (m: ModelSpec) => estimateModelRam(m, nCtx, { vision });
  const sort = q.sort ?? 'recommended';
  return out.sort((a, b) => {
    switch (sort) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'size_asc':
        return installSizeBytes(a) - installSizeBytes(b);
      case 'size_desc':
        return installSizeBytes(b) - installSizeBytes(a);
      case 'ram_asc':
        return ramOf(a) - ramOf(b);
      case 'ram_desc':
        return ramOf(b) - ramOf(a);
      case 'grade':
        return GRADE_ORDER[a.grade] - GRADE_ORDER[b.grade] || b.paramsB - a.paramsB;
      case 'newest':
        return b.published.localeCompare(a.published) || a.name.localeCompare(b.name);
      case 'recommended':
        return FIT_ORDER[fit(a)] - FIT_ORDER[fit(b)] || b.priority - a.priority || a.sizeBytes - b.sizeBytes;
    }
  });
}

/** Facet counts for filter chips (how many entries carry each tag / grade / policy). */
export function libraryFacets(catalog: readonly ModelSpec[] = MODEL_CATALOG): {
  capabilities: Record<ModelCapability, number>;
  grades: Record<ModelGrade, number>;
  policy: Record<'Standard' | 'Uncensored', number>;
} {
  const capabilities = Object.fromEntries(ALL_CAPABILITIES.map((c) => [c, 0])) as Record<ModelCapability, number>;
  const grades: Record<ModelGrade, number> = { S: 0, B: 0, C: 0 };
  const policy = { Standard: 0, Uncensored: 0 };
  for (const m of catalog) {
    for (const c of m.capabilities) capabilities[c]++;
    grades[m.grade]++;
    policy[m.contentPolicy]++;
  }
  return { capabilities, grades, policy };
}

// -------------------------------------------------------------------- legacy query (v1 API, kept for the current UI)

export interface CatalogQuery {
  search?: string;
  grade?: ModelGrade | 'ALL';
  capabilities?: ModelCapability[];
  /** 'ALL' = must have every selected capability, 'ANY' = at least one. */
  match?: 'ALL' | 'ANY';
  onlyUncensored?: boolean;
  sort?: 'ram_asc' | 'ram_desc' | 'size_asc' | 'size_desc' | 'name_asc';
}

/** v1 API: same semantics as before (default ANY, default size ascending by model file), implemented with `queryLibrary`. */
export function queryCatalog(query: CatalogQuery = {}, catalog: ModelSpec[] = MODEL_CATALOG): ModelSpec[] {
  const out = queryLibrary(
    {
      search: query.search,
      capabilities: query.capabilities,
      match: query.match ?? 'ANY',
      grades: query.grade && query.grade !== 'ALL' ? [query.grade] : undefined,
      policy: query.onlyUncensored ? 'Uncensored' : 'all',
      sort: 'name',
    },
    catalog,
  );
  const sort = query.sort ?? 'size_asc';
  if (sort === 'name_asc') return out;
  const desc = sort === 'size_desc' || sort === 'ram_desc';
  return out.sort((a, b) => (desc ? b.sizeBytes - a.sizeBytes : a.sizeBytes - b.sizeBytes));
}

// -------------------------------------------------------------------- speculative decoding

export type DraftOption =
  /** The target's own MTP draft head (Gemma 4): best acceptance, tiny download. */
  | { kind: 'mtp'; file: HubFile }
  /** A smaller library model with the same tokenizer. */
  | { kind: 'model'; spec: ModelSpec };

/**
 * Draft candidates for speculative decoding with `target`: its own MTP head first, then library models with the same
 * tokenizer (`draftKey`) that are at most half its size (loaded text-only). Same content policy first, then smallest.
 * `installedIds` (optional) keeps only drafts already on the phone.
 */
export function draftOptions(target: ModelSpec, catalog: readonly ModelSpec[] = MODEL_CATALOG, installedIds?: Iterable<string>): DraftOption[] {
  const installed = installedIds ? new Set(installedIds) : null;
  const models = catalog
    .filter(
      (m) =>
        m.id !== target.id &&
        m.draftKey === target.draftKey &&
        m.paramsB <= target.paramsB * 0.5 &&
        m.sizeBytes < target.sizeBytes &&
        (!installed || installed.has(m.id)),
    )
    // The target decides every token, so a draft's content policy never changes the output; same policy first anyway.
    .sort((a, b) => Number(a.contentPolicy !== target.contentPolicy) - Number(b.contentPolicy !== target.contentPolicy) || a.sizeBytes - b.sizeBytes)
    .map((spec): DraftOption => ({ kind: 'model', spec }));
  return target.draft ? [{ kind: 'mtp', file: target.draft }, ...models] : models;
}

/** Library models that `draft` can speed up (inverse of `draftOptions`). */
export function draftTargets(draft: ModelSpec, catalog: readonly ModelSpec[] = MODEL_CATALOG): ModelSpec[] {
  return catalog.filter((t) => draftOptions(t, [draft, t]).some((o) => o.kind === 'model' && o.spec.id === draft.id));
}
