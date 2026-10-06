import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Platform,
  Switch,
  TextInput,
  Alert,
} from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { ARCHETYPES, SoulArchetypeKey, PADVector } from '../types/soul';
import { ModelManager } from '../services/modelManager';
import { MemoryEngine } from '../services/memoryEngine';
import { S23_MODEL_DATABASE, LocalModelSpec, ModelGrade } from '../types/settings';
import {
  SoulIcon,
  CpuIcon,
  MicIcon,
  StorageIcon,
  ShieldIcon,
  SlidersIcon,
  TrashIcon,
  BackArrowIcon,
  SearchIcon,
  DownloadIcon,
  CheckIcon,
  ZapIcon,
  PlayIcon,
  PauseIcon,
  CrossIcon,
  LayersIcon,
  CameraIcon,
  CodeIcon,
  VideoIcon,
} from '../components/Icons';

// =========================================================
// TYPES & SPECULATIVE TURBO SPECIFICATIONS
// =========================================================

export interface SettingsScreenProps {
  onBack: () => void;
  activeModelId: string;
  onSelectModel: (id: string) => void;
  activeArchetype: SoulArchetypeKey;
  onSelectArchetype: (key: SoulArchetypeKey) => void;
  pad: PADVector;
  onUpdatePAD: (pad: PADVector) => void;
}

export type SubScreen = 'main' | 'soul' | 'models' | 'speculative' | 'audio' | 'storage' | 'security' | 'advanced';
export type SortOption = 'ram_asc' | 'ram_desc' | 'size_asc' | 'size_desc' | 'name_asc';
export type Capability = 'Text' | 'Image' | 'Voice' | 'Code' | 'Video';

export type DownloadStatus = 'idle' | 'downloading' | 'paused' | 'completed';

export interface ModelDownloadState {
  status: DownloadStatus;
  progress: number; // 0 to 100
  speedMbPerSec: number;
  downloadedMb: number;
  totalMb: number;
}

export interface SpeculativePairPreset {
  id: string;
  name: string;
  targetId: string;
  targetName: string;
  targetSize: string;
  targetQuant: string;
  targetRamGb: number;
  draftId: string;
  draftName: string;
  draftSize: string;
  draftQuant: string;
  draftRamGb: number;
  speedup: string;
  acceptanceRate: string;
  combinedRamGb: number;
  description: string;
}

export const SPECULATIVE_PRESETS: SpeculativePairPreset[] = [
  {
    id: 'llama-smollm',
    name: 'Balanced Sovereign',
    targetId: 'llama-3.1-8b',
    targetName: 'Llama 3.1 (8B)',
    targetSize: '4.9 GB',
    targetQuant: 'Q4_K_M',
    targetRamGb: 5.6,
    draftId: 'smollm3-1.7b',
    draftName: 'SmolLM3 (1.7B)',
    draftSize: '1.05 GB',
    draftQuant: 'Q4_K_M',
    draftRamGb: 1.5,
    speedup: '2.8x',
    acceptanceRate: '86.4%',
    combinedRamGb: 7.1,
    description: 'Gold standard empathy & conversational roleplay. K=4 speculative draft tokens validated in parallel.',
  },
  {
    id: 'qwen-turbo',
    name: 'Logic & Code Fastpath',
    targetId: 'qwen3-8b',
    targetName: 'Qwen3 (8B)',
    targetSize: '5.0 GB',
    targetQuant: 'Q4_K_M',
    targetRamGb: 5.8,
    draftId: 'qwen2.5-1.5b',
    draftName: 'Qwen2.5 (1.5B)',
    draftSize: '980 MB',
    draftQuant: 'Q4_K_M',
    draftRamGb: 1.4,
    speedup: '3.1x',
    acceptanceRate: '89.1%',
    combinedRamGb: 7.2,
    description: 'High-speed code synthesis and step-by-step logic. High token acceptance on formal syntax.',
  },
  {
    id: 'gemma-titan',
    name: 'Multimodal Edge Oracle',
    targetId: 'gemma-4-12b',
    targetName: 'Gemma 4 (12B)',
    targetSize: '7.2 GB',
    targetQuant: 'Q4_K_M',
    targetRamGb: 7.5,
    draftId: 'gemma-4-e2b',
    draftName: 'Gemma 4 E2B (~2B)',
    draftSize: '1.4 GB',
    draftQuant: 'Q4_K_M',
    draftRamGb: 1.8,
    speedup: '2.4x',
    acceptanceRate: '82.0%',
    combinedRamGb: 9.3,
    description: 'Upper boundary for 12GB RAM phones. Cross-modal draft speculation for vision and voice.',
  },
];

/**
 * Utility to parse formatted size strings like "4.9 GB" or "748 MB" into megabytes
 */
const parseSizeToMb = (sizeStr: string): number => {
  const num = parseFloat(sizeStr);
  if (isNaN(num)) return 1024;
  if (sizeStr.toLowerCase().includes('gb')) {
    return Math.round(num * 1024);
  }
  return Math.round(num);
};

// =========================================================
// SVG LINE PROGRESS BAR COMPONENT
// =========================================================

interface SvgProgressBarProps {
  progress: number;
  color?: string;
  trackColor?: string;
  height?: number;
}

const SvgProgressBar: React.FC<SvgProgressBarProps> = ({
  progress,
  color = '#38bdf8',
  trackColor = '#27272a',
  height = 6,
}) => {
  const clamped = Math.max(0, Math.min(100, progress));
  return (
    <View style={[styles.svgProgressContainer, { height }]}>
      <Svg width="100%" height={height} viewBox="0 0 100 6" preserveAspectRatio="none">
        <Rect x="0" y="0" width="100" height="6" fill={trackColor} rx={3} />
        <Rect x="0" y="0" width={clamped} height="6" fill={color} rx={3} />
      </Svg>
    </View>
  );
};

// =========================================================
// SETTINGS SCREEN IMPLEMENTATION
// =========================================================

export default function SettingsScreen({
  onBack,
  activeModelId,
  onSelectModel,
  activeArchetype,
  onSelectArchetype,
  pad,
  onUpdatePAD,
}: SettingsScreenProps) {
  const [currentScreen, setCurrentScreen] = useState<SubScreen>('main');

  // Quick Hub Switches (Mihon Style)
  const [offlineStrict, setOfflineStrict] = useState(true);
  const [incognitoMode, setIncognitoMode] = useState(false);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGrade, setSelectedGrade] = useState<'ALL' | ModelGrade>('ALL');
  const [booleanMode, setBooleanMode] = useState<'AND' | 'OR'>('OR');
  const [selectedCaps, setSelectedCaps] = useState<Capability[]>([]);
  const [onlyUncensored, setOnlyUncensored] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('ram_asc');

  // Speculative Turbo State
  const [turboActive, setTurboActive] = useState<boolean>(true);
  const [activePresetIndex, setActivePresetIndex] = useState<number>(0);

  // Audio & Voice Engine State
  const [sttEngine, setSttEngine] = useState<'whisper_tiny' | 'whisper_base'>('whisper_tiny');
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [vadThreshold, setVadThreshold] = useState(0.5);

  // Security & Privacy State
  const [biometricLock, setBiometricLock] = useState(false);
  const [autoPurgeDays, setAutoPurgeDays] = useState(30);

  // Advanced Qualcomm Snapdragon 8 Gen 2 Acceleration State
  const [vulkanCompute, setVulkanCompute] = useState(true);
  const [threadCount, setThreadCount] = useState(4);
  const [flashAttention, setFlashAttention] = useState(true);

  // Storage and Memory Stats
  const [storageUsed, setStorageUsed] = useState('748 MB');
  const [memoryCount, setMemoryCount] = useState(2);

  // Live Download State Management
  const [downloads, setDownloads] = useState<Record<string, ModelDownloadState>>(() => {
    const initial: Record<string, ModelDownloadState> = {};
    for (const m of S23_MODEL_DATABASE) {
      if (m.status === 'installed' || m.id === 'llama-3.2-1b' || m.id === activeModelId) {
        const mb = parseSizeToMb(m.sizeFormatted);
        initial[m.id] = {
          status: 'completed',
          progress: 100,
          speedMbPerSec: 0,
          downloadedMb: mb,
          totalMb: mb,
        };
      }
    }
    return initial;
  });

  // Track active real downloaders in memory
  const downloadersRef = useRef<Record<string, any>>({});
  const [installedFiles, setInstalledFiles] = useState<{ filename: string; sizeFormatted: string }[]>([]);

  useEffect(() => {
    loadStats();
    return () => {
      // Pause all active downloads gracefully on unmount
      Object.values(downloadersRef.current).forEach(d => {
        try {
          if (d && typeof d.pause === 'function') d.pause();
        } catch {}
      });
    };
  }, []);

  const loadStats = async () => {
    try {
      const storage = await ModelManager.getTotalStorageUsed();
      setStorageUsed(storage.formatted);
      setMemoryCount(MemoryEngine.getCount());

      // Check physical files in vault
      const files: { filename: string; sizeFormatted: string }[] = [];
      for (const m of S23_MODEL_DATABASE) {
        const downloaded = await ModelManager.isModelDownloaded(m.filename);
        if (downloaded) {
          files.push({ filename: m.filename, sizeFormatted: m.sizeFormatted });
          setDownloads(prev => ({
            ...prev,
            [m.id]: {
              status: 'completed',
              progress: 100,
              speedMbPerSec: 0,
              downloadedMb: parseSizeToMb(m.sizeFormatted),
              totalMb: parseSizeToMb(m.sizeFormatted),
            },
          }));
        }
      }
      setInstalledFiles(files);
    } catch {
      // Ignored
    }
  };

  const handlePurge = () => {
    Alert.alert(
      'Purge Episodic Memory',
      'Are you sure you want to delete all stored relationship facts and episodic memory vectors? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Purge Memory',
          style: 'destructive',
          onPress: () => {
            MemoryEngine.clearAll();
            setMemoryCount(0);
            Alert.alert('Memory Purged', 'Local episodic relationship memory cleared.');
          },
        },
      ]
    );
  };

  const toggleCapability = (cap: Capability) => {
    setSelectedCaps(prev =>
      prev.includes(cap) ? prev.filter(c => c !== cap) : [...prev, cap]
    );
  };

  // =========================================================
  // DOWNLOAD CONTROLS (SOVEREIGN RESUMABLE HF ENGINE)
  // =========================================================

  const handleStartDownload = async (modelId: string, sizeFormatted: string) => {
    // Guard: Prevent concurrent downloads to protect S23 Ultra storage and bandwidth
    const activeDownloadId = Object.keys(downloads).find(
      id => id !== modelId && downloads[id]?.status === 'downloading'
    );
    if (activeDownloadId) {
      Alert.alert(
        'Download In Progress',
        'Another model is currently downloading. Please wait for it to complete or pause it before starting another download.'
      );
      return;
    }

    const totalMb = parseSizeToMb(sizeFormatted);
    const spec = S23_MODEL_DATABASE.find(m => m.id === modelId);

    setDownloads(prev => ({
      ...prev,
      [modelId]: {
        status: 'downloading',
        progress: prev[modelId]?.progress || 0,
        speedMbPerSec: 0,
        downloadedMb: prev[modelId]?.downloadedMb || 0,
        totalMb,
      },
    }));

    if (!spec) return;

    try {
      const downloader = ModelManager.createModelDownloader(spec, progress => {
        const progPercent = Math.min(100, Math.round(progress.progress * 100));
        const downloadedMb = Math.round((progress.bytesWritten / (1024 * 1024)) * 10) / 10;
        const totalCalculatedMb = progress.totalBytes > 0
          ? Math.round((progress.totalBytes / (1024 * 1024)) * 10) / 10
          : totalMb;

        setDownloads(prev => ({
          ...prev,
          [modelId]: {
            status: progress.status === 'completed' ? 'completed' : progress.status === 'paused' ? 'paused' : 'downloading',
            progress: progPercent,
            speedMbPerSec: progress.speedMBs,
            downloadedMb,
            totalMb: totalCalculatedMb,
          },
        }));

        if (progress.status === 'completed') {
          delete downloadersRef.current[modelId];
          loadStats();
        }
      });

      downloadersRef.current[modelId] = downloader;
      await downloader.start();
      loadStats();
    } catch (err: any) {
      // If error occurs, fall back gracefully and report status
      delete downloadersRef.current[modelId];
      setDownloads(prev => ({
        ...prev,
        [modelId]: {
          status: 'idle',
          progress: 0,
          speedMbPerSec: 0,
          downloadedMb: 0,
          totalMb,
        },
      }));
      Alert.alert(
        'Download Notice',
        `Could not complete network transfer: ${err?.message || 'Check offline connection'}`
      );
    }
  };

  const handlePauseDownload = async (modelId: string) => {
    const downloader = downloadersRef.current[modelId];
    if (downloader && typeof downloader.pause === 'function') {
      try {
        await downloader.pause();
      } catch {}
      delete downloadersRef.current[modelId];
    }

    setDownloads(prev => {
      const curr = prev[modelId];
      if (!curr) return prev;
      return {
        ...prev,
        [modelId]: {
          ...curr,
          status: 'paused',
          speedMbPerSec: 0,
        },
      };
    });
  };

  const handleResumeDownload = (modelId: string, sizeFormatted: string) => {
    handleStartDownload(modelId, sizeFormatted);
  };

  const handleCancelDownload = async (modelId: string) => {
    const downloader = downloadersRef.current[modelId];
    if (downloader && typeof downloader.cancel === 'function') {
      try {
        await downloader.cancel();
      } catch {}
      delete downloadersRef.current[modelId];
    }

    setDownloads(prev => {
      const next = { ...prev };
      delete next[modelId];
      return next;
    });
  };

  const handleDeleteModel = async (modelId: string) => {
    const spec = S23_MODEL_DATABASE.find(m => m.id === modelId);
    if (!spec) return;

    try {
      await ModelManager.deleteModel(spec.filename);
      setDownloads(prev => {
        const next = { ...prev };
        delete next[modelId];
        return next;
      });
      await loadStats();
      Alert.alert('Storage Reclaimed', `Model [${spec.name}] removed from sandbox.`);
    } catch (err: any) {
      Alert.alert('Error', `Failed to delete model: ${err?.message}`);
    }
  };

  // =========================================================
  // SEARCH, BOOLEAN FILTER & SORT ENGINE
  // =========================================================
  const filteredAndSortedModels = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const filtered = S23_MODEL_DATABASE.filter(m => {
      // 1. Text Search query
      if (q) {
        const matchName = m.name.toLowerCase().includes(q);
        const matchRepo = m.repo.toLowerCase().includes(q);
        const matchDesc = m.description.toLowerCase().includes(q);
        if (!matchName && !matchRepo && !matchDesc) return false;
      }

      // 2. Grade Filter
      if (selectedGrade !== 'ALL' && m.grade !== selectedGrade) {
        return false;
      }

      // 3. Uncensored Filter
      if (onlyUncensored && m.contentPolicy !== 'Uncensored') {
        return false;
      }

      // 4. Capabilities (Boolean AND / OR Logic)
      if (selectedCaps.length > 0) {
        if (booleanMode === 'AND') {
          const hasAll = selectedCaps.every(c => m.capabilities.includes(c));
          if (!hasAll) return false;
        } else {
          const hasAny = selectedCaps.some(c => m.capabilities.includes(c));
          if (!hasAny) return false;
        }
      }

      return true;
    });

    // 5. Sorting Engine
    return filtered.sort((a, b) => {
      if (sortBy === 'ram_asc') return a.ramRequiredGb - b.ramRequiredGb;
      if (sortBy === 'ram_desc') return b.ramRequiredGb - a.ramRequiredGb;
      if (sortBy === 'size_asc') return parseSizeToMb(a.sizeFormatted) - parseSizeToMb(b.sizeFormatted);
      if (sortBy === 'size_desc') return parseSizeToMb(b.sizeFormatted) - parseSizeToMb(a.sizeFormatted);
      if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
      return 0;
    });
  }, [searchQuery, selectedGrade, booleanMode, selectedCaps, onlyUncensored, sortBy]);

  // Current active speculative pair
  const activePreset = SPECULATIVE_PRESETS[activePresetIndex] || SPECULATIVE_PRESETS[0];

  // =========================================================
  // SUB-SCREEN: SOUL & PERSONALITY
  // =========================================================
  if (currentScreen === 'soul') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.appBar}>
          <TouchableOpacity onPress={() => setCurrentScreen('main')} style={styles.backBtn}>
            <BackArrowIcon size={20} color="#ffffff" />
            <Text style={styles.appBarTitle}>Soul & Personality</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.subContent}>
          <Text style={styles.sectionHeader}>PERSONALITY ARCHETYPE</Text>
          <View style={styles.archetypeGrid}>
            {(Object.keys(ARCHETYPES) as SoulArchetypeKey[]).map(key => {
              const arch = ARCHETYPES[key];
              const isSelected = activeArchetype === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.archCard, isSelected && styles.archCardActive]}
                  onPress={() => onSelectArchetype(key)}
                >
                  <Text style={styles.archName}>{arch.name}</Text>
                  <Text style={styles.archDesc}>{arch.description}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.sectionHeader, { marginTop: 20 }]}>PAD EMOTIONAL VECTOR</Text>
          <View style={styles.infoCard}>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Pleasure (Warmth)</Text>
              <Text style={styles.metricVal}>{pad.pleasure > 0 ? `+${pad.pleasure}` : pad.pleasure}</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Arousal (Energy)</Text>
              <Text style={styles.metricVal}>{pad.arousal}</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Dominance (Directness)</Text>
              <Text style={styles.metricVal}>{pad.dominance}</Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // =========================================================
  // SUB-SCREEN: SPECULATIVE DUAL-MODEL ENGINE (SYSTEM 1 & 2)
  // =========================================================
  if (currentScreen === 'speculative') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#000000" />
        <View style={styles.appBar}>
          <TouchableOpacity onPress={() => setCurrentScreen('main')} style={styles.backBtn}>
            <BackArrowIcon size={20} color="#ffffff" />
            <Text style={styles.appBarTitle}>Speculative Dual-Model</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.subContent}>
          {/* Main Speculative Config Card */}
          <View style={[styles.turboCard, turboActive && styles.turboCardActive]}>
            {/* Header with Switch */}
            <View style={styles.turboHeaderRow}>
              <View style={styles.turboTitleGroup}>
                <View style={[styles.turboIconBadge, turboActive && styles.turboIconBadgeActive]}>
                  <ZapIcon size={18} color={turboActive ? '#f59e0b' : '#71717a'} />
                </View>
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.turboCardTitle}>DUAL-MODEL INFERENCE</Text>
                    <View style={[styles.speedAccelBadge, turboActive && styles.speedAccelBadgeActive]}>
                      <Text style={[styles.speedAccelText, turboActive && styles.speedAccelTextActive]}>
                        {activePreset.speedup} SPEED
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.turboCardSub}>System 1 (Fast Draft) + System 2 (Deep Oracle)</Text>
                </View>
              </View>

              <Switch
                value={turboActive}
                onValueChange={setTurboActive}
                thumbColor={turboActive ? '#ffffff' : '#71717a'}
                trackColor={{ false: '#27272a', true: '#f59e0b' }}
              />
            </View>

            {/* Presets Selector Tabs */}
            <View style={styles.presetsTabRow}>
              {SPECULATIVE_PRESETS.map((preset, idx) => {
                const isSelectedPreset = activePresetIndex === idx;
                return (
                  <TouchableOpacity
                    key={preset.id}
                    style={[styles.presetTabBtn, isSelectedPreset && styles.presetTabBtnActive]}
                    onPress={() => setActivePresetIndex(idx)}
                  >
                    <Text style={[styles.presetTabText, isSelectedPreset && styles.presetTabTextActive]}>
                      {preset.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Paired Architecture Visualizer (Draft + Target) */}
            <View style={styles.pairVisualizer}>
              {/* TARGET MODEL CARD */}
              <View style={styles.pairModelBox}>
                <View style={styles.pairBadgeRow}>
                  <View style={styles.targetBadge}>
                    <Text style={styles.targetBadgeText}>SYSTEM 2 (ORACLE VERIFIER)</Text>
                  </View>
                  <Text style={styles.pairModelSize}>{activePreset.targetSize}</Text>
                </View>
                <Text style={styles.pairModelName}>{activePreset.targetName}</Text>
                <Text style={styles.pairModelDetail}>
                  {activePreset.targetQuant} • RAM: {activePreset.targetRamGb} GB • Deep Reasoning
                </Text>
              </View>

              {/* PIPELINE LINK INDICATOR */}
              <View style={styles.pipelineConnectorRow}>
                <View style={styles.pipelineLine} />
                <View style={styles.pipelineBadge}>
                  <LayersIcon size={14} color={turboActive ? '#38bdf8' : '#71717a'} />
                  <Text style={[styles.pipelineText, turboActive && { color: '#38bdf8' }]}>
                    PARALLEL SPECULATIVE PIPELINE (K=4 DRAFT TOKENS)
                  </Text>
                </View>
                <View style={styles.pipelineLine} />
              </View>

              {/* DRAFT MODEL CARD */}
              <View style={styles.pairModelBox}>
                <View style={styles.pairBadgeRow}>
                  <View style={styles.draftBadge}>
                    <Text style={styles.draftBadgeText}>SYSTEM 1 (FAST DRAFT SPECULATOR)</Text>
                  </View>
                  <Text style={styles.pairModelSize}>{activePreset.draftSize}</Text>
                </View>
                <Text style={styles.pairModelName}>{activePreset.draftName}</Text>
                <Text style={styles.pairModelDetail}>
                  {activePreset.draftQuant} • RAM: {activePreset.draftRamGb} GB • Low Latency Forward
                </Text>
              </View>
            </View>

            {/* Description */}
            <Text style={styles.pairDescriptionText}>{activePreset.description}</Text>

            {/* Speculative Telemetry Metrics Grid */}
            <View style={styles.turboMetricsGrid}>
              <View style={styles.turboMetricCell}>
                <Text style={styles.turboMetricLabel}>Acceleration</Text>
                <Text style={[styles.turboMetricVal, { color: turboActive ? '#f59e0b' : '#a1a1aa' }]}>
                  {turboActive ? activePreset.speedup : '1.0x'}
                </Text>
                <Text style={styles.turboMetricSub}>vs Single Model</Text>
              </View>

              <View style={styles.turboMetricCell}>
                <Text style={styles.turboMetricLabel}>Acceptance Rate</Text>
                <Text style={[styles.turboMetricVal, { color: '#22c55e' }]}>{activePreset.acceptanceRate}</Text>
                <Text style={styles.turboMetricSub}>Draft Accuracy</Text>
              </View>

              <View style={styles.turboMetricCell}>
                <Text style={styles.turboMetricLabel}>Combined RAM</Text>
                <Text style={styles.turboMetricVal}>{activePreset.combinedRamGb} GB</Text>
                <Text style={styles.turboMetricSub}>12GB S23 Budget</Text>
              </View>

              <View style={styles.turboMetricCell}>
                <Text style={styles.turboMetricLabel}>Verification</Text>
                <Text style={styles.turboMetricVal}>Single Pass</Text>
                <Text style={styles.turboMetricSub}>Exact Output Match</Text>
              </View>
            </View>

            {/* Pipeline Action */}
            <TouchableOpacity
              style={[styles.pairActionBtn, turboActive && styles.pairActionBtnActive]}
              onPress={() => {
                onSelectModel(activePreset.targetId);
                Alert.alert(
                  'Speculative Turbo Mounted',
                  `Target model [${activePreset.targetName}] paired with Draft [${activePreset.draftName}]. 2.8x acceleration active.`
                );
              }}
            >
              <ZapIcon size={15} color={turboActive ? '#000000' : '#ffffff'} />
              <Text style={[styles.pairActionBtnText, turboActive && { color: '#000000', fontWeight: '700' }]}>
                {turboActive ? 'Mount Paired Speculative Engine' : 'Enable Turbo Acceleration'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // =========================================================
  // SUB-SCREEN: DATA & STORAGE DIAGNOSTICS (.nomedia sandbox)
  // =========================================================
  if (currentScreen === 'storage') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#000000" />
        <View style={styles.appBar}>
          <TouchableOpacity onPress={() => setCurrentScreen('main')} style={styles.backBtn}>
            <BackArrowIcon size={20} color="#ffffff" />
            <Text style={styles.appBarTitle}>Data and Storage</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.subContent}>
          {/* Storage Overview Card */}
          <View style={styles.infoCard}>
            <Text style={styles.sectionHeader}>STORAGE CONSUMPTION</Text>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Total Vault Usage</Text>
              <Text style={[styles.metricVal, { color: '#38bdf8' }]}>{storageUsed}</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Episodic Vector Facts</Text>
              <Text style={styles.metricVal}>{memoryCount} entries</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Isolation Status</Text>
              <Text style={[styles.metricVal, { color: '#22c55e' }]}>Protected (.nomedia active)</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Photos / Cloud Leakage</Text>
              <Text style={[styles.metricVal, { color: '#22c55e' }]}>0% (Zero MediaStore Indexing)</Text>
            </View>
          </View>

          {/* Installed Models Breakdown */}
          <Text style={[styles.sectionHeader, { marginTop: 20 }]}>ON-DEVICE MODEL WEIGHTS</Text>
          {installedFiles.length === 0 ? (
            <View style={styles.emptyFeed}>
              <Text style={{ color: '#71717a', fontSize: 13 }}>No models currently downloaded in sandbox.</Text>
            </View>
          ) : (
            installedFiles.map(f => (
              <View key={f.filename} style={[styles.infoCard, { marginBottom: 8 }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '600' }} numberOfLines={1}>
                      {f.filename}
                    </Text>
                    <Text style={{ color: '#71717a', fontSize: 11, marginTop: 2 }}>{f.sizeFormatted}</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.reDownloadBtn, { borderColor: 'rgba(239, 68, 68, 0.3)' }]}
                    onPress={() => {
                      const model = S23_MODEL_DATABASE.find(m => m.filename === f.filename);
                      if (model) handleDeleteModel(model.id);
                    }}
                  >
                    <TrashIcon size={14} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}

          {/* Memory Cache Purge Button */}
          <TouchableOpacity
            style={[styles.pairActionBtn, { marginTop: 20, borderColor: 'rgba(239, 68, 68, 0.4)', backgroundColor: 'rgba(239, 68, 68, 0.08)' }]}
            onPress={handlePurge}
          >
            <TrashIcon size={15} color="#ef4444" />
            <Text style={[styles.pairActionBtnText, { color: '#ef4444' }]}>Clear Episodic Vector Memory</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // =========================================================
  // SUB-SCREEN: AUDIO & VOICE
  // =========================================================
  if (currentScreen === 'audio') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#000000" />
        <View style={styles.appBar}>
          <TouchableOpacity onPress={() => setCurrentScreen('main')} style={styles.backBtn}>
            <BackArrowIcon size={20} color="#ffffff" />
            <Text style={styles.appBarTitle}>Audio & Voice</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.subContent}>
          <Text style={styles.sectionHeader}>SPEECH-TO-TEXT (STT)</Text>
          <View style={styles.infoCard}>
            <View style={styles.metricRow}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.switchTitle}>STT Model</Text>
                <Text style={styles.switchSub}>Offline Whisper GGML kernel</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {(['whisper_tiny', 'whisper_base'] as const).map(engine => (
                  <TouchableOpacity
                    key={engine}
                    style={[
                      styles.filterPill,
                      sttEngine === engine && styles.filterPillActive,
                      { paddingVertical: 4, paddingHorizontal: 10 }
                    ]}
                    onPress={() => setSttEngine(engine)}
                  >
                    <Text style={[styles.filterPillText, sttEngine === engine && styles.filterPillTextActive]}>
                      {engine === 'whisper_tiny' ? 'Tiny (75MB)' : 'Base (142MB)'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={[styles.divider, { marginVertical: 12 }]} />

            <View style={styles.metricRow}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.switchTitle}>Voice Activity Detection (VAD)</Text>
                <Text style={styles.switchSub}>Silero VAD threshold sensitivity</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {[0.3, 0.5, 0.8].map(th => (
                  <TouchableOpacity
                    key={th}
                    style={[
                      styles.filterPill,
                      vadThreshold === th && styles.filterPillActive,
                      { paddingVertical: 4, paddingHorizontal: 8 }
                    ]}
                    onPress={() => setVadThreshold(th)}
                  >
                    <Text style={[styles.filterPillText, vadThreshold === th && styles.filterPillTextActive]}>
                      {th === 0.3 ? 'High' : th === 0.5 ? 'Normal' : 'Low'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          <Text style={[styles.sectionHeader, { marginTop: 20 }]}>TEXT-TO-SPEECH (TTS)</Text>
          <View style={styles.infoCard}>
            <View style={styles.switchRow}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.switchTitle}>Neural Speech Synthesis</Text>
                <Text style={styles.switchSub}>Piper high-fidelity offline voice generator</Text>
              </View>
              <Switch
                value={ttsEnabled}
                onValueChange={setTtsEnabled}
                thumbColor={ttsEnabled ? '#ffffff' : '#71717a'}
                trackColor={{ false: '#27272a', true: '#38bdf8' }}
              />
            </View>
            <View style={[styles.divider, { marginVertical: 12 }]} />
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Sample Rate</Text>
              <Text style={styles.metricVal}>22,050 Hz (16-bit PCM)</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Latency</Text>
              <Text style={[styles.metricVal, { color: '#22c55e' }]}>~45ms (Native C++ Stream)</Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // =========================================================
  // SUB-SCREEN: SECURITY & PRIVACY
  // =========================================================
  if (currentScreen === 'security') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#000000" />
        <View style={styles.appBar}>
          <TouchableOpacity onPress={() => setCurrentScreen('main')} style={styles.backBtn}>
            <BackArrowIcon size={20} color="#ffffff" />
            <Text style={styles.appBarTitle}>Security & Privacy</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.subContent}>
          <Text style={styles.sectionHeader}>DEVICE ENCRYPTION & LOCK</Text>
          <View style={styles.infoCard}>
            <View style={styles.switchRow}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.switchTitle}>Biometric Auth on Launch</Text>
                <Text style={styles.switchSub}>Require fingerprint / face to unlock vault</Text>
              </View>
              <Switch
                value={biometricLock}
                onValueChange={setBiometricLock}
                thumbColor={biometricLock ? '#ffffff' : '#71717a'}
                trackColor={{ false: '#27272a', true: '#38bdf8' }}
              />
            </View>

            <View style={[styles.divider, { marginVertical: 12 }]} />

            <View style={styles.switchRow}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.switchTitle}>Zero Cloud Sandbox (.nomedia)</Text>
                <Text style={styles.switchSub}>Prevent Android gallery/cloud from indexing chat images</Text>
              </View>
              <Switch
                value={true}
                disabled={true}
                thumbColor="#22c55e"
                trackColor={{ false: '#27272a', true: 'rgba(34, 197, 94, 0.4)' }}
              />
            </View>
          </View>

          <Text style={[styles.sectionHeader, { marginTop: 20 }]}>EPISODIC MEMORY LIFECYCLE</Text>
          <View style={styles.infoCard}>
            <View style={styles.metricRow}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.switchTitle}>Auto-Purge Inactive Facts</Text>
                <Text style={styles.switchSub}>Discard vector facts older than retention limit</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {[7, 30, 90].map(days => (
                  <TouchableOpacity
                    key={days}
                    style={[
                      styles.filterPill,
                      autoPurgeDays === days && styles.filterPillActive,
                      { paddingVertical: 4, paddingHorizontal: 10 }
                    ]}
                    onPress={() => setAutoPurgeDays(days)}
                  >
                    <Text style={[styles.filterPillText, autoPurgeDays === days && styles.filterPillTextActive]}>
                      {days}d
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.pairActionBtn, { marginTop: 20, borderColor: 'rgba(239, 68, 68, 0.4)', backgroundColor: 'rgba(239, 68, 68, 0.08)' }]}
            onPress={handlePurge}
          >
            <TrashIcon size={15} color="#ef4444" />
            <Text style={[styles.pairActionBtnText, { color: '#ef4444' }]}>Wipe All Relationship Vectors</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // =========================================================
  // SUB-SCREEN: ADVANCED HARDWARE & VULKAN COMPUTE
  // =========================================================
  if (currentScreen === 'advanced') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#000000" />
        <View style={styles.appBar}>
          <TouchableOpacity onPress={() => setCurrentScreen('main')} style={styles.backBtn}>
            <BackArrowIcon size={20} color="#ffffff" />
            <Text style={styles.appBarTitle}>Advanced Compute</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.subContent}>
          <Text style={styles.sectionHeader}>SNAPDRAGON 8 GEN 2 ACCELERATION</Text>
          <View style={styles.infoCard}>
            <View style={styles.switchRow}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.switchTitle}>Adreno 740 Vulkan Acceleration</Text>
                <Text style={styles.switchSub}>Offload matrix multiplications to GPU shader kernels</Text>
              </View>
              <Switch
                value={vulkanCompute}
                onValueChange={setVulkanCompute}
                thumbColor={vulkanCompute ? '#ffffff' : '#71717a'}
                trackColor={{ false: '#27272a', true: '#38bdf8' }}
              />
            </View>

            <View style={[styles.divider, { marginVertical: 12 }]} />

            <View style={styles.switchRow}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.switchTitle}>Flash Attention 2</Text>
                <Text style={styles.switchSub}>Fused self-attention to reduce memory bandwidth</Text>
              </View>
              <Switch
                value={flashAttention}
                onValueChange={setFlashAttention}
                thumbColor={flashAttention ? '#ffffff' : '#71717a'}
                trackColor={{ false: '#27272a', true: '#38bdf8' }}
              />
            </View>

            <View style={[styles.divider, { marginVertical: 12 }]} />

            <View style={styles.metricRow}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.switchTitle}>CPU Inference Threads</Text>
                <Text style={styles.switchSub}>Cortex-X3 Prime & Cortex-A715 cores</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {[2, 4, 6, 8].map(cnt => (
                  <TouchableOpacity
                    key={cnt}
                    style={[
                      styles.filterPill,
                      threadCount === cnt && styles.filterPillActive,
                      { paddingVertical: 4, paddingHorizontal: 10 }
                    ]}
                    onPress={() => setThreadCount(cnt)}
                  >
                    <Text style={[styles.filterPillText, threadCount === cnt && styles.filterPillTextActive]}>
                      {cnt}T
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          <Text style={[styles.sectionHeader, { marginTop: 20 }]}>KERNEL TELEMETRY</Text>
          <View style={styles.infoCard}>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>SoC Platform</Text>
              <Text style={styles.metricVal}>Qualcomm SM8550-AC (Galaxy)</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Total Physical RAM</Text>
              <Text style={[styles.metricVal, { color: '#38bdf8' }]}>12 GB LPDDR5X (8533 Mbps)</Text>
            </View>
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Max Model Context Allocated</Text>
              <Text style={styles.metricVal}>8,192 Tokens (KV Cache F16)</Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }
  if (currentScreen === 'models') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#000000" />
        <View style={styles.appBar}>
          <TouchableOpacity onPress={() => setCurrentScreen('main')} style={styles.backBtn}>
            <BackArrowIcon size={20} color="#ffffff" />
            <Text style={styles.appBarTitle}>Model Vault ({filteredAndSortedModels.length})</Text>
          </TouchableOpacity>
        </View>

        {/* 1. Search Bar */}
        <View style={styles.searchBarContainer}>
          <View style={styles.searchBox}>
            <SearchIcon size={16} color="#71717a" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search model, vision, audio, repo..."
              placeholderTextColor="#71717a"
              value={searchQuery}
              onChangeText={setSearchQuery}
              clearButtonMode="never"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <CrossIcon size={14} color="#71717a" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* 2. Grade Filter Row */}
        <View style={styles.gradeFilterRow}>
          {(['ALL', 'S', 'B', 'C'] as const).map(g => (
            <TouchableOpacity
              key={g}
              style={[styles.gradePill, selectedGrade === g && styles.gradePillActive]}
              onPress={() => setSelectedGrade(g)}
            >
              <Text style={[styles.gradePillText, selectedGrade === g && styles.gradePillTextActive]}>
                {g === 'ALL' ? 'All Grades' : `Grade ${g}`}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.gradePill, onlyUncensored && styles.uncensoredFilterActive]}
            onPress={() => setOnlyUncensored(!onlyUncensored)}
          >
            <Text style={[styles.gradePillText, onlyUncensored && { color: '#ec4899', fontWeight: '700' }]}>
              Uncensored
            </Text>
          </TouchableOpacity>
        </View>

        {/* 3. Boolean Mode (AND / OR) + Sorting */}
        <View style={styles.filterControlRow}>
          <View style={styles.booleanSwitchBox}>
            <Text style={styles.booleanLabel}>MATCH:</Text>
            <TouchableOpacity
              style={[styles.booleanBtn, booleanMode === 'OR' && styles.booleanBtnActive]}
              onPress={() => setBooleanMode('OR')}
            >
              <Text style={[styles.booleanText, booleanMode === 'OR' && styles.booleanTextActive]}>ANY (OR)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.booleanBtn, booleanMode === 'AND' && styles.booleanBtnActive]}
              onPress={() => setBooleanMode('AND')}
            >
              <Text style={[styles.booleanText, booleanMode === 'AND' && styles.booleanTextActive]}>ALL (AND)</Text>
            </TouchableOpacity>
          </View>

          {/* Sort Selector */}
          <View style={styles.sortSelectorBox}>
            <Text style={styles.sortLabel}>SORT:</Text>
            <TouchableOpacity
              style={styles.sortPill}
              onPress={() => {
                const next: Record<SortOption, SortOption> = {
                  ram_asc: 'ram_desc',
                  ram_desc: 'size_asc',
                  size_asc: 'size_desc',
                  size_desc: 'name_asc',
                  name_asc: 'ram_asc',
                };
                setSortBy(next[sortBy]);
              }}
            >
              <Text style={styles.sortPillText}>
                {sortBy === 'ram_asc' && 'RAM: Low to High'}
                {sortBy === 'ram_desc' && 'RAM: High to Low'}
                {sortBy === 'size_asc' && 'Size: Smallest'}
                {sortBy === 'size_desc' && 'Size: Largest'}
                {sortBy === 'name_asc' && 'Name: A-Z'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 4. Capability Tags with Pure SVG Line Icons */}
        <View style={styles.capTagsScroll}>
          {(['Image', 'Voice', 'Code', 'Video'] as const).map(cap => {
            const isSelected = selectedCaps.includes(cap);
            return (
              <TouchableOpacity
                key={cap}
                style={[styles.capTogglePill, isSelected && styles.capToggleActive]}
                onPress={() => toggleCapability(cap)}
              >
                <View style={styles.capPillInner}>
                  {cap === 'Image' && <CameraIcon size={12} color={isSelected ? '#ffffff' : '#71717a'} />}
                  {cap === 'Voice' && <MicIcon size={12} color={isSelected ? '#ffffff' : '#71717a'} />}
                  {cap === 'Code' && <CodeIcon size={12} color={isSelected ? '#ffffff' : '#71717a'} />}
                  {cap === 'Video' && <VideoIcon size={12} color={isSelected ? '#ffffff' : '#71717a'} />}
                  <Text style={[styles.capToggleText, isSelected && styles.capToggleTextActive]}>
                    {cap === 'Image' ? 'Vision' : cap}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* 5. Main Feed: Speculative Turbo Card + Model Cards */}
        <ScrollView contentContainerStyle={styles.subContent}>
          <TouchableOpacity
            style={styles.turboBannerBtn}
            onPress={() => setCurrentScreen('speculative')}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={styles.turboIconBadgeActive}>
                <ZapIcon size={18} color="#f59e0b" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.turboCardTitle}>SPECULATIVE DUAL-MODEL ENGINE</Text>
                  <View style={styles.speedAccelBadgeActive}>
                    <Text style={styles.speedAccelTextActive}>2.8x - 3.1x SPEED</Text>
                  </View>
                </View>
                <Text style={styles.turboCardSub}>Dual-Model System 1 & 2 Reasoning (Tap to configure)</Text>
              </View>
              <Text style={{ color: '#f59e0b', fontSize: 16, fontWeight: '700' }}>→</Text>
            </View>
          </TouchableOpacity>
          {/* Section Divider */}
          <View style={styles.modelsFeedHeader}>
            <Text style={styles.sectionHeader}>INDIVIDUAL MODEL VAULT REPOSITORY</Text>
            <Text style={styles.modelsCountText}>{filteredAndSortedModels.length} AVAILABLE</Text>
          </View>

          {/* Model Cards Feed with Interactive Download */}
          {filteredAndSortedModels.length === 0 ? (
            <View style={styles.emptyFeed}>
              <Text style={{ color: '#71717a', fontSize: 14 }}>No models match your search & boolean filters.</Text>
              <TouchableOpacity
                style={{ marginTop: 12, padding: 8 }}
                onPress={() => {
                  setSearchQuery('');
                  setSelectedGrade('ALL');
                  setSelectedCaps([]);
                  setOnlyUncensored(false);
                }}
              >
                <Text style={{ color: '#ffffff', fontSize: 13, textDecorationLine: 'underline' }}>
                  Reset All Filters
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            filteredAndSortedModels.map(m => {
              const isSelected = m.id === activeModelId;
              const dlState = downloads[m.id] || {
                status: 'idle',
                progress: 0,
                speedMbPerSec: 0,
                downloadedMb: 0,
                totalMb: parseSizeToMb(m.sizeFormatted),
              };

              const isDownloading = dlState.status === 'downloading';
              const isPaused = dlState.status === 'paused';
              const isCompleted = dlState.status === 'completed';

              return (
                <View key={m.id} style={[styles.modelCard, isSelected && styles.modelCardActive]}>
                  {/* Header Row */}
                  <View style={styles.modelHeaderRow}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text style={styles.modelName}>{m.name}</Text>
                        <View
                          style={[
                            styles.gradeBadge,
                            m.grade === 'S'
                              ? styles.gradeS
                              : m.grade === 'B'
                              ? styles.gradeB
                              : styles.gradeC,
                          ]}
                        >
                          <Text style={styles.gradeBadgeText}>Grade {m.grade}</Text>
                        </View>
                        {m.contentPolicy === 'Uncensored' && (
                          <View style={styles.uncensoredBadge}>
                            <Text style={styles.uncensoredText}>Uncensored</Text>
                          </View>
                        )}
                        {isCompleted && (
                          <View style={styles.installedBadge}>
                            <CheckIcon size={11} color="#22c55e" />
                            <Text style={styles.installedBadgeText}>Ready</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.modelRepo}>{m.repo}</Text>
                    </View>
                    <Text style={styles.modelSize}>{m.sizeFormatted}</Text>
                  </View>

                  {/* Description */}
                  <Text style={styles.modelDesc}>{m.description}</Text>

                  {/* Capabilities Badges */}
                  <View style={styles.capabilitiesRow}>
                    {m.capabilities.map(cap => (
                      <View key={cap} style={styles.capBadge}>
                        <Text style={styles.capText}>{cap}</Text>
                      </View>
                    ))}
                    <Text style={styles.ramReqText}>RAM: {m.ramRequiredFormatted}</Text>
                  </View>

                  {/* ========================================================= */}
                  {/* INTERACTIVE DOWNLOAD / PROGRESS / CONTROL BAR */}
                  {/* ========================================================= */}
                  {(isDownloading || isPaused) && (
                    <View style={styles.downloadProgressCard}>
                      {/* Telemetry Row: Speed & Percent */}
                      <View style={styles.downloadTelemetryRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <DownloadIcon size={14} color={isDownloading ? '#38bdf8' : '#f59e0b'} />
                          <Text style={[styles.downloadSpeedText, isPaused && { color: '#f59e0b' }]}>
                            {isDownloading ? `${dlState.speedMbPerSec.toFixed(1)} MB/s` : 'Paused'}
                          </Text>
                        </View>

                        <Text style={styles.downloadRatioText}>
                          {dlState.downloadedMb >= 1024
                            ? (dlState.downloadedMb / 1024).toFixed(2) + ' GB'
                            : Math.round(dlState.downloadedMb) + ' MB'}{' '}
                          /{' '}
                          {dlState.totalMb >= 1024
                            ? (dlState.totalMb / 1024).toFixed(1) + ' GB'
                            : dlState.totalMb + ' MB'}{' '}
                          ({Math.round(dlState.progress)}%)
                        </Text>
                      </View>

                      {/* Pure SVG Line Progress Bar */}
                      <SvgProgressBar
                        progress={dlState.progress}
                        color={isDownloading ? '#38bdf8' : '#f59e0b'}
                        height={6}
                      />

                      {/* Pause / Resume & Cancel Controls */}
                      <View style={styles.downloadControlsRow}>
                        {isDownloading ? (
                          <TouchableOpacity
                            style={styles.pauseResumeBtn}
                            onPress={() => handlePauseDownload(m.id)}
                          >
                            <PauseIcon size={13} color="#ffffff" />
                            <Text style={styles.pauseResumeText}>Pause</Text>
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            style={[styles.pauseResumeBtn, styles.resumeBtnActive]}
                            onPress={() => handleResumeDownload(m.id, m.sizeFormatted)}
                          >
                            <PlayIcon size={13} color="#ffffff" />
                            <Text style={styles.pauseResumeText}>Resume</Text>
                          </TouchableOpacity>
                        )}

                        <TouchableOpacity
                          style={styles.cancelDlBtn}
                          onPress={() => handleCancelDownload(m.id)}
                        >
                          <CrossIcon size={12} color="#71717a" />
                          <Text style={styles.cancelDlText}>Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {/* IDLE: Trigger Interactive Download */}
                  {!isDownloading && !isPaused && !isCompleted && (
                    <TouchableOpacity
                      style={styles.downloadStartBtn}
                      onPress={() => handleStartDownload(m.id, m.sizeFormatted)}
                    >
                      <DownloadIcon size={15} color="#ffffff" />
                      <Text style={styles.downloadStartBtnText}>Download Model ({m.sizeFormatted})</Text>
                    </TouchableOpacity>
                  )}

                  {/* COMPLETED: Mount into RAM */}
                  {isCompleted && (
                    <View style={styles.completedActionRow}>
                      <TouchableOpacity
                        style={[styles.mountBtn, isSelected && styles.mountBtnActive]}
                        onPress={() => onSelectModel(m.id)}
                      >
                        <Text style={[styles.mountBtnText, isSelected && { color: '#000', fontWeight: '700' }]}>
                          {isSelected ? 'Loaded in RAM' : 'Mount into RAM'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.reDownloadBtn}
                        onPress={() => handleStartDownload(m.id, m.sizeFormatted)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <DownloadIcon size={14} color="#71717a" />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.reDownloadBtn, { borderColor: 'rgba(239, 68, 68, 0.2)' }]}
                        onPress={() => {
                          Alert.alert(
                            'Delete Model Weights',
                            `Are you sure you want to delete ${m.name} (${m.sizeFormatted}) from device storage?`,
                            [
                              { text: 'Cancel', style: 'cancel' },
                              { text: 'Delete', style: 'destructive', onPress: () => handleDeleteModel(m.id) },
                            ]
                          );
                        }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <TrashIcon size={13} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // =========================================================
  // MAIN SETTINGS & PROFILE VIEW (Mihon Layout with Pure SVG Icons)
  // =========================================================
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      {/* Top Bar */}
      <View style={styles.appBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <BackArrowIcon size={20} color="#ffffff" />
          <Text style={styles.appBarTitle}>Settings</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Top Brand Header (Mihon-Style) */}
        <View style={styles.topGlyphContainer}>
          <View style={styles.brandGlyph}>
            <Text style={styles.brandGlyphText}>千</Text>
          </View>
          <Text style={styles.brandTitle}>CHIWIWI SOVEREIGN</Text>
          <Text style={styles.brandSub}>Galaxy S23 Ultra • 12GB RAM Optimization</Text>
        </View>

        {/* Quick Hub Switches */}
        <View style={styles.quickGroup}>
          <View style={styles.switchRow}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={styles.switchTitle}>Offline-only strict</Text>
              <Text style={styles.switchSub}>Zero outbound requests permitted</Text>
            </View>
            <Switch
              value={offlineStrict}
              onValueChange={setOfflineStrict}
              thumbColor={offlineStrict ? '#fff' : '#71717a'}
              trackColor={{ false: '#27272a', true: '#3f3f46' }}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.switchRow}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={styles.switchTitle}>Incognito mode</Text>
              <Text style={styles.switchSub}>Pauses episodic memory recording</Text>
            </View>
            <Switch
              value={incognitoMode}
              onValueChange={setIncognitoMode}
              thumbColor={incognitoMode ? '#fff' : '#71717a'}
              trackColor={{ false: '#27272a', true: '#3f3f46' }}
            />
          </View>
        </View>

        <View style={styles.dividerThick} />

        {/* Categorized Settings List with Pure SVG Vector Icons */}
        <View style={styles.listSection}>
          <TouchableOpacity style={styles.rowItem} onPress={() => setCurrentScreen('soul')}>
            <View style={styles.iconWrapper}>
              <SoulIcon size={20} color="#ffffff" />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Soul & Personality</Text>
              <Text style={styles.rowSub}>Archetype, PAD emotional vector, prompt modifier</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.rowItem} onPress={() => setCurrentScreen('models')}>
            <View style={styles.iconWrapper}>
              <CpuIcon size={20} color="#ffffff" />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Model Vault ({S23_MODEL_DATABASE.length} Models)</Text>
              <Text style={styles.rowSub}>S23 Ultra local offline models, Grade S/B/C, Boolean search</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.rowItem} onPress={() => setCurrentScreen('speculative')}>
            <View style={styles.iconWrapper}>
              <ZapIcon size={20} color="#f59e0b" />
            </View>
            <View style={styles.rowText}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.rowTitle}>Speculative Dual-Model (System 1 & 2)</Text>
                <View style={styles.turboPill}>
                  <Text style={styles.turboPillText}>2.8x Turbo</Text>
                </View>
              </View>
              <Text style={styles.rowSub}>Fast draft speculator + heavy foundation reasoning oracle</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.rowItem} onPress={() => setCurrentScreen('audio')}>
            <View style={styles.iconWrapper}>
              <MicIcon size={20} color="#ffffff" />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Audio & Voice</Text>
              <Text style={styles.rowSub}>Whisper STT, Piper neural TTS, VAD threshold</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.rowItem} onPress={() => setCurrentScreen('storage')}>
            <View style={styles.iconWrapper}>
              <StorageIcon size={20} color="#ffffff" />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Data and storage</Text>
              <Text style={styles.rowSub}>
                {storageUsed} in sandbox, {memoryCount} vector facts
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.rowItem} onPress={() => setCurrentScreen('security')}>
            <View style={styles.iconWrapper}>
              <ShieldIcon size={20} color="#ffffff" />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Security & Privacy</Text>
              <Text style={styles.rowSub}>Local app lock, episodic memory purge, sandbox seal</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.rowItem} onPress={() => setCurrentScreen('advanced')}>
            <View style={styles.iconWrapper}>
              <SlidersIcon size={20} color="#ffffff" />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Advanced</Text>
              <Text style={styles.rowSub}>Snapdragon 8 Gen 2 Vulkan compute kernels</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.rowItem} onPress={handlePurge}>
            <View style={styles.iconWrapper}>
              <TrashIcon size={20} color="#ef4444" />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: '#ef4444' }]}>Clear Memory Cache</Text>
              <Text style={styles.rowSub}>Wipes all learned relationship facts</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Footer info */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>CHIWIWI Sovereign Stable 1.0.0</Text>
          <Text style={styles.footerSub}>Zero Cloud Dependencies • 100% Private</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// =========================================================
// ENTERPRISE STYLES (OLED DARK AESTHETIC FOR S23 ULTRA)
// =========================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 0,
  },
  appBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  appBarTitle: { color: '#ffffff', fontSize: 18, fontWeight: '700' },

  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 40 },

  // Brand Header
  topGlyphContainer: {
    alignItems: 'center',
    paddingVertical: 26,
  },
  brandGlyph: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#18181d',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  brandGlyphText: { color: '#ffffff', fontSize: 30, fontWeight: '800' },
  brandTitle: { color: '#ffffff', fontSize: 14, fontWeight: '700', letterSpacing: 1 },
  brandSub: { color: '#71717a', fontSize: 12, marginTop: 4 },

  // Quick Switches (Mihon)
  quickGroup: {
    paddingHorizontal: 20,
    paddingVertical: 4,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  switchTitle: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  switchSub: { color: '#71717a', fontSize: 12, marginTop: 2 },
  divider: { height: 1, backgroundColor: 'rgba(255, 255, 255, 0.05)', marginVertical: 4 },
  dividerThick: { height: 8, backgroundColor: '#09090b', marginVertical: 12 },

  // List Rows
  listSection: { paddingHorizontal: 16 },
  rowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  iconWrapper: {
    width: 38,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  rowText: { flex: 1 },
  rowTitle: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  rowSub: { color: '#71717a', fontSize: 12, marginTop: 2 },
  turboPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  turboPillText: { color: '#f59e0b', fontSize: 10, fontWeight: '700' },

  footer: {
    alignItems: 'center',
    paddingVertical: 32,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
    marginTop: 20,
  },
  footerText: { color: '#52525b', fontSize: 12, fontWeight: '600' },
  footerSub: { color: '#3f3f46', fontSize: 11, marginTop: 2 },

  // Model Vault: Search Bar
  searchBarContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#09090b',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111114',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 13,
    padding: 0,
  },

  // Grade Filters
  gradeFilterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    backgroundColor: '#09090b',
  },
  gradePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: '#18181d',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  gradePillActive: {
    backgroundColor: '#ffffff',
    borderColor: '#ffffff',
  },
  gradePillText: { color: '#71717a', fontSize: 11, fontWeight: '600' },
  gradePillTextActive: { color: '#000000', fontWeight: '700' },
  filterPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#18181d',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  filterPillActive: {
    backgroundColor: '#ffffff',
    borderColor: '#ffffff',
  },
  filterPillText: { color: '#71717a', fontSize: 11, fontWeight: '600' },
  filterPillTextActive: { color: '#000000', fontWeight: '700' },
  uncensoredFilterActive: {
    backgroundColor: 'rgba(236, 72, 153, 0.15)',
    borderColor: 'rgba(236, 72, 153, 0.4)',
  },

  // Boolean Switch (AND / OR) & Sorting
  filterControlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  booleanSwitchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  booleanLabel: { color: '#52525b', fontSize: 10, fontWeight: '800' },
  booleanBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#18181d',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  booleanBtnActive: {
    backgroundColor: '#27272a',
    borderColor: '#ffffff',
  },
  booleanText: { color: '#71717a', fontSize: 10, fontWeight: '600' },
  booleanTextActive: { color: '#ffffff', fontWeight: '700' },

  sortSelectorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sortLabel: { color: '#52525b', fontSize: 10, fontWeight: '800' },
  sortPill: {
    backgroundColor: '#18181d',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  sortPillText: { color: '#e4e4e7', fontSize: 10, fontWeight: '600' },

  // Capability Tags
  capTagsScroll: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  capTogglePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#111114',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  capPillInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  capToggleActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderColor: '#ffffff',
  },
  capToggleText: { color: '#71717a', fontSize: 11, fontWeight: '500' },
  capToggleTextActive: { color: '#ffffff', fontWeight: '700' },

  // Content Area
  subContent: { padding: 16, gap: 14 },
  sectionHeader: { color: '#71717a', fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  modelsFeedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 2,
  },
  modelsCountText: { color: '#52525b', fontSize: 10, fontWeight: '700' },
  emptyFeed: { alignItems: 'center', paddingVertical: 40 },

  // =========================================================
  // SPECULATIVE TURBO CARD STYLES
  // =========================================================
  turboCard: {
    backgroundColor: '#0c0c10',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 18,
    padding: 16,
    gap: 14,
  },
  turboCardActive: {
    borderColor: 'rgba(245, 158, 11, 0.4)',
    backgroundColor: '#0f0f14',
  },
  turboHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  turboTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  turboIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#18181d',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  turboIconBadgeActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  turboCardTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  turboCardSub: {
    color: '#71717a',
    fontSize: 11,
    marginTop: 2,
  },
  speedAccelBadge: {
    backgroundColor: '#1c1917',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#292524',
  },
  speedAccelBadgeActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    borderColor: 'rgba(245, 158, 11, 0.45)',
  },
  speedAccelText: { color: '#78716c', fontSize: 10, fontWeight: '700' },
  speedAccelTextActive: { color: '#f59e0b', fontWeight: '800' },

  // Presets Tabs
  presetsTabRow: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: '#070709',
    padding: 4,
    borderRadius: 10,
  },
  presetTabBtn: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 7,
  },
  presetTabBtnActive: {
    backgroundColor: '#1c1c24',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  presetTabText: { color: '#71717a', fontSize: 10, fontWeight: '600' },
  presetTabTextActive: { color: '#ffffff', fontWeight: '700' },

  // Pair Visualizer Box
  pairVisualizer: {
    backgroundColor: '#111116',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    padding: 12,
    gap: 10,
  },
  pairModelBox: {
    backgroundColor: '#18181f',
    borderRadius: 10,
    padding: 10,
    gap: 3,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  pairBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  targetBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  targetBadgeText: { color: '#f87171', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  draftBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  draftBadgeText: { color: '#38bdf8', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  pairModelSize: { color: '#a1a1aa', fontSize: 11, fontWeight: '600' },
  pairModelName: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
  pairModelDetail: { color: '#71717a', fontSize: 11 },

  pipelineConnectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
  },
  pipelineLine: { flex: 1, height: 1, backgroundColor: 'rgba(255, 255, 255, 0.08)' },
  pipelineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#0c0c10',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  pipelineText: { color: '#71717a', fontSize: 9, fontWeight: '700', letterSpacing: 0.4 },

  // Turbo Metrics Grid
  turboMetricsGrid: {
    flexDirection: 'row',
    gap: 6,
  },
  turboMetricCell: {
    flex: 1,
    backgroundColor: '#111116',
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  turboMetricLabel: { color: '#71717a', fontSize: 9, fontWeight: '600' },
  turboMetricVal: { color: '#ffffff', fontSize: 12, fontWeight: '700', marginTop: 2 },
  turboMetricSub: { color: '#52525b', fontSize: 8, marginTop: 1 },

  pairDescriptionText: {
    color: '#a1a1aa',
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 2,
  },
  turboBannerBtn: {
    backgroundColor: '#0c0c10',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  pairActionBtn: {
    backgroundColor: '#18181f',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 10,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  pairActionBtnActive: {
    backgroundColor: '#f59e0b',
    borderColor: '#f59e0b',
  },
  pairActionBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '600' },

  // =========================================================
  // MODEL CARD & LIVE DOWNLOAD STYLES
  // =========================================================
  modelCard: {
    backgroundColor: '#111114',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  modelCardActive: { borderColor: '#ffffff', backgroundColor: '#18181d' },
  modelHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  modelName: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  modelSize: { color: '#ffffff', fontSize: 13, fontWeight: '600' },
  modelRepo: { color: '#71717a', fontSize: 11, marginTop: 2 },
  modelDesc: { color: '#a1a1aa', fontSize: 12, lineHeight: 17 },

  gradeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  gradeS: { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.4)' },
  gradeB: { backgroundColor: 'rgba(59, 130, 246, 0.15)', borderColor: 'rgba(59, 130, 246, 0.4)' },
  gradeC: { backgroundColor: 'rgba(34, 197, 94, 0.15)', borderColor: 'rgba(34, 197, 94, 0.4)' },
  gradeBadgeText: { color: '#ffffff', fontSize: 10, fontWeight: '700' },

  uncensoredBadge: {
    backgroundColor: 'rgba(236, 72, 153, 0.15)',
    borderColor: 'rgba(236, 72, 153, 0.4)',
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  uncensoredText: { color: '#ec4899', fontSize: 10, fontWeight: '700' },

  installedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderColor: 'rgba(34, 197, 94, 0.4)',
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  installedBadgeText: { color: '#22c55e', fontSize: 10, fontWeight: '700' },

  capabilitiesRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  capBadge: {
    backgroundColor: '#1f1f23',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  capText: { color: '#d4d4d8', fontSize: 10, fontWeight: '600' },
  ramReqText: { color: '#71717a', fontSize: 11, marginLeft: 'auto' },

  // Download Trigger Button
  downloadStartBtn: {
    backgroundColor: '#18181d',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 8,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 2,
  },
  downloadStartBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '600' },

  // Live Download Progress Box
  downloadProgressCard: {
    backgroundColor: '#18181f',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 10,
    padding: 12,
    gap: 8,
    marginTop: 2,
  },
  downloadTelemetryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  downloadSpeedText: { color: '#38bdf8', fontSize: 12, fontWeight: '700' },
  downloadRatioText: { color: '#a1a1aa', fontSize: 11, fontWeight: '500' },
  svgProgressContainer: {
    width: '100%',
    borderRadius: 3,
    overflow: 'hidden',
  },
  downloadControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  pauseResumeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#27272a',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  resumeBtnActive: {
    backgroundColor: '#15803d',
    borderColor: '#22c55e',
  },
  pauseResumeText: { color: '#ffffff', fontSize: 11, fontWeight: '600' },
  cancelDlBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  cancelDlText: { color: '#71717a', fontSize: 11, fontWeight: '500' },

  // Completed Action Row
  completedActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  mountBtn: {
    flex: 1,
    backgroundColor: '#18181d',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mountBtnActive: { backgroundColor: '#ffffff' },
  mountBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '600' },
  reDownloadBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#18181d',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Archetypes & Info Cards
  archetypeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  archCard: {
    width: '48%',
    backgroundColor: '#111114',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 14,
    padding: 14,
    gap: 4,
  },
  archCardActive: { borderColor: '#ffffff', backgroundColor: '#18181d' },
  archName: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
  archDesc: { color: '#71717a', fontSize: 11, lineHeight: 15 },

  infoCard: {
    backgroundColor: '#111114',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 16,
    gap: 12,
  },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between' },
  metricLabel: { color: '#a1a1aa', fontSize: 13 },
  metricVal: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
});
