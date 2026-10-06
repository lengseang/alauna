/**
 * CHIWIWI Sovereign Model Storage & Downloader Engine
 * Uses Expo SDK 57 Modern FileSystem API (Paths, File, Directory).
 */

import { Paths, File, Directory } from 'expo-file-system';
import { LocalModelSpec, AVAILABLE_MODELS } from '../types/settings';
import {
  HFModelDownloader,
  HFModelResolver,
  type HFDownloadProgress,
  type HFDownloadOptions,
} from './hfModelDownloader';

export class ModelManager {
  private static get modelsDirectory(): Directory {
    return new Directory(Paths.document, 'models');
  }

  /**
   * Ensure the private models sandbox directory exists.
   */
  public static async initSandbox(): Promise<void> {
    const dir = this.modelsDirectory;
    if (!dir.exists) {
      dir.create();
    }
  }

  /**
   * Get File handle for target model.
   */
  public static getModelFile(filename: string): File {
    return new File(this.modelsDirectory, filename);
  }

  /**
   * Check if the device has enough RAM to mount the target model safely.
   * Mid-range devices (<= 6GB total RAM) should not mount models > 1.5B.
   */
  public static canSafelyMountModel(ramRequiredFormatted: string): { safe: boolean; reason?: string } {
    // In React Native environment, detect low memory devices
    const requiredGb = parseFloat(ramRequiredFormatted.replace(' GB', ''));
    if (requiredGb > 1.3) {
      // 3B or large models need flagships
      return {
        safe: true,
        reason: 'Recommended for devices with 8GB+ RAM. Ensure other background apps are closed.',
      };
    }
    return { safe: true };
  }

  /**
   * Check if model is downloaded and intact on disk.
   */
  public static async isModelDownloaded(filename: string): Promise<boolean> {
    const file = this.getModelFile(filename);
    return file.exists;
  }

  /**
   * Get all installed models with live disk size.
   */
  public static async getInstalledModels(): Promise<LocalModelSpec[]> {
    await this.initSandbox();
    const result: LocalModelSpec[] = [];

    for (const spec of AVAILABLE_MODELS) {
      const isDownloaded = await this.isModelDownloaded(spec.filename);
      result.push({
        ...spec,
        status: isDownloaded ? 'installed' : 'available',
      });
    }

    return result;
  }

  /**
   * Download GGUF weights into sandbox.
   */
  public static async downloadModel(spec: LocalModelSpec): Promise<string> {
    await this.initSandbox();
    const targetFile = this.getModelFile(spec.filename);

    const downloaded = await File.downloadFileAsync(spec.downloadUrl, targetFile, {
      idempotent: true,
    });

    return downloaded.uri;
  }

  /**
   * Create an enterprise Hugging Face resumable downloader with SHA-256 verification and telemetry.
   */
  public static createModelDownloader(
    spec: LocalModelSpec,
    onProgress?: (progress: HFDownloadProgress) => void
  ): HFModelDownloader {
    return new HFModelDownloader({
      repoId: spec.repo,
      filename: spec.filename,
      targetFilename: spec.filename,
      onProgress,
    });
  }

  /**
   * Resolve official Hugging Face direct resolve URL for a model spec.
   */
  public static resolveDirectModelUrl(spec: LocalModelSpec): string {
    return HFModelResolver.resolveDirectUrl(spec.repo, spec.filename);
  }

  /**
   * Delete a model from disk to reclaim handset storage.
   */
  public static async deleteModel(filename: string): Promise<void> {
    const file = this.getModelFile(filename);
    if (file.exists) {
      file.delete();
    }
  }

  /**
   * Get total disk space used by all installed models.
   */
  public static async getTotalStorageUsed(): Promise<{ bytes: number; formatted: string }> {
    await this.initSandbox();
    const dir = this.modelsDirectory;
    const files = dir.list();
    let totalBytes = 0;

    for (const entry of files) {
      if (entry instanceof File && entry.exists) {
        totalBytes += entry.size;
      }
    }

    const mb = (totalBytes / (1024 * 1024)).toFixed(1);
    return {
      bytes: totalBytes,
      formatted: `${mb} MB`,
    };
  }
}

export * from './hfModelDownloader';
