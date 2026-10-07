import React, { useState, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { ARCHETYPES, SoulArchetypeKey, PADVector } from '../types/soul';
import { ZapIcon, SlidersIcon } from './Icons';

export interface SoulCustomizerProps {
  archetype: SoulArchetypeKey;
  onSelectArchetype: (key: SoulArchetypeKey) => void;
  pad: PADVector;
  onUpdatePAD: (pad: PADVector) => void;
  toneIntensity: number;
  onUpdateToneIntensity: (intensity: number) => void;
  customBackstory?: string;
  onUpdateCustomBackstory?: (text: string) => void;
  showBackstory?: boolean;
}

type PreviewPromptScenario = 'architecture' | 'crisis' | 'creative';

const PREVIEW_SCENARIOS: { id: PreviewPromptScenario; label: string; prompt: string }[] = [
  {
    id: 'architecture',
    label: 'Architecture Query',
    prompt: 'How should we decouple our session storage from the mobile UI thread?',
  },
  {
    id: 'crisis',
    label: 'Production Stress',
    prompt: "I'm stressed out, the deployment broke and the customer demo is in 20 minutes.",
  },
  {
    id: 'creative',
    label: 'Creative Idea',
    prompt: 'Give me a distinctive name and concept for our sovereign AI assistant.',
  },
];

export function SoulCustomizer({
  archetype,
  onSelectArchetype,
  pad,
  onUpdatePAD,
  toneIntensity,
  onUpdateToneIntensity,
  customBackstory = '',
  onUpdateCustomBackstory,
  showBackstory = true,
}: SoulCustomizerProps) {
  const [activeScenario, setActiveScenario] = useState<PreviewPromptScenario>('architecture');

  const triggerHaptic = () => {
    try {
      if (Platform.OS !== 'web') {
        Haptics.selectionAsync().catch(() => {});
      }
    } catch {}
  };

  const handleStep = (axis: 'pleasure' | 'arousal' | 'dominance' | 'intensity', delta: number) => {
    triggerHaptic();
    if (axis === 'intensity') {
      const next = Math.max(0.1, Math.min(1.0, Math.round((toneIntensity + delta) * 10) / 10));
      onUpdateToneIntensity(next);
      return;
    }

    const min = axis === 'pleasure' ? -1.0 : 0.0;
    const max = 1.0;
    const currentVal = pad[axis];
    const nextVal = Math.max(min, Math.min(max, Math.round((currentVal + delta) * 10) / 10));

    onUpdatePAD({
      ...pad,
      [axis]: nextVal,
    });
  };

  const handleResetToDefaults = () => {
    triggerHaptic();
    const defaults = ARCHETYPES[archetype].defaultPAD;
    onUpdatePAD(defaults);
    onUpdateToneIntensity(0.8);
  };

  // Synthesize live dynamic preview based on PAD vector, Archetype and Intensity
  const livePreview = useMemo(() => {
    const p = pad.pleasure;
    const a = pad.arousal;
    const d = pad.dominance;
    const intensity = toneIntensity;

    const scenario = PREVIEW_SCENARIOS.find(s => s.id === activeScenario)!;

    if (activeScenario === 'architecture') {
      if (d >= 0.7 && p <= 0.2) {
        // High Candor / Stoic / Tactical
        return {
          thought: 'Isolating memory layers: MMKV synchronous key-value in C++ Nitro + background FileSystem flushes.',
          response:
            'Use dual-layer partitioning. Put active thread states and PAD vectors in MMKV (<0.1ms sync RAM read). Background thread writes atomic `.chiwiwi` JSON snapshots to disk. Zero UI jank, 60fps locked.',
          tag: 'Tactical • Zero-Preamble • High Candor',
        };
      } else if (p >= 0.5) {
        // Warm / Supportive / Empathic
        return {
          thought: 'Focus on clean architecture that brings developer confidence and seamless user experience.',
          response:
            'Great question! To keep your app silky smooth, decouple the immediate UI state with a rapid in-memory cache like MMKV, while letting a quiet background worker persist durable session files. That way, users never feel a hiccup.',
          tag: 'Empathetic • Encouraging • Attuned',
        };
      } else if (a <= 0.4 && d >= 0.5) {
        // Mentor / High Wisdom / Grounded
        return {
          thought: 'Architectural clarity: separate durability guarantees from frame rendering budgets.',
          response:
            'Never bind storage I/O to frame ticks. Maintain an ephemeral synchronous cache for UI re-renders, and delegate persistent session compaction to an async queue. Simplicity preserves performance.',
          tag: 'Mentor • High Wisdom • Measured',
        };
      } else {
        // Playful Spark
        return {
          thought: 'Optimizing for snappy feel and joyful responsiveness!',
          response:
            'Lightning fast is the only way! Stash the active chat in MMKV for instant 0ms pop-in, then quietly write the disk files in the shadows. Your 120Hz display will thank you! ⚡',
          tag: 'Spark • High Energy • Witty',
        };
      }
    } else if (activeScenario === 'crisis') {
      if (d >= 0.7) {
        return {
          thought: 'Triage: 20 minutes remaining. Revert immediately or bypass non-critical checks.',
          response:
            'Do not debug in production right now. Roll back to the last stable git commit immediately: `git revert HEAD` and push. Run the happy-path demo checklist. We debug the root cause after the demo.',
          tag: 'Tactical • Crisis Triage • High Candor',
        };
      } else if (p >= 0.5) {
        return {
          thought: 'De-escalate panic, focus on immediate achievable win.',
          response:
            "Take a deep breath—we can handle this. First, let's roll back to the last known working build right now so your demo is safe. You've got this, and I'll walk you through the checklist step by step.",
          tag: 'Empathetic • Grounded • Validating',
        };
      } else {
        return {
          thought: 'Calm perspective: a demo tests the invariant, not the edge cases.',
          response:
            'Panic wastes precious minutes. Revert to the known baseline build now. A clean presentation of core functionality is worth far more than scrambling for an unverified last-minute patch.',
          tag: 'Mentor • High Perspective • Calm',
        };
      }
    } else {
      // Creative Idea scenario
      if (archetype === 'spark' || a >= 0.7) {
        return {
          thought: 'High voltage sovereign branding with personality!',
          response:
            '**CHIWIWI Sovereign** — "The Unshackled Mind in Your Pocket". Tagline: *Zero cloud. Zero compromise. 100% on silicon.* Let’s give it an obsidian-minimal badge with amber plasma accents!',
          tag: 'Spark • Creative • Dynamic',
        };
      } else if (archetype === 'tactical') {
        return {
          thought: 'Clean, austere, functional sovereign identity.',
          response:
            '**CHIWIWI Kernel** — Hardware-local autonomous intelligence. Emphasizes hermetic privacy, zero telemetry, and sub-millisecond local execution directly on Snapdragon NPU.',
          tag: 'Tactical • Pragmatic • Austere',
        };
      } else {
        return {
          thought: 'Soulful, enduring partnership identity.',
          response:
            '**CHIWIWI** — Your Sovereign Co-Pilot. A companion that lives purely with you, remembering what matters, with total loyalty and hermetic privacy.',
          tag: 'Balanced • Attuned • Sovereign',
        };
      }
    }
  }, [pad, archetype, toneIntensity, activeScenario]);

  return (
    <View style={styles.container}>
      {/* 1. ARCHETYPE CARDS */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>ARCHETYPE MATRIX</Text>
        <TouchableOpacity onPress={handleResetToDefaults} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.resetBtnText}>Reset to Defaults</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.archetypeGrid}>
        {(Object.keys(ARCHETYPES) as SoulArchetypeKey[]).map(key => {
          const arch = ARCHETYPES[key];
          const isSelected = archetype === key;
          return (
            <TouchableOpacity
              key={key}
              style={[styles.archCard, isSelected && styles.archCardActive]}
              onPress={() => {
                triggerHaptic();
                onSelectArchetype(key);
                onUpdatePAD(arch.defaultPAD);
              }}
              activeOpacity={0.8}
            >
              <View style={styles.archCardTop}>
                <View style={[styles.archDot, isSelected && styles.archDotActive]} />
                <Text style={[styles.archCardName, isSelected && styles.archCardNameActive]}>
                  {arch.name}
                </Text>
              </View>
              <Text style={styles.archCardDesc} numberOfLines={2}>
                {arch.description}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 2. CUSTOMIZATION METERS */}
      <Text style={[styles.sectionTitle, { marginTop: 18 }]}>EMOTIONAL ATTUNEMENT METERS (PAD)</Text>

      {/* Pleasure (Warmth) Meter */}
      <View style={styles.meterCard}>
        <View style={styles.meterHeader}>
          <View>
            <Text style={styles.meterLabel}>PLEASURE / WARMTH (P)</Text>
            <Text style={styles.meterSub}>
              {pad.pleasure <= -0.4
                ? 'Stoic & Hyper-Analytical'
                : pad.pleasure < 0.2
                ? 'Neutral & Objective'
                : pad.pleasure < 0.7
                ? 'Warm & Empathetic'
                : 'Deeply Affectionate & Validating'}
            </Text>
          </View>
          <View style={styles.meterValBadge}>
            <Text style={[styles.meterValText, { color: pad.pleasure >= 0 ? '#10b981' : '#38bdf8' }]}>
              {pad.pleasure > 0 ? `+${pad.pleasure.toFixed(2)}` : pad.pleasure.toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Visual Bar Track */}
        <View style={styles.barTrack}>
          <View
            style={[
              styles.barFill,
              {
                width: `${Math.round(((pad.pleasure + 1) / 2) * 100)}%`,
                backgroundColor: pad.pleasure >= 0 ? '#10b981' : '#38bdf8',
              },
            ]}
          />
        </View>

        {/* Stepper Controls */}
        <View style={styles.stepperRow}>
          <TouchableOpacity
            style={styles.stepBtn}
            onPress={() => handleStep('pleasure', -0.1)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text style={styles.stepBtnText}>- 0.1</Text>
          </TouchableOpacity>

          <View style={styles.pillDeck}>
            {[-0.5, 0.0, 0.5, 0.9].map(val => (
              <TouchableOpacity
                key={val}
                style={[styles.quickPill, Math.abs(pad.pleasure - val) < 0.05 && styles.quickPillActive]}
                onPress={() => {
                  triggerHaptic();
                  onUpdatePAD({ ...pad, pleasure: val });
                }}
              >
                <Text style={[styles.quickPillText, Math.abs(pad.pleasure - val) < 0.05 && styles.quickPillTextActive]}>
                  {val > 0 ? `+${val}` : val}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={styles.stepBtn}
            onPress={() => handleStep('pleasure', 0.1)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text style={styles.stepBtnText}>+ 0.1</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Arousal (Energy) Meter */}
      <View style={styles.meterCard}>
        <View style={styles.meterHeader}>
          <View>
            <Text style={styles.meterLabel}>AROUSAL / REACTIVITY (A)</Text>
            <Text style={styles.meterSub}>
              {pad.arousal <= 0.3
                ? 'Calm & Serene'
                : pad.arousal <= 0.6
                ? 'Balanced & Attentive'
                : 'High-Tempo & Urgent'}
            </Text>
          </View>
          <View style={styles.meterValBadge}>
            <Text style={[styles.meterValText, { color: '#f59e0b' }]}>
              {pad.arousal.toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Visual Bar Track */}
        <View style={styles.barTrack}>
          <View
            style={[
              styles.barFill,
              {
                width: `${Math.round(pad.arousal * 100)}%`,
                backgroundColor: '#f59e0b',
              },
            ]}
          />
        </View>

        {/* Stepper Controls */}
        <View style={styles.stepperRow}>
          <TouchableOpacity
            style={styles.stepBtn}
            onPress={() => handleStep('arousal', -0.1)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text style={styles.stepBtnText}>- 0.1</Text>
          </TouchableOpacity>

          <View style={styles.pillDeck}>
            {[0.2, 0.5, 0.85].map(val => (
              <TouchableOpacity
                key={val}
                style={[styles.quickPill, Math.abs(pad.arousal - val) < 0.05 && styles.quickPillActive]}
                onPress={() => {
                  triggerHaptic();
                  onUpdatePAD({ ...pad, arousal: val });
                }}
              >
                <Text style={[styles.quickPillText, Math.abs(pad.arousal - val) < 0.05 && styles.quickPillTextActive]}>
                  {val}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={styles.stepBtn}
            onPress={() => handleStep('arousal', 0.1)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text style={styles.stepBtnText}>+ 0.1</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Dominance (Candor) Meter */}
      <View style={styles.meterCard}>
        <View style={styles.meterHeader}>
          <View>
            <Text style={styles.meterLabel}>DOMINANCE / CANDOR (D)</Text>
            <Text style={styles.meterSub}>
              {pad.dominance <= 0.3
                ? 'Gentle & Deferential'
                : pad.dominance <= 0.7
                ? 'Collaborative & Direct'
                : 'Authoritative & Unfiltered'}
            </Text>
          </View>
          <View style={styles.meterValBadge}>
            <Text style={[styles.meterValText, { color: '#a855f7' }]}>
              {pad.dominance.toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Visual Bar Track */}
        <View style={styles.barTrack}>
          <View
            style={[
              styles.barFill,
              {
                width: `${Math.round(pad.dominance * 100)}%`,
                backgroundColor: '#a855f7',
              },
            ]}
          />
        </View>

        {/* Stepper Controls */}
        <View style={styles.stepperRow}>
          <TouchableOpacity
            style={styles.stepBtn}
            onPress={() => handleStep('dominance', -0.1)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text style={styles.stepBtnText}>- 0.1</Text>
          </TouchableOpacity>

          <View style={styles.pillDeck}>
            {[0.3, 0.6, 0.95].map(val => (
              <TouchableOpacity
                key={val}
                style={[styles.quickPill, Math.abs(pad.dominance - val) < 0.05 && styles.quickPillActive]}
                onPress={() => {
                  triggerHaptic();
                  onUpdatePAD({ ...pad, dominance: val });
                }}
              >
                <Text style={[styles.quickPillText, Math.abs(pad.dominance - val) < 0.05 && styles.quickPillTextActive]}>
                  {val}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={styles.stepBtn}
            onPress={() => handleStep('dominance', 0.1)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text style={styles.stepBtnText}>+ 0.1</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tone Intensity Meter */}
      <View style={styles.meterCard}>
        <View style={styles.meterHeader}>
          <View>
            <Text style={styles.meterLabel}>TONE INTENSITY & CONVICTION</Text>
            <Text style={styles.meterSub}>
              {toneIntensity <= 0.4
                ? 'Subtle personality tint'
                : toneIntensity <= 0.7
                ? 'Balanced persona attunement'
                : 'Full unfiltered sovereign presence'}
            </Text>
          </View>
          <View style={styles.meterValBadge}>
            <Text style={[styles.meterValText, { color: '#38bdf8' }]}>
              {Math.round(toneIntensity * 100)}%
            </Text>
          </View>
        </View>

        <View style={styles.barTrack}>
          <View
            style={[
              styles.barFill,
              {
                width: `${Math.round(toneIntensity * 100)}%`,
                backgroundColor: '#38bdf8',
              },
            ]}
          />
        </View>

        <View style={styles.stepperRow}>
          <TouchableOpacity
            style={styles.stepBtn}
            onPress={() => handleStep('intensity', -0.1)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text style={styles.stepBtnText}>- 10%</Text>
          </TouchableOpacity>

          <View style={styles.pillDeck}>
            {[0.4, 0.7, 1.0].map(val => (
              <TouchableOpacity
                key={val}
                style={[styles.quickPill, Math.abs(toneIntensity - val) < 0.05 && styles.quickPillActive]}
                onPress={() => {
                  triggerHaptic();
                  onUpdateToneIntensity(val);
                }}
              >
                <Text style={[styles.quickPillText, Math.abs(toneIntensity - val) < 0.05 && styles.quickPillTextActive]}>
                  {Math.round(val * 100)}%
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={styles.stepBtn}
            onPress={() => handleStep('intensity', 0.1)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text style={styles.stepBtnText}>+ 10%</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 3. OPTIONAL BACKSTORY INPUT */}
      {showBackstory && onUpdateCustomBackstory && (
        <View style={{ marginTop: 14 }}>
          <Text style={styles.sectionTitle}>CUSTOM ROLEPLAY BACKSTORY</Text>
          <TextInput
            style={styles.backstoryInput}
            placeholder="e.g. Senior staff engineer with 15 years in distributed systems..."
            placeholderTextColor="#52525b"
            multiline
            numberOfLines={3}
            value={customBackstory}
            onChangeText={onUpdateCustomBackstory}
          />
        </View>
      )}

      {/* 4. LIVE DYNAMIC EXAMPLE PREVIEWS */}
      <View style={styles.previewContainer}>
        <View style={styles.previewHeaderRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <ZapIcon size={14} color="#38bdf8" />
            <Text style={styles.previewTitle}>LIVE VOICE PREVIEW</Text>
          </View>
          <View style={styles.previewTagBadge}>
            <Text style={styles.previewTagText}>{livePreview.tag}</Text>
          </View>
        </View>

        {/* Scenario Selector Pills */}
        <View style={styles.scenarioRow}>
          {PREVIEW_SCENARIOS.map(s => {
            const isChosen = activeScenario === s.id;
            return (
              <TouchableOpacity
                key={s.id}
                style={[styles.scenarioPill, isChosen && styles.scenarioPillActive]}
                onPress={() => {
                  triggerHaptic();
                  setActiveScenario(s.id);
                }}
              >
                <Text style={[styles.scenarioPillText, isChosen && styles.scenarioPillTextActive]}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* User Prompt Box */}
        <View style={styles.promptBubble}>
          <Text style={styles.promptLabel}>USER QUERY:</Text>
          <Text style={styles.promptText}>
            "{PREVIEW_SCENARIOS.find(s => s.id === activeScenario)?.prompt}"
          </Text>
        </View>

        {/* Live Synthesized AI Response */}
        <View style={styles.responseBubble}>
          <View style={styles.thoughtBox}>
            <Text style={styles.thoughtLabel}>INTERNAL REASONING TRACE</Text>
            <Text style={styles.thoughtText}>{livePreview.thought}</Text>
          </View>
          <Text style={styles.responseText}>{livePreview.response}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  sectionTitle: {
    color: '#71717a',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  resetBtnText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '600',
  },

  archetypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  archCard: {
    width: '48.5%',
    backgroundColor: '#111114',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  archCardActive: {
    backgroundColor: '#18181d',
    borderColor: '#ffffff',
  },
  archCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  archDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#52525b',
  },
  archDotActive: {
    backgroundColor: '#38bdf8',
  },
  archCardName: {
    color: '#d4d4d8',
    fontSize: 12,
    fontWeight: '700',
  },
  archCardNameActive: {
    color: '#ffffff',
  },
  archCardDesc: {
    color: '#71717a',
    fontSize: 10,
    lineHeight: 14,
  },

  meterCard: {
    backgroundColor: '#111114',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  meterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  meterLabel: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  meterSub: {
    color: '#71717a',
    fontSize: 10,
    marginTop: 2,
  },
  meterValBadge: {
    backgroundColor: '#18181b',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  meterValText: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },

  barTrack: {
    height: 6,
    backgroundColor: '#1f1f23',
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },

  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 2,
  },
  stepBtn: {
    backgroundColor: '#1f1f24',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  stepBtnText: {
    color: '#d4d4d8',
    fontSize: 11,
    fontWeight: '600',
  },

  pillDeck: {
    flexDirection: 'row',
    gap: 6,
    flex: 1,
    justifyContent: 'center',
  },
  quickPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
  },
  quickPillActive: {
    backgroundColor: '#27272a',
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  quickPillText: {
    color: '#71717a',
    fontSize: 10,
    fontWeight: '600',
  },
  quickPillTextActive: {
    color: '#ffffff',
  },

  backstoryInput: {
    backgroundColor: '#111114',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    padding: 12,
    color: '#ffffff',
    fontSize: 12,
    minHeight: 64,
    textAlignVertical: 'top',
    marginTop: 6,
  },

  previewContainer: {
    backgroundColor: '#0c0c0f',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
    borderRadius: 16,
    padding: 14,
    gap: 10,
    marginTop: 10,
  },
  previewHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewTitle: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  previewTagBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.2)',
  },
  previewTagText: {
    color: '#38bdf8',
    fontSize: 9,
    fontWeight: '700',
  },

  scenarioRow: {
    flexDirection: 'row',
    gap: 6,
  },
  scenarioPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#18181d',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  scenarioPillActive: {
    backgroundColor: '#27272a',
    borderColor: '#38bdf8',
  },
  scenarioPillText: {
    color: '#71717a',
    fontSize: 10,
    fontWeight: '600',
  },
  scenarioPillTextActive: {
    color: '#ffffff',
  },

  promptBubble: {
    backgroundColor: '#16161a',
    padding: 10,
    borderRadius: 10,
    gap: 2,
  },
  promptLabel: {
    color: '#71717a',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  promptText: {
    color: '#e4e4e7',
    fontSize: 11,
    fontStyle: 'italic',
  },

  responseBubble: {
    backgroundColor: '#111114',
    padding: 12,
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#38bdf8',
    gap: 8,
  },
  thoughtBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    padding: 8,
    borderRadius: 6,
    gap: 2,
  },
  thoughtLabel: {
    color: '#71717a',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  thoughtText: {
    color: '#a1a1aa',
    fontSize: 10,
    lineHeight: 14,
  },
  responseText: {
    color: '#ffffff',
    fontSize: 12,
    lineHeight: 17,
  },
});
