/**
 * Settings shape v2 + validation + v1 migration (pure; persistence is in services/settings.ts).
 *
 * Every field is read by real code (docs/api/engine.md lists the reader of each one). Rules:
 *  - `sanitizeSettings(raw)` accepts anything (v1 file, v2 file, hand edits, garbage) and returns a valid object.
 *    Each field is validated and clamped on its own: one bad value never resets the others.
 *  - `compute` is the source of truth for threads / GPU / context size. The v1 top-level fields `threads`, `useGpu`
 *    and `contextOverride` are kept as read-only MIRRORS so older UI keeps working; writing them through
 *    `applySettingsPatch` updates `compute`.
 */
import { ARCHETYPES, clampPad, type PADVector, type SoulArchetypeKey } from './persona.ts';
import { DEFAULT_SECURITY_PREFS, sanitizeSecurityPrefs, type SecurityPrefs } from './appLock.ts';
import { DEFAULT_VOICE_PREFS, sanitizeVoicePrefs, type VoicePrefs } from './voiceModels.ts';
import { DEFAULT_MODEL_FREEDOM, sanitizeModelFreedom, type ModelFreedomSettings } from './modelFreedom.ts';

export type { SecurityPrefs } from './appLock.ts';
export type { VoicePrefs } from './voiceModels.ts';
export type { ModelFreedomSettings } from './modelFreedom.ts';

export const SETTINGS_VERSION = 3;

export interface VerifiedInfo {
  at: number;
  tokensPerSecond: number;
  loadMs: number;
  /** Last measured chat speed WITHOUT speculative decoding (tok/s). Baseline for the speed-up number. */
  chatTokPerSec?: number;
  /** Last measured chat speed WITH speculative decoding active (tok/s). */
  specTokPerSec?: number;
}

export type ComputeBackend = 'cpu' | 'gpu';
export type FlashAttnMode = 'auto' | 'on' | 'off';
/** KV cache element types llama.rn 0.12.9 accepts (index.ts `validCacheTypes`). */
export const KV_CACHE_TYPES = ['f16', 'f32', 'q8_0', 'q4_0', 'q4_1', 'iq4_nl', 'q5_0', 'q5_1'] as const;
export type KvCacheType = (typeof KV_CACHE_TYPES)[number];

export interface ComputeSettings {
  /** 'gpu' is experimental (OpenCL on Adreno); a failed GPU load falls back to CPU automatically and says why. */
  backend: ComputeBackend;
  /** Layers offloaded when backend = 'gpu' (0..999, 99 = all). */
  nGpuLayers: number;
  /** null = engine default (pins the fast cores). 1..16. */
  threads: number | null;
  /** null = automatic by RAM (core/fit.ts defaultContext). 512..MAX_CONTEXT. */
  nCtx: number | null;
  /** Prompt batch size (n_batch = n_ubatch). 32..2048. */
  nBatch: number;
  flashAttn: FlashAttnMode;
  cacheTypeK: KvCacheType;
  cacheTypeV: KvCacheType;
  useMmap: boolean;
  useMlock: boolean;
  /** Save the persona/system-prompt prefix to disk after it is evaluated and restore it on the next load (TTFT). */
  kvSessionCache: boolean;
  /** Max vision tokens per image (256..2048). 0 = Auto: per projector family (core/visionProfile.ts). Default: 0. */
  imageMaxTokens: number;
}

export interface SamplingSettings {
  temperature: number;
  topP: number;
  topK: number;
  minP: number;
  repeatPenalty: number;
}

export interface SpeculativeSettings {
  enabled: boolean;
  /** 'mtp' (or null) = the model's own built-in MTP draft layers; otherwise the catalog id of a draft model. */
  draftModelId: string | null;
  /** Max draft tokens per step (spec_draft_n_max). 1..16 */
  nDraft: number;
  /** Min draft probability to keep drafting (spec_draft_p_min). 0..1 */
  pMin: number;
}

export interface SttSettings {
  /** Speech model id (W3 decides the ids, e.g. 'whisper-tiny' | 'whisper-base'). */
  model: string;
  /** Voice activity threshold 0..1 (higher = needs louder speech). */
  vadThreshold: number;
}

export interface TtsSettings {
  enabled: boolean;
  /** expo-speech voice identifier; null = system default. */
  voiceId: string | null;
  /** 0.25..2 (1 = normal). */
  rate: number;
  /** 0.5..2 (1 = normal). */
  pitch: number;
}

export type ThemeChoice = 'system' | 'nyx' | 'helios';
export interface AppearanceSettings {
  theme: ThemeChoice;
  /** 0.85..1.5 (W4 snaps to its own steps). */
  textScale: number;
  haptics: boolean;
  reducedMotion: boolean;
}

export interface StoragePrefs {
  /** Storage slot where NEW model downloads go (services/storage.ts slots). null = the main vault. */
  modelSlotId: string | null;
}

export type VerifyMode = 'background' | 'always' | 'off';

export interface DownloadSettings {
  /** How many installs download at the same time (1..4). */
  parallel: number;
}

export interface Settings {
  version: number;
  // ---- Soul (global; a chat can override it, see core/chatTypes.ts ThreadSoul)
  archetype: SoulArchetypeKey;
  activeSoulId: string;
  pad: PADVector;
  /** 0.1 (subtle) .. 1 (strong). */
  toneIntensity: number;
  /** Extra instructions added to the system prompt (max 600 chars reach the model). */
  customBackstory: string;
  freedom: ModelFreedomSettings;
  // ---- engine
  activeModelId: string | null;
  /** Models that loaded AND produced a test reply on this phone. */
  verified: Record<string, VerifiedInfo>;
  /** v1 mirror of compute.nCtx (read-only; write compute or use applySettingsPatch). */
  contextOverride: number | null;
  /** v1 mirror of compute.threads. */
  threads: number | null;
  /** v1 mirror of compute.backend === 'gpu'. */
  useGpu: boolean;
  /** Per-message thinking for hybrid reasoning models. */
  thinkingEnabled: boolean;
  /** Set while a model is loading; still set at next launch => the app was killed (out of memory). */
  pendingMountModelId: string | null;
  /** The pending load used the GPU (a crash then switches compute.backend back to CPU). */
  pendingMountGpu: boolean;
  /** One-time explanation of an automatic settings change (e.g. "GPU crashed the app, switched to CPU"). */
  computeNotice: string | null;
  compute: ComputeSettings;
  sampling: SamplingSettings;
  speculative: SpeculativeSettings;
  /** Selected speculative preset card (UI index). */
  activePresetIndex: number;
  // ---- voice
  voice: VoicePrefs;
  /** Mirror of voice.sttModelId and voice.vadThreshold */
  stt: SttSettings;
  /** Mirror of voice.ttsEnabled, voice.ttsVoice, voice.ttsRate, voice.ttsPitch */
  tts: TtsSettings;
  // ---- privacy & security
  /** Block every network request except downloads the user started (services/networkGate.ts). */
  offlineStrict: boolean;
  /** New chats start as incognito (never written to disk). */
  incognitoDefault: boolean;
  security: SecurityPrefs;
  /** Mirror of security.appLock */
  biometricLock: boolean;
  /** SHA-256 download check mode ('background' | 'always' | 'off'). */
  verifyMode: VerifyMode;
  /** Delete chats not updated for this many days at launch (pinned chats are kept). 0 = off. */
  autoPurgeDays: number;
  // ---- look & storage
  appearance: AppearanceSettings;
  storage: StoragePrefs;
  downloads: DownloadSettings;
}

/** Upper bound for a user-chosen context size (tokens). */
export const MAX_CONTEXT = 32768;
export const MAX_AUTO_PURGE_DAYS = 3650;

export const DEFAULT_COMPUTE: ComputeSettings = {
  backend: 'cpu',
  nGpuLayers: 99,
  threads: null,
  nCtx: null,
  nBatch: 512,
  flashAttn: 'auto',
  cacheTypeK: 'f16',
  cacheTypeV: 'f16',
  useMmap: true,
  useMlock: false,
  kvSessionCache: true,
  imageMaxTokens: 0,
};

/** The values the engine used before v2 (llamaEngine.ts constants), so v1 users see no behaviour change. */
export const DEFAULT_SAMPLING: SamplingSettings = { temperature: 0.7, topP: 0.9, topK: 40, minP: 0.05, repeatPenalty: 1.1 };

function defaults(): Settings {
  return {
    version: SETTINGS_VERSION,
    archetype: 'neutral',
    activeSoulId: 'soul_neutral',
    pad: { ...ARCHETYPES.neutral.defaultPAD },
    toneIntensity: 0.8,
    customBackstory: '',
    freedom: { ...DEFAULT_MODEL_FREEDOM },
    activeModelId: null,
    verified: {},
    contextOverride: null,
    threads: null,
    useGpu: false,
    thinkingEnabled: true,
    pendingMountModelId: null,
    pendingMountGpu: false,
    computeNotice: null,
    compute: { ...DEFAULT_COMPUTE },
    sampling: { ...DEFAULT_SAMPLING },
    speculative: { enabled: false, draftModelId: null, nDraft: 4, pMin: 0.75 },
    activePresetIndex: 0,
    voice: { ...DEFAULT_VOICE_PREFS },
    stt: { model: DEFAULT_VOICE_PREFS.sttModelId, vadThreshold: DEFAULT_VOICE_PREFS.vadThreshold },
    tts: { enabled: DEFAULT_VOICE_PREFS.ttsEnabled, voiceId: DEFAULT_VOICE_PREFS.ttsVoice, rate: DEFAULT_VOICE_PREFS.ttsRate, pitch: DEFAULT_VOICE_PREFS.ttsPitch },
    offlineStrict: true,
    incognitoDefault: false,
    security: { ...DEFAULT_SECURITY_PREFS },
    biometricLock: DEFAULT_SECURITY_PREFS.appLock,
    verifyMode: 'background',
    autoPurgeDays: 0,
    appearance: { theme: 'system', textScale: 1, haptics: true, reducedMotion: false },
    storage: { modelSlotId: null },
    downloads: { parallel: 1 },
  };
}

export const DEFAULT_SETTINGS: Settings = defaults();

// ------------------------------------------------------------------ field validators

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const num = (v: unknown, lo: number, hi: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
const int = (v: unknown, lo: number, hi: number, fallback: number): number => Math.round(num(v, lo, hi, fallback));
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);
const str = (v: unknown, max: number, fallback: string): string => (typeof v === 'string' ? v.slice(0, max) : fallback);
const strOrNull = (v: unknown, max: number, fallback: string | null): string | null =>
  v === null ? null : typeof v === 'string' && v.trim() ? v.slice(0, max) : fallback;
const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T =>
  typeof v === 'string' && (options as readonly string[]).includes(v) ? (v as T) : fallback;

/** chiwiwi_downloads.json ({ concurrency: 1..4 }) -> v2 downloads. */
export function importLegacyDownloads(raw: unknown): DownloadSettings | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Obj;
  const n = Number(r.concurrency);
  return Number.isInteger(n) && n >= 1 && n <= 4 ? { parallel: n } : null;
}

/** null (automatic) or a sane context size. A corrupt `1e9` must never make llama.cpp allocate gigabytes of KV cache. */
function ctxOrNull(v: unknown, fallback: number | null): number | null {
  if (v === null) return null;
  if (typeof v === 'number' && Number.isFinite(v) && v >= 512) return Math.min(MAX_CONTEXT, Math.round(v));
  return fallback;
}
function threadsOrNull(v: unknown, fallback: number | null): number | null {
  if (v === null) return null;
  return typeof v === 'number' && v >= 1 && v <= 16 ? Math.round(v) : fallback;
}

function sanitizeCompute(raw: unknown, base: ComputeSettings): ComputeSettings {
  const r = obj(raw);
  return {
    backend: oneOf(r.backend, ['cpu', 'gpu'] as const, base.backend),
    nGpuLayers: int(r.nGpuLayers, 0, 999, base.nGpuLayers),
    threads: 'threads' in r ? threadsOrNull(r.threads, base.threads) : base.threads,
    nCtx: 'nCtx' in r ? ctxOrNull(r.nCtx, base.nCtx) : base.nCtx,
    nBatch: int(r.nBatch, 32, 2048, base.nBatch),
    flashAttn: oneOf(r.flashAttn, ['auto', 'on', 'off'] as const, base.flashAttn),
    cacheTypeK: oneOf(r.cacheTypeK, KV_CACHE_TYPES, base.cacheTypeK),
    cacheTypeV: oneOf(r.cacheTypeV, KV_CACHE_TYPES, base.cacheTypeV),
    useMmap: bool(r.useMmap, base.useMmap),
    useMlock: bool(r.useMlock, base.useMlock),
    kvSessionCache: bool(r.kvSessionCache, base.kvSessionCache),
    imageMaxTokens: r.imageMaxTokens === 0 ? 0 : int(r.imageMaxTokens, 128, 4096, base.imageMaxTokens ?? 0),
  };
}

export function sanitizeSampling(raw: unknown, base: SamplingSettings = DEFAULT_SAMPLING): SamplingSettings {
  const r = obj(raw);
  return {
    temperature: num(r.temperature, 0, 2, base.temperature),
    topP: num(r.topP, 0.05, 1, base.topP),
    topK: int(r.topK, 0, 200, base.topK),
    minP: num(r.minP, 0, 1, base.minP),
    repeatPenalty: num(r.repeatPenalty, 1, 2, base.repeatPenalty),
  };
}

/** Merge unknown/old/corrupt JSON into a valid v2 Settings object. Never throws. Migrates v1 files. */
export function sanitizeSettings(raw: unknown): Settings {
  const out = defaults();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const r = raw as Obj;
  const d = out;

  if (typeof r.archetype === 'string' && r.archetype in ARCHETYPES) {
    out.archetype = r.archetype as SoulArchetypeKey;
    if (!r.activeSoulId && LEGACY_ARCH_TO_SOUL[out.archetype]) {
      out.activeSoulId = LEGACY_ARCH_TO_SOUL[out.archetype];
    }
  }
  if (typeof r.activeSoulId === 'string' && r.activeSoulId.trim()) {
    out.activeSoulId = r.activeSoulId.trim();
    if (!r.archetype && SOUL_TO_LEGACY_ARCH[out.activeSoulId]) {
      out.archetype = SOUL_TO_LEGACY_ARCH[out.activeSoulId];
    }
  }
  const p = obj(r.pad);
  if (typeof p.pleasure === 'number' && typeof p.arousal === 'number' && typeof p.dominance === 'number') {
    out.pad = clampPad({ pleasure: p.pleasure, arousal: p.arousal, dominance: p.dominance });
  }
  out.toneIntensity = num(r.toneIntensity, 0.1, 1, d.toneIntensity);
  out.customBackstory = str(r.customBackstory, 2000, d.customBackstory);
  out.freedom = sanitizeModelFreedom(r.freedom);

  if (typeof r.activeModelId === 'string') out.activeModelId = r.activeModelId;
  for (const [k, v] of Object.entries(obj(r.verified))) {
    const o = v as Partial<VerifiedInfo> | null;
    if (o && typeof o.at === 'number') {
      const info: VerifiedInfo = { at: o.at, tokensPerSecond: Number(o.tokensPerSecond) || 0, loadMs: Number(o.loadMs) || 0 };
      if (typeof o.chatTokPerSec === 'number' && o.chatTokPerSec > 0) info.chatTokPerSec = o.chatTokPerSec;
      if (typeof o.specTokPerSec === 'number' && o.specTokPerSec > 0) info.specTokPerSec = o.specTokPerSec;
      out.verified[k] = info;
    }
  }
  out.thinkingEnabled = bool(r.thinkingEnabled, d.thinkingEnabled);
  if (typeof r.pendingMountModelId === 'string') out.pendingMountModelId = r.pendingMountModelId;
  out.pendingMountGpu = bool(r.pendingMountGpu, false);
  out.computeNotice = strOrNull(r.computeNotice, 300, null);

  // compute: v2 object wins; a v1 file only has the three flat fields.
  if (r.compute && typeof r.compute === 'object') {
    out.compute = sanitizeCompute(r.compute, d.compute);
  } else {
    out.compute = sanitizeCompute(
      {
        threads: 'threads' in r ? r.threads : d.compute.threads,
        nCtx: 'contextOverride' in r ? r.contextOverride : d.compute.nCtx,
        backend: r.useGpu === true ? 'gpu' : 'cpu',
      },
      d.compute,
    );
  }
  // v2 -> v3: 512 was the old flat default, not a choice; those files move to Auto (per-family budget).
  if (!(typeof r.version === 'number' && r.version >= 3) && out.compute.imageMaxTokens === 512) out.compute = { ...out.compute, imageMaxTokens: 0 };
  out.sampling = sanitizeSampling(r.sampling, d.sampling);
  const sp = obj(r.speculative);
  out.speculative = {
    enabled: bool(sp.enabled, d.speculative.enabled),
    draftModelId: strOrNull(sp.draftModelId, 100, d.speculative.draftModelId),
    nDraft: int(sp.nDraft, 1, 16, d.speculative.nDraft),
    pMin: num(sp.pMin, 0, 1, d.speculative.pMin),
  };
  out.activePresetIndex = int(r.activePresetIndex, 0, 99, d.activePresetIndex);

  if (r.voice && typeof r.voice === 'object') {
    out.voice = sanitizeVoicePrefs(r.voice);
  } else {
    const stt = obj(r.stt);
    const tts = obj(r.tts);
    out.voice = sanitizeVoicePrefs({
      ...d.voice,
      ...(typeof stt.model === 'string' && stt.model.trim() ? { sttModelId: stt.model.trim() } : {}),
      ...(typeof stt.vadThreshold === 'number' ? { vadThreshold: stt.vadThreshold } : {}),
      ...(typeof tts.enabled === 'boolean' ? { ttsEnabled: tts.enabled } : {}),
      ...(typeof tts.voiceId === 'string' || tts.voiceId === null ? { ttsVoice: tts.voiceId } : {}),
      ...(typeof tts.rate === 'number' ? { ttsRate: tts.rate } : {}),
      ...(typeof tts.pitch === 'number' ? { ttsPitch: tts.pitch } : {}),
    });
  }

  out.offlineStrict = bool(r.offlineStrict, d.offlineStrict);
  out.incognitoDefault = bool(r.incognitoDefault, d.incognitoDefault);
  if (r.security && typeof r.security === 'object') {
    out.security = sanitizeSecurityPrefs(r.security);
  } else if (typeof r.biometricLock === 'boolean') {
    out.security = sanitizeSecurityPrefs({ ...d.security, appLock: r.biometricLock });
  } else {
    out.security = sanitizeSecurityPrefs(d.security);
  }
  out.verifyMode = oneOf(r.verifyMode, ['background', 'always', 'off'] as const, d.verifyMode);
  out.autoPurgeDays = int(r.autoPurgeDays, 0, MAX_AUTO_PURGE_DAYS, d.autoPurgeDays);

  const ap = obj(r.appearance);
  out.appearance = {
    theme: oneOf(ap.theme, ['system', 'nyx', 'helios'] as const, d.appearance.theme),
    textScale: num(ap.textScale, 0.85, 1.5, d.appearance.textScale),
    haptics: bool(ap.haptics, d.appearance.haptics),
    reducedMotion: bool(ap.reducedMotion, d.appearance.reducedMotion),
  };
  const st = obj(r.storage);
  out.storage = { modelSlotId: strOrNull(st.modelSlotId, 100, d.storage.modelSlotId) };
  const dl = obj(r.downloads);
  out.downloads = { parallel: int(dl.parallel, 1, 4, d.downloads.parallel) };

  return withMirrors(out);
}

const LEGACY_ARCH_TO_SOUL: Record<string, string> = {
  neutral: 'soul_neutral',
  empath: 'soul_caregiver',
  mentor: 'soul_sage',
  tactical: 'soul_analyst',
  spark: 'soul_trickster',
  cynic: 'soul_rebel',
  visionary: 'soul_strategist',
};

const SOUL_TO_LEGACY_ARCH: Record<string, SoulArchetypeKey> = {
  soul_neutral: 'neutral',
  soul_caregiver: 'empath',
  soul_sage: 'mentor',
  soul_analyst: 'tactical',
  soul_trickster: 'spark',
  soul_rebel: 'cynic',
  soul_strategist: 'visionary',
};

/** Recompute the v1 mirror fields from `compute`, `voice`, and `security` (the sources of truth). */
function withMirrors(s: Settings): Settings {
  s.threads = s.compute.threads;
  s.useGpu = s.compute.backend === 'gpu';
  s.contextOverride = s.compute.nCtx;
  s.biometricLock = s.security.appLock;
  s.stt = { model: s.voice.sttModelId, vadThreshold: s.voice.vadThreshold };
  s.tts = { enabled: s.voice.ttsEnabled, voiceId: s.voice.ttsVoice, rate: s.voice.ttsRate, pitch: s.voice.ttsPitch };
  s.version = SETTINGS_VERSION;
  return s;
}

/**
 * The ONLY way settings change: merge a patch, write v1 fields through to `compute`, then validate + clamp everything.
 * Patches to nested sections are full section objects (`{ compute: { ...s.compute, threads: 6 } }`);
 * services/settings.ts `updateSection()` builds them for the UI.
 */
export function applySettingsPatch(prev: Settings, patch: Partial<Settings>): Settings {
  const next: Settings = { ...prev, ...patch };
  if (!('compute' in patch)) {
    const c = { ...prev.compute };
    if ('threads' in patch) c.threads = patch.threads ?? null;
    if ('contextOverride' in patch) c.nCtx = patch.contextOverride ?? null;
    if ('useGpu' in patch) c.backend = patch.useGpu ? 'gpu' : 'cpu';
    next.compute = c;
  }
  if (!('security' in patch) && 'biometricLock' in patch && typeof patch.biometricLock === 'boolean') {
    next.security = { ...prev.security, appLock: patch.biometricLock };
  }
  if ('archetype' in patch && !('activeSoulId' in patch)) {
    const mapped = LEGACY_ARCH_TO_SOUL[patch.archetype as string];
    if (mapped) next.activeSoulId = mapped;
  }
  if ('activeSoulId' in patch && !('archetype' in patch)) {
    const mapped = SOUL_TO_LEGACY_ARCH[patch.activeSoulId as string];
    if (mapped) next.archetype = mapped;
  }
  if (!('voice' in patch)) {
    let vChanged = false;
    const v = { ...prev.voice };
    if (patch.stt && typeof patch.stt === 'object') {
      const stt = patch.stt as Partial<SttSettings>;
      if (typeof stt.model === 'string') { v.sttModelId = stt.model; vChanged = true; }
      if (typeof stt.vadThreshold === 'number') { v.vadThreshold = stt.vadThreshold; vChanged = true; }
    }
    if (patch.tts && typeof patch.tts === 'object') {
      const tts = patch.tts as Partial<TtsSettings>;
      if (typeof tts.enabled === 'boolean') { v.ttsEnabled = tts.enabled; vChanged = true; }
      if (tts.voiceId !== undefined) { v.ttsVoice = tts.voiceId; vChanged = true; }
      if (typeof tts.rate === 'number') { v.ttsRate = tts.rate; vChanged = true; }
      if (typeof tts.pitch === 'number') { v.ttsPitch = tts.pitch; vChanged = true; }
    }
    if (vChanged) next.voice = v;
  }
  return sanitizeSettings(next);
}
