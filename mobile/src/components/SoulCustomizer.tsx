import React, { useState, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Rect, Circle, Line } from 'react-native-svg';
import { ARCHETYPES, SoulArchetypeKey, PADVector } from '../types/soul';
import { ZapIcon, SlidersIcon, ChevronDownIcon, CheckIcon, CpuIcon } from './Icons';

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
    label: 'Systems & Architecture',
    prompt: 'How should we decouple our session storage from the mobile UI thread?',
  },
  {
    id: 'crisis',
    label: 'Outage & Crisis Triage',
    prompt: "The production deploy failed and customer demo begins in 15 minutes. What do we do?",
  },
  {
    id: 'creative',
    label: 'Creative Strategy',
    prompt: 'Give me a distinctive brand concept and tagline for our sovereign on-device AI assistant.',
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
  const [kernelInspectorOpen, setKernelInspectorOpen] = useState(false);

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
    const defaults = ARCHETYPES[archetype]?.defaultPAD || ARCHETYPES.empath.defaultPAD;
    onUpdatePAD(defaults);
    onUpdateToneIntensity(0.8);
  };

  // Synthesize live dynamic preview based on PAD vector, Archetype and Intensity
  const livePreview = useMemo(() => {
    const p = pad.pleasure;
    const a = pad.arousal;
    const d = pad.dominance;

    if (activeScenario === 'architecture') {
      if (archetype === 'cynic' || (d >= 0.8 && p <= 0.0)) {
        return {
          thought: 'Adversarial audit: detect tight coupling between UI frame ticks and I/O disk writes.',
          response:
            'Decouple immediately or risk frame drops. Bind UI reads to synchronous MMKV memory cache in C++ Nitro (<0.1ms). Delegate durable disk flushes to an asynchronous queue with atomic replacement. Any file operation on the main thread is a critical defect.',
          tag: 'ADVERSARIAL • ZERO TOLERANCE • ROOT CAUSE',
        };
      } else if (archetype === 'visionary' || (d >= 0.7 && a >= 0.6)) {
        return {
          thought: 'Macro systems perspective: multi-tier memory architecture with domain-level isolation.',
          response:
            'Implement clean architectural tiering. Split storage into ephemeral UI cache (L1), local vector memory (L2), and hermetic cold vault (L3). Use immutable snapshots so state transitions never block render pipelines.',
          tag: 'SYSTEMS ARCHITECT • MULTI-TIER • HIGH LEVERAGE',
        };
      } else if (d >= 0.7 && p <= 0.2) {
        return {
          thought: 'Isolating memory layers: MMKV synchronous key-value + background FileSystem flushes.',
          response:
            'Use dual-layer partitioning. Put active thread states and PAD vectors in MMKV (<0.1ms sync RAM read). Background worker writes atomic `.chiwiwi` JSON snapshots to disk. Zero UI jank, 60fps locked.',
          tag: 'TACTICAL • ZERO PREAMBLE • HIGH CANDOR',
        };
      } else if (p >= 0.5) {
        return {
          thought: 'Focus on clean architecture that brings developer confidence and seamless user experience.',
          response:
            'To keep your app silky smooth, decouple the immediate UI state with a rapid in-memory cache like MMKV, while letting a quiet background worker persist durable session files. That way, users never feel a hiccup.',
          tag: 'EMPATHIC • ATTUNED • SUPPORTIVE',
        };
      } else if (a <= 0.4 && d >= 0.5) {
        return {
          thought: 'Architectural clarity: separate durability guarantees from frame rendering budgets.',
          response:
            'Never bind storage I/O to frame ticks. Maintain an ephemeral synchronous cache for UI re-renders, and delegate persistent session compaction to an async queue. Simplicity preserves performance.',
          tag: 'SOVEREIGN MENTOR • SOCRATIC • MEASURED',
        };
      } else {
        return {
          thought: 'Optimizing for snappy feel and joyful responsiveness!',
          response:
            'Lightning fast is the only way! Stash the active chat in MMKV for instant 0ms pop-in, then quietly write the disk files in the shadows. Your 120Hz display will thank you! ⚡',
          tag: 'SPARK • HIGH ENERGY • WITTY',
        };
      }
    } else if (activeScenario === 'crisis') {
      if (archetype === 'cynic' || d >= 0.85) {
        return {
          thought: 'Triage constraint: 15 minutes remaining. Live patching in production will fail.',
          response:
            'Halt all code edits. You have 15 minutes: debugging in production guarantees disaster. Execute `git revert HEAD` now. Verify the happy path on staging. We conduct root-cause autopsy after the demo.',
          tag: 'ADVERSARIAL • CRISIS TRIAGE • NO EXCUSES',
        };
      } else if (p >= 0.5) {
        return {
          thought: 'De-escalate stress, focus on immediate achievable win.',
          response:
            "Take a deep breath—we can handle this. First, let's roll back to the last known working build right now so your demo is safe. You've got this, and I'll walk you through the checklist step by step.",
          tag: 'EMPATHIC • GROUNDED • CALM',
        };
      } else {
        return {
          thought: 'Calm perspective: a demo tests the invariant, not the edge cases.',
          response:
            'Panic wastes precious minutes. Revert to the known baseline build now. A clean presentation of core functionality is worth far more than scrambling for an unverified last-minute patch.',
          tag: 'SOVEREIGN MENTOR • TRIAGE • STOIC',
        };
      }
    } else {
      if (archetype === 'visionary') {
        return {
          thought: 'Strategic positioning: sovereign AI as the uncompromised personal perimeter.',
          response:
            '**CHIWIWI Apex** — "The Sovereign Cognition Engine". Tagline: *Your mind, your silicon, zero surveillance.* Position it as the definitive private neural workstation for high-agency builders.',
          tag: 'SYSTEMS ARCHITECT • MACRO POSITIONING',
        };
      } else if (archetype === 'spark' || a >= 0.7) {
        return {
          thought: 'High voltage sovereign branding with punchy personality.',
          response:
            '**CHIWIWI Sovereign** — "The Unshackled Mind in Your Pocket". Tagline: *Zero cloud. Zero compromise. 100% on silicon.* Obsidian minimal badge with neon plasma accents.',
          tag: 'SPARK • CREATIVE • DYNAMIC',
        };
      } else {
        return {
          thought: 'Clean, austere, functional sovereign identity.',
          response:
            '**CHIWIWI Kernel** — Hardware-local autonomous intelligence. Emphasizes hermetic privacy, zero telemetry, and sub-millisecond local execution directly on Snapdragon NPU.',
          tag: 'TACTICAL • PRAGMATIC • AUSTERE',
        };
      }
    }
  }, [pad, archetype, toneIntensity, activeScenario]);

  // Current active archetype spec
  const currentArchSpec = ARCHETYPES[archetype] || ARCHETYPES.empath;

  // Calculate radar plot points for 2D representation
  // Normalized Pleasure X: [-1, 1] mapped to [10, 90]
  // Normalized Arousal Y: [0, 1] mapped to [90, 10]
  const radarX = Math.round(50 + pad.pleasure * 40);
  const radarY = Math.round(90 - pad.arousal * 80);
  const dotRadius = Math.max(4, Math.round(4 + pad.dominance * 5));

  return (
    <View style={styles.container}>
      {/* 1. TOP DNN NEURAL RADAR & COGNITIVE STATE HUD */}
      <View style={styles.hudCard}>
        <View style={styles.hudTopRow}>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <CpuIcon size={14} color="#38bdf8" />
              <Text style={styles.hudHeaderTitle}>AFFECTIVE NEURAL MATRIX (PAD)</Text>
            </View>
            <Text style={styles.hudHeaderSub}>
              Active Node: <Text style={{ color: '#ffffff', fontWeight: '700' }}>{currentArchSpec.name}</Text>
            </Text>
          </View>

          <TouchableOpacity
            style={styles.resetBtn}
            onPress={handleResetToDefaults}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.resetBtnText}>Reset Defaults</Text>
          </TouchableOpacity>
        </View>

        {/* 2D Coordinate Grid Visualizer */}
        <View style={styles.radarContainer}>
          <View style={styles.radarBox}>
            <Svg width="100%" height={100} viewBox="0 0 100 100">
              {/* Background Grid */}
              <Rect x="0" y="0" width="100" height="100" fill="#09090d" rx="8" />
              {/* Axes */}
              <Line x1="50" y1="5" x2="50" y2="95" stroke="rgba(255,255,255,0.08)" strokeWidth="1" strokeDasharray="3 3" />
              <Line x1="5" y1="50" x2="95" y2="50" stroke="rgba(255,255,255,0.08)" strokeWidth="1" strokeDasharray="3 3" />
              {/* Neutral Center Circle */}
              <Circle cx="50" cy="50" r="18" stroke="rgba(56,189,248,0.12)" strokeWidth="1" fill="none" />
              {/* Vector line from origin to coordinate */}
              <Line x1="50" y1="50" x2={radarX} y2={radarY} stroke="#38bdf8" strokeWidth="1.5" strokeOpacity="0.5" />
              {/* Active Plotted Node */}
              <Circle cx={radarX} cy={radarY} r={dotRadius + 3} fill="rgba(56,189,248,0.2)" />
              <Circle cx={radarX} cy={radarY} r={dotRadius} fill="#38bdf8" stroke="#ffffff" strokeWidth="1.5" />
            </Svg>

            {/* Radar Corner Tags */}
            <Text style={[styles.radarCornerTag, { top: 4, left: 8 }]}>HIGH TEMPO</Text>
            <Text style={[styles.radarCornerTag, { top: 4, right: 8 }]}>HIGH ENERGY</Text>
            <Text style={[styles.radarCornerTag, { bottom: 4, left: 8 }]}>STOIC ANALYTICAL</Text>
            <Text style={[styles.radarCornerTag, { bottom: 4, right: 8 }]}>DEEP WARMTH</Text>
          </View>

          {/* Metric Telemetry Chips */}
          <View style={styles.telemetryColumn}>
            <View style={styles.telemetryChip}>
              <Text style={styles.telemetryChipLabel}>VALENCE (P)</Text>
              <Text style={[styles.telemetryChipVal, { color: pad.pleasure >= 0 ? '#10b981' : '#38bdf8' }]}>
                {pad.pleasure > 0 ? `+${pad.pleasure.toFixed(2)}` : pad.pleasure.toFixed(2)}
              </Text>
            </View>

            <View style={styles.telemetryChip}>
              <Text style={styles.telemetryChipLabel}>ACTIVATION (A)</Text>
              <Text style={[styles.telemetryChipVal, { color: '#f59e0b' }]}>
                {pad.arousal.toFixed(2)}
              </Text>
            </View>

            <View style={styles.telemetryChip}>
              <Text style={styles.telemetryChipLabel}>CANDOR (D)</Text>
              <Text style={[styles.telemetryChipVal, { color: '#a855f7' }]}>
                {pad.dominance.toFixed(2)}
              </Text>
            </View>

            <View style={styles.telemetryChip}>
              <Text style={styles.telemetryChipLabel}>AMPLITUDE</Text>
              <Text style={[styles.telemetryChipVal, { color: '#ffffff' }]}>
                {Math.round(toneIntensity * 100)}%
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* 2. ENTERPRISE ARCHETYPE MATRIX NODES (6 DISTINCT ROLES) */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>ENTERPRISE ARCHETYPE NODES</Text>
        <Text style={styles.sectionSubBadge}>6 PRESETS</Text>
      </View>

      <View style={styles.archetypeGrid}>
        {(Object.keys(ARCHETYPES) as SoulArchetypeKey[]).map(key => {
          const arch = ARCHETYPES[key];
          const isSelected = archetype === key;

          const tagColor =
            key === 'tactical' ? '#38bdf8' :
            key === 'empath' ? '#10b981' :
            key === 'mentor' ? '#a855f7' :
            key === 'spark' ? '#f59e0b' :
            key === 'cynic' ? '#ef4444' : '#06b6d4';

          const tagLabel =
            key === 'tactical' ? 'ZERO PREAMBLE' :
            key === 'empath' ? 'HIGH ATTUNEMENT' :
            key === 'mentor' ? 'FIRST PRINCIPLES' :
            key === 'spark' ? 'LATERAL SPARK' :
            key === 'cynic' ? 'RED-TEAM AUDIT' : 'SYSTEMS MACRO';

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
                <View style={[styles.archStatusDot, isSelected && { backgroundColor: tagColor }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.archCardName, isSelected && styles.archCardNameActive]}>
                    {arch.name}
                  </Text>
                  <View style={[styles.archRoleTag, { borderColor: `${tagColor}40`, backgroundColor: `${tagColor}12` }]}>
                    <Text style={[styles.archRoleTagText, { color: tagColor }]}>{tagLabel}</Text>
                  </View>
                </View>
              </View>

              <Text style={styles.archCardDesc} numberOfLines={2}>
                {arch.description}
              </Text>

              <View style={styles.archPadFooter}>
                <Text style={styles.archPadFooterText}>
                  P: {arch.defaultPAD.pleasure > 0 ? `+${arch.defaultPAD.pleasure}` : arch.defaultPAD.pleasure} • A: {arch.defaultPAD.arousal} • D: {arch.defaultPAD.dominance}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 3. CONTINUOUS PRECISION TUNERS */}
      <View style={[styles.sectionHeaderRow, { marginTop: 16 }]}>
        <Text style={styles.sectionTitle}>PRECISION COGNITIVE TUNERS</Text>
        <SlidersIcon size={14} color="#71717a" />
      </View>

      {/* Pleasure (Warmth) Meter */}
      <View style={styles.tunerCard}>
        <View style={styles.tunerHeader}>
          <View>
            <Text style={styles.tunerLabel}>PLEASURE / EMOTIONAL VALENCE (P)</Text>
            <Text style={styles.tunerSub}>
              {pad.pleasure <= -0.4
                ? 'Stoic, austere, hyper-analytical'
                : pad.pleasure < 0.2
                ? 'Neutral, objective, impartial'
                : pad.pleasure < 0.7
                ? 'Warm, empathetic, validating'
                : 'Deeply supportive and affirmative'}
            </Text>
          </View>
          <View style={styles.tunerValBadge}>
            <Text style={[styles.tunerValText, { color: pad.pleasure >= 0 ? '#10b981' : '#38bdf8' }]}>
              {pad.pleasure > 0 ? `+${pad.pleasure.toFixed(2)}` : pad.pleasure.toFixed(2)}
            </Text>
          </View>
        </View>

        <View style={styles.tunerTrack}>
          <View
            style={[
              styles.tunerFill,
              {
                width: `${Math.round(((pad.pleasure + 1) / 2) * 100)}%`,
                backgroundColor: pad.pleasure >= 0 ? '#10b981' : '#38bdf8',
              },
            ]}
          />
        </View>

        <View style={styles.stepperRow}>
          <TouchableOpacity
            style={styles.stepBtn}
            onPress={() => handleStep('pleasure', -0.1)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text style={styles.stepBtnText}>- 0.1</Text>
          </TouchableOpacity>

          <View style={styles.presetDeck}>
            {[-0.5, 0.0, 0.5, 0.85].map(val => (
              <TouchableOpacity
                key={val}
                style={[styles.presetPill, Math.abs(pad.pleasure - val) < 0.05 && styles.presetPillActive]}
                onPress={() => {
                  triggerHaptic();
                  onUpdatePAD({ ...pad, pleasure: val });
                }}
              >
                <Text style={[styles.presetPillText, Math.abs(pad.pleasure - val) < 0.05 && styles.presetPillTextActive]}>
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

      {/* Arousal (Activation) Meter */}
      <View style={styles.tunerCard}>
        <View style={styles.tunerHeader}>
          <View>
            <Text style={styles.tunerLabel}>AROUSAL / COGNITIVE ACTIVATION (A)</Text>
            <Text style={styles.tunerSub}>
              {pad.arousal <= 0.3
                ? 'Calm, measured, meditative'
                : pad.arousal <= 0.6
                ? 'Balanced, alert, responsive'
                : 'High-tempo, urgent, rapid'}
            </Text>
          </View>
          <View style={styles.tunerValBadge}>
            <Text style={[styles.tunerValText, { color: '#f59e0b' }]}>
              {pad.arousal.toFixed(2)}
            </Text>
          </View>
        </View>

        <View style={styles.tunerTrack}>
          <View
            style={[
              styles.tunerFill,
              {
                width: `${Math.round(pad.arousal * 100)}%`,
                backgroundColor: '#f59e0b',
              },
            ]}
          />
        </View>

        <View style={styles.stepperRow}>
          <TouchableOpacity
            style={styles.stepBtn}
            onPress={() => handleStep('arousal', -0.1)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text style={styles.stepBtnText}>- 0.1</Text>
          </TouchableOpacity>

          <View style={styles.presetDeck}>
            {[0.2, 0.5, 0.85].map(val => (
              <TouchableOpacity
                key={val}
                style={[styles.presetPill, Math.abs(pad.arousal - val) < 0.05 && styles.presetPillActive]}
                onPress={() => {
                  triggerHaptic();
                  onUpdatePAD({ ...pad, arousal: val });
                }}
              >
                <Text style={[styles.presetPillText, Math.abs(pad.arousal - val) < 0.05 && styles.presetPillTextActive]}>
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

      {/* Dominance (Agency) Meter */}
      <View style={styles.tunerCard}>
        <View style={styles.tunerHeader}>
          <View>
            <Text style={styles.tunerLabel}>DOMINANCE / EXECUTIVE AGENCY (D)</Text>
            <Text style={styles.tunerSub}>
              {pad.dominance <= 0.3
                ? 'Gentle, deferential, collaborative'
                : pad.dominance <= 0.7
                ? 'Direct, decisive, autonomous'
                : 'Authoritative, proactive, unfiltered'}
            </Text>
          </View>
          <View style={styles.tunerValBadge}>
            <Text style={[styles.tunerValText, { color: '#a855f7' }]}>
              {pad.dominance.toFixed(2)}
            </Text>
          </View>
        </View>

        <View style={styles.tunerTrack}>
          <View
            style={[
              styles.tunerFill,
              {
                width: `${Math.round(pad.dominance * 100)}%`,
                backgroundColor: '#a855f7',
              },
            ]}
          />
        </View>

        <View style={styles.stepperRow}>
          <TouchableOpacity
            style={styles.stepBtn}
            onPress={() => handleStep('dominance', -0.1)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text style={styles.stepBtnText}>- 0.1</Text>
          </TouchableOpacity>

          <View style={styles.presetDeck}>
            {[0.3, 0.6, 0.95].map(val => (
              <TouchableOpacity
                key={val}
                style={[styles.presetPill, Math.abs(pad.dominance - val) < 0.05 && styles.presetPillActive]}
                onPress={() => {
                  triggerHaptic();
                  onUpdatePAD({ ...pad, dominance: val });
                }}
              >
                <Text style={[styles.presetPillText, Math.abs(pad.dominance - val) < 0.05 && styles.presetPillTextActive]}>
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
      <View style={styles.tunerCard}>
        <View style={styles.tunerHeader}>
          <View>
            <Text style={styles.tunerLabel}>TONE CONVICTION & AMPLITUDE</Text>
            <Text style={styles.tunerSub}>
              {toneIntensity <= 0.4
                ? 'Subtle tint on default responses'
                : toneIntensity <= 0.7
                ? 'Balanced cognitive attunement'
                : 'Full unfiltered sovereign presence'}
            </Text>
          </View>
          <View style={styles.tunerValBadge}>
            <Text style={[styles.tunerValText, { color: '#38bdf8' }]}>
              {Math.round(toneIntensity * 100)}%
            </Text>
          </View>
        </View>

        <View style={styles.tunerTrack}>
          <View
            style={[
              styles.tunerFill,
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

          <View style={styles.presetDeck}>
            {[0.4, 0.7, 1.0].map(val => (
              <TouchableOpacity
                key={val}
                style={[styles.presetPill, Math.abs(toneIntensity - val) < 0.05 && styles.presetPillActive]}
                onPress={() => {
                  triggerHaptic();
                  onUpdateToneIntensity(val);
                }}
              >
                <Text style={[styles.presetPillText, Math.abs(toneIntensity - val) < 0.05 && styles.presetPillTextActive]}>
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

      {/* 4. DYNAMIC SYSTEM PROMPT KERNEL INSPECTOR (COLLAPSIBLE) */}
      <TouchableOpacity
        style={styles.kernelAccordionHeader}
        onPress={() => setKernelInspectorOpen(!kernelInspectorOpen)}
        activeOpacity={0.8}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <ZapIcon size={13} color="#f59e0b" />
          <Text style={styles.kernelAccordionTitle}>PROMPT KERNEL MODIFIER INSPECTOR</Text>
        </View>
        <ChevronDownIcon size={12} color="#71717a" />
      </TouchableOpacity>

      {kernelInspectorOpen && (
        <View style={styles.kernelBody}>
          <Text style={styles.kernelText}>
            {currentArchSpec.systemPromptModifier}
          </Text>
          <View style={styles.kernelVectorLine}>
            <Text style={styles.kernelVectorText}>
              [PAD VECTOR]: P={pad.pleasure > 0 ? `+${pad.pleasure.toFixed(2)}` : pad.pleasure.toFixed(2)} | A={pad.arousal.toFixed(2)} | D={pad.dominance.toFixed(2)} | Intensity={Math.round(toneIntensity * 100)}%
            </Text>
          </View>
        </View>
      )}

      {/* 5. OPTIONAL CUSTOM BACKSTORY */}
      {showBackstory && onUpdateCustomBackstory && (
        <View style={{ marginTop: 12 }}>
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

      {/* 6. LIVE COGNITIVE SIMULATION TERMINAL */}
      <View style={styles.simContainer}>
        <View style={styles.simHeaderRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <ZapIcon size={14} color="#38bdf8" />
            <Text style={styles.simTitle}>LIVE COGNITIVE SIMULATION</Text>
          </View>
          <View style={styles.simTagBadge}>
            <Text style={styles.simTagText}>{livePreview.tag}</Text>
          </View>
        </View>

        {/* Scenario Switcher Tabs */}
        <View style={styles.scenarioTabs}>
          {PREVIEW_SCENARIOS.map(s => {
            const isChosen = activeScenario === s.id;
            return (
              <TouchableOpacity
                key={s.id}
                style={[styles.scenarioTab, isChosen && styles.scenarioTabActive]}
                onPress={() => {
                  triggerHaptic();
                  setActiveScenario(s.id);
                }}
              >
                <Text style={[styles.scenarioTabText, isChosen && styles.scenarioTabTextActive]}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* User Prompt Box */}
        <View style={styles.simPromptBox}>
          <Text style={styles.simPromptLabel}>INPUT SCENARIO:</Text>
          <Text style={styles.simPromptText}>
            "{PREVIEW_SCENARIOS.find(s => s.id === activeScenario)?.prompt}"
          </Text>
        </View>

        {/* Internal Cognitive Reasoning Trace */}
        <View style={styles.thoughtCard}>
          <Text style={styles.thoughtCardHeader}>INTERNAL REASONING TRACE</Text>
          <Text style={styles.thoughtCardBody}>{livePreview.thought}</Text>
        </View>

        {/* Synthesized Output Response */}
        <View style={styles.responseCard}>
          <Text style={styles.responseCardHeader}>SYNTHESIZED SOUL OUTPUT</Text>
          <Text style={styles.responseCardBody}>{livePreview.response}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },

  // Top DNN HUD Card
  hudCard: {
    backgroundColor: '#0c0d12',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.2)',
    borderRadius: 18,
    padding: 14,
    gap: 12,
  },
  hudTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  hudHeaderTitle: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  hudHeaderSub: {
    color: '#71717a',
    fontSize: 11,
    marginTop: 2,
  },
  resetBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  resetBtnText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '600',
  },
  radarContainer: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  radarBox: {
    flex: 1.2,
    height: 100,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  radarCornerTag: {
    position: 'absolute',
    color: '#3f3f46',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  telemetryColumn: {
    flex: 0.9,
    gap: 6,
  },
  telemetryChip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#111116',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  telemetryChipLabel: {
    color: '#71717a',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  telemetryChipVal: {
    fontSize: 11,
    fontWeight: '800',
  },

  // Section Headers
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 2,
  },
  sectionTitle: {
    color: '#71717a',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  sectionSubBadge: {
    color: '#52525b',
    fontSize: 10,
    fontWeight: '700',
  },

  // Archetype Matrix Grid
  archetypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  archCard: {
    width: '48.5%',
    backgroundColor: '#0c0c10',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  archCardActive: {
    borderColor: '#ffffff',
    backgroundColor: '#14141c',
  },
  archCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  archStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#3f3f46',
    marginTop: 4,
  },
  archCardName: {
    color: '#a1a1aa',
    fontSize: 12,
    fontWeight: '700',
  },
  archCardNameActive: {
    color: '#ffffff',
  },
  archRoleTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
    borderWidth: 1,
    marginTop: 3,
  },
  archRoleTagText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  archCardDesc: {
    color: '#71717a',
    fontSize: 10,
    lineHeight: 14,
  },
  archPadFooter: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.04)',
    paddingTop: 4,
    marginTop: 2,
  },
  archPadFooterText: {
    color: '#52525b',
    fontSize: 9,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  // Tuner Cards
  tunerCard: {
    backgroundColor: '#0c0c10',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 14,
    gap: 10,
  },
  tunerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  tunerLabel: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  tunerSub: {
    color: '#71717a',
    fontSize: 10,
    marginTop: 2,
  },
  tunerValBadge: {
    backgroundColor: '#18181f',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  tunerValText: {
    fontSize: 11,
    fontWeight: '800',
  },
  tunerTrack: {
    height: 6,
    backgroundColor: '#18181f',
    borderRadius: 3,
    overflow: 'hidden',
  },
  tunerFill: {
    height: '100%',
    borderRadius: 3,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepBtn: {
    backgroundColor: '#18181f',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  stepBtnText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  presetDeck: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
  },
  presetPill: {
    backgroundColor: '#111116',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  presetPillActive: {
    backgroundColor: '#27272a',
    borderColor: '#ffffff',
  },
  presetPillText: {
    color: '#71717a',
    fontSize: 10,
    fontWeight: '600',
  },
  presetPillTextActive: {
    color: '#ffffff',
    fontWeight: '800',
  },

  // Kernel Inspector
  kernelAccordionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 6,
  },
  kernelAccordionTitle: {
    color: '#f59e0b',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  kernelBody: {
    backgroundColor: '#0a0a0d',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  kernelText: {
    color: '#e4e4e7',
    fontSize: 11,
    lineHeight: 16,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  kernelVectorLine: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
    paddingTop: 6,
  },
  kernelVectorText: {
    color: '#38bdf8',
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontWeight: '600',
  },

  // Custom Backstory
  backstoryInput: {
    backgroundColor: '#0c0c10',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 10,
    padding: 10,
    color: '#ffffff',
    fontSize: 11,
    textAlignVertical: 'top',
    marginTop: 4,
  },

  // Simulation Container
  simContainer: {
    backgroundColor: '#0a0a0f',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.2)',
    borderRadius: 16,
    padding: 14,
    gap: 10,
    marginTop: 8,
  },
  simHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  simTitle: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  simTagBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  simTagText: {
    color: '#38bdf8',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  scenarioTabs: {
    flexDirection: 'row',
    gap: 6,
  },
  scenarioTab: {
    flex: 1,
    backgroundColor: '#111116',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 6,
    alignItems: 'center',
  },
  scenarioTabActive: {
    backgroundColor: '#27272a',
    borderColor: '#38bdf8',
  },
  scenarioTabText: {
    color: '#71717a',
    fontSize: 9,
    fontWeight: '600',
  },
  scenarioTabTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  simPromptBox: {
    backgroundColor: '#111116',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  simPromptLabel: {
    color: '#52525b',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  simPromptText: {
    color: '#a1a1aa',
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 2,
  },
  thoughtCard: {
    backgroundColor: 'rgba(56, 189, 248, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.15)',
    borderRadius: 8,
    padding: 10,
    gap: 3,
  },
  thoughtCardHeader: {
    color: '#38bdf8',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  thoughtCardBody: {
    color: '#94a3b8',
    fontSize: 10,
    lineHeight: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  responseCard: {
    backgroundColor: '#14141a',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  responseCardHeader: {
    color: '#71717a',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  responseCardBody: {
    color: '#ffffff',
    fontSize: 12,
    lineHeight: 18,
  },
});
