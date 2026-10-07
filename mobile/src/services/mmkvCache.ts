/**
 * CHIWIWI Sovereign MMKV Memory Cache Layer
 * Provides sub-millisecond, synchronous, C++ Nitro backed caching for:
 * - Thread index and metadata
 * - Active thread state
 * - Soul PAD vectors and personality anchors
 * - Episodic relationship memory
 * - Hardware performance benchmarks
 * 
 * Includes automatic in-memory fallback for headless test runners and node CLI.
 */

export interface FastStorage {
  getString(key: string): string | undefined;
  setString(key: string, value: string): void;
  getNumber(key: string): number | undefined;
  setNumber(key: string, value: number): void;
  getBoolean(key: string): boolean | undefined;
  setBoolean(key: string, value: boolean): void;
  delete(key: string): void;
  contains(key: string): boolean;
  clearAll(): void;
  getAllKeys(): string[];
  setObject<T>(key: string, value: T): void;
  getObject<T>(key: string): T | null;
}

class InMemoryStorage implements FastStorage {
  private map = new Map<string, string | number | boolean>();

  getString(key: string): string | undefined {
    const val = this.map.get(key);
    return typeof val === 'string' ? val : undefined;
  }

  setString(key: string, value: string): void {
    this.map.set(key, value);
  }

  getNumber(key: string): number | undefined {
    const val = this.map.get(key);
    return typeof val === 'number' ? val : undefined;
  }

  setNumber(key: string, value: number): void {
    this.map.set(key, value);
  }

  getBoolean(key: string): boolean | undefined {
    const val = this.map.get(key);
    return typeof val === 'boolean' ? val : undefined;
  }

  setBoolean(key: string, value: boolean): void {
    this.map.set(key, value);
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  contains(key: string): boolean {
    return this.map.has(key);
  }

  clearAll(): void {
    this.map.clear();
  }

  getAllKeys(): string[] {
    return Array.from(this.map.keys());
  }

  setObject<T>(key: string, value: T): void {
    this.map.set(key, JSON.stringify(value));
  }

  getObject<T>(key: string): T | null {
    const str = this.getString(key);
    if (!str) return null;
    try {
      return JSON.parse(str) as T;
    } catch {
      return null;
    }
  }
}

class NativeMmkvWrapper implements FastStorage {
  private mmkv: any;

  constructor(mmkvInstance: any) {
    this.mmkv = mmkvInstance;
  }

  getString(key: string): string | undefined {
    try {
      const val = this.mmkv.getString(key);
      return val ?? undefined;
    } catch {
      return undefined;
    }
  }

  setString(key: string, value: string): void {
    try {
      this.mmkv.set(key, value);
    } catch {}
  }

  getNumber(key: string): number | undefined {
    try {
      const val = this.mmkv.getNumber(key);
      return typeof val === 'number' ? val : undefined;
    } catch {
      return undefined;
    }
  }

  setNumber(key: string, value: number): void {
    try {
      this.mmkv.set(key, value);
    } catch {}
  }

  getBoolean(key: string): boolean | undefined {
    try {
      const val = this.mmkv.getBoolean(key);
      return typeof val === 'boolean' ? val : undefined;
    } catch {
      return undefined;
    }
  }

  setBoolean(key: string, value: boolean): void {
    try {
      this.mmkv.set(key, value);
    } catch {}
  }

  delete(key: string): void {
    try {
      this.mmkv.delete(key);
    } catch {}
  }

  contains(key: string): boolean {
    try {
      return Boolean(this.mmkv.contains(key));
    } catch {
      return false;
    }
  }

  clearAll(): void {
    try {
      this.mmkv.clearAll();
    } catch {}
  }

  getAllKeys(): string[] {
    try {
      return this.mmkv.getAllKeys() || [];
    } catch {
      return [];
    }
  }

  setObject<T>(key: string, value: T): void {
    this.setString(key, JSON.stringify(value));
  }

  getObject<T>(key: string): T | null {
    const str = this.getString(key);
    if (!str) return null;
    try {
      return JSON.parse(str) as T;
    } catch {
      return null;
    }
  }
}

// Factory initialization with try-catch
let instance: FastStorage;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createMMKV } = require('react-native-mmkv');
  if (typeof createMMKV === 'function') {
    const nativeInstance = createMMKV({ id: 'chiwiwi.sovereign.vault' });
    instance = new NativeMmkvWrapper(nativeInstance);
  } else {
    instance = new InMemoryStorage();
  }
} catch {
  // Pure Node.js / unit tests / fallback
  instance = new InMemoryStorage();
}

export const MMKVCache: FastStorage = instance;

export const CACHE_KEYS = {
  ACTIVE_THREAD_ID: 'chiwiwi_active_thread_id',
  THREADS_INDEX: 'chiwiwi_threads_index',
  THREAD_PREFIX: 'chiwiwi_thread_',
  ACTIVE_MODEL_ID: 'chiwiwi_active_model_id',
  GLOBAL_ARCHETYPE: 'chiwiwi_global_archetype',
  GLOBAL_PAD: 'chiwiwi_global_pad',
  GLOBAL_TONE_INTENSITY: 'chiwiwi_global_tone_intensity',
  EPISODIC_MEMORIES: 'chiwiwi_episodic_memories',
  HARDWARE_PROFILE: 'chiwiwi_hardware_profile',
} as const;
