import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Modal,
  StatusBar,
  Animated,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { ARCHETYPES, SoulArchetypeKey, PADVector } from './src/types/soul';
import { MobileOrchestrator } from './src/engine/orchestrator';
import { MemoryEngine } from './src/services/memoryEngine';
import { VaultStorage, ChatThread, ChatMessage, ThreadSoulConfig } from './src/services/vaultStorage';
import SettingsScreen from './src/screens/SettingsScreen';
import ThreadSoulModal from './src/components/ThreadSoulModal';
import { SoulIcon, SlidersIcon, ZapIcon, CrossIcon } from './src/components/Icons';

const { width } = Dimensions.get('window');

export default function App() {
  const [currentThread, setCurrentThread] = useState<ChatThread>(() => VaultStorage.createNewThread());
  const [allThreads, setAllThreads] = useState<{ id: string; title: string; updatedAt: number }[]>([]);
  const [inputText, setInputText] = useState('');
  const [activeModelId, setActiveModelId] = useState('llama-3.2-1b');

  // Global settings baseline
  const [globalArchetype, setGlobalArchetype] = useState<SoulArchetypeKey>('empath');
  const [globalPAD, setGlobalPAD] = useState<PADVector>(ARCHETYPES.empath.defaultPAD);

  // Overlays
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [threadSoulModalOpen, setThreadSoulModalOpen] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);

  // Voice Pulse Animation
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    loadSavedThreads();
  }, []);

  const loadSavedThreads = async () => {
    try {
      const list = await VaultStorage.listAllThreads();
      setAllThreads(list);
    } catch {
      // Ignored
    }
  };

  const startVoicePulse = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.95,
          duration: 1800,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const handleSend = async () => {
    if (!inputText.trim()) return;

    const userText = inputText.trim();
    
    // 1. Process turn with this thread's specific soul and PAD
    const threadArch = currentThread.soulConfig.archetype;
    const threadPAD = currentThread.soulConfig.pad;
    const result = MobileOrchestrator.processTurn(userText, threadArch, threadPAD);

    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      sender: 'user',
      text: userText,
      timestamp: Date.now(),
      tokenCountEst: Math.floor(userText.length / 4),
    };

    const botMsg: ChatMessage = {
      id: `a_${Date.now() + 1}`,
      sender: 'assistant',
      text: result.response,
      timestamp: Date.now() + 1,
      tokenCountEst: Math.floor(result.response.length / 4),
      meta: `${activeModelId} • ${result.route.latencyMs.toFixed(2)}ms ${result.route.category}`,
    };

    // 2. Append messages
    const updatedMessages = [...currentThread.messages, userMsg, botMsg];

    // Auto-derive thread title if it's the first user turn
    const threadTitle = currentThread.title === 'New Conversation' ? userText.slice(0, 32) : currentThread.title;

    let updatedThread: ChatThread = {
      ...currentThread,
      title: threadTitle,
      messages: updatedMessages,
      soulConfig: {
        ...currentThread.soulConfig,
        pad: result.updatedPAD,
      },
      updatedAt: Date.now(),
    };

    // 3. Claude-Style Automatic Session Compaction if conversation exceeds token ceiling
    updatedThread = VaultStorage.compactSession(updatedThread, 2048);

    setCurrentThread(updatedThread);
    setInputText('');

    // 4. Persist sovereign thread to disk
    await VaultStorage.saveThread(updatedThread);
    loadSavedThreads();
  };

  const handleSelectThread = async (threadId: string) => {
    const loaded = await VaultStorage.loadThread(threadId);
    if (loaded) {
      setCurrentThread(loaded);
    }
    setDrawerOpen(false);
  };

  const handleNewConversation = () => {
    const fresh = VaultStorage.createNewThread('New Conversation', globalArchetype);
    setCurrentThread(fresh);
    setDrawerOpen(false);
  };

  const handleSaveThreadSoul = async (newConfig: ThreadSoulConfig) => {
    const updated: ChatThread = {
      ...currentThread,
      soulConfig: newConfig,
    };
    setCurrentThread(updated);
    await VaultStorage.saveThread(updated);
  };

  // If settings view is open, render dedicated screen
  if (settingsOpen) {
    return (
      <SettingsScreen
        onBack={() => setSettingsOpen(false)}
        activeModelId={activeModelId}
        onSelectModel={setActiveModelId}
        activeArchetype={globalArchetype}
        onSelectArchetype={(key) => {
          setGlobalArchetype(key);
          setGlobalPAD(ARCHETYPES[key].defaultPAD);
        }}
        pad={globalPAD}
        onUpdatePAD={setGlobalPAD}
      />
    );
  }

  return (
    <View style={styles.outerContainer}>
      <SafeAreaView style={styles.safeContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#000000" />

        {/* Top Navigation Bar */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => setDrawerOpen(true)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.iconText}>☰</Text>
          </TouchableOpacity>

          {/* Center Pill: Shows Model and Thread Soul */}
          <TouchableOpacity style={styles.modelPill} onPress={() => setSettingsOpen(true)}>
            <View style={styles.statusDot} />
            <Text style={styles.modelPillText}>{activeModelId.split('-')[0].toUpperCase()}</Text>
            <Text style={styles.dropdownArrow}>▾</Text>
          </TouchableOpacity>

          {/* Right Action: Per-Thread Soul Customizer Button */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => setThreadSoulModalOpen(true)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Customize Persona for this chat"
            >
              <SoulIcon size={18} color="#a1a1aa" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => setSettingsOpen(true)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <SlidersIcon size={18} color="#a1a1aa" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Active Thread Banner (Shows if session has compacted summaries or custom persona) */}
        {currentThread.compactedSummaries.length > 0 && (
          <View style={styles.compactedBanner}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <ZapIcon size={13} color="#60a5fa" />
              <Text style={styles.compactedBannerText}>
                Infinite Session: {currentThread.compactedSummaries.length} older blocks auto-compacted into memory
              </Text>
            </View>
          </View>
        )}

        {/* Keyboard Aware Chat Feed */}
        <KeyboardAvoidingView
          style={styles.keyboardContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            style={styles.chatScroll}
            contentContainerStyle={styles.chatContent}
            keyboardShouldPersistTaps="handled"
          >
            {currentThread.messages.map((m) => (
              <View
                key={m.id}
                style={[
                  styles.messageRow,
                  m.sender === 'user' ? styles.userRow : styles.assistantRow,
                ]}
              >
                {m.sender === 'assistant' && (
                  <View style={styles.assistantHeader}>
                    <View style={styles.botDot} />
                    <Text style={styles.botTag}>CHIWIWI</Text>
                    <Text style={styles.soulTag}>• {ARCHETYPES[currentThread.soulConfig.archetype].name}</Text>
                    {m.meta && <Text style={styles.metaText}>• {m.meta}</Text>}
                  </View>
                )}
                <View
                  style={[
                    styles.messageBubble,
                    m.sender === 'user' ? styles.userBubble : styles.assistantBubble,
                  ]}
                >
                  <Text style={styles.messageText}>{m.text}</Text>
                </View>
              </View>
            ))}
          </ScrollView>

          {/* Floating Bottom Input Deck */}
          <View style={styles.inputDeck}>
            <View style={styles.inputShell}>
              <TextInput
                style={styles.promptField}
                placeholder="Message CHIWIWI..."
                placeholderTextColor="#71717a"
                value={inputText}
                onChangeText={setInputText}
                onSubmitEditing={handleSend}
                returnKeyType="send"
              />
              <TouchableOpacity
                style={styles.micBtn}
                onPress={() => {
                  setVoiceActive(true);
                  startVoicePulse();
                }}
              >
                <Text style={{ fontSize: 16 }}>🎙</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sendBtn} onPress={handleSend}>
                <Text style={styles.sendBtnText}>↑</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>

        {/* History Drawer Modal (Persistent Saved Threads) */}
        <Modal visible={drawerOpen} transparent animationType="fade">
          <View style={styles.modalBackdrop}>
            <TouchableOpacity style={styles.backdropTouch} onPress={() => setDrawerOpen(false)} />
            <View style={styles.drawerSheet}>
              <View>
                <TouchableOpacity style={styles.newChatBtn} onPress={handleNewConversation}>
                  <Text style={styles.newChatText}>+ New Conversation</Text>
                </TouchableOpacity>

                <Text style={styles.sectionHeader}>SAVED SOVEREIGN THREADS</Text>
                <ScrollView style={{ maxHeight: 380 }}>
                  {allThreads.map(t => (
                    <TouchableOpacity
                      key={t.id}
                      style={[styles.threadItem, t.id === currentThread.id && styles.threadItemActive]}
                      onPress={() => handleSelectThread(t.id)}
                    >
                      <Text
                        style={[styles.threadText, t.id === currentThread.id && { color: '#ffffff', fontWeight: '700' }]}
                        numberOfLines={1}
                      >
                        {t.title}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  {allThreads.length === 0 && (
                    <Text style={{ color: '#52525b', fontSize: 12, paddingVertical: 8 }}>
                      No saved threads yet.
                    </Text>
                  )}
                </ScrollView>

                <View style={{ marginTop: 20 }}>
                  <Text style={styles.sectionHeader}>SYSTEM</Text>
                  <TouchableOpacity
                    style={[styles.threadItem, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}
                    onPress={() => {
                      setDrawerOpen(false);
                      setSettingsOpen(true);
                    }}
                  >
                    <SlidersIcon size={16} color="#ffffff" />
                    <Text style={[styles.threadText, { color: '#ffffff', fontWeight: '600' }]}>
                      Model & System Settings
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.drawerFooter}>
                <View>
                  <Text style={styles.profileName}>LENG SEANG</Text>
                  <Text style={styles.profileMeta}>S23 Ultra 12GB • Private Vault</Text>
                </View>
                <View style={styles.localBadge}>
                  <Text style={styles.localBadgeText}>LOCAL</Text>
                </View>
              </View>
            </View>
          </View>
        </Modal>

        {/* Per-Chat Soul & Persona Customizer Modal */}
        <ThreadSoulModal
          visible={threadSoulModalOpen}
          onClose={() => setThreadSoulModalOpen(false)}
          config={currentThread.soulConfig}
          onSave={handleSaveThreadSoul}
        />

        {/* Live Siri Voice Overlay */}
        <Modal visible={voiceActive} transparent animationType="fade">
          <View style={styles.voiceFullscreen}>
            <View style={styles.voiceTopBar}>
              <Text style={styles.voiceTopLabel}>OFFLINE LIVE VOICE</Text>
              <TouchableOpacity onPress={() => setVoiceActive(false)}>
                <CrossIcon size={18} color="#ffffff" />
              </TouchableOpacity>
            </View>

            <Animated.View
              style={[
                styles.siriPlasma,
                { transform: [{ scale: pulseAnim }] },
              ]}
            />

            <View style={styles.voiceBottom}>
              <Text style={styles.voiceSubtitle}>"Listening closely. Speak anytime."</Text>
              <TouchableOpacity
                style={styles.closeVoiceBtn}
                onPress={() => setVoiceActive(false)}
              >
                <CrossIcon size={18} color="#ffffff" />
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
  },
  safeContainer: {
    flex: 1,
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#000000',
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 0,
  },
  topBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  iconBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: { color: '#ffffff', fontSize: 18, fontWeight: '600' },
  modelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111114',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    gap: 6,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22c55e' },
  modelPillText: { color: '#ffffff', fontSize: 13, fontWeight: '600' },
  dropdownArrow: { color: '#71717a', fontSize: 10 },

  compactedBanner: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(59, 130, 246, 0.2)',
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  compactedBannerText: { color: '#60a5fa', fontSize: 11, fontWeight: '600' },

  keyboardContainer: { flex: 1 },
  chatScroll: { flex: 1 },
  chatContent: { padding: 16, gap: 16 },

  messageRow: { width: '100%', marginVertical: 4 },
  userRow: { alignItems: 'flex-end' },
  assistantRow: { alignItems: 'flex-start' },

  assistantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  botDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#ffffff' },
  botTag: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  soulTag: { color: '#38bdf8', fontSize: 11, fontWeight: '600' },
  metaText: { color: '#71717a', fontSize: 11 },

  messageBubble: { padding: 14, borderRadius: 18, maxWidth: '85%' },
  userBubble: {
    backgroundColor: '#18181d',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: '#111114',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderBottomLeftRadius: 4,
  },
  messageText: { color: '#e4e4e7', fontSize: 14, lineHeight: 21 },

  inputDeck: {
    padding: 12,
    paddingBottom: Platform.OS === 'ios' ? 12 : 20,
    backgroundColor: '#000000',
  },
  inputShell: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111114',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 26,
    paddingHorizontal: 14,
    paddingVertical: 6,
    gap: 8,
  },
  promptField: {
    flex: 1,
    color: '#ffffff',
    fontSize: 14,
    paddingVertical: 6,
  },
  micBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#18181d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnText: { color: '#000000', fontSize: 16, fontWeight: '800' },

  // Modals & Overlays
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)' },
  backdropTouch: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
  drawerSheet: {
    width: Math.min(width * 0.78, 320),
    height: '100%',
    backgroundColor: '#09090b',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255, 255, 255, 0.08)',
    padding: 24,
    justifyContent: 'space-between',
  },
  newChatBtn: {
    backgroundColor: '#111114',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 12,
    borderRadius: 12,
    marginBottom: 20,
  },
  newChatText: { color: '#ffffff', fontSize: 13, fontWeight: '600' },
  sectionHeader: { color: '#52525b', fontSize: 11, fontWeight: '700', marginBottom: 10 },
  threadItem: { paddingVertical: 10, paddingHorizontal: 6, borderRadius: 8 },
  threadItemActive: { backgroundColor: '#18181d' },
  threadText: { color: '#a1a1aa', fontSize: 13 },
  drawerFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    paddingTop: 16,
  },
  profileName: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
  profileMeta: { color: '#71717a', fontSize: 11 },
  localBadge: {
    backgroundColor: '#111114',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  localBadgeText: { color: '#22c55e', fontSize: 10, fontWeight: '700' },

  // Siri Voice Mode
  voiceFullscreen: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 30,
    paddingVertical: 60,
  },
  voiceTopBar: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  voiceTopLabel: { color: '#52525b', fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  siriPlasma: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#e2e8f0',
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 50,
    elevation: 25,
  },
  voiceBottom: { alignItems: 'center', gap: 24 },
  voiceSubtitle: { color: '#e4e4e7', fontSize: 17, textAlign: 'center' },
  closeVoiceBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#18181d',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
});
