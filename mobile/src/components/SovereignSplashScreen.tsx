import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Animated,
  Image,
  Dimensions,
  Platform,
  StatusBar,
} from 'react-native';
import Svg, { Rect, Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { CpuIcon, ShieldIcon, ZapIcon, StorageIcon } from './Icons';

interface SovereignSplashScreenProps {
  isReady: boolean;
  onFinish: () => void;
  vaultPath?: string;
  activeModelName?: string;
}

const { width, height } = Dimensions.get('window');

const BOOT_STAGES = [
  { label: 'Initializing Snapdragon 8 Gen 2 tensor runtime', icon: 'cpu' },
  { label: 'Verifying hermetic sandbox (.nomedia sealed)', icon: 'shield' },
  { label: 'Mounting sovereign episodic memory vault', icon: 'storage' },
  { label: 'Calibrating neural weights & KV-cache arena', icon: 'zap' },
];

export const SovereignSplashScreen: React.FC<SovereignSplashScreenProps> = ({
  isReady,
  onFinish,
  vaultPath = 'App Sandbox',
  activeModelName = 'SmolLM2 / Llama 3.2',
}) => {
  const [currentStageIndex, setCurrentStageIndex] = useState(0);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const auraAnim = useRef(new Animated.Value(0.6)).current;
  const progressAnim = useRef(new Animated.Value(0.08)).current;
  const fadeOutAnim = useRef(new Animated.Value(1)).current;
  const textFadeAnim = useRef(new Animated.Value(1)).current;

  // Breathing logo & aura pulsation
  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseAnim, {
            toValue: 1.06,
            duration: 1400,
            useNativeDriver: true,
          }),
          Animated.timing(auraAnim, {
            toValue: 1.0,
            duration: 1400,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(pulseAnim, {
            toValue: 0.98,
            duration: 1400,
            useNativeDriver: true,
          }),
          Animated.timing(auraAnim, {
            toValue: 0.5,
            duration: 1400,
            useNativeDriver: true,
          }),
        ]),
      ])
    );
    pulseLoop.start();
    return () => pulseLoop.stop();
  }, []);

  // Stage transition cycle
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStageIndex(prev => {
        const next = prev + 1;
        if (next < BOOT_STAGES.length) {
          Animated.timing(progressAnim, {
            toValue: (next + 1) / BOOT_STAGES.length,
            duration: 400,
            useNativeDriver: false,
          }).start();
          return next;
        }
        return prev;
      });
    }, 450);

    return () => clearInterval(interval);
  }, []);

  // Trigger smooth transition once isReady is true and minimum animation elapsed
  useEffect(() => {
    if (isReady && currentStageIndex >= BOOT_STAGES.length - 1) {
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: false,
      }).start();

      const timer = setTimeout(() => {
        Animated.timing(fadeOutAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }).start(() => {
          onFinish();
        });
      }, 350);

      return () => clearTimeout(timer);
    }
  }, [isReady, currentStageIndex]);

  // Safety watchdog timer: prevent splash from ever hanging if hardware init stalls
  useEffect(() => {
    const safetyTimer = setTimeout(() => {
      Animated.timing(fadeOutAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(() => {
        onFinish();
      });
    }, 4500);
    return () => clearTimeout(safetyTimer);
  }, []);

  const currentStage = BOOT_STAGES[currentStageIndex] || BOOT_STAGES[BOOT_STAGES.length - 1];

  return (
    <Animated.View style={[styles.container, { opacity: fadeOutAnim }]}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      {/* Background Liquid Glass Ambient Aura */}
      <View style={StyleSheet.absoluteFill}>
        <Svg width={width} height={height}>
          <Defs>
            <RadialGradient id="auraGrad" cx="50%" cy="38%" rx="60%" ry="45%">
              <Stop offset="0%" stopColor="#38bdf8" stopOpacity="0.16" />
              <Stop offset="40%" stopColor="#0284c7" stopOpacity="0.06" />
              <Stop offset="100%" stopColor="#000000" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width={width} height={height} fill="url(#auraGrad)" />
        </Svg>
      </View>

      {/* Main Center Content */}
      <View style={styles.centerContainer}>
        {/* Pulsating Glowing Aura Ring */}
        <Animated.View
          style={[
            styles.auraRing,
            {
              transform: [{ scale: pulseAnim }],
              opacity: auraAnim,
            },
          ]}
        />

        {/* Centerpiece Sovereign Logo Squircle */}
        <Animated.View
          style={[
            styles.logoWrapper,
            {
              transform: [{ scale: pulseAnim }],
            },
          ]}
        >
          <Image
            source={require('../../assets/icon.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </Animated.View>

        {/* Brand Typography */}
        <Text style={styles.brandTitle}>CHIWIWI</Text>
        <Text style={styles.brandTagline}>SOVEREIGN NEURAL INTELLIGENCE</Text>

        {/* Security & Isolation Pill */}
        <View style={styles.securityPill}>
          <View style={styles.secureDot} />
          <Text style={styles.securityPillText}>0% Cloud Egress • 100% On-Silicon</Text>
        </View>
      </View>

      {/* Bottom Kernel & Hardware Telemetry HUD */}
      <View style={styles.bottomHud}>
        {/* Stage Label & Icon */}
        <View style={styles.stageStatusRow}>
          <View style={styles.stageIconBox}>
            {currentStage.icon === 'cpu' && <CpuIcon size={14} color="#38bdf8" />}
            {currentStage.icon === 'shield' && <ShieldIcon size={14} color="#22c55e" />}
            {currentStage.icon === 'storage' && <StorageIcon size={14} color="#a855f7" />}
            {currentStage.icon === 'zap' && <ZapIcon size={14} color="#f59e0b" />}
          </View>
          <Text style={styles.stageStatusText} numberOfLines={1}>
            {currentStage.label}
          </Text>
        </View>

        {/* Fluid Neon Loading Bar */}
        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressBar,
              {
                width: progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        </View>

        {/* Hardware & Vault Metadata Grid */}
        <View style={styles.telemetryGrid}>
          <View style={styles.telemetryCell}>
            <Text style={styles.telemetryLabel}>HARDWARE PLATFORM</Text>
            <Text style={styles.telemetryValue}>Qualcomm Snapdragon 8 Gen 2</Text>
          </View>

          <View style={styles.telemetryCell}>
            <Text style={styles.telemetryLabel}>ISOLATION BOUNDARY</Text>
            <Text style={[styles.telemetryValue, { color: '#22c55e' }]}>Hermetic Sandbox (.nomedia)</Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 99999,
  },
  centerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: height * 0.22,
  },
  auraRing: {
    position: 'absolute',
    width: 148,
    height: 148,
    borderRadius: 74,
    borderWidth: 1.5,
    borderColor: 'rgba(56, 189, 248, 0.35)',
    backgroundColor: 'rgba(56, 189, 248, 0.06)',
  },
  logoWrapper: {
    width: 96,
    height: 96,
    borderRadius: 26,
    backgroundColor: '#0a0a0f',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 8,
  },
  logoImage: {
    width: 82,
    height: 82,
    borderRadius: 22,
  },
  brandTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 4,
    marginBottom: 4,
  },
  brandTagline: {
    color: '#71717a',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 16,
  },
  securityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.25)',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  secureDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22c55e',
  },
  securityPillText: {
    color: '#22c55e',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  bottomHud: {
    width: '100%',
    paddingHorizontal: 28,
    paddingBottom: Platform.OS === 'ios' ? 44 : 32,
    gap: 14,
  },
  stageStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stageIconBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: '#18181f',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageStatusText: {
    color: '#e4e4e7',
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  progressTrack: {
    width: '100%',
    height: 3,
    backgroundColor: '#18181f',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#38bdf8',
    borderRadius: 2,
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  telemetryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  telemetryCell: {
    gap: 2,
  },
  telemetryLabel: {
    color: '#52525b',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  telemetryValue: {
    color: '#a1a1aa',
    fontSize: 11,
    fontWeight: '500',
  },
});
