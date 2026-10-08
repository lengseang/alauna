/**
 * Pure logic behind the Model Vault, Model detail, Downloads Hub and Speculative screens (no React, no react-native):
 * unit-tested in test/vaultView.test.ts. Every number comes from the catalog, the download manager or the engine.
 */
import {
  MODEL_CATALOG,
  estimateModelRam,
  getModel,
  queryLibrary,
  type LibrarySort,
  type ModelCapability,
  type ModelGrade,
  type ModelSpec,
} from '../core/catalog.ts';
import type { DownloadState, FileKind } from '../core/downloadManager.ts';
import type { EngineState } from '../core/engineManager.ts';
import { FIT_LABEL, rateFit, type FitRating } from '../core/fit.ts';
import { formatPercent, formatSpeed } from '../core/format.ts';
import { actionsFor, deriveModelStatus, type ModelAction, type ModelStatusKind, type StatusTone } from '../core/modelStatus.ts';

// -------------------------------------------------------------------- fit

export interface FitVerdict {
  rating: FitRating;
  label: string;
  /** Estimated memory with the context window in use (and the image add-on, which a default install loads). */
  ramBytes: number;
  tone: 'accent' | 'muted' | 'danger';
}

/** One fit rule for the whole Vault (rows, filter, detail): the projector counts because a default install loads it. */
export function fitVerdict(spec: ModelSpec, totalRamBytes: number | null, nCtx: number): FitVerdict {
  const ramBytes = estimateModelRam(spec, nCtx, { vision: !!spec.mmproj });
  const rating = rateFit(ramBytes, totalRamBytes);
  const tone = rating === 'too_heavy' ? 'danger' : rating === 'great' ? 'accent' : 'muted';
  return { rating, label: FIT_LABEL[rating], ramBytes, tone };
}

// -------------------------------------------------------------------- filters, sorts, groups

export type PolicyFilter = 'Standard' | 'Uncensored';

export interface VaultFilters {
  search: string;
  caps: ModelCapability[];
  grades: ModelGrade[];
  policies: PolicyFilter[];
  fits: boolean;
  installed: boolean;
  match: 'AND' | 'OR';
  sort: LibrarySort;
}

export const DEFAULT_FILTERS: VaultFilters = { search: '', caps: [], grades: [], policies: [], fits: false, installed: false, match: 'AND', sort: 'recommended' };

/** Chips switched on (the search text and the sort are not chips). */
export function activeFilterCount(f: VaultFilters): number {
  return f.caps.length + f.grades.length + f.policies.length + (f.fits ? 1 : 0) + (f.installed ? 1 : 0);
}

export function toggle<T>(list: readonly T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export interface QueryEnv {
  ramBytes: number | null;
  nCtx: number;
  installedIds: readonly string[];
}

/** queryLibrary + the Vault's own "Fits this phone" rule (so a row never says "too heavy" under that filter). */
export function runVaultQuery(f: VaultFilters, env: QueryEnv, catalog: readonly ModelSpec[] = MODEL_CATALOG): ModelSpec[] {
  let out = queryLibrary(
    {
      search: f.search,
      capabilities: f.caps,
      match: f.match,
      grades: f.grades,
      policy: f.policies.length === 1 ? f.policies[0] : 'all',
      ramBytes: env.ramBytes,
      nCtx: env.nCtx,
      install: f.installed ? 'installed' : 'all',
      installedIds: env.installedIds,
      sort: f.sort,
    },
    catalog,
  );
  if (f.fits && env.ramBytes) out = out.filter((m) => fitVerdict(m, env.ramBytes, env.nCtx).rating !== 'too_heavy');
  return out;
}

export const SORTS: readonly { value: LibrarySort; label: string; short: string; hint: string; grouped: boolean }[] = [
  { value: 'recommended', label: 'Best fit for this phone', short: 'Best fit', hint: 'Fits first, then our preference. Grouped by grade.', grouped: true },
  { value: 'grade', label: 'Grade', short: 'Grade', hint: 'Titans, then Sweet spot, then Ultra-light.', grouped: true },
  { value: 'name', label: 'Name A to Z', short: 'Name', hint: 'One list.', grouped: false },
  { value: 'size_asc', label: 'Smallest download first', short: 'Smallest', hint: 'Model plus add-on. One list.', grouped: false },
  { value: 'size_desc', label: 'Largest download first', short: 'Largest', hint: 'Model plus add-on. One list.', grouped: false },
  { value: 'ram_asc', label: 'Least memory first', short: 'Least memory', hint: 'Estimated memory while running. One list.', grouped: false },
  { value: 'ram_desc', label: 'Most memory first', short: 'Most memory', hint: 'Estimated memory while running. One list.', grouped: false },
  { value: 'newest', label: 'Newest first', short: 'Newest', hint: 'By the date the files appeared on the Hub. One list.', grouped: false },
];

export const sortInfo = (sort: LibrarySort) => SORTS.find((s) => s.value === sort) ?? SORTS[0];

export const GRADE_INFO: Record<ModelGrade, { title: string; blurb: string }> = {
  S: { title: 'Grade S · Titans', blurb: 'Over 5 GB of memory. Strongest answers, slower on a phone.' },
  B: { title: 'Grade B · Sweet spot', blurb: '2.5 to 5 GB of memory. The best balance on most phones.' },
  C: { title: 'Grade C · Ultra-light', blurb: 'Under 2.5 GB of memory. Quick, fits almost any phone.' },
};

export interface VaultSection {
  key: string;
  title: string;
  hint: string;
  data: ModelSpec[];
}

const GRADES: readonly ModelGrade[] = ['S', 'B', 'C'];
const FIT_RANK: Record<FitRating, number> = { great: 0, ok: 1, tight: 2, unknown: 3, too_heavy: 4 };

/**
 * Grade groups for "Best fit" (the group holding the best-fitting model first, so the top of the list always suits this
 * phone) and "Grade" (S, B, C). Every other order is one flat list so the order the user asked for is the order they see.
 */
export function sectionsFor(models: readonly ModelSpec[], sort: LibrarySort, env: Pick<QueryEnv, 'ramBytes' | 'nCtx'>): VaultSection[] {
  if (!sortInfo(sort).grouped) {
    return models.length === 0 ? [] : [{ key: 'all', title: sortInfo(sort).label, hint: `${models.length} ${models.length === 1 ? 'model' : 'models'}`, data: [...models] }];
  }
  const groups = GRADES.map((g) => ({ g, data: models.filter((m) => m.grade === g) })).filter((x) => x.data.length > 0);
  if (sort === 'recommended') {
    const best = (data: ModelSpec[]) => Math.min(...data.map((m) => FIT_RANK[fitVerdict(m, env.ramBytes, env.nCtx).rating]));
    groups.sort((a, b) => best(a.data) - best(b.data)); // stable: ties keep S, B, C
  }
  return groups.map(({ g, data }) => ({ key: g, title: GRADE_INFO[g].title, hint: `${GRADE_INFO[g].blurb} ${data.length} ${data.length === 1 ? 'model' : 'models'}.`, data }));
}

// -------------------------------------------------------------------- one model's status and primary action

export type PrimaryAction = ModelAction | 'busy';

export interface RowState {
  kind: ModelStatusKind;
  /** Short status in words ("Downloading 42%"); '' when the model is simply available. */
  label: string;
  tone: StatusTone;
  /** 0..1 for a transfer, a verification or a load in progress. */
  fraction: number | null;
  primary: { action: PrimaryAction; label: string } | null;
}

export type EngineLike = Pick<EngineState, 'status' | 'modelId' | 'stage' | 'loadProgress'>;

/** What no model looks like to the engine (used for every row except the one the engine is working on). */
export const IDLE_ENGINE: EngineLike = { status: 'unmounted', modelId: null, stage: null, loadProgress: 0 };

/** Button label per model action (the one a row shows is `RowState.primary`). */
export const ACTION_LABEL: Partial<Record<ModelAction, string>> = {
  download: 'Download',
  pause: 'Pause',
  resume: 'Resume',
  retry: 'Retry',
  cancel: 'Cancel',
  load: 'Load',
  start_chat: 'Chat',
};

export function rowState(spec: ModelSpec, dl: DownloadState, engine: EngineLike, verified: boolean): RowState {
  const st = deriveModelStatus({ modelId: spec.id, download: dl, engine, verified });
  const done = dl.totalBytes > 0 ? Math.min(1, dl.bytesWritten / dl.totalBytes) : 0;
  let label = '';
  let fraction: number | null = null;
  switch (st.kind) {
    case 'queued':
      label = `Queued #${dl.queuePosition ?? '?'}`;
      break;
    case 'resolving':
      label = 'Contacting Hugging Face';
      break;
    case 'downloading':
      label = `Downloading ${formatPercent(done)}${dl.speedBps > 0 ? ` · ${formatSpeed(dl.speedBps)}` : ''}`;
      fraction = done;
      break;
    case 'finalizing':
      label = dl.verifyFraction !== undefined ? `Verifying ${formatPercent(dl.verifyFraction)}` : 'Verifying';
      fraction = dl.verifyFraction ?? 1;
      break;
    case 'paused':
      label = `Paused at ${formatPercent(done)}`;
      fraction = done;
      break;
    case 'download_error':
      label = 'Download failed';
      break;
    case 'installed':
      label = verified ? 'Installed · works on this phone' : 'Installed';
      break;
    case 'loading':
      label = st.label.replace('...', '');
      fraction = engine.stage === 'loading' ? engine.loadProgress : null;
      break;
    case 'active':
      label = 'Loaded';
      break;
    case 'load_failed':
      label = 'Could not load';
      break;
    default:
      break;
  }
  const first = actionsFor(st.kind, dl.retryable)[0];
  let primary: RowState['primary'] = null;
  if (st.kind === 'loading') primary = { action: 'busy', label: 'Loading' };
  else if (first) primary = { action: first, label: st.kind === 'download_error' && first === 'cancel' ? 'Discard' : (ACTION_LABEL[first] ?? first) };
  return { kind: st.kind, label, tone: st.tone, fraction, primary };
}

/** True when the model is on the phone (with or without being loaded). */
export const isOnPhone = (kind: ModelStatusKind): boolean => kind === 'installed' || kind === 'active' || kind === 'loading' || kind === 'load_failed';

/** True while bytes are moving or being checked for this install. */
export const isTransferring = (kind: ModelStatusKind): boolean => kind === 'resolving' || kind === 'downloading' || kind === 'finalizing';

// -------------------------------------------------------------------- facts

/** 262144 -> "256K tokens". */
export function contextLabel(tokens: number): string {
  if (!tokens || tokens <= 0) return 'unknown';
  return tokens >= 1024 ? `${Math.round(tokens / 1024)}K tokens` : `${tokens} tokens`;
}

/** Parameters: 0.36 -> "360M", 4 -> "4B", 1.7 -> "1.7B". */
export function paramsLabel(b: number): string {
  if (b < 1) return `${Math.round(b * 1000)}M`;
  return `${Number.isInteger(b) ? b : b.toFixed(1).replace(/\.0$/, '')}B`;
}

export const shortSha = (sha: string): string => (sha ? sha.slice(0, 12) : 'none published');

export const FILE_LABEL: Record<FileKind, string> = { model: 'Model', mmproj: 'Image add-on', draft: 'Speed-up head' };

/** License ids the catalog carries that are not plain permissive licenses (docs/api/vault.md section 5, point 4). */
export function licenseNote(license: string): { level: 'warn'; text: string } | null {
  const l = license.toLowerCase();
  if (l === 'qwen-research') return { level: 'warn', text: 'Research license: not for commercial use. Read the license before you use this model in a product.' };
  if (l.startsWith('lfm')) return { level: 'warn', text: 'Custom license with limits on commercial use. Read it before you use this model in a product.' };
  if (l.includes('minicpm')) return { level: 'warn', text: 'Custom license with its own terms for commercial use. Read it before you use this model in a product.' };
  if (l.startsWith('gemma')) return { level: 'warn', text: 'Gemma terms of use: a custom license with usage rules. Read it before you use this model in a product.' };
  if (l.startsWith('llama')) return { level: 'warn', text: 'Llama community license: custom conditions apply. Read it before you use this model in a product.' };
  return null;
}

// -------------------------------------------------------------------- downloads hub

export interface DownloadGroups {
  /** Transferring or verifying right now. */
  active: string[];
  /** Waiting, in queue order. */
  queued: string[];
  paused: string[];
  failed: string[];
  /** Fully on the phone. */
  installed: string[];
}

export function partitionDownloads(items: Record<string, DownloadState>, queue: readonly string[]): DownloadGroups {
  const ids = Object.keys(items).filter((id) => !!getModel(id));
  const by = (pred: (s: DownloadState) => boolean) => ids.filter((id) => pred(items[id]));
  const name = (id: string) => getModel(id)?.name ?? id;
  const sorted = (xs: string[]) => xs.sort((a, b) => name(a).localeCompare(name(b)));
  const queuedSet = by((s) => s.status === 'queued');
  return {
    active: sorted(by((s) => s.status === 'resolving' || s.status === 'downloading' || s.status === 'finalizing')),
    queued: [...queue.filter((id) => queuedSet.includes(id)), ...queuedSet.filter((id) => !queue.includes(id))],
    paused: sorted(by((s) => s.status === 'paused')),
    failed: sorted(by((s) => s.status === 'error')),
    installed: sorted(by((s) => s.status === 'completed')),
  };
}

/** "model done, image add-on 40%" style line from DownloadState.parts. */
export function partsLine(dl: DownloadState): string {
  if (!dl.parts || dl.parts.length < 2) return '';
  return dl.parts.map((p) => `${FILE_LABEL[p.kind].toLowerCase()} ${p.done ? 'done' : dl.part === p.kind ? 'now' : 'waiting'}`).join(' · ');
}

// -------------------------------------------------------------------- speculative

/**
 * llama.rn 0.12.9 drafts only with MTP heads (`spec_type: 'draft-mtp'`). A separate small model as draft (the old app's
 * pairs) is refused before load. Flip this when the engine wires llama.cpp's classic draft.
 */
export const CLASSIC_DRAFT_SUPPORTED = false;

export const CLASSIC_REASON = 'Not supported by this engine version: llama.rn 0.12.9 can only draft with an MTP head built for the target, not with a separate model.';

export interface SpecPreset {
  id: string;
  name: string;
  targetId: string;
  draftId: string;
  description: string;
}

/** The three pairs of the old Speculative Turbo screen (same names and ids; the invented speed-ups and rates are gone). */
export const SPEC_PRESETS: readonly SpecPreset[] = [
  { id: 'llama-smollm', name: 'Balanced Sovereign', targetId: 'llama-3.1-8b', draftId: 'smollm3-1.7b', description: 'Gold standard empathy and conversational roleplay. Draft tokens are checked in parallel by the big model.' },
  { id: 'qwen-turbo', name: 'Logic & Code Fastpath', targetId: 'qwen3-8b', draftId: 'qwen2.5-1.5b', description: 'High-speed code synthesis and step-by-step logic. High acceptance on formal syntax.' },
  { id: 'gemma-titan', name: 'Multimodal Edge Oracle', targetId: 'gemma-4-12b', draftId: 'gemma-4-e2b', description: 'Upper boundary for 12 GB RAM phones. Vision and voice.' },
];

export interface PresetSupport {
  target?: ModelSpec;
  draft?: ModelSpec;
  /** The pair exactly as the old app defined it (target + a separate draft model). */
  pairRunnable: boolean;
  reason: string | null;
  /** The target has its own MTP head, so it can still draft for itself. */
  mtpAlternative: boolean;
}

export function presetSupport(p: SpecPreset): PresetSupport {
  const target = getModel(p.targetId);
  const draft = getModel(p.draftId);
  if (!target || !draft) return { target, draft, pairRunnable: false, reason: 'One of the two models is not in the library.', mtpAlternative: false };
  return { target, draft, pairRunnable: CLASSIC_DRAFT_SUPPORTED, reason: CLASSIC_DRAFT_SUPPORTED ? null : CLASSIC_REASON, mtpAlternative: !!target.draft };
}

/** Models that carry their own MTP head: the pairs this engine can really run. */
export function mtpTargets(catalog: readonly ModelSpec[] = MODEL_CATALOG): ModelSpec[] {
  return catalog.filter((m) => !!m.draft);
}

/** What Settings asks for, in the engine's words (used to tell whether a reload is needed). */
export function wantedMode(s: { enabled: boolean; draftModelId: string | null }): 'off' | 'mtp' | 'draft' {
  if (!s.enabled) return 'off';
  return s.draftModelId && s.draftModelId !== 'mtp' ? 'draft' : 'mtp';
}

/** "1.6x" or null (not measured yet). */
export const speedupLabel = (x: number | null): string | null => (x === null || !Number.isFinite(x) ? null : `${x.toFixed(2).replace(/0$/, '')}x`);
