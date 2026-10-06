/**
 * The single status a model card shows (MD-7). Pure function of download state,
 * engine state and verification record, so every combination is unit-tested.
 */
import type { DownloadState } from './downloadManager.ts';
import type { EngineState } from './engineManager.ts';
import { formatPercent } from './format.ts';

export type ModelStatusKind =
  | 'not_downloaded'
  | 'resolving'
  | 'downloading'
  | 'paused'
  | 'finalizing'
  | 'download_error'
  | 'installed'
  | 'loading'
  | 'active'
  | 'load_failed';

export type StatusTone = 'neutral' | 'good' | 'warn' | 'bad' | 'accent';

export interface ModelStatus {
  kind: ModelStatusKind;
  label: string;
  tone: StatusTone;
}

export interface StatusInput {
  modelId: string;
  download: DownloadState;
  engine: Pick<EngineState, 'status' | 'modelId' | 'stage' | 'loadProgress'>;
  verified: boolean;
}

export function deriveModelStatus(i: StatusInput): ModelStatus {
  const mine = i.engine.modelId === i.modelId;
  if (mine && i.engine.status === 'mounting') {
    const stage = i.engine.stage === 'testing' ? 'Testing a reply...' : i.engine.stage === 'checking' ? 'Checking file...' : `Loading into memory ${formatPercent(i.engine.loadProgress)}`;
    return { kind: 'loading', label: stage, tone: 'accent' };
  }
  if (mine && (i.engine.status === 'ready' || i.engine.status === 'generating')) {
    return { kind: 'active', label: 'Active · Verified', tone: 'good' };
  }

  const d = i.download;
  switch (d.status) {
    case 'resolving':
      return { kind: 'resolving', label: 'Contacting Hugging Face...', tone: 'accent' };
    case 'downloading':
      return { kind: 'downloading', label: d.note ?? 'Downloading', tone: 'accent' };
    case 'finalizing':
      return { kind: 'finalizing', label: 'Checking the downloaded file...', tone: 'accent' };
    case 'paused':
      return { kind: 'paused', label: d.totalBytes > 0 ? `Paused at ${formatPercent(d.bytesWritten / d.totalBytes)}` : 'Paused', tone: 'warn' };
    case 'error':
      return { kind: 'download_error', label: 'Download problem', tone: 'bad' };
    case 'completed':
      if (mine && i.engine.status === 'error') return { kind: 'load_failed', label: 'Could not load', tone: 'bad' };
      return i.verified
        ? { kind: 'installed', label: 'Installed · Verified on this phone', tone: 'good' }
        : { kind: 'installed', label: 'Installed · Load it to verify', tone: 'neutral' };
    default:
      return { kind: 'not_downloaded', label: 'Not downloaded', tone: 'neutral' };
  }
}

export type ModelAction = 'download' | 'pause' | 'resume' | 'retry' | 'cancel' | 'load' | 'unload' | 'delete' | 'verify_checksum' | 'start_chat';

/** Which buttons a card offers in each status (UX-1: every control has a purpose and a place). */
export function actionsFor(kind: ModelStatusKind, retryable: boolean): ModelAction[] {
  switch (kind) {
    case 'not_downloaded':
      return ['download'];
    case 'resolving':
    case 'downloading':
      return ['pause', 'cancel'];
    case 'paused':
      return ['resume', 'cancel'];
    case 'finalizing':
    case 'loading':
      return [];
    case 'download_error':
      return retryable ? ['retry', 'cancel'] : ['cancel'];
    case 'installed':
    case 'load_failed':
      return ['load', 'verify_checksum', 'delete'];
    case 'active':
      return ['start_chat', 'unload', 'verify_checksum', 'delete'];
  }
}
