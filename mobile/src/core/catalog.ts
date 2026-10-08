/**
 * Model catalog. SHORT on purpose (6 entries): every entry was checked against the live
 * Hugging Face Hub on 2026-10-08 (repo ungated, Apache-2.0, file exists, exact LFS byte size, LFS sha256,
 * HTTP Range request answers 206 and the first 4 bytes are "GGUF"). Re-run
 * `node scripts/verify-catalog.mjs` to re-check against the live Hub (it also fails on drift).
 *
 * Rules for adding a model (see docs/QA_PLAN.md):
 *  - The `id` must describe the file (no id/name mismatches, no duplicate files).
 *  - Only claim a capability the app can actually deliver. The app does text chat only,
 *    so there is no Vision/Voice badge.
 *  - The architecture must exist in the llama.cpp bundled with the pinned llama.rn
 *    (0.12.9 = llama.cpp b10256: `qwen3`, `qwen35`, `gemma4` are present; checked in
 *    node_modules/llama.rn/cpp/llama-arch.cpp).
 *  - Never hand-type sizes/hashes: `node scripts/verify-catalog.mjs --write`.
 */

export type ModelGrade = 'S' | 'B' | 'C';
export type ModelCapability = 'Text' | 'Code' | 'Reasoning';
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
  | 'Max quality (needs 12 GB+)';

export interface ModelSpec {
  id: string;
  name: string;
  family: string;
  /** Parameter count in billions (display + RAM heuristics). Total parameters, including embeddings. */
  paramsB: number;
  grade: ModelGrade;
  role: ModelRole;
  /** Higher = preferred by `recommendModel` when it fits the phone. */
  priority: number;
  /**
   * f16 KV-cache bytes per context token, read from the GGUF header (attention layers x KV heads x (key+value length) x 2 B).
   * Hybrid Qwen3.5 only has attention in every 4th layer, so its cache is 4-12x smaller than a dense model of the same size.
   */
  kvBytesPerToken: number;
  repo: string;
  filename: string;
  /** Exact size in bytes of the GGUF file. */
  sizeBytes: number;
  /** LFS sha256 of the GGUF (used for the deep check). */
  sha256: string;
  quantization: string;
  capabilities: ModelCapability[];
  thinking: ThinkingMode;
  contentPolicy: 'Standard' | 'Uncensored';
  description: string;
}

export const MODEL_CATALOG: ModelSpec[] = [
  {
    id: 'qwen3.5-0.8b',
    name: 'Qwen3.5 0.8B',
    family: 'Qwen',
    paramsB: 0.8,
    grade: 'C',
    role: 'Smoke test',
    priority: 40,
    kvBytesPerToken: 12288, // 6 attention layers x 2 KV heads x 256 x 2 x 2 B
    repo: 'unsloth/Qwen3.5-0.8B-GGUF',
    filename: 'Qwen3.5-0.8B-Q4_K_M.gguf',
    sizeBytes: 532_517_120,
    sha256: 'bd258782e35f7f458f8aced1adc053e6e92e89bc735ba3be89d38a06121dc517',
    quantization: 'Q4_K_M',
    capabilities: ['Text'],
    thinking: 'none',
    contentPolicy: 'Standard',
    description: 'Tiny test model (0.5 GB). Download this first to confirm the whole pipeline works. Short, simple answers.',
  },
  {
    id: 'qwen3.5-2b',
    name: 'Qwen3.5 2B',
    family: 'Qwen',
    paramsB: 2.0,
    grade: 'C',
    role: 'Fast',
    priority: 80,
    kvBytesPerToken: 12288, // 6 attention layers x 2 KV heads x 256 x 2 x 2 B
    repo: 'unsloth/Qwen3.5-2B-GGUF',
    filename: 'Qwen3.5-2B-Q4_K_M.gguf',
    sizeBytes: 1_280_835_840,
    sha256: 'aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223',
    quantization: 'Q4_K_M',
    capabilities: ['Text', 'Code', 'Reasoning'],
    thinking: 'toggle',
    contentPolicy: 'Standard',
    description: 'Quick replies on any recent phone. Can think step by step, or answer directly.',
  },
  {
    id: 'qwen3.5-4b',
    name: 'Qwen3.5 4B',
    family: 'Qwen',
    paramsB: 4.0,
    grade: 'B',
    role: 'Balanced (default)',
    priority: 100,
    kvBytesPerToken: 32768, // 8 attention layers x 4 KV heads x 256 x 2 x 2 B
    repo: 'unsloth/Qwen3.5-4B-GGUF',
    filename: 'Qwen3.5-4B-Q4_K_M.gguf',
    sizeBytes: 2_740_937_888,
    sha256: '00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4',
    quantization: 'Q4_K_M',
    capabilities: ['Text', 'Code', 'Reasoning'],
    thinking: 'toggle',
    contentPolicy: 'Standard',
    description: 'The recommended model: good quality and still quick on a 12 GB phone. Can think step by step, or answer directly.',
  },
  {
    id: 'qwen3-4b-instruct-2507',
    name: 'Qwen3 4B Instruct',
    family: 'Qwen',
    paramsB: 4.02,
    grade: 'B',
    role: 'No-thinking (safe fallback)',
    priority: 70,
    kvBytesPerToken: 147456, // 36 layers x 8 KV heads x 128 x 2 x 2 B
    repo: 'unsloth/Qwen3-4B-Instruct-2507-GGUF',
    filename: 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf',
    sizeBytes: 2_497_281_120,
    sha256: '3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597',
    quantization: 'Q4_K_M',
    capabilities: ['Text', 'Code'],
    thinking: 'none',
    contentPolicy: 'Standard',
    description: 'Older, very well-tested Qwen design that always answers directly. Pick this if the default model misbehaves.',
  },
  {
    id: 'gemma-4-e2b',
    name: 'Gemma 4 E2B',
    family: 'Gemma',
    paramsB: 4.65,
    grade: 'B',
    role: 'Different family',
    priority: 60,
    kvBytesPerToken: 40000, // rounded up: 1 KV head, 512-wide global layers + sliding-window layers
    repo: 'unsloth/gemma-4-E2B-it-GGUF',
    filename: 'gemma-4-E2B-it-Q4_K_M.gguf',
    sizeBytes: 3_106_738_272,
    sha256: '740185b21d22ceb83a11c3aa62ad5842ef32c70f6096d756bbee85a1e4ec34b8',
    quantization: 'Q4_K_M',
    capabilities: ['Text', 'Code'],
    thinking: 'none',
    contentPolicy: 'Standard',
    description: 'Google model with a different writing style. Only about 2 billion parameters are active per word, so it is quick. Text only in this app.',
  },
  {
    id: 'qwen3.5-9b',
    name: 'Qwen3.5 9B',
    family: 'Qwen',
    paramsB: 9.0,
    grade: 'S',
    role: 'Max quality (needs 12 GB+)',
    priority: 30,
    kvBytesPerToken: 32768, // 8 attention layers x 4 KV heads x 256 x 2 x 2 B
    repo: 'unsloth/Qwen3.5-9B-GGUF',
    filename: 'Qwen3.5-9B-Q4_K_M.gguf',
    sizeBytes: 5_680_522_464,
    sha256: '03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8',
    quantization: 'Q4_K_M',
    capabilities: ['Text', 'Code', 'Reasoning'],
    thinking: 'toggle',
    contentPolicy: 'Standard',
    description: 'Best answers, but big (5.7 GB) and slower. Close other apps first. Fits a 12 GB phone with a small context only.',
  },
];

const BY_ID = new Map(MODEL_CATALOG.map((m) => [m.id, m]));

export function getModel(id: string | null | undefined): ModelSpec | undefined {
  return id ? BY_ID.get(id) : undefined;
}

/** Marketing-free one-line summary used in chat headers. */
export function shortName(spec: ModelSpec): string {
  return `${spec.name} · ${spec.quantization}`;
}

export interface CatalogQuery {
  search?: string;
  grade?: ModelGrade | 'ALL';
  capabilities?: ModelCapability[];
  /** 'ALL' = must have every selected capability, 'ANY' = at least one. */
  match?: 'ALL' | 'ANY';
  onlyUncensored?: boolean;
  sort?: 'ram_asc' | 'ram_desc' | 'size_asc' | 'size_desc' | 'name_asc';
}

export function queryCatalog(query: CatalogQuery = {}, catalog: ModelSpec[] = MODEL_CATALOG): ModelSpec[] {
  const q = (query.search ?? '').trim().toLowerCase();
  const caps = query.capabilities ?? [];
  const out = catalog.filter((m) => {
    if (q && !`${m.name} ${m.repo} ${m.family} ${m.role} ${m.description}`.toLowerCase().includes(q)) return false;
    if (query.grade && query.grade !== 'ALL' && m.grade !== query.grade) return false;
    if (query.onlyUncensored && m.contentPolicy !== 'Uncensored') return false;
    if (caps.length > 0) {
      const ok =
        (query.match ?? 'ANY') === 'ALL'
          ? caps.every((c) => m.capabilities.includes(c))
          : caps.some((c) => m.capabilities.includes(c));
      if (!ok) return false;
    }
    return true;
  });
  const sort = query.sort ?? 'size_asc';
  return out.sort((a, b) => {
    switch (sort) {
      case 'ram_asc':
      case 'size_asc':
        return a.sizeBytes - b.sizeBytes;
      case 'ram_desc':
      case 'size_desc':
        return b.sizeBytes - a.sizeBytes;
      case 'name_asc':
        return a.name.localeCompare(b.name);
    }
  });
}
