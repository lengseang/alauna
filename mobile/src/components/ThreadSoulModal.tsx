import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
} from 'react-native';
import { ARCHETYPES, SoulArchetypeKey, PADVector } from '../types/soul';
import { ThreadSoulConfig } from '../services/vaultStorage';
import { CrossIcon } from './Icons';

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
  const [backstory, setBackstory] = useState(config.customBackstory || '');

  React.useEffect(() => {
    setSelectedArch(config.archetype);
    setPad(config.pad);
    setBackstory(config.customBackstory || '');
  }, [config, visible]);

  const handleApply = () => {
    onSave({
      archetype: selectedArch,
      pad,
      customBackstory: backstory.trim(),
      toneIntensity: config.toneIntensity,
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
              <Text style={styles.title}>Chat Personality & Soul</Text>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <CrossIcon size={16} color="#71717a" />
              </TouchableOpacity>
            </View>

          <Text style={styles.subtext}>
            Customize how the AI behaves exclusively within this conversation.
          </Text>

          <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 14 }}>
            {/* Archetype Row */}
            <Text style={styles.label}>ARCHETYPE FOR THIS THREAD</Text>
            <View style={styles.archRow}>
              {(Object.keys(ARCHETYPES) as SoulArchetypeKey[]).map(key => {
                const arch = ARCHETYPES[key];
                const isSelected = selectedArch === key;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.archBtn, isSelected && styles.archBtnActive]}
                    onPress={() => {
                      setSelectedArch(key);
                      setPad(ARCHETYPES[key].defaultPAD);
                    }}
                  >
                    <Text style={[styles.archText, isSelected && { color: '#000', fontWeight: '700' }]}>
                      {arch.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Custom Backstory / Roleplay Prompt */}
            <Text style={styles.label}>THREAD ROLEPLAY / BACKSTORY</Text>
            <TextInput
              style={styles.backstoryInput}
              placeholder="e.g. You are an expert Rust backend architect reviewing microservices..."
              placeholderTextColor="#52525b"
              multiline
              numberOfLines={3}
              value={backstory}
              onChangeText={setBackstory}
            />

            {/* PAD Readout */}
            <View style={styles.padInfoBox}>
              <Text style={styles.label}>EMOTIONAL ATTUNEMENT</Text>
              <Text style={styles.padText}>
                Pleasure: {pad.pleasure > 0 ? `+${pad.pleasure}` : pad.pleasure} • Arousal: {pad.arousal} • Dominance: {pad.dominance}
              </Text>
            </View>
          </ScrollView>

          <TouchableOpacity style={styles.saveBtn} onPress={handleApply}>
            <Text style={styles.saveBtnText}>Apply to This Chat</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#0c0c0f',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    padding: 20,
    paddingBottom: 36,
    gap: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignSelf: 'center',
    marginBottom: 4,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  subtext: { color: '#71717a', fontSize: 12, lineHeight: 16, marginBottom: 4 },
  label: { color: '#52525b', fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },

  archRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  archBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#18181d',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  archBtnActive: { backgroundColor: '#ffffff', borderColor: '#ffffff' },
  archText: { color: '#d4d4d8', fontSize: 12, fontWeight: '600' },

  backstoryInput: {
    backgroundColor: '#111114',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    padding: 12,
    color: '#ffffff',
    fontSize: 13,
    minHeight: 70,
    textAlignVertical: 'top',
  },

  padInfoBox: {
    backgroundColor: '#111114',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    gap: 4,
  },
  padText: { color: '#ffffff', fontSize: 12, fontWeight: '600' },

  saveBtn: {
    backgroundColor: '#ffffff',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnText: { color: '#000000', fontSize: 14, fontWeight: '700' },
});
