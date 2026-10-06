import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ARCHETYPES, ARCHETYPE_KEYS, clampPad, describePad, type PADVector, type SoulArchetypeKey } from '../core/persona.ts';
import { Btn } from './Btn';
import { Card } from './kit';
import { colors, font, radius } from './theme';

export interface SoulValue {
  archetype: SoulArchetypeKey;
  pad: PADVector;
  customBackstory?: string;
  toneIntensity?: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function Stepper({ label, hint, value, min, max, onChange }: { label: string; hint: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <View style={styles.stepRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.stepLabel}>{label}</Text>
        <Text style={styles.stepHint}>{hint}</Text>
      </View>
      <Btn small label="−" variant="secondary" onPress={() => onChange(Math.max(min, round1(value - 0.1)))} disabled={value <= min} debounceMs={120} haptics={false} style={styles.stepBtn} accessibilityLabel={`Decrease ${label}`} />
      <Text style={styles.stepValue}>{value.toFixed(1)}</Text>
      <Btn small label="+" variant="secondary" onPress={() => onChange(Math.min(max, round1(value + 0.1)))} disabled={value >= max} debounceMs={120} haptics={false} style={styles.stepBtn} accessibilityLabel={`Increase ${label}`} />
    </View>
  );
}

/**
 * Persona controls. Changing any of these changes the system prompt sent to the
 * model (see core/persona.ts), so the effect is real and shown in the preview.
 */
export function SoulEditor({ value, onChange, showBackstory = true }: { value: SoulValue; onChange: (v: SoulValue) => void; showBackstory?: boolean }) {
  const set = (patch: Partial<SoulValue>) => onChange({ ...value, ...patch });
  const setPad = (patch: Partial<PADVector>) => set({ pad: clampPad({ ...value.pad, ...patch }) });
  return (
    <View style={{ gap: 12 }}>
      <View style={styles.archGrid}>
        {ARCHETYPE_KEYS.map((k) => {
          const a = ARCHETYPES[k];
          const active = value.archetype === k;
          return (
            <Pressable key={k} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => set({ archetype: k, pad: { ...a.defaultPAD } })} style={[styles.arch, active && styles.archActive]}>
              <Text style={styles.archName}>{a.name}</Text>
              <Text style={styles.archDesc}>{a.description}</Text>
            </Pressable>
          );
        })}
      </View>

      <Card>
        <Stepper label="Warmth" hint="Cold and blunt  ↔  warm and friendly" value={value.pad.pleasure} min={-1} max={1} onChange={(v) => setPad({ pleasure: v })} />
        <Stepper label="Energy" hint="Calm  ↔  lively" value={value.pad.arousal} min={0} max={1} onChange={(v) => setPad({ arousal: v })} />
        <Stepper label="Directness" hint="Gentle, asks first  ↔  confident, direct" value={value.pad.dominance} min={0} max={1} onChange={(v) => setPad({ dominance: v })} />
        {value.toneIntensity !== undefined ? <Stepper label="Persona strength" hint="Subtle  ↔  strong" value={value.toneIntensity} min={0.1} max={1} onChange={(v) => set({ toneIntensity: v })} /> : null}
        <Text style={styles.preview}>The AI is told: {describePad(value.pad).join(' ')}</Text>
      </Card>

      {showBackstory ? (
        <View style={{ gap: 6 }}>
          <Text style={styles.stepLabel}>Extra instructions (optional)</Text>
          <TextInput
            value={value.customBackstory ?? ''}
            onChangeText={(t) => set({ customBackstory: t })}
            placeholder="e.g. Always answer in Khmer. Keep replies under 5 lines."
            placeholderTextColor={colors.faint}
            multiline
            maxLength={600}
            style={styles.input}
            accessibilityLabel="Extra instructions"
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  archGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  arch: { width: '48.5%', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 4 },
  archActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  archName: { color: colors.text, fontSize: font.md, fontWeight: '700' },
  archDesc: { color: colors.muted, fontSize: font.xs },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepLabel: { color: colors.text, fontSize: font.md, fontWeight: '600' },
  stepHint: { color: colors.faint, fontSize: font.xs },
  stepBtn: { width: 40, paddingHorizontal: 0 },
  stepValue: { color: colors.text, width: 38, textAlign: 'center', fontSize: font.md, fontWeight: '700' },
  preview: { color: colors.faint, fontSize: font.xs, lineHeight: 17, marginTop: 4 },
  input: { backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, color: colors.text, fontSize: font.md, padding: 12, minHeight: 80, textAlignVertical: 'top' },
});
