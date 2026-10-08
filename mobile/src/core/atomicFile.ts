/**
 * Crash-safe small-file writes (chats, settings, memory, storage config).
 *
 * A plain overwrite can be cut in half when Android kills the app (low-memory kill, swipe-away, battery pull), leaving
 * a truncated JSON file that parses as garbage and loses the whole file. Since chats are now saved every ~2 s while an
 * answer streams, that window matters. Protocol: write `<name>.tmp` completely, then replace `<name>` by renaming.
 * `readWithFallback` also understands every intermediate state a kill can leave behind:
 *   - only `<name>.tmp` exists (killed between delete and rename) -> the tmp IS the newest complete copy
 *   - `<name>` is truncated/corrupt but `<name>.tmp` is complete -> use the tmp
 *
 * Pure: the file system is injected (services/atomicIo.ts adapts expo-file-system), tested with a fake that "dies" at
 * every step.
 */
export interface FileIO {
  exists(name: string): boolean;
  /** Create or overwrite. */
  write(name: string, text: string): void;
  remove(name: string): void;
  /** Rename inside the same directory; the target must not exist. */
  rename(from: string, to: string): void;
  read(name: string): Promise<string>;
}

export const TMP_SUFFIX = '.tmp';

export function writeAtomic(io: FileIO, name: string, text: string): void {
  const tmp = name + TMP_SUFFIX;
  io.write(tmp, text);
  if (io.exists(name)) io.remove(name);
  io.rename(tmp, name);
}

/** Parse `<name>`, falling back to `<name>.tmp`. Returns null if neither holds something `parse` accepts. */
export async function readWithFallback<T>(io: FileIO, name: string, parse: (text: string) => T | null): Promise<T | null> {
  for (const candidate of [name, name + TMP_SUFFIX]) {
    try {
      if (!io.exists(candidate)) continue;
      const parsed = parse(await io.read(candidate));
      if (parsed !== null) return parsed;
    } catch {
      // truncated / unreadable: try the next copy
    }
  }
  return null;
}

/** Names (without the .tmp suffix) that have a leftover temp copy and no main file: a kill happened mid-replace. */
export function orphanedTemps(names: string[]): string[] {
  const all = new Set(names);
  return names.filter((n) => n.endsWith(TMP_SUFFIX) && !all.has(n.slice(0, -TMP_SUFFIX.length))).map((n) => n.slice(0, -TMP_SUFFIX.length));
}
