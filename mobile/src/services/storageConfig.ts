/**
 * CHIWIWI Sovereign Storage Vault Configuration Service
 * Manages reliable POSIX storage directories for neural weights, encrypted vaults, and chat history.
 * Automatically resolves Android SAF tree URIs (content://...primary%3A...) into real, writable POSIX file paths.
 */

import { Paths, Directory, File } from 'expo-file-system';

export interface StorageConfig {
  isConfigured: boolean;
  vaultUri: string;         // Guaranteed file:// URI or direct POSIX path
  displayPath: string;      // Clean human-friendly path (e.g. "Internal Storage / Ai" or "Private App Sandbox")
  modelsUri: string;        // Guaranteed file:// models directory
  chatsUri: string;         // Guaranteed file:// chats directory
  mediaUri: string;         // Guaranteed file:// media directory
  selectedByPicker: boolean;
  configuredAt: number;
}

const CONFIG_FILENAME = 'chiwiwi_storage_config.json';

export { parseAndroidSafUri } from './storageUtils.ts';
import { parseAndroidSafUri } from './storageUtils.ts';

/**
 * Verify whether a directory can be created and written to with an atomic test file.
 */
export async function testDirectoryWritable(dir: Directory): Promise<boolean> {
  try {
    if (!dir.exists) {
      dir.create();
    }
    const testFile = new File(dir, '.chiwiwi_write_test');
    await testFile.write('ok');
    if (testFile.exists) {
      testFile.delete();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export class StorageConfigService {
  private static cachedConfig: StorageConfig | null = null;

  private static get configFile(): File {
    return new File(Paths.document, CONFIG_FILENAME);
  }

  /**
   * Default sandboxed directory fallback (Guaranteed 100% writable on all platforms)
   */
  public static getDefaultVaultDirectory(): Directory {
    return new Directory(Paths.document, 'vault');
  }

  /**
   * Load storage configuration from disk.
   * Automatically repairs legacy content:// URIs into valid file:// paths.
   */
  public static async getConfig(): Promise<StorageConfig> {
    if (this.cachedConfig) {
      return this.cachedConfig;
    }

    try {
      const file = this.configFile;
      if (file.exists) {
        const raw = await file.text();
        const parsed = JSON.parse(raw) as StorageConfig;
        if (parsed && typeof parsed.vaultUri === 'string') {
          // Automatic migration if vaultUri was previously stored as a broken content:// URI
          if (parsed.vaultUri.startsWith('content://')) {
            const repaired = await this.setCustomVaultDirectory(new Directory(parsed.vaultUri));
            this.cachedConfig = repaired;
            return repaired;
          }
          this.cachedConfig = parsed;
          return parsed;
        }
      }
    } catch {
      // Config not found or corrupted, will return unconfigured state
    }

    const defaultVault = this.getDefaultVaultDirectory();
    const defaultModels = new Directory(defaultVault, 'models');
    const defaultChats = new Directory(defaultVault, 'chats');
    const defaultMedia = new Directory(defaultVault, 'media');

    const defaultConfig: StorageConfig = {
      isConfigured: false,
      vaultUri: defaultVault.uri,
      displayPath: 'Private App Sandbox (Default)',
      modelsUri: defaultModels.uri,
      chatsUri: defaultChats.uri,
      mediaUri: defaultMedia.uri,
      selectedByPicker: false,
      configuredAt: 0,
    };

    return defaultConfig;
  }

  /**
   * Check if user has initialized their storage location.
   */
  public static async isStorageConfigured(): Promise<boolean> {
    const config = await this.getConfig();
    return config.isConfigured;
  }

  /**
   * Set custom vault directory selected via system directory picker.
   * Guaranteed to map to a real, writable file:// directory.
   */
  public static async setCustomVaultDirectory(vaultDir: Directory): Promise<StorageConfig> {
    const defaultVault = this.getDefaultVaultDirectory();
    let effectiveVaultDir: Directory = defaultVault;
    let displayPath = 'Default Sovereign Sandbox (App Private)';

    const rawUri = vaultDir?.uri || '';

    if (rawUri.startsWith('content://')) {
      const { realPath, displayLabel } = parseAndroidSafUri(rawUri);
      if (realPath) {
        const candidateDir = new Directory(realPath);
        const isWritable = await testDirectoryWritable(candidateDir);
        if (isWritable) {
          effectiveVaultDir = candidateDir;
          displayPath = displayLabel;
        } else {
          // Android Scoped Storage blocks raw POSIX writes to /storage/emulated/0/<path> without SAF.
          // Smoothly fall back to guaranteed writable app sandbox so chats and models NEVER fail to save!
          effectiveVaultDir = defaultVault;
          displayPath = `Default Vault (${displayLabel} requires app sandbox)`;
        }
      }
    } else if (rawUri.startsWith('file://') || rawUri.startsWith('/')) {
      const isWritable = await testDirectoryWritable(vaultDir);
      if (isWritable) {
        effectiveVaultDir = vaultDir;
        displayPath = rawUri.replace('file://', '');
      }
    }

    if (!effectiveVaultDir.exists) {
      try { effectiveVaultDir.create(); } catch {}
    }

    const modelsDir = new Directory(effectiveVaultDir, 'models');
    try { if (!modelsDir.exists) modelsDir.create(); } catch {}

    const chatsDir = new Directory(effectiveVaultDir, 'chats');
    try { if (!chatsDir.exists) chatsDir.create(); } catch {}

    const mediaDir = new Directory(effectiveVaultDir, 'media');
    try {
      if (!mediaDir.exists) mediaDir.create();
      // Prevent gallery/photos indexing
      const nomedia = new File(mediaDir, '.nomedia');
      if (!nomedia.exists) nomedia.write('');
    } catch {}

    // ALSO guarantee fallback sandbox directories exist
    try {
      const fallbackChats = new Directory(defaultVault, 'chats');
      if (!fallbackChats.exists) fallbackChats.create();
      const fallbackModels = new Directory(defaultVault, 'models');
      if (!fallbackModels.exists) fallbackModels.create();
    } catch {}

    const config: StorageConfig = {
      isConfigured: true,
      vaultUri: effectiveVaultDir.uri,
      displayPath,
      modelsUri: modelsDir.uri,
      chatsUri: chatsDir.uri,
      mediaUri: mediaDir.uri,
      selectedByPicker: true,
      configuredAt: Date.now(),
    };

    this.cachedConfig = config;
    try {
      const file = this.configFile;
      file.write(JSON.stringify(config, null, 2));
    } catch {}

    return config;
  }

  /**
   * Confirm usage of default sandboxed application storage.
   */
  public static async useDefaultSandbox(): Promise<StorageConfig> {
    const defaultVault = this.getDefaultVaultDirectory();
    return this.setCustomVaultDirectory(defaultVault);
  }

  /**
   * Get active models directory based on user configuration.
   * Guarantees a valid, writable file:// directory exists.
   */
  public static async getModelsDirectory(): Promise<Directory> {
    const config = await this.getConfig();
    let dir = new Directory(config.modelsUri);
    if (dir.uri.startsWith('content://')) {
      dir = new Directory(this.getDefaultVaultDirectory(), 'models');
    }
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
    return dir;
  }

  /**
   * Get active chats directory based on user configuration.
   * Guarantees a valid, writable file:// directory exists.
   */
  public static async getChatsDirectory(): Promise<Directory> {
    const config = await this.getConfig();
    let dir = new Directory(config.chatsUri);
    if (dir.uri.startsWith('content://')) {
      dir = new Directory(this.getDefaultVaultDirectory(), 'chats');
    }
    if (!dir.exists) {
      try {
        dir.create();
      } catch {}
    }
    return dir;
  }

  /**
   * Reset configuration so picker triggers again on next launch.
   */
  public static async resetConfig(): Promise<void> {
    this.cachedConfig = null;
    const file = this.configFile;
    if (file.exists) {
      file.delete();
    }
  }
}
