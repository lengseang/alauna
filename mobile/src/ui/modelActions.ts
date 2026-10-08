import type { ModelSpec } from '../core/catalog.ts';
import { defaultContext, estimateRamBytes, fitFor } from '../core/fit.ts';
import { formatBytes } from '../core/format.ts';
import { getDeviceProfile } from '../services/device.ts';
import { downloads } from '../services/downloads.ts';
import type { SelfTestResult } from '../core/selfTest.ts';
import { engine, runSelfTest } from '../services/engine.ts';
import { settingsStore, updateSettings } from '../services/settings.ts';
import { showToast } from '../services/toast.ts';
import { confirm } from './confirm';

/**
 * Side effects behind the Models screen buttons. Every one reports back with a toast (never a blocking Alert);
 * only destructive or risky steps ask first.
 */
function context() {
  const device = getDeviceProfile();
  const nCtx = settingsStore.getState().contextOverride ?? defaultContext(device.totalRamBytes);
  return { device, nCtx, fit: (spec: ModelSpec) => fitFor(spec, device.totalRamBytes, nCtx) };
}

export async function startDownload(spec: ModelSpec): Promise<void> {
  const { device, nCtx, fit } = context();
  if (fit(spec) === 'too_heavy') {
    const ok = await confirm(
      'Too heavy for this phone',
      `${spec.name} needs about ${formatBytes(estimateRamBytes(spec, nCtx))} of memory and this phone reports ${device.totalRamBytes ? formatBytes(device.totalRamBytes) : 'unknown'}. It will probably not load. Download anyway?`,
      'Download anyway',
    );
    if (!ok) return;
  }
  const r = await downloads.start(spec);
  if (!r.ok) showToast(r.message);
}

export async function cancelDownload(spec: ModelSpec): Promise<void> {
  if (await confirm('Cancel download?', 'The partly downloaded file will be deleted.', 'Cancel download', true)) await downloads.cancel(spec, true);
}

/**
 * "Test model": load it if needed, ask one fixed question, return what really happened (answer, first-token time,
 * tokens/second, pass/fail with reasons). Returns null if the user declined the "too heavy" warning.
 */
export async function testModel(spec: ModelSpec): Promise<SelfTestResult | null> {
  const heavy = context().fit(spec) === 'too_heavy';
  if (heavy && !(await confirm('Try anyway?', 'This model is likely too big for this phone and Android may close CHIWIWI. Try loading it anyway?', 'Try anyway'))) return null;
  return runSelfTest(spec.id, { force: heavy });
}

/** One plain sentence per test result, shown on the model card. */
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
  if (!(await confirm(`Delete ${spec.name}?`, `This frees ${formatBytes(spec.sizeBytes)}. You can download it again later.`, 'Delete', true))) return;
  if (engine.state.modelId === spec.id) await engine.unmount();
  if (settingsStore.getState().activeModelId === spec.id) updateSettings({ activeModelId: null });
  await downloads.remove(spec);
  showToast(`${spec.name} deleted`);
}
