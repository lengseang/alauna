/**
 * CHIWIWI Sovereign Storage Vault Configuration Service
 * Manages user-selected storage directory for neural weights, encrypted vaults, and chat history.
 */

import { Paths, Directory, File } from 'expo-file-system';

export interface StorageConfig {
  isConfigured: boolean;
  vaultUri: string;
  modelsUri: string;
  chatsUri: string;
  mediaUri: string;
  selectedByPicker: boolean;
  configuredAt: number;
}

const CONFIG_FILENAME = 'chiwiwi_storage_config.json';

export class StorageConfigService {
  private static cachedConfig: StorageConfig | null = null;

  private static get configFile(): File {
    return new File(Paths.document, CONFIG_FILENAME);
  }

  /**
   * Default sandboxed directory fallback
   */
  public static getDefaultVaultDirectory(): Directory {
    return new Directory(Paths.document, 'vault');
  }

  /**
   * Load storage configuration from disk.
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
   */
  public static async setCustomVaultDirectory(vaultDir: Directory): Promise<StorageConfig> {
    if (!vaultDir.exists) {
      try {
        vaultDir.create();
      } catch {}
    }

    // Note: Expo FileSystem DownloadTask and llama.rn require standard file:// POSIX paths.
    // External SAF directories (content://) cannot be directly written to by native C++ mmap or download tasks.
    // If the picked directory is a SAF content:// URI, we store models in the reliable private file:// sandbox
    // while keeping chats, media, and metadata in the user vault.
    const isSafUri = vaultDir.uri.startsWith('content://');
    const defaultVault = this.getDefaultVaultDirectory();
    const modelsDir = isSafUri
      ? new Directory(defaultVault, 'models')
      : new Directory(vaultDir, 'models');

    try {
      if (!modelsDir.exists) modelsDir.create();
    } catch {}

    const chatsDir = new Directory(vaultDir, 'chats');
    try {
      if (!chatsDir.exists) chatsDir.create();
    } catch {}

    const mediaDir = new Directory(vaultDir, 'media');
    try {
      if (!mediaDir.exists) mediaDir.create();
      // Prevent gallery/photos indexing
      const nomedia = new File(mediaDir, '.nomedia');
      if (!nomedia.exists) nomedia.write('');
    } catch {}

    const config: StorageConfig = {
      isConfigured: true,
      vaultUri: vaultDir.uri,
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
    // If modelsUri is somehow a content:// URI, fallback to private sandbox models directory
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
   */
  public static async getChatsDirectory(): Promise<Directory> {
    const config = await this.getConfig();
    const dir = new Directory(config.chatsUri);
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
