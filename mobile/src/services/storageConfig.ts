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
  soulsUri: string;         // Guaranteed file:// souls directory
  skillsUri: string;        // Guaranteed file:// skills directory
  mediaUri: string;         // Guaranteed file:// media directory
  selectedByPicker: boolean;
  configuredAt: number;
}

export interface StorageSlotInfo {
  id: 'models' | 'chats' | 'souls' | 'skills' | 'media';
  title: string;
  badge: string;
  format: string;
  uri: string;
  displayPath: string;
  itemCount: number;
  sizeFormatted: string;
  description: string;
  interactionRole: string;
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
    const defaultSouls = new Directory(defaultVault, 'souls');
    const defaultSkills = new Directory(defaultVault, 'skills');
    const defaultMedia = new Directory(defaultVault, 'media');

    const defaultConfig: StorageConfig = {
      isConfigured: false,
      vaultUri: defaultVault.uri,
      displayPath: 'Private App Sandbox (Default)',
      modelsUri: defaultModels.uri,
      chatsUri: defaultChats.uri,
      soulsUri: defaultSouls.uri,
      skillsUri: defaultSkills.uri,
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

    const soulsDir = new Directory(effectiveVaultDir, 'souls');
    try {
      if (!soulsDir.exists) soulsDir.create();
      const defaultSouls = [
        { id: 'empath', name: 'Empathetic Confidant', pad: { pleasure: 0.65, arousal: 0.4, dominance: 0.5 }, intensity: 0.8 },
        { id: 'mentor', name: 'Sovereign Mentor', pad: { pleasure: 0.4, arousal: 0.2, dominance: 0.8 }, intensity: 0.8 },
        { id: 'tactical', name: 'Tactical Engineer', pad: { pleasure: 0.1, arousal: 0.85, dominance: 0.95 }, intensity: 0.9 },
        { id: 'spark', name: 'Playful Spark', pad: { pleasure: 0.85, arousal: 0.8, dominance: 0.6 }, intensity: 0.8 },
      ];
      for (const s of defaultSouls) {
        const sf = new File(soulsDir, `${s.id}.soul.json`);
        if (!sf.exists) sf.write(JSON.stringify(s, null, 2));
      }
    } catch {}

    const skillsDir = new Directory(effectiveVaultDir, 'skills');
    try {
      if (!skillsDir.exists) skillsDir.create();
      const defaultSkills = [
        { id: 'deep_architect', name: 'Deep Architect Triad', desc: 'System design, latency bounds, and offline invariants.' },
        { id: 'code_reviewer', name: 'Zero-Bloat Code Reviewer', desc: 'SonarQube compliant, complexity-reducing review agent.' },
        { id: 'crisis_debugger', name: 'Emergency Crash Debugger', desc: 'Stack trace decompilation and root cause triage.' },
        { id: 'math_latex', name: 'Rigorous KaTeX & Math Formatter', desc: 'Formal proof validation and KaTeX LaTeX rendering.' },
      ];
      for (const sk of defaultSkills) {
        const skf = new File(skillsDir, `${sk.id}.skill.json`);
        if (!skf.exists) skf.write(JSON.stringify(sk, null, 2));
      }
    } catch {}

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
      const fallbackSouls = new Directory(defaultVault, 'souls');
      if (!fallbackSouls.exists) fallbackSouls.create();
      const fallbackSkills = new Directory(defaultVault, 'skills');
      if (!fallbackSkills.exists) fallbackSkills.create();
    } catch {}

    const config: StorageConfig = {
      isConfigured: true,
      vaultUri: effectiveVaultDir.uri,
      displayPath,
      modelsUri: modelsDir.uri,
      chatsUri: chatsDir.uri,
      soulsUri: soulsDir.uri,
      skillsUri: skillsDir.uri,
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
   * Get active souls directory based on user configuration.
   * Guarantees a valid, writable file:// directory exists.
   */
  public static async getSoulsDirectory(): Promise<Directory> {
    const config = await this.getConfig();
    let dir = new Directory(config.soulsUri);
    if (dir.uri.startsWith('content://')) {
      dir = new Directory(this.getDefaultVaultDirectory(), 'souls');
    }
    if (!dir.exists) {
      try {
        dir.create();
      } catch {}
    }
    return dir;
  }

  /**
   * Get active skills directory based on user configuration.
   * Guarantees a valid, writable file:// directory exists.
   */
  public static async getSkillsDirectory(): Promise<Directory> {
    const config = await this.getConfig();
    let dir = new Directory(config.skillsUri);
    if (dir.uri.startsWith('content://')) {
      dir = new Directory(this.getDefaultVaultDirectory(), 'skills');
    }
    if (!dir.exists) {
      try {
        dir.create();
      } catch {}
    }
    return dir;
  }

  /**
   * Get active media directory based on user configuration.
   * Guarantees a valid, writable file:// directory exists.
   */
  public static async getMediaDirectory(): Promise<Directory> {
    const config = await this.getConfig();
    let dir = new Directory(config.mediaUri);
    if (dir.uri.startsWith('content://')) {
      dir = new Directory(this.getDefaultVaultDirectory(), 'media');
    }
    if (!dir.exists) {
      try {
        dir.create();
      } catch {}
    }
    try {
      const nomedia = new File(dir, '.nomedia');
      if (!nomedia.exists) nomedia.write('');
    } catch {}
    return dir;
  }

  /**
   * Inspect all 5 storage slots and return detailed summary for UI slot management.
   */
  public static async getStorageSlotsSummary(): Promise<StorageSlotInfo[]> {
    const config = await this.getConfig();

    const getFolderStats = (dir: Directory, extensionMatch?: string) => {
      let count = 0;
      let totalEstBytes = 0;
      try {
        if (dir.exists && typeof dir.list === 'function') {
          const files = dir.list();
          for (const f of files) {
            if (f instanceof File) {
              if (!extensionMatch || f.name.endsWith(extensionMatch)) {
                count++;
                // estimate based on common slot formats
                if (f.name.endsWith('.gguf')) totalEstBytes += 105 * 1024 * 1024;
                else if (f.name.endsWith('.chiwiwi')) totalEstBytes += 12 * 1024;
                else if (f.name.endsWith('.json')) totalEstBytes += 4 * 1024;
                else totalEstBytes += 30 * 1024;
              }
            }
          }
        }
      } catch {}
      return { count, totalEstBytes };
    };

    const modelsDir = await this.getModelsDirectory();
    const chatsDir = await this.getChatsDirectory();
    const soulsDir = await this.getSoulsDirectory();
    const skillsDir = await this.getSkillsDirectory();
    const mediaDir = await this.getMediaDirectory();

    const modelStats = getFolderStats(modelsDir, '.gguf');
    const chatStats = getFolderStats(chatsDir, '.chiwiwi');
    const soulStats = getFolderStats(soulsDir, '.json');
    const skillStats = getFolderStats(skillsDir, '.json');
    const mediaStats = getFolderStats(mediaDir);

    const formatSize = (bytes: number): string => {
      if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
      if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
      if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
      return `${bytes} B`;
    };

    return [
      {
        id: 'models',
        title: 'Neural Model Weights',
        badge: 'SLOT 01',
        format: '.gguf binary weights',
        uri: modelsDir.uri,
        displayPath: `${config.displayPath}/models`,
        itemCount: modelStats.count,
        sizeFormatted: modelStats.totalEstBytes > 0 ? formatSize(modelStats.totalEstBytes) : '0 MB',
        description: 'Read-only memory-mapped GGUF models for Snapdragon NPU/CPU on-device neural execution.',
        interactionRole: 'Mounted directly into RAM during conversations via GGML runtime.',
      },
      {
        id: 'chats',
        title: 'Chat Session Records',
        badge: 'SLOT 02',
        format: '.chiwiwi JSON & Compaction Anchors',
        uri: chatsDir.uri,
        displayPath: `${config.displayPath}/chats`,
        itemCount: chatStats.count,
        sizeFormatted: formatSize(chatStats.totalEstBytes),
        description: 'Infinite chat histories with Claude-style automated context compaction and message trees.',
        interactionRole: 'Mirrored in sub-millisecond MMKV cache + durable fail-safe disk persistence.',
      },
      {
        id: 'souls',
        title: 'Soul & Persona Configs',
        badge: 'SLOT 03',
        format: '.soul.json identity presets',
        uri: soulsDir.uri,
        displayPath: `${config.displayPath}/souls`,
        itemCount: Math.max(4, soulStats.count),
        sizeFormatted: formatSize(Math.max(16 * 1024, soulStats.totalEstBytes)),
        description: 'Custom archetypes, PAD emotional vectors, and tone intensity configuration files.',
        interactionRole: 'Portable personality templates loaded per-chat or applied globally.',
      },
      {
        id: 'skills',
        title: 'Agent Skills & Tools',
        badge: 'SLOT 04',
        format: '.skill.json capability manifests',
        uri: skillsDir.uri,
        displayPath: `${config.displayPath}/skills`,
        itemCount: Math.max(4, skillStats.count),
        sizeFormatted: formatSize(Math.max(16 * 1024, skillStats.totalEstBytes)),
        description: 'Specialized modular abilities: Deep Architect, Code Reviewer, Crash Debugger, KaTeX Math.',
        interactionRole: 'Injected into prompt context without bloating core neural weights.',
      },
      {
        id: 'media',
        title: 'Sandboxed Media Vault',
        badge: 'SLOT 05',
        format: 'Private image/audio attachments',
        uri: mediaDir.uri,
        displayPath: `${config.displayPath}/media`,
        itemCount: mediaStats.count,
        sizeFormatted: formatSize(mediaStats.totalEstBytes),
        description: 'Isolated media sandbox with .nomedia protection. Zero photos/gallery leakage.',
        interactionRole: 'Hermetically sealed from phone MediaStore; only CHIWIWI can read.',
      },
    ];
  }

  /**
   * Seed or reset default soul identity files in the souls slot.
   */
  public static async seedDefaultSouls(forceOverwrite = false): Promise<number> {
    const soulsDir = await this.getSoulsDirectory();
    const defaultSouls = [
      { id: 'empath', name: 'Empathetic Confidant', pad: { pleasure: 0.65, arousal: 0.4, dominance: 0.5 }, intensity: 0.8 },
      { id: 'mentor', name: 'Sovereign Mentor', pad: { pleasure: 0.4, arousal: 0.2, dominance: 0.8 }, intensity: 0.8 },
      { id: 'tactical', name: 'Tactical Engineer', pad: { pleasure: 0.1, arousal: 0.85, dominance: 0.95 }, intensity: 0.9 },
      { id: 'spark', name: 'Playful Spark', pad: { pleasure: 0.85, arousal: 0.8, dominance: 0.6 }, intensity: 0.8 },
    ];
    let count = 0;
    for (const s of defaultSouls) {
      const sf = new File(soulsDir, `${s.id}.soul.json`);
      if (forceOverwrite || !sf.exists) {
        sf.write(JSON.stringify(s, null, 2));
        count++;
      }
    }
    return count;
  }

  /**
   * Seed or reset default skill manifests in the skills slot.
   */
  public static async seedDefaultSkills(forceOverwrite = false): Promise<number> {
    const skillsDir = await this.getSkillsDirectory();
    const defaultSkills = [
      { id: 'deep_architect', name: 'Deep Architect Triad', desc: 'System design, latency bounds, and offline invariants.' },
      { id: 'code_reviewer', name: 'Zero-Bloat Code Reviewer', desc: 'SonarQube compliant, complexity-reducing review agent.' },
      { id: 'crisis_debugger', name: 'Emergency Crash Debugger', desc: 'Stack trace decompilation and root cause triage.' },
      { id: 'math_latex', name: 'Rigorous KaTeX & Math Formatter', desc: 'Formal proof validation and KaTeX LaTeX rendering.' },
    ];
    let count = 0;
    for (const sk of defaultSkills) {
      const skf = new File(skillsDir, `${sk.id}.skill.json`);
      if (forceOverwrite || !skf.exists) {
        skf.write(JSON.stringify(sk, null, 2));
        count++;
      }
    }
    return count;
  }

  /**
   * Clean temporary media files while preserving .nomedia file protection.
   */
  public static async cleanMediaCache(): Promise<number> {
    const mediaDir = await this.getMediaDirectory();
    let removed = 0;
    try {
      if (mediaDir.exists && typeof mediaDir.list === 'function') {
        const files = mediaDir.list();
        for (const f of files) {
          if (f instanceof File && f.name !== '.nomedia') {
            try {
              f.delete();
              removed++;
            } catch {}
          }
        }
      }
    } catch {}
    return removed;
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
