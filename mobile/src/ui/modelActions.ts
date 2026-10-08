import { File } from 'expo-file-system';
import { MODEL_CATALOG, type ModelSpec } from '../core/catalog.ts';
import type { InstallOptions } from '../core/downloadManager.ts';
import { defaultContext } from '../core/fit.ts';
import { formatBytes } from '../core/format.ts';
import type { ModelAction } from '../core/modelStatus.ts';
import { pathToUri } from '../core/paths.ts';
import type { SelfTestResult } from '../core/selfTest.ts';
import { getDeviceProfile } from '../services/device.ts';
import { downloads, refreshDownloads } from '../services/downloads.ts';
import { engine, runSelfTest } from '../services/engine.ts';
import { companionPath, installedBytes } from '../services/modelLibrary.ts';
import { settingsStore, updateSettings } from '../services/settings.ts';
import { moveModel, type MoveModelOptions } from '../services/storageSlots.ts';
import { showToast } from '../services/toast.ts';
import { confirm } from './confirm';
import { resetTo } from './nav';
import { fitVerdict } from './vaultLogic';

/**
 * Side effects behind the Vault buttons. Every one reports back with a toast (never a blocking Alert);
 * only destructive or risky steps ask first.
 */
function context() {
  const device = getDeviceProfile();
  const nCtx = settingsStore.getState().compute.nCtx ?? defaultContext(device.totalRamBytes);
  return { device, nCtx, rating: (spec: ModelSpec) => fitVerdict(spec, device.totalRamBytes, nCtx) };
}

/** Start or queue a download (model + its image add-on by default). Warns first when the model is too big for this phone. */
export async function startDownload(spec: ModelSpec, opts?: InstallOptions): Promise<void> {
  const { device, rating } = context();
  const fit = rating(spec);
  if (fit.rating === 'too_heavy') {
    const ok = await confirm(
      'Too heavy for this phone',
      `${spec.name} needs about ${formatBytes(fit.ramBytes)} of memory and this phone reports ${device.totalRamBytes ? formatBytes(device.totalRamBytes) : 'unknown'}. It will probably not load. Download anyway?`,
      'Download anyway',
    );
    if (!ok) return;
  }
  const r = await downloads.start(spec, opts);
  if (!r.ok) showToast(r.message);
}

/** Continue a paused or failed download from the bytes already on the phone (no size warning: it was accepted before). */
export async function resumeDownload(spec: ModelSpec): Promise<void> {
  const r = await downloads.start(spec);
  if (!r.ok) showToast(r.message);
}

export const pauseDownload = (spec: ModelSpec): Promise<void> => downloads.pause(spec.id);

export async function cancelDownload(spec: ModelSpec): Promise<void> {
  if (await confirm('Cancel download?', 'The partly downloaded file will be deleted.', 'Cancel download', true)) await downloads.cancel(spec, true);
}

/** Load a model into memory (replacing the current one). Reports the real reason when it fails. */
export async function loadModel(spec: ModelSpec): Promise<void> {
  const heavy = context().rating(spec).rating === 'too_heavy';
  if (heavy && !(await confirm('Try anyway?', 'This model is likely too big for this phone and Android may close CHIWIWI. Try loading it anyway?', 'Try anyway'))) return;
  const r = await engine.mount(spec, { force: heavy });
  if (!r.ok) showToast(`${r.message} ${r.fix ?? ''}`.trim(), 6000);
}

/**
 * "Test model": load it if needed, ask one fixed question, return what really happened (answer, first-token time,
 * tokens/second, pass/fail with reasons). Returns null if the user declined the "too heavy" warning.
 */
export async function testModel(spec: ModelSpec): Promise<SelfTestResult | null> {
  const heavy = context().rating(spec).rating === 'too_heavy';
  if (heavy && !(await confirm('Try anyway?', 'This model is likely too big for this phone and Android may close CHIWIWI. Try loading it anyway?', 'Try anyway'))) return null;
  return runSelfTest(spec.id, { force: heavy });
}

/** One plain sentence per test result, shown on the model's detail screen. */
export function describeTest(r: SelfTestResult): { ok: boolean; text: string } {
  if (!r.ok) return { ok: false, text: `${r.reasons.join(' ')} ${r.fix ?? ''}`.trim() };
  const bits = [`It answered "${r.text.slice(0, 30)}"`];
  if (r.ttftMs) bits.push(`first token in ${(r.ttftMs / 1000).toFixed(1)}s`);
  if (r.tokPerSec) bits.push(`${r.tokPerSec.toFixed(1)} tok/s`);
  if (r.loadMs) bits.push(`loaded in ${(r.loadMs / 1000).toFixed(1)}s`);
  if (r.backend) bits.push(r.backend.startsWith('GPU') ? 'GPU' : 'CPU');
  return { ok: true, text: `Works. ${bits.join(' · ')}.${r.warnings.length ? ` ${r.warnings.join(' ')}` : ''}` };
}

export async function unloadModel(): Promise<void> {
  await engine.unmount();
  showToast('Model unloaded from memory');
}

export async function deleteModel(spec: ModelSpec): Promise<void> {
  const bytes = installedBytes([spec]);
  if (!(await confirm(`Delete ${spec.name}?`, `This frees ${formatBytes(bytes || spec.sizeBytes)}. You can download it again later.`, 'Delete', true))) return;
  if (engine.state.modelId === spec.id) await engine.unmount();
  if (settingsStore.getState().activeModelId === spec.id) updateSettings({ activeModelId: null });
  await downloads.remove(spec);
  showToast(`${spec.name} deleted`);
}

/** The single button a row or card shows for its state (see rowState in vaultLogic). */
export async function runModelAction(spec: ModelSpec, action: ModelAction): Promise<void> {
  switch (action) {
    case 'download':
      return startDownload(spec);
    case 'pause':
      return pauseDownload(spec);
    case 'resume':
    case 'retry':
      return resumeDownload(spec);
    case 'cancel':
      return cancelDownload(spec);
    case 'load':
      return loadModel(spec);
    case 'unload':
      return unloadModel();
    case 'start_chat':
      return resetTo('chat');
    case 'delete':
      return deleteModel(spec);
    case 'verify_checksum':
      return;
  }
}

// -------------------------------------------------------------------- add-ons (image projector, speed-up head)

/** Other installed models that use the same projector file (a shared add-on must not be removed under them). */
export function addonSharedWith(spec: ModelSpec, kind: 'mmproj' | 'draft'): ModelSpec[] {
  const mine = kind === 'mmproj' ? spec.mmproj : spec.draft;
  if (!mine) return [];
  return MODEL_CATALOG.filter((m) => {
    const theirs = kind === 'mmproj' ? m.mmproj : m.draft;
    return m.id !== spec.id && !!theirs && theirs.repo === mine.repo && theirs.filename === mine.filename && downloads.store.getState().items[m.id]?.status === 'completed';
  });
}

/** Download only the add-on an installed model is missing. */
export async function addAddon(spec: ModelSpec, kind: 'mmproj' | 'draft'): Promise<void> {
  const r = await downloads.start(spec, { vision: kind === 'mmproj', draft: kind === 'draft' });
  if (!r.ok) showToast(r.message);
}

/** Remove one add-on file (after asking). The model itself stays. Refuses while another installed model uses the same file. */
export async function removeAddon(spec: ModelSpec, kind: 'mmproj' | 'draft'): Promise<boolean> {
  const label = kind === 'mmproj' ? 'image add-on' : 'speed-up head';
  const shared = addonSharedWith(spec, kind);
  if (shared.length > 0) {
    showToast(`The ${label} is also used by ${shared.map((m) => m.name).join(', ')}. Delete those first.`, 5000);
    return false;
  }
  const path = companionPath(spec, kind);
  if (!path) return false;
  const size = (kind === 'mmproj' ? spec.mmproj : spec.draft)?.sizeBytes ?? 0;
  const ok = await confirm(
    `Remove the ${label}?`,
    kind === 'mmproj' ? `${spec.name} will stop reading images. This frees ${formatBytes(size)}; you can add it again later.` : `Speculative decoding with ${spec.name} stops working. This frees ${formatBytes(size)}.`,
    'Remove',
    true,
  );
  if (!ok) return false;
  try {
    new File(pathToUri(path)).delete();
  } catch (e) {
    showToast(`Could not remove it: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
  refreshDownloads();
  showToast(engine.state.modelId === spec.id ? `${label} removed. It stops being used when the model is loaded again.` : `${label} removed`, 4000);
  return true;
}

/** Move a model and its add-ons to another storage slot (copy, verify, then delete the original). */
export const moveToSlot = (spec: ModelSpec, slotId: string, opts: MoveModelOptions) => moveModel(spec, slotId, opts);
