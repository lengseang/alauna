import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getVoicePersona } from '../core/voicePersonas.ts';
import { chatStore } from '../services/chat.ts';
import { getVoicePrefs, useVoicePrefs } from '../services/voice/prefs.ts';
import {
  downloadSpeechModel,
  speechModelStore,
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
import { makeStyles } from '../theme';
import { Button } from './Button';
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
 * - Fluid audio-reactive Voice Orb (center) that pulses, rotates, and radiates soundwaves
 * - Real-time live transcript for both user input and streaming AI replies
 * - Integrated session turn history view (synchronized with chatStore)
 * - Quick Voice Model / Persona selector sheet with Normal, Girlfriend/Boyfriend & 18+ Adult styles
 * - Interrupt speech by tapping the orb or the bottom button
 */
export function VoiceOverlay({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const s = useStyles();
  const insets = useSafeAreaInsets();
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
        {/* Top Control Bar */}
        <View style={s.topBar}>
          <Pressable
            style={s.personaPill}
            onPress={() => setShowPersonaSheet(true)}
            accessibilityLabel="Select voice style"
          >
            <Text style={s.personaPillText}>
              Voice: {persona ? persona.name : 'Natural'}
            </Text>
            {persona?.isNsfw ? <Tag label="18+" tone="danger" /> : null}
            <Text tone="muted" style={s.pillArrow}>▾</Text>
          </Pressable>

          <IconButton icon="close" label="Close voice mode" onPress={close} />
        </View>

        {/* Center Animated Orb Stage */}
        <View style={s.centerStage}>
          <VoiceOrb
            phase={v.phase}
            size={170}
            onPress={handleOrbPress}
            label={status}
          />

          <View style={s.phaseContainer}>
            <Text variant="heading" style={s.statusText} accessibilityLiveRegion="polite">
              {status}
            </Text>
            {v.phase === 'speaking' ? (
              <Text tone="muted" style={s.tapHint}>
                (Tap orb to interrupt)
              </Text>
            ) : null}
          </View>

          {/* Error handling card */}
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
            /* Live Transcript & History Area */
            <View style={s.transcriptWrapper}>
              <View style={s.transcriptHeader}>
                <Text tone="muted" style={s.transcriptHeaderTitle}>
                  {showHistory ? 'Conversation History' : 'Live Transcript'}
                </Text>
                <Pressable onPress={() => setShowHistory((prev) => !prev)}>
                  <Text tone="accent" style={s.toggleHistoryText}>
                    {showHistory ? 'Show Current' : `History (${chatMessages.length})`}
                  </Text>
                </Pressable>
              </View>

              <ScrollView
                ref={scrollRef}
                style={s.transcriptScroll}
                contentContainerStyle={s.transcriptContent}
                showsVerticalScrollIndicator
              >
                {showHistory ? (
                  chatMessages.length === 0 ? (
                    <Text tone="muted" style={s.emptyHint}>
                      No messages in this conversation yet. Speak to begin!
                    </Text>
                  ) : (
                    chatMessages.map((m) => (
                      <View
                        key={m.id}
                        style={[
                          s.bubble,
                          m.role === 'user' ? s.bubbleUser : s.bubbleAssistant,
                        ]}
                      >
                        <Text
                          style={s.roleTag}
                          tone={m.role === 'user' ? 'muted' : 'accent'}
                        >
                          {m.role === 'user' ? 'You' : persona?.name ?? 'AI'}
                        </Text>
                        <Text style={s.messageText}>{m.text}</Text>
                      </View>
                    ))
                  )
                ) : (
                  <>
                    {v.heard ? (
                      <View style={[s.bubble, s.bubbleUser]}>
                        <Text style={s.roleTag} tone="muted">You</Text>
                        <Text style={s.messageText}>{v.heard}</Text>
                      </View>
                    ) : null}

                    {v.reply ? (
                      <View style={[s.bubble, s.bubbleAssistant]}>
                        <Text style={s.roleTag} tone="accent">
                          {persona?.name ?? 'AI'}
                        </Text>
                        <Text style={s.messageText}>{v.reply}</Text>
                      </View>
                    ) : null}

                    {!v.heard && !v.reply ? (
                      <Text tone="muted" style={s.emptyHint}>
                        Speak clearly into the microphone. Voice replies will appear here.
                      </Text>
                    ) : null}
                  </>
                )}
              </ScrollView>
            </View>
          )}
        </View>

        {/* Bottom Action Dock */}
        {v.phase !== 'error' ? (
          <View style={s.bottomDock}>
            {v.phase === 'speaking' ? (
              <Button
                label="Interrupt AI"
                variant="quiet"
                icon="stop"
                onPress={handleOrbPress}
              />
            ) : null}

            <Button
              label="End Call"
              variant="quiet"
              icon="close"
              onPress={close}
            />
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

const useStyles = makeStyles(({ colors, space, line }) => ({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: space.lg,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  personaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.xs,
    paddingHorizontal: space.md,
    backgroundColor: colors.surface,
    borderWidth: line,
    borderColor: colors.border,
  },
  personaPillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  pillArrow: {
    fontSize: 12,
  },
  centerStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.md,
    gap: space.md,
  },
  phaseContainer: {
    alignItems: 'center',
    gap: 2,
  },
  statusText: {
    fontSize: 18,
    textAlign: 'center',
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
    maxHeight: 250,
    backgroundColor: colors.surface,
    borderWidth: line,
    borderColor: colors.border,
    padding: space.md,
  },
  transcriptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.sm,
    borderBottomWidth: line,
    borderBottomColor: colors.border,
    paddingBottom: space.xs,
  },
  transcriptHeaderTitle: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  toggleHistoryText: {
    fontSize: 12,
    fontWeight: '600',
  },
  transcriptScroll: {
    maxHeight: 190,
  },
  transcriptContent: {
    gap: space.sm,
  },
  bubble: {
    padding: space.sm,
    borderLeftWidth: 3,
    gap: 2,
  },
  bubbleUser: {
    backgroundColor: colors.bg,
    borderLeftColor: colors.borderStrong,
  },
  bubbleAssistant: {
    backgroundColor: colors.bg,
    borderLeftColor: colors.accent,
  },
  roleTag: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  emptyHint: {
    textAlign: 'center',
    fontSize: 13,
    paddingVertical: space.md,
  },
  bottomDock: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: space.md,
    paddingTop: space.sm,
  },
}));
