import { Paths } from 'expo-file-system';
import { readWithFallback, writeAtomic } from '../core/atomicFile.ts';
import { directoryIO } from '../services/atomicIo.ts';
import { downloads } from '../services/downloads.ts';

/**
 * How many installs download at the same time (1..4). The manager keeps it in memory only, so the Hub saves it in its
 * own small file and re-applies it the first time a Vault screen opens in a session.
 * ponytail: lives here because Settings v2 has no field for it; move it into settings (and apply it at boot) if wanted.
 */
const FILE = 'chiwiwi_downloads.json';
const io = () => directoryIO(() => Paths.document);
let applied: Promise<void> | null = null;

const parse = (text: string): { concurrency: number } | null => {
  const n = Number((JSON.parse(text) as { concurrency?: unknown }).concurrency);
  return Number.isInteger(n) && n >= 1 && n <= 4 ? { concurrency: n } : null;
};

export function applySavedConcurrency(): Promise<void> {
  applied ??= readWithFallback(io(), FILE, parse)
    .then((p) => {
      if (p) downloads.setConcurrency(p.concurrency);
    })
    .catch(() => undefined);
  return applied;
}

export function saveConcurrency(n: number): void {
  downloads.setConcurrency(n);
  try {
    writeAtomic(io(), FILE, JSON.stringify({ concurrency: n }));
  } catch {
    // A failed save only means the choice resets to 1 at the next launch.
  }
}
