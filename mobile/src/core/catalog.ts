/**
 * Model catalog. Every entry was checked against the Hugging Face API
 * (file exists, ungated, exact byte size, LFS sha256). Re-run
 * `node scripts/verify-catalog.mjs` to re-check against the live Hub.
 *
 * Rules for adding a model (see docs/QA_PLAN.md):
 *  - The `id` must describe the file (no id/name mismatches, no duplicate files).
 *  - Only claim a capability the app can actually deliver. The app currently
 *    does text chat only, so there is no Vision/Voice badge.
 *  - `contentPolicy: 'Uncensored'` only for models that really are
 *    uncensored/abliterated upstream.
 */

export type ModelGrade = 'S' | 'B' | 'C';
export type ModelCapability = 'Text' | 'Code' | 'Reasoning';
export type ThinkingMode =
  /** Model has no reasoning phase. */
  | 'none'
  /** Reasoning model that always thinks first (e.g. DeepSeek-R1 distills). */
  | 'always'
  /** Hybrid model; thinking can be switched on/off per message. */
  | 'toggle';

export interface ModelSpec {
  id: string;
  name: string;
  family: string;
  /** Parameter count in billions (display + RAM heuristics). */
  paramsB: number;
  grade: ModelGrade;
  repo: string;
  filename: string;
  /** Exact size in bytes of the GGUF file. */
  sizeBytes: number;
  /** LFS sha256 of the GGUF (used for the optional deep check). */
  sha256: string;
  quantization: string;
  capabilities: ModelCapability[];
  thinking: ThinkingMode;
  contentPolicy: 'Standard' | 'Uncensored';
  description: string;
}

export const MODEL_CATALOG: ModelSpec[] = [
  // ------------------------------------------------------------------ Grade C (<= 2B)
  {
    id: 'smollm2-360m',
    name: 'SmolLM2 360M',
    family: 'SmolLM2',
    paramsB: 0.36,
    grade: 'C',
    repo: 'bartowski/SmolLM2-360M-Instruct-GGUF',
    filename: 'SmolLM2-360M-Instruct-Q4_K_M.gguf',
    sizeBytes: 270_590_880,
    sha256: '2fa3f013dcdd7b99f9b237717fa0b12d75bbb89984cc1274be1471a465bac9c2',
    quantization: 'Q4_K_M',
    capabilities: ['Text'],
    thinking: 'none',
    contentPolicy: 'Standard',
    description: 'Tiny test model. Downloads in seconds - use it to confirm the whole pipeline works. Basic answers only.',
  },
  {
    id: 'llama-3.2-1b',
    name: 'Llama 3.2 1B',
    family: 'Llama',
    paramsB: 1.24,
    grade: 'C',
    repo: 'bartowski/Llama-3.2-1B-Instruct-GGUF',
    filename: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    sizeBytes: 807_694_464,
    sha256: '6f85a640a97cf2bf5b8e764087b1e83da0fdb51d7c9fab7d0fece9385611df83',
    quantization: 'Q4_K_M',
    capabilities: ['Text'],
    thinking: 'none',
    contentPolicy: 'Standard',
    description: 'Fast, light all-rounder. Runs well on almost any phone.',
  },
  {
    id: 'qwen2.5-1.5b',
    name: 'Qwen2.5 1.5B',
    family: 'Qwen',
    paramsB: 1.54,
    grade: 'C',
    repo: 'bartowski/Qwen2.5-1.5B-Instruct-GGUF',
    filename: 'Qwen2.5-1.5B-Instruct-Q4_K_M.gguf',
    sizeBytes: 986_048_768,
    sha256: '1adf0b11065d8ad2e8123ea110d1ec956dab4ab038eab665614adba04b6c3370',
    quantization: 'Q4_K_M',
    capabilities: ['Text', 'Code'],
    thinking: 'none',
    contentPolicy: 'Standard',
    description: 'Compact, multilingual, decent at simple code.',
  },
  {
    id: 'smollm2-1.7b',
    name: 'SmolLM2 1.7B',
    family: 'SmolLM2',
    paramsB: 1.71,
    grade: 'C',
    repo: 'HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF',
    filename: 'smollm2-1.7b-instruct-q4_k_m.gguf',
    sizeBytes: 1_055_609_536,
    sha256: 'decd2598bc2c8ed08c19adc3c8fdd461ee19ed5708679d1c54ef54a5a30d4f33',
    quantization: 'Q4_K_M',
    capabilities: ['Text'],
    thinking: 'none',
    contentPolicy: 'Standard',
    description: 'Hugging Face small model with natural dialogue.',
  },
  {
    id: 'qwen3-1.7b',
    name: 'Qwen3 1.7B',
    family: 'Qwen',
    paramsB: 1.72,
    grade: 'C',
    repo: 'unsloth/Qwen3-1.7B-GGUF',
    filename: 'Qwen3-1.7B-Q4_K_M.gguf',
    sizeBytes: 1_107_409_472,
    sha256: 'b139949c5bd74937ad8ed8c8cf3d9ffb1e99c866c823204dc42c0d91fa181897',
    quantization: 'Q4_K_M',
    capabilities: ['Text', 'Code', 'Reasoning'],
    thinking: 'toggle',
    contentPolicy: 'Standard',
    description: 'Small hybrid reasoning model: can think step by step, or answer directly.',
  },
  {
    id: 'deepseek-r1-1.5b',
    name: 'DeepSeek-R1 Distill 1.5B',
    family: 'DeepSeek',
    paramsB: 1.78,
    grade: 'C',
    repo: 'bartowski/DeepSeek-R1-Distill-Qwen-1.5B-GGUF',
    filename: 'DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M.gguf',
    sizeBytes: 1_117_320_800,
    sha256: '1741e5b2d062b07acf048bf0d2c514dadf2a48f94e2b4aa0cfe069af3838ee2f',
    quantization: 'Q4_K_M',
    capabilities: ['Text', 'Code', 'Reasoning'],
    thinking: 'always',
    contentPolicy: 'Standard',
    description: 'Always reasons before answering. You will see its thinking in the process panel.',
  },
  {
    id: 'qwen3.5-2b',
    name: 'Qwen3.5 2B',
    family: 'Qwen',
    paramsB: 2.0,
    grade: 'C',
    repo: 'unsloth/Qwen3.5-2B-GGUF',
    filename: 'Qwen3.5-2B-Q4_K_M.gguf',
    sizeBytes: 1_280_835_840,
    sha256: 'aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223',
    quantization: 'Q4_K_M',
    capabilities: ['Text', 'Code', 'Reasoning'],
    thinking: 'toggle',
    contentPolicy: 'Standard',
    description: 'Newest-generation small Qwen. Best quality under 2B.',
  },

  // ------------------------------------------------------------------ Grade B (2B - 4B)
  {
    id: 'gemma-2-2b',
    name: 'Gemma 2 2B',
    family: 'Gemma',
    paramsB: 2.6,
    grade: 'B',
    repo: 'bartowski/gemma-2-2b-it-GGUF',
    filename: 'gemma-2-2b-it-Q4_K_M.gguf',
    sizeBytes: 1_708_582_752,
    sha256: 'e0aee85060f168f0f2d8473d7ea41ce2f3230c1bc1374847505ea599288a7787',
    quantization: 'Q4_K_M',
    capabilities: ['Text'],
    thinking: 'none',
    contentPolicy: 'Standard',
    description: 'Google small model. Polite, concise answers.',
  },
  {
    id: 'llama-3.2-3b',
    name: 'Llama 3.2 3B',
    family: 'Llama',
    paramsB: 3.21,
    grade: 'B',
    repo: 'bartowski/Llama-3.2-3B-Instruct-GGUF',
    filename: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    sizeBytes: 2_019_377_696,
    sha256: '6c1a2b41161032677be168d354123594c0e6e67d2b9227c84f296ad037c728ff',
    quantization: 'Q4_K_M',
    capabilities: ['Text', 'Code'],
    thinking: 'none',
    contentPolicy: 'Standard',
    description: 'Strong instruction following for its size. Good daily driver.',
  },
  {
    id: 'smollm3-3b',
    name: 'SmolLM3 3B',
    family: 'SmolLM',
    paramsB: 3.08,
    grade: 'B',
    repo: 'bartowski/HuggingFaceTB_SmolLM3-3B-GGUF',
    filename: 'HuggingFaceTB_SmolLM3-3B-Q4_K_M.gguf',
    sizeBytes: 1_915_305_792,
    sha256: '519732558d5fa7420ab058e1b776dcfe73da78013c2fe59c7ca43c325ef89132',
    quantization: 'Q4_K_M',
    capabilities: ['Text', 'Code', 'Reasoning'],
    thinking: 'toggle',
    contentPolicy: 'Standard',
    description: 'Hugging Face 3B with optional reasoning mode.',
  },
  {
    id: 'qwen3-4b',
    name: 'Qwen3 4B',
    family: 'Qwen',
    paramsB: 4.02,
    grade: 'B',
    repo: 'Qwen/Qwen3-4B-GGUF',
    filename: 'Qwen3-4B-Q4_K_M.gguf',
    sizeBytes: 2_497_280_256,
    sha256: '7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5',
    quantization: 'Q4_K_M',
    capabilities: ['Text', 'Code', 'Reasoning'],
    thinking: 'toggle',
    contentPolicy: 'Standard',
    description: 'Official Qwen. Excellent reasoning and code for 4B; the sweet spot for most phones.',
  },
  {
    id: 'qwen3.5-4b',
    name: 'Qwen3.5 4B',
    family: 'Qwen',
    paramsB: 4.0,
    grade: 'B',
    repo: 'unsloth/Qwen3.5-4B-GGUF',
    filename: 'Qwen3.5-4B-Q4_K_M.gguf',
    sizeBytes: 2_740_937_888,
    sha256: '00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4',
    quantization: 'Q4_K_M',
    capabilities: ['Text', 'Code', 'Reasoning'],
    thinking: 'toggle',
    contentPolicy: 'Standard',
    description: 'Newest-generation Qwen at 4B.',
  },
  {
    id: 'gemma-3-4b',
    name: 'Gemma 3 4B',
    family: 'Gemma',
    paramsB: 4.3,
    grade: 'B',
    repo: 'unsloth/gemma-3-4b-it-GGUF',
    filename: 'gemma-3-4b-it-Q4_K_M.gguf',
    sizeBytes: 2_489_894_016,
    sha256: '04a43a22e8d2003deda5acc262f68ec1005fa76c735a9962a8c77042a74a7d19',
    quantization: 'Q4_K_M',
    capabilities: ['Text'],
    thinking: 'none',
    contentPolicy: 'Standard',
    description: 'Google 4B with very natural writing. (Text only in this app.)',
  },
  {
    id: 'phi-4-mini',
    name: 'Phi-4 Mini 3.8B',
    family: 'Phi',
    paramsB: 3.84,
    grade: 'B',
    repo: 'unsloth/Phi-4-mini-instruct-GGUF',
    filename: 'Phi-4-mini-instruct-Q4_K_M.gguf',
    sizeBytes: 2_491_874_272,
    sha256: '88c00229914083cd112853aab84ed51b87bdf6b9ce42f532d8c85c7c63b1730a',
    quantization: 'Q4_K_M',
    capabilities: ['Text', 'Code'],
    thinking: 'none',
    contentPolicy: 'Standard',
    description: 'Microsoft small model, strong at logic and maths.',
  },

  // ------------------------------------------------------------------ Grade S (7B+)
  {
    id: 'llama-3.1-8b',
    name: 'Llama 3.1 8B',
    family: 'Llama',
    paramsB: 8.03,
    grade: 'S',
    repo: 'bartowski/Meta-Llama-3.1-8B-Instruct-GGUF',
    filename: 'Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf',
    sizeBytes: 4_920_739_232,
    sha256: '7b064f5842bf9532c91456deda288a1b672397a54fa729aa665952863033557c',
    quantization: 'Q4_K_M',
    capabilities: ['Text', 'Code'],
    thinking: 'none',
    contentPolicy: 'Standard',
    description: 'The reliable all-rounder. Needs a flagship phone (8 GB+ free-ish RAM).',
  },
  {
    id: 'qwen3-8b',
    name: 'Qwen3 8B',
    family: 'Qwen',
    paramsB: 8.19,
    grade: 'S',
    repo: 'Qwen/Qwen3-8B-GGUF',
    filename: 'Qwen3-8B-Q4_K_M.gguf',
    sizeBytes: 5_027_783_488,
    sha256: 'd98cdcbd03e17ce47681435b5150e34c1417f50b5c0019dd560e4882c5745785',
    quantization: 'Q4_K_M',
    capabilities: ['Text', 'Code', 'Reasoning'],
    thinking: 'toggle',
    contentPolicy: 'Standard',
    description: 'Official Qwen 8B with optional deep reasoning.',
  },
  {
    id: 'deepseek-r1-7b',
    name: 'DeepSeek-R1 Distill 7B',
    family: 'DeepSeek',
    paramsB: 7.62,
    grade: 'S',
    repo: 'bartowski/DeepSeek-R1-Distill-Qwen-7B-GGUF',
    filename: 'DeepSeek-R1-Distill-Qwen-7B-Q4_K_M.gguf',
    sizeBytes: 4_683_073_504,
    sha256: '731ece8d06dc7eda6f6572997feb9ee1258db0784827e642909d9b565641937b',
    quantization: 'Q4_K_M',
    capabilities: ['Text', 'Code', 'Reasoning'],
    thinking: 'always',
    contentPolicy: 'Standard',
    description: 'Always reasons before answering - strongest step-by-step logic here. Slow on phones.',
  },
  {
    id: 'qwen3.5-9b',
    name: 'Qwen3.5 9B',
    family: 'Qwen',
    paramsB: 9.0,
    grade: 'S',
    repo: 'unsloth/Qwen3.5-9B-GGUF',
    filename: 'Qwen3.5-9B-Q4_K_M.gguf',
    sizeBytes: 5_680_522_464,
    sha256: '03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8',
    quantization: 'Q4_K_M',
    capabilities: ['Text', 'Code', 'Reasoning'],
    thinking: 'toggle',
    contentPolicy: 'Standard',
    description: 'Highest-quality Qwen that fits a 12 GB phone.',
  },
  {
    id: 'gemma-4-12b',
    name: 'Gemma 4 12B',
    family: 'Gemma',
    paramsB: 12,
    grade: 'S',
    repo: 'unsloth/gemma-4-12b-it-GGUF',
    filename: 'gemma-4-12b-it-Q4_K_M.gguf',
    sizeBytes: 7_121_861_440,
    sha256: '0a270ec9fe6b34f4a0d33992b6135117b484ebc4766ab76b51d4ae8c457e4c42',
    quantization: 'Q4_K_M',
    capabilities: ['Text', 'Code'],
    thinking: 'none',
    contentPolicy: 'Standard',
    description: 'Largest model offered. Only for phones with 16 GB RAM. (Text only in this app.)',
  },
  {
    id: 'dolphin-3.0-8b',
    name: 'Dolphin 3.0 8B',
    family: 'Dolphin',
    paramsB: 8.03,
    grade: 'S',
    repo: 'dphn/Dolphin3.0-Llama3.1-8B-GGUF',
    filename: 'Dolphin3.0-Llama3.1-8B-Q4_K_M.gguf',
    sizeBytes: 4_920_745_856,
    sha256: '4c001f29d4edbd9327a6df8e16e2b7907a64e0e31b0a7abe9c779a96773f304e',
    quantization: 'Q4_K_M',
    capabilities: ['Text', 'Code'],
    thinking: 'none',
    contentPolicy: 'Uncensored',
    description: 'Llama 3.1 fine-tuned to follow instructions without refusals.',
  },
  {
    id: 'huihui-qwen3.5-9b-abliterated',
    name: 'Huihui Qwen3.5 9B Abliterated',
    family: 'Qwen',
    paramsB: 9.0,
    grade: 'S',
    repo: 'mradermacher/Huihui-Qwen3.5-9B-abliterated-GGUF',
    filename: 'Huihui-Qwen3.5-9B-abliterated.Q4_K_M.gguf',
    sizeBytes: 5_627_045_248,
    sha256: 'ea1858ef4dc4b648b8dbb44612962a0333e945060dd0545ac0f28d7c4416e4b3',
    quantization: 'Q4_K_M',
    capabilities: ['Text', 'Code', 'Reasoning'],
    thinking: 'toggle',
    contentPolicy: 'Uncensored',
    description: 'Qwen3.5 9B with refusal behaviour removed (abliterated).',
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
    if (q && !`${m.name} ${m.repo} ${m.family} ${m.description}`.toLowerCase().includes(q)) return false;
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
