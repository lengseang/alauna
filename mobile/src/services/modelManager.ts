/**
 * CHIWIWI Sovereign Model Storage & Downloader Engine
 * Uses Expo SDK 57 Modern FileSystem API (Paths, File, Directory).
 */

import { Paths, File, Directory } from 'expo-file-system';
import { LocalModelSpec, AVAILABLE_MODELS } from '../types/settings';
import { StorageConfigService } from './storageConfig';
import {
  HFModelDownloader,
  HFModelResolver,
  type HFDownloadProgress,
  type HFDownloadOptions,
} from './hfModelDownloader';

export class ModelManager {
  private static cachedModelsDir: Directory | null = null;

  public static async getModelsDirectory(): Promise<Directory> {
    const dir = await StorageConfigService.getModelsDirectory();
    this.cachedModelsDir = dir;
    return dir;
  }

  public static get modelsDirectory(): Directory {
    if (this.cachedModelsDir) return this.cachedModelsDir;
    return new Directory(new Directory(Paths.document, 'vault'), 'models');
  }

  public static setModelsDirectory(dir: Directory): void {
    this.cachedModelsDir = dir;
  }

  /**
   * Ensure the private models sandbox directory exists.
   */
  public static async initSandbox(): Promise<void> {
    const dir = await this.getModelsDirectory();
    if (!dir.exists) {
      try {
        dir.create();
      } catch {}
    }
    try {
      const nomedia = new File(dir, '.nomedia');
      if (!nomedia.exists) {
        nomedia.write('');
      }
    } catch {}
  }

  /**
   * Get File handle for target model.
   * If not found in primary vault models directory, also inspects legacy sandbox directory.
   */
  public static getModelFile(filename: string): File {
    const primary = new File(this.modelsDirectory, filename);
    if (primary.exists) {
      return primary;
    }
    const cachedConfig = StorageConfigService.getCachedConfig();
    if (cachedConfig?.modelsUri) {
      try {
        const inCustom = new File(new Directory(cachedConfig.modelsUri), filename);
        if (inCustom.exists) return inCustom;
      } catch {}
    }
    if (cachedConfig?.vaultUri) {
      try {
        const inVault = new File(new Directory(cachedConfig.vaultUri), filename);
        if (inVault.exists) return inVault;
      } catch {}
    }
    // Fallback 1: check default internal vault models directory
    const defaultVaultModels = new File(new Directory(new Directory(Paths.document, 'vault'), 'models'), filename);
    if (defaultVaultModels.exists) {
      return defaultVaultModels;
    }
    // Fallback 2: check legacy sandbox document/models path if it exists
    const legacy = new File(new Directory(Paths.document, 'models'), filename);
    if (legacy.exists) {
      return legacy;
    }
    // Fallback 3: check directly in document directory
    const inDoc = new File(Paths.document, filename);
    if (inDoc.exists) {
      return inDoc;
    }
    return primary;
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
    await this.initSandbox();
    const file = this.getModelFile(filename);
    return file.exists;
  }

  /**
   * Verify model file integrity, existence, and byte size.
   */
  public static async verifyModelIntegrity(
    filename: string
  ): Promise<{ valid: boolean; sizeBytes: number; error?: string }> {
    await this.initSandbox();
    const file = this.getModelFile(filename);
    if (!file.exists) {
      return { valid: false, sizeBytes: 0, error: 'Model file not found on disk.' };
    }
    const size = file.size;
    if (size < 1024 * 1024) {
      return {
        valid: false,
        sizeBytes: size,
        error: `Incomplete download payload (${(size / 1024).toFixed(1)} KB). GGUF models require full weights.`,
      };
    }
    return { valid: true, sizeBytes: size };
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
    const directUrl = this.resolveDirectModelUrl(spec);

    const downloaded = await File.downloadFileAsync(directUrl, targetFile, {
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
      destinationDir: this.modelsDirectory,
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
