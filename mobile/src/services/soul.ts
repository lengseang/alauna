/**
 * Soul: the global persona (Settings) + per-chat override (chat.ts updateThreadSoul / clearThreadSoul), the PAD ->
 * sampling mapping a chat really uses, and a live preview written by the loaded model.
 */
import type { ThreadSoul } from '../core/chatTypes.ts';
import { ARCHETYPES, clampPad, describePad, padToSampling, type PADVector, type SoulArchetypeKey } from '../core/persona.ts';
import type { SamplingSettings, Settings } from '../core/settingsModel.ts';
import { runSoulPreview, type SoulPreviewResult } from '../core/soulPreview.ts';
import { LEGACY_ARCHETYPE_TO_SOUL_ID } from '../core/builtInSouls.ts';
import { engine } from './engine.ts';
import { settingsStore, updateSettings } from './settings.ts';

export type { SoulPreviewResult } from '../core/soulPreview.ts';

/** The global soul as a ThreadSoul (what new chats follow). */
export function globalSoul(s: Pick<Settings, 'archetype' | 'pad' | 'toneIntensity' | 'customBackstory'> = settingsStore.getState()): ThreadSoul {
  return { archetype: s.archetype, pad: { ...s.pad }, toneIntensity: s.toneIntensity, customBackstory: s.customBackstory || undefined };
}

/** Change the global soul (any subset). Values are clamped. */
export function setGlobalSoul(patch: Partial<ThreadSoul>): void {
  const next: Partial<Settings> = {};
  if (patch.archetype) next.archetype = patch.archetype;
  if (patch.pad) next.pad = clampPad(patch.pad);
  if (patch.toneIntensity !== undefined) next.toneIntensity = patch.toneIntensity;
  if (patch.customBackstory !== undefined) next.customBackstory = patch.customBackstory;
  updateSettings(next);
}

/** Pick an archetype and reset PAD to its defaults (the old app's behaviour). */
export function applyArchetype(key: SoulArchetypeKey): void {
  const soulId = LEGACY_ARCHETYPE_TO_SOUL_ID[key] || 'soul_sage';
  updateSettings({ archetype: key, activeSoulId: soulId, pad: { ...ARCHETYPES[key].defaultPAD } });
}

/** What a soul does to the model: the prompt descriptors and the sampling values (Settings sampling as the base). */
export function soulEffects(soul: { pad: PADVector; toneIntensity: number }, base: SamplingSettings = settingsStore.getState().sampling): {
  descriptors: string[];
  sampling: SamplingSettings;
} {
  return { descriptors: describePad(soul.pad), sampling: padToSampling(soul.pad, soul.toneIntensity, base) };
}

/** Real short generation with the loaded model (honest error if none / busy). Defaults to the global soul. */
export function previewSoul(soul: ThreadSoul = globalSoul(), prompt?: string): Promise<SoulPreviewResult> {
  return runSoulPreview(engine, soul, settingsStore.getState().sampling, prompt);
}
