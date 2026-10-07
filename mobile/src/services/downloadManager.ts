/**
 * CHIWIWI Persistent Sovereign Download Manager
 * Global singleton managing in-flight model downloads across app lifecycle,
 * screen transitions, and background execution.
 */

import { File, Directory } from 'expo-file-system';
import { AppState, type AppStateStatus } from 'react-native';
import { S23_MODEL_DATABASE, LocalModelSpec } from '../types/settings';
import { StorageConfigService } from './storageConfig';
import {
  HFModelDownloader,
  type HFDownloadProgress,
  type DownloadStatus,
} from './hfModelDownloader';
import { MMKVCache } from './mmkvCache';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

export interface PersistentDownloadState {
  modelId: string;
  filename: string;
  status: DownloadStatus;
  progress: number; // 0 to 100
  speedMbPerSec: number;
  downloadedMb: number;
  totalMb: number;
  error?: string;
  updatedAt: number;
}

type DownloadListener = (states: Record<string, PersistentDownloadState>) => void;

class SovereignDownloadManager {
  private activeDownloaders: Map<string, HFModelDownloader> = new Map();
  private states: Record<string, PersistentDownloadState> = {};
  private listeners: Set<DownloadListener> = new Set();
  private isInitialized = false;

  constructor() {
    this.restoreFromCache();
    this.setupAppStateListener();
  }

  private setupAppStateListener() {
    try {
      AppState.addEventListener('change', (nextState: AppStateStatus) => {
        if (nextState === 'active') {
          this.syncFromDisk().catch(() => {});
        }
      });
    } catch {}
  }

  /**
   * Synchronize active download states with actual on-disk files.
   * Prevents stale, weird, or 0% progress when returning from background or switching apps.
   */
  public async syncFromDisk(): Promise<void> {
    const modelsDir = HFModelDownloader.modelsDirectory;
    let changed = false;

    for (const [id, state] of Object.entries(this.states)) {
      if (state.status === 'completed') continue;

      // 1. Check if model has completed on disk
      const finalFile = new File(modelsDir, state.filename);
      if (finalFile.exists && finalFile.size > 1024 * 1024) {
        const isGGUF = await HFModelDownloader.verifyGGUFHeader(finalFile);
        if (isGGUF) {
          this.states[id] = {
            ...state,
            status: 'completed',
            progress: 100,
            speedMbPerSec: 0,
            downloadedMb: state.totalMb,
            updatedAt: Date.now(),
          };
          changed = true;
          continue;
        }
      }

      // 2. Check partial file bytes on disk
      const partialFile = new File(modelsDir, `${state.filename}.chiwiwi_part`);
      if (partialFile.exists) {
        const bytesOnDisk = partialFile.size;
        const downloadedMb = Math.round((bytesOnDisk / (1024 * 1024)) * 10) / 10;
        const progress = state.totalMb > 0
          ? Math.min(100, Math.round((downloadedMb / state.totalMb) * 100))
          : state.progress;

        const downloader = this.activeDownloaders.get(id);
        const isActivelyDownloading = downloader && downloader.getStatus() === 'downloading';

        this.states[id] = {
          ...state,
          status: isActivelyDownloading ? 'downloading' : 'paused',
          downloadedMb,
          progress,
          speedMbPerSec: isActivelyDownloading ? state.speedMbPerSec : 0,
          updatedAt: Date.now(),
        };
        changed = true;
      }
    }

    if (changed) {
      this.notify();
    }
  }

  private restoreFromCache() {
    if (this.isInitialized) return;
    this.isInitialized = true;
    try {
      const cached = MMKVCache.getObject<Record<string, PersistentDownloadState>>('chiwiwi_active_downloads');
      if (cached && typeof cached === 'object') {
        for (const [id, state] of Object.entries(cached)) {
          // If app was killed mid-download, mark as paused so user can resume
          if (state.status === 'downloading') {
            this.states[id] = { ...state, status: 'paused', speedMbPerSec: 0 };
          } else {
            this.states[id] = state;
          }
        }
      }
    } catch {}
    this.syncFromDisk().catch(() => {});
  }

  private persistStates() {
    try {
      MMKVCache.setObject('chiwiwi_active_downloads', this.states);
    } catch {}
  }

  private notify() {
    this.persistStates();
    const snapshot = { ...this.states };
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch {}
    }
  }

  public subscribe(listener: DownloadListener): () => void {
    this.listeners.add(listener);
    // Initial emit
    listener({ ...this.states });
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getState(modelId: string): PersistentDownloadState | undefined {
    return this.states[modelId];
  }

  public getAllStates(): Record<string, PersistentDownloadState> {
    return { ...this.states };
  }

  public isDownloading(modelId: string): boolean {
    const s = this.states[modelId];
    return s?.status === 'downloading';
  }

  /**
   * Start or resume download in global background scope.
   */
  public async startDownload(spec: LocalModelSpec): Promise<string> {
    const modelId = spec.id;
    const existing = this.activeDownloaders.get(modelId);
    if (existing && existing.getStatus() === 'downloading') {
      return '';
    }

    // Target models directory is guaranteed-writable app sandbox
    const modelsDir = HFModelDownloader.modelsDirectory;
    await HFModelDownloader.initStorage();

    const parseSizeToMb = (sizeStr: string): number => {
      const num = parseFloat(sizeStr);
      if (sizeStr.includes('GB')) return Math.round(num * 1024);
      return Math.round(num);
    };

    const targetTotalMb = parseSizeToMb(spec.sizeFormatted);

    // If already exists in memory and was paused, resume it natively
    if (existing) {
      if (existing.getStatus() === 'downloading') {
        return '';
      }
      if (existing.getStatus() === 'paused') {
        this.states[modelId] = {
          ...this.states[modelId],
          status: 'downloading',
          updatedAt: Date.now(),
        };
        this.notify();
        try {
          activateKeepAwakeAsync('chiwiwi_model_download').catch(() => {});
        } catch {}

        try {
          const finalUri = await existing.resume();
          this.activeDownloaders.delete(modelId);
          if (this.activeDownloaders.size === 0) {
            try { deactivateKeepAwake('chiwiwi_model_download'); } catch {}
          }
          await this.syncToCustomVault(spec.filename, finalUri);
          this.states[modelId] = {
            modelId,
            filename: spec.filename,
            status: 'completed',
            progress: 100,
            speedMbPerSec: 0,
            downloadedMb: this.states[modelId]?.totalMb || targetTotalMb,
            totalMb: this.states[modelId]?.totalMb || targetTotalMb,
            updatedAt: Date.now(),
          };
          this.notify();
          return finalUri;
        } catch (err: any) {
          if (existing.getStatus() !== 'paused') {
            this.activeDownloaders.delete(modelId);
            if (this.activeDownloaders.size === 0) {
              try { deactivateKeepAwake('chiwiwi_model_download'); } catch {}
            }
            this.states[modelId] = {
              modelId,
              filename: spec.filename,
              status: 'error',
              progress: this.states[modelId]?.progress || 0,
              speedMbPerSec: 0,
              downloadedMb: this.states[modelId]?.downloadedMb || 0,
              totalMb: targetTotalMb,
              error: err?.message || 'Download interrupted',
              updatedAt: Date.now(),
            };
            this.notify();
          }
          throw err;
        }
      }
    }

    this.states[modelId] = {
      modelId,
      filename: spec.filename,
      status: 'downloading',
      progress: this.states[modelId]?.progress || 0,
      speedMbPerSec: 0,
      downloadedMb: this.states[modelId]?.downloadedMb || 0,
      totalMb: targetTotalMb,
      updatedAt: Date.now(),
    };
    this.notify();

    const downloader = new HFModelDownloader({
      repoId: spec.repo,
      filename: spec.filename,
      targetFilename: spec.filename,
      destinationDir: modelsDir,
      onProgress: (p: HFDownloadProgress) => {
        const progPercent = Math.min(100, Math.round(p.progress * 100));
        const downloadedMb = Math.round((p.bytesWritten / (1024 * 1024)) * 10) / 10;
        const totalMb = p.totalBytes > 0
          ? Math.round((p.totalBytes / (1024 * 1024)) * 10) / 10
          : targetTotalMb;

        this.states[modelId] = {
          modelId,
          filename: spec.filename,
          status: p.status,
          progress: progPercent,
          speedMbPerSec: p.speedMBs,
          downloadedMb,
          totalMb,
          updatedAt: Date.now(),
        };
        this.notify();
      },
      onStatusChange: (status: DownloadStatus) => {
        if (this.states[modelId]) {
          this.states[modelId].status = status;
          this.notify();
        }
      },
    });

    this.activeDownloaders.set(modelId, downloader);
    try {
      activateKeepAwakeAsync('chiwiwi_model_download').catch(() => {});
    } catch {}

    try {
      const finalUri = await downloader.start();
      this.activeDownloaders.delete(modelId);
      if (this.activeDownloaders.size === 0) {
        try { deactivateKeepAwake('chiwiwi_model_download'); } catch {}
      }

      await this.syncToCustomVault(spec.filename, finalUri);

      this.states[modelId] = {
        modelId,
        filename: spec.filename,
        status: 'completed',
        progress: 100,
        speedMbPerSec: 0,
        downloadedMb: this.states[modelId]?.totalMb || targetTotalMb,
        totalMb: this.states[modelId]?.totalMb || targetTotalMb,
        updatedAt: Date.now(),
      };
      this.notify();
      return finalUri;
    } catch (err: any) {
      if (downloader.getStatus() !== 'paused') {
        this.activeDownloaders.delete(modelId);
        if (this.activeDownloaders.size === 0) {
          try { deactivateKeepAwake('chiwiwi_model_download'); } catch {}
        }
        this.states[modelId] = {
          modelId,
          filename: spec.filename,
          status: 'error',
          progress: this.states[modelId]?.progress || 0,
          speedMbPerSec: 0,
          downloadedMb: this.states[modelId]?.downloadedMb || 0,
          totalMb: targetTotalMb,
          error: err?.message || 'Download interrupted',
          updatedAt: Date.now(),
        };
        this.notify();
      }
      throw err;
    }
  }

  /**
   * Sync completed model into user-configured custom storage vault.
   */
  private async syncToCustomVault(filename: string, sourceUri: string): Promise<void> {
    try {
      const config = await StorageConfigService.getConfig();
      if (config.isConfigured && config.modelsUri) {
        const customModelsDir = new Directory(config.modelsUri);
        const internalDir = HFModelDownloader.modelsDirectory;
        if (customModelsDir.exists && customModelsDir.uri !== internalDir.uri) {
          const destInCustom = new File(customModelsDir, filename);
          const sourceFile = new File(sourceUri);
          if (sourceFile.exists && !destInCustom.exists) {
            await sourceFile.copy(destInCustom);
          }
        }
      }
    } catch {}
  }

  /**
   * Pause active download safely without losing in-memory resume state.
   */
  public async pauseDownload(modelId: string): Promise<void> {
    const downloader = this.activeDownloaders.get(modelId);
    if (downloader) {
      await downloader.pause();
      // Keep downloader in activeDownloaders so resumeAsync() works without recreating task
      if (this.activeDownloaders.size === 0) {
        try { deactivateKeepAwake('chiwiwi_model_download'); } catch {}
      }
    }
    if (this.states[modelId]) {
      this.states[modelId].status = 'paused';
      this.states[modelId].speedMbPerSec = 0;
      this.notify();
    }
  }

  /**
   * Cancel and discard partial file.
   */
  public async cancelDownload(modelId: string): Promise<void> {
    const downloader = this.activeDownloaders.get(modelId);
    if (downloader) {
      await downloader.cancel(true);
      this.activeDownloaders.delete(modelId);
      if (this.activeDownloaders.size === 0) {
        try { deactivateKeepAwake('chiwiwi_model_download'); } catch {}
      }
    }
    delete this.states[modelId];
    this.notify();
  }

  /**
   * Pause all active downloads.
   */
  public async pauseAll(): Promise<void> {
    for (const [id, downloader] of this.activeDownloaders.entries()) {
      try {
        await downloader.pause();
      } catch {}
      if (this.states[id]) {
        this.states[id].status = 'paused';
        this.states[id].speedMbPerSec = 0;
      }
    }
    try { deactivateKeepAwake('chiwiwi_model_download'); } catch {}
    this.notify();
  }

  /**
   * Resume all paused downloads.
   */
  public async resumeAll(): Promise<void> {
    for (const [id, state] of Object.entries(this.states)) {
      if (state.status === 'paused') {
        const spec = S23_MODEL_DATABASE.find(m => m.id === id);
        if (spec) {
          this.startDownload(spec).catch(() => {});
        }
      }
    }
  }

  /**
   * Remove completed download items from queue state.
   */
  public clearCompleted(): void {
    let changed = false;
    for (const [id, state] of Object.entries(this.states)) {
      if (state.status === 'completed') {
        delete this.states[id];
        changed = true;
      }
    }
    if (changed) {
      this.notify();
    }
  }

  /**
   * Count how many downloads are actively running or connecting.
   */
  public getActiveCount(): number {
    return Object.values(this.states).filter(
      s => s.status === 'downloading' || s.status === 'resolving' || s.status === 'verifying'
    ).length;
  }
}

export const DownloadManager = new SovereignDownloadManager();
