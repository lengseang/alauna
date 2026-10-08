/** expo-file-system adapter for core/atomicFile.ts: one directory, files addressed by name. */
import { Directory, File } from 'expo-file-system';
import type { FileIO } from '../core/atomicFile.ts';

export function directoryIO(dir: () => Directory): FileIO {
  const f = (name: string) => new File(dir(), name);
  return {
    exists: (name) => f(name).exists,
    write(name, text) {
      const file = f(name);
      if (!file.exists) file.create({ intermediates: true });
      file.write(text);
    },
    remove(name) {
      const file = f(name);
      if (file.exists) file.delete();
    },
    rename: (from, to) => f(from).rename(to),
    read: (name) => f(name).text(),
  };
}
