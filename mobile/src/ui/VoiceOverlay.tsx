import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { getVoicePersona } from '../core/voicePersonas.ts';
import { chatStore } from '../services/chat.ts';
import { getVoicePrefs, useVoicePrefs } from '../services/voice/prefs.ts';
import {
  downloadSpeechModel,
  useSpeechModels,
} from '../services/voice/speechModels.ts';
import { openAppSettings } from '../services/voice/stt.ts';
import { stopSpeaking } from '../services/voice/tts.ts';
import {
  dispatchVoice,
  startVoiceMode,
  stopVoiceMode,
  useVoiceMode,
  type VoiceFix,
} from '../services/voice/voiceMode.ts';
import { makeStyles, useTheme } from '../theme';
import { Button } from './Button';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { ProgressBar } from './ProgressBar';
import { Tag } from './Tag';
import { Text } from './Text';
import { VoiceOrb } from './voice/VoiceOrb';
import { VoicePersonaSheet } from './voice/VoicePersonaSheet';

const PHASE_LABEL = {
  idle: 'Connecting voice...',
  listening: 'Listening to you',
  transcribing: 'Processing speech...',
  thinking: 'Thinking...',
  speaking: 'Speaking',
  error: 'Voice mode unavailable',
} as const;

/**
 * ChatGPT-style immersive voice interaction overlay:
 * - Fluid audio-reactive Voice Orb (center) bouncing dynamically with vocal pitch & volume
 * - Sun shine neon effect for light mode (Helios) & Moon light neon effect for dark mode (Nyx)
 * - Ambient backdrop blur with celestial radial corona
 * - Clean floating typography transcript (no divs/boxes, floating text directly on canvas)
 * - Session turn history toggle (synchronized with chatStore)
 * - Voice Model / Persona selector sheet with adult 18+ and girlfriend/boyfriend options
 */
export function VoiceOverlay({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const { isDark, colors } = useTheme();
  const v = useVoiceMode();
  const prefs = useVoicePrefs();
  const speechModels = useSpeechModels();
  const [fixing, setFixing] = useState(false);
  const [showPersonaSheet, setShowPersonaSheet] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const persona = useMemo(() => getVoicePersona(prefs.personaId), [prefs.personaId]);

  // Read message history from chatStore
  const [chatMessages, setChatMessages] = useState(() => chatStore.getState().thread.messages);

  useEffect(() => {
    const unsub = chatStore.subscribe(() => {
      setChatMessages(chatStore.getState().thread.messages);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!visible) return;
    void startVoiceMode();
    return () => void stopVoiceMode();
  }, [visible]);

  // Auto-scroll transcript container as speech streams in
  useEffect(() => {
    if (v.heard || v.reply) {
      scrollRef.current?.scrollToEnd({ animated: true });
    }
  }, [v.heard, v.reply]);

  const close = () => {
    void stopVoiceMode();
    onClose();
  };

  const handleOrbPress = async () => {
    if (v.phase === 'speaking') {
      // User tapped orb while AI is speaking -> interrupt AI and listen immediately
      await stopSpeaking();
      dispatchVoice({ type: 'utteranceDone' });
    }
  };

  const fix = async (kind: VoiceFix) => {
    if (kind === 'download_model') {
      setFixing(true);
      const r = await downloadSpeechModel(getVoicePrefs().sttModelId);
      setFixing(false);
      if (r.ok) void startVoiceMode();
    } else if (kind === 'open_settings') {
      await openAppSettings();
    }
  };

  const currentSttModel = speechModels[prefs.sttModelId];
  const downloadProgress =
    currentSttModel && currentSttModel.totalBytes > 0
      ? currentSttModel.receivedBytes / currentSttModel.totalBytes
      : null;

  const status = PHASE_LABEL[v.phase];
  const fixLabel =
    v.fix === 'download_model'
      ? 'Download Voice Engine'
      : v.fix === 'open_settings'
        ? 'Open App Settings'
        : null;

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={close} statusBarTranslucent>
      <View style={[s.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
        {/* Dynamic Celestial Backdrop Aura (Sun shine light / Moon light dark) */}
        <View pointerEvents="none" style={s.ambientBackdrop}>
          <Svg width="100%" height="100%">
            <Defs>
              <RadialGradient id="bgAura" cx="50%" cy="40%" rx="60%" ry="50%">
                <Stop
                  offset="0%"
                  stopColor={isDark ? '#0284C7' : '#F59E0B'}
                  stopOpacity={isDark ? '0.22' : '0.18'}
                />
                <Stop
                  offset="60%"
                  stopColor={isDark ? '#0369A1' : '#FCD34D'}
                  stopOpacity={isDark ? '0.08' : '0.05'}
                />
                <Stop
                  offset="100%"
                  stopColor={isDark ? '#0284C7' : '#F59E0B'}
                  stopOpacity="0"
                />
              </RadialGradient>
            </Defs>
            <Circle cx="50%" cy="40%" r="55%" fill="url(#bgAura)" />
          </Svg>
        </View>

        {/* Top Control Bar */}
        <View style={s.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close voice chat"
            onPress={close}
            style={({ pressed }) => [s.roundTopBtn, pressed && s.actionPressed]}
          >
            <Icon name="back" size={20} />
          </Pressable>

          <Text variant="strong" style={s.topTitle}>
            Live Voice Chat
          </Text>

          <Pressable
            style={s.personaPill}
            onPress={() => setShowPersonaSheet(true)}
            accessibilityLabel="Select voice style"
          >
            <Text style={s.personaPillText}>
              {persona ? persona.name : 'Natural'}
            </Text>
            {persona?.isNsfw ? <Tag label="18+" tone="danger" /> : null}
            <Text tone="muted" style={s.pillArrow}>▾</Text>
          </Pressable>
        </View>

        {/* Center Animated Orb Stage */}
        <View style={s.centerStage}>
          <VoiceOrb
            phase={v.phase}
            size={200}
            onPress={handleOrbPress}
            label={status}
          />

          <View style={s.phaseContainer}>
            <View style={s.statusPill}>
              <Text variant="small" tone="accent" style={s.statusPillText} accessibilityLiveRegion="polite">
                {status.toLowerCase()}
              </Text>
            </View>
            {v.phase === 'speaking' ? (
              <Text tone="muted" style={s.tapHint}>
                (Tap to interrupt)
              </Text>
            ) : null}
          </View>

          {/* Error handling card if unavailable */}
          {v.phase === 'error' ? (
            <View style={s.errorBox}>
              <Text style={s.errorText}>{v.error ?? 'Voice mode could not start.'}</Text>
              {downloadProgress !== null && fixing ? (
                <View style={s.downloadBar}>
                  <ProgressBar fraction={downloadProgress} label="Voice model download" />
                </View>
              ) : null}
              {fixLabel ? (
                <Button
                  label={fixLabel}
                  variant="primary"
                  loading={fixing}
                  busyLabel="Downloading Speech Model"
                  onPress={() => fix(v.fix)}
                />
              ) : null}
              {v.fix !== 'download_model' && v.fix !== 'open_settings' ? (
                <Button label="Try Again" variant="quiet" onPress={() => void startVoiceMode()} />
              ) : null}
            </View>
          ) : (
            /* Clean Floating Typography Live Transcript */
            <View style={s.transcriptWrapper}>
              <ScrollView
                ref={scrollRef}
                style={s.transcriptScroll}
                contentContainerStyle={s.transcriptContent}
                showsVerticalScrollIndicator={false}
              >
                {showHistory ? (
                  chatMessages.length === 0 ? (
                    <Text tone="muted" style={s.emptyHint}>
                      No messages in this conversation yet. Speak to begin!
                    </Text>
                  ) : (
                    chatMessages.map((m) => (
                      <View key={m.id} style={s.floatingRow}>
                        <Text
                          style={s.floatingRole}
                          tone={m.role === 'user' ? 'muted' : 'accent'}
                        >
                          {m.role === 'user' ? 'YOU' : persona?.name?.toUpperCase() ?? 'ALAUNA'}
                        </Text>
                        <Text style={s.floatingText}>{m.text}</Text>
                      </View>
                    ))
                  )
                ) : (
                  <>
                    {v.heard ? (
                      <View style={s.floatingRow}>
                        <Text style={s.floatingRole} tone="muted">YOU</Text>
                        <Text style={s.floatingText}>{v.heard}</Text>
                      </View>
                    ) : null}

                    {v.reply ? (
                      <View style={s.floatingRow}>
                        <Text style={s.floatingRole} tone="accent">
                          {persona?.name?.toUpperCase() ?? 'ALAUNA'}
                        </Text>
                        <Text style={s.floatingText}>{v.reply}</Text>
                      </View>
                    ) : null}

                    {!v.heard && !v.reply ? (
                      <Text tone="muted" style={s.emptyHint}>
                        Hello! I'm here with you. Speak whenever you're ready.
                      </Text>
                    ) : null}
                  </>
                )}
              </ScrollView>
            </View>
          )}
        </View>

        {/* Bottom Floating Control Dock (Matching Screen 3) */}
        {v.phase !== 'error' ? (
          <View style={s.bottomDock}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Toggle conversation history"
              onPress={() => setShowHistory((prev) => !prev)}
              style={({ pressed }) => [s.roundActionBtn, showHistory && s.roundActionBtnActive, pressed && s.actionPressed]}
            >
              <Icon name="chat" size={22} color={showHistory ? colors.onAccent : colors.text} />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={v.phase === 'speaking' ? 'Interrupt AI' : 'Push to talk'}
              onPress={handleOrbPress}
              style={({ pressed }) => [
                s.mainVoiceButton,
                v.phase === 'speaking' && s.mainVoiceButtonActive,
                pressed && s.mainVoiceButtonPressed,
              ]}
            >
              <Icon
                name={v.phase === 'speaking' ? 'stop' : 'mic'}
                size={30}
                color={colors.onAccent}
              />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="End call"
              onPress={close}
              style={({ pressed }) => [s.roundActionBtn, pressed && s.actionPressed]}
            >
              <Icon name="close" size={22} color={colors.text} />
            </Pressable>
          </View>
        ) : null}

        {/* Voice Persona Selector Modal Sheet */}
        <VoicePersonaSheet
          visible={showPersonaSheet}
          onClose={() => setShowPersonaSheet(false)}
        />
      </View>
    </Modal>
  );
}

const useStyles = makeStyles(({ colors, space, line, radius, isDark }) => ({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: space.lg,
    justifyContent: 'space-between',
  },
  ambientBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 10,
    minHeight: 44,
  },
  roundTopBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: line,
    borderColor: colors.border,
    shadowColor: colors.accent,
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  topTitle: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  personaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: 6,
    paddingHorizontal: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: line,
    borderColor: colors.border,
    shadowColor: colors.accent,
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  personaPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  pillArrow: {
    fontSize: 12,
  },
  centerStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.sm,
    gap: space.md,
  },
  phaseContainer: {
    alignItems: 'center',
    gap: space.xs,
  },
  statusPill: {
    paddingHorizontal: space.md,
    paddingVertical: 5,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: line,
    borderColor: colors.border,
    shadowColor: colors.accent,
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  statusPillText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  tapHint: {
    fontSize: 12,
  },
  errorBox: {
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
  },
  errorText: {
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
  },
  downloadBar: {
    width: 220,
  },
  transcriptWrapper: {
    width: '100%',
    maxHeight: 180,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  transcriptScroll: {
    maxHeight: 160,
  },
  transcriptContent: {
    gap: space.md,
    alignItems: 'center',
  },
  floatingRow: {
    gap: 2,
    alignItems: 'center',
    maxWidth: '90%',
  },
  floatingRole: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  floatingText: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  emptyHint: {
    textAlign: 'center',
    fontSize: 14,
    paddingVertical: space.md,
    lineHeight: 20,
  },
  bottomDock: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: space.xl,
    paddingBottom: space.sm,
    zIndex: 10,
  },
  roundActionBtn: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: line,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOpacity: isDark ? 0.3 : 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  roundActionBtnActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  actionPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.96 }],
  },
  mainVoiceButton: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 6,
  },
  mainVoiceButtonActive: {
    backgroundColor: colors.danger,
    shadowColor: colors.danger,
  },
  mainVoiceButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.94 }],
  },
}));
