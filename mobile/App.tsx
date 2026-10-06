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
  ActivityIndicator,
  Alert,
} from 'react-native';
import { ARCHETYPES, SoulArchetypeKey, PADVector } from './src/types/soul';
import { MobileOrchestrator } from './src/engine/orchestrator';
import { MemoryEngine } from './src/services/memoryEngine';
import { VaultStorage, ChatThread, ChatMessage, ThreadSoulConfig } from './src/services/vaultStorage';
import SettingsScreen from './src/screens/SettingsScreen';
import ThreadSoulModal from './src/components/ThreadSoulModal';
import {
  SoulIcon,
  SlidersIcon,
  ZapIcon,
  CrossIcon,
  MicIcon,
  AttachmentIcon,
  ImageIcon,
  DocumentIcon,
  CameraIcon,
} from './src/components/Icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'react-native';

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

  // Multimodal Attachments State
  const [selectedMedia, setSelectedMedia] = useState<{ uri: string; type: 'image' | 'file'; name?: string }[]>([]);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

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

  const handlePickImage = async () => {
    setAttachmentMenuOpen(false);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsMultipleSelection: true,
      });

      if (!result.canceled && result.assets.length > 0) {
        const newItems = result.assets.map(a => ({
          uri: a.uri,
          type: 'image' as const,
          name: a.fileName || 'Photo',
        }));
        setSelectedMedia(prev => [...prev, ...newItems]);
      }
    } catch {}
  };

  const handleTakePhoto = async () => {
    setAttachmentMenuOpen(false);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.8,
      });

      if (!result.canceled && result.assets.length > 0) {
        const item = {
          uri: result.assets[0].uri,
          type: 'image' as const,
          name: 'Camera Capture',
        };
        setSelectedMedia(prev => [...prev, item]);
      }
    } catch {}
  };

  const handlePickDocument = async () => {
    setAttachmentMenuOpen(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: true,
      });

      if (!result.canceled && result.assets.length > 0) {
        const newItems = result.assets.map(a => ({
          uri: a.uri,
          type: 'file' as const,
          name: a.name || 'Document',
        }));
        setSelectedMedia(prev => [...prev, ...newItems]);
      }
    } catch {}
  };

  const handleRemoveMedia = (index: number) => {
    setSelectedMedia(prev => prev.filter((_, i) => i !== index));
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
    if (isGenerating) return;
    if (!inputText.trim() && selectedMedia.length === 0) return;

    const userText = inputText.trim();
    const mediaUris = selectedMedia.map(m => m.uri);

    // Immediately clear input fields to prevent double submissions
    setInputText('');
    setSelectedMedia([]);
    setIsGenerating(true);

    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      sender: 'user',
      text: userText,
      timestamp: Date.now(),
      mediaUris: mediaUris.length > 0 ? mediaUris : undefined,
      tokenCountEst: Math.floor((userText.length || 20) / 4),
    };

    const threadTitle = currentThread.title === 'New Conversation' ? (userText ? userText.slice(0, 32) : 'Photo Analysis') : currentThread.title;

    // Immediately append user message to feed
    setCurrentThread(prev => ({
      ...prev,
      title: threadTitle,
      messages: [...prev.messages, userMsg],
      updatedAt: Date.now(),
    }));

    try {
      // Execute turn asynchronously through on-device streaming generator
      const threadArch = currentThread.soulConfig.archetype;
      const threadPAD = currentThread.soulConfig.pad;
      const result = await MobileOrchestrator.processTurnAsync(
        userText || 'Analyze attached document/image',
        threadArch,
        threadPAD,
        activeModelId
      );

      const botMsg: ChatMessage = {
        id: `a_${Date.now() + 1}`,
        sender: 'assistant',
        text: result.response,
        timestamp: Date.now() + 1,
        tokenCountEst: Math.floor(result.response.length / 4),
        meta: `${activeModelId} • ${result.route.latencyMs.toFixed(2)}ms ${result.route.category}`,
      };

      setCurrentThread(prev => {
        let updated: ChatThread = {
          ...prev,
          title: threadTitle,
          messages: [...prev.messages, botMsg],
          soulConfig: {
            ...prev.soulConfig,
            pad: result.updatedPAD,
          },
          updatedAt: Date.now(),
        };

        // Claude-Style Automatic Session Compaction if conversation exceeds token threshold
        updated = VaultStorage.compactSession(updated, 2048);
        VaultStorage.saveThread(updated);
        return updated;
      });

      loadSavedThreads();
    } catch (err: any) {
      Alert.alert('Inference Notice', `Local generation interrupted: ${err?.message || 'Check model weights'}`);
    } finally {
      setIsGenerating(false);
    }
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
                  {/* Attached Media Previews */}
                  {m.mediaUris && m.mediaUris.length > 0 && (
                    <View style={styles.attachedMediaGrid}>
                      {m.mediaUris.map((uri, idx) => (
                        <Image key={idx} source={{ uri }} style={styles.bubbleMediaThumb} />
                      ))}
                    </View>
                  )}
                  {m.text ? <Text style={styles.messageText}>{m.text}</Text> : null}
                </View>
              </View>
            ))}
          </ScrollView>

          {/* Floating Bottom Input Deck */}
          <View style={styles.inputDeck}>
            {/* Selected Attachments Preview Tray */}
            {selectedMedia.length > 0 && (
              <View style={styles.mediaPreviewTray}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {selectedMedia.map((item, idx) => (
                    <View key={idx} style={styles.mediaPreviewCard}>
                      {item.type === 'image' ? (
                        <Image source={{ uri: item.uri }} style={styles.mediaPreviewThumb} />
                      ) : (
                        <View style={styles.docPreviewBadge}>
                          <DocumentIcon size={14} color="#38bdf8" />
                          <Text style={styles.docPreviewText} numberOfLines={1}>{item.name}</Text>
                        </View>
                      )}
                      <TouchableOpacity
                        style={styles.mediaRemoveBtn}
                        onPress={() => handleRemoveMedia(idx)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <CrossIcon size={10} color="#ffffff" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            <View style={styles.inputShell}>
              {/* Attachment Picker Trigger Button */}
              <TouchableOpacity
                style={styles.attachBtn}
                onPress={() => setAttachmentMenuOpen(true)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <AttachmentIcon size={18} color="#a1a1aa" />
              </TouchableOpacity>

              <TextInput
                style={styles.promptField}
                placeholder="Message CHIWIWI..."
                placeholderTextColor="#71717a"
                value={inputText}
                onChangeText={setInputText}
                onSubmitEditing={handleSend}
                returnKeyType="send"
              />

              {/* Minimal Line Mic Icon */}
              <TouchableOpacity
                style={styles.micBtn}
                onPress={() => {
                  setVoiceActive(true);
                  startVoicePulse();
                }}
              >
                <MicIcon size={18} color="#ffffff" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.sendBtn, (isGenerating || (!inputText.trim() && selectedMedia.length === 0)) && { opacity: 0.4 }]}
                onPress={handleSend}
                disabled={isGenerating}
                activeOpacity={0.7}
              >
                {isGenerating ? (
                  <ActivityIndicator size="small" color="#000000" />
                ) : (
                  <Text style={styles.sendBtnText}>↑</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Multimodal Attachment Picker Menu Modal */}
          <Modal visible={attachmentMenuOpen} transparent animationType="fade">
            <View style={styles.modalBackdrop}>
              <TouchableOpacity style={styles.backdropTouch} onPress={() => setAttachmentMenuOpen(false)} />
              <View style={styles.attachmentSheet}>
                <Text style={styles.attachmentTitle}>ATTACH CONTENT</Text>
                <TouchableOpacity style={styles.attachmentOption} onPress={handleTakePhoto}>
                  <View style={styles.attachIconBg}>
                    <CameraIcon size={18} color="#38bdf8" />
                  </View>
                  <View>
                    <Text style={styles.attachOptionLabel}>Camera</Text>
                    <Text style={styles.attachOptionSub}>Take photo with S23 Ultra</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity style={styles.attachmentOption} onPress={handlePickImage}>
                  <View style={styles.attachIconBg}>
                    <ImageIcon size={18} color="#22c55e" />
                  </View>
                  <View>
                    <Text style={styles.attachOptionLabel}>Photos & Images</Text>
                    <Text style={styles.attachOptionSub}>Select from device gallery</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity style={styles.attachmentOption} onPress={handlePickDocument}>
                  <View style={styles.attachIconBg}>
                    <DocumentIcon size={18} color="#f59e0b" />
                  </View>
                  <View>
                    <Text style={styles.attachOptionLabel}>Files & Documents</Text>
                    <Text style={styles.attachOptionSub}>PDF, TXT, code, markdown</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
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

  // Multimodal Attachments & Preview Tray
  attachBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaPreviewTray: {
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  mediaPreviewCard: {
    position: 'relative',
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    backgroundColor: '#18181d',
  },
  mediaPreviewThumb: {
    width: 56,
    height: 56,
    borderRadius: 9,
  },
  mediaRemoveBtn: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  docPreviewBadge: {
    height: 56,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: 160,
  },
  docPreviewText: {
    color: '#e4e4e7',
    fontSize: 11,
    fontWeight: '600',
  },
  attachedMediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  bubbleMediaThumb: {
    width: 180,
    height: 140,
    borderRadius: 12,
    backgroundColor: '#27272a',
  },

  // Attachment Sheet Modal
  attachmentSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#111114',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 28,
    gap: 16,
  },
  attachmentTitle: {
    color: '#71717a',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  attachmentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 10,
  },
  attachIconBg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#18181d',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachOptionLabel: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  attachOptionSub: {
    color: '#71717a',
    fontSize: 12,
    marginTop: 2,
  },
});
