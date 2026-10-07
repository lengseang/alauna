/**
 * CHIWIWI Persistent Sovereign Download Manager
 * Global singleton managing in-flight model downloads across app lifecycle,
 * screen transitions, and background execution.
 */

import { File, Directory } from 'expo-file-system';
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

    // Resolve target models directory from sovereign storage config
    const modelsDir = await StorageConfigService.getModelsDirectory();

    const parseSizeToMb = (sizeStr: string): number => {
      const num = parseFloat(sizeStr);
      if (sizeStr.includes('GB')) return Math.round(num * 1024);
      return Math.round(num);
    };

    const targetTotalMb = parseSizeToMb(spec.sizeFormatted);

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

      // Sync into user-configured custom vault directory if mapped
      try {
        const config = await StorageConfigService.getConfig();
        if (config.isConfigured && config.modelsUri) {
          const customModelsDir = new Directory(config.modelsUri);
          if (customModelsDir.exists && customModelsDir.uri !== modelsDir.uri) {
            const destInCustom = new File(customModelsDir, spec.filename);
            const sourceFile = new File(finalUri);
            if (sourceFile.exists && !destInCustom.exists) {
              await sourceFile.copy(destInCustom);
            }
          }
        }
      } catch {}

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
      this.activeDownloaders.delete(modelId);
      if (this.activeDownloaders.size === 0) {
        try { deactivateKeepAwake('chiwiwi_model_download'); } catch {}
      }
      if (this.states[modelId]?.status !== 'paused') {
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
   * Pause active download safely.
   */
  public async pauseDownload(modelId: string): Promise<void> {
    const downloader = this.activeDownloaders.get(modelId);
    if (downloader) {
      await downloader.pause();
      this.activeDownloaders.delete(modelId);
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
      await downloader.cancel();
      this.activeDownloaders.delete(modelId);
      if (this.activeDownloaders.size === 0) {
        try { deactivateKeepAwake('chiwiwi_model_download'); } catch {}
      }
    }
    delete this.states[modelId];
    this.notify();
  }
}

export const DownloadManager = new SovereignDownloadManager();
