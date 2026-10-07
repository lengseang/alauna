import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SoulArchetypeKey, PADVector } from '../types/soul';
import { ThreadSoulConfig } from '../services/vaultStorage';
import { CrossIcon } from './Icons';
import { SoulCustomizer } from './SoulCustomizer';

interface ThreadSoulModalProps {
  visible: boolean;
  onClose: () => void;
  config: ThreadSoulConfig;
  onSave: (newConfig: ThreadSoulConfig) => void;
}

export default function ThreadSoulModal({
  visible,
  onClose,
  config,
  onSave,
}: ThreadSoulModalProps) {
  const [selectedArch, setSelectedArch] = useState<SoulArchetypeKey>(config.archetype);
  const [pad, setPad] = useState<PADVector>(config.pad);
  const [toneIntensity, setToneIntensity] = useState<number>(config.toneIntensity ?? 0.8);
  const [backstory, setBackstory] = useState(config.customBackstory || '');

  React.useEffect(() => {
    setSelectedArch(config.archetype);
    setPad(config.pad);
    setToneIntensity(config.toneIntensity ?? 0.8);
    setBackstory(config.customBackstory || '');
  }, [config, visible]);

  const handleApply = () => {
    onSave({
      archetype: selectedArch,
      pad,
      customBackstory: backstory.trim(),
      toneIntensity,
    });
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.modalSheet}>
          <View style={styles.handle} />

          <View style={styles.headerRow}>
            <View>
              <Text style={styles.title}>Chat Personality & Soul</Text>
              <Text style={styles.subtext}>
                Customize tone, emotional attunement, and backstory for this conversation.
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <CrossIcon size={16} color="#71717a" />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ paddingBottom: 16 }}>
            <SoulCustomizer
              archetype={selectedArch}
              onSelectArchetype={setSelectedArch}
              pad={pad}
              onUpdatePAD={setPad}
              toneIntensity={toneIntensity}
              onUpdateToneIntensity={setToneIntensity}
              customBackstory={backstory}
              onUpdateCustomBackstory={setBackstory}
              showBackstory={true}
            />
          </ScrollView>

          <TouchableOpacity style={styles.saveBtn} onPress={handleApply} activeOpacity={0.85}>
            <Text style={styles.saveBtnText}>Apply Persona to This Chat</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#0a0a0d',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 36,
    gap: 12,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignSelf: 'center',
    marginBottom: 4,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: 4,
  },
  title: { color: '#ffffff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  subtext: { color: '#71717a', fontSize: 11, marginTop: 2 },

  saveBtn: {
    backgroundColor: '#ffffff',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 4,
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  saveBtnText: { color: '#000000', fontSize: 14, fontWeight: '800' },
});
