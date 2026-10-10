import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  listVoicePersonas,
  VOICE_PERSONAS,
  type VoiceCategory,
  type VoicePersona,
} from '../../core/voicePersonas.ts';
import { updateVoicePrefs, useVoicePrefs } from '../../services/voice/prefs.ts';
import { previewPersonaVoice, stopSpeaking } from '../../services/voice/tts.ts';
import { makeStyles } from '../../theme';
import { Button } from '../Button';
import { Notice } from '../Notice';
import { Sheet } from '../Sheet';
import { Tag } from '../Tag';
import { Text } from '../Text';

export interface VoicePersonaSheetProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * Bottom sheet picker for Voice Models & Personas.
 * Supports Normal Everyday, Companion (Girlfriend/Boyfriend), and 18+ Adult/NSFW styles.
 */
export function VoicePersonaSheet({ visible, onClose }: VoicePersonaSheetProps) {
  const s = useStyles();
  const prefs = useVoicePrefs();
  const [tab, setTab] = useState<'normal' | 'companion' | 'nsfw_adult'>('normal');
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  const personas = listVoicePersonas(tab);

  const handlePreview = async (persona: VoicePersona) => {
    if (previewingId === persona.id) {
      await stopSpeaking();
      setPreviewingId(null);
      return;
    }
    setPreviewingId(persona.id);
    await previewPersonaVoice(persona);
    setPreviewingId(null);
  };

  const handleSelect = (persona: VoicePersona) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    updateVoicePrefs({
      personaId: persona.id,
      ttsPitch: persona.pitch,
      ttsRate: persona.rate,
    });
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Voice Models & Styles">
      <View style={s.content}>
        {/* Category switcher tabs */}
        <View style={s.tabs}>
          <Button
            label="Normal"
            variant={tab === 'normal' ? 'primary' : 'quiet'}
            onPress={() => setTab('normal')}
          />
          <Button
            label="Girlfriend & Boyfriend"
            variant={tab === 'companion' ? 'primary' : 'quiet'}
            onPress={() => setTab('companion')}
          />
          <Button
            label="18+ Adult (NSFW)"
            variant={tab === 'nsfw_adult' ? 'primary' : 'quiet'}
            onPress={() => setTab('nsfw_adult')}
          />
        </View>

        {tab === 'nsfw_adult' ? (
          <Notice tone="danger" title="Uncensored 18+ Voice Profiles">
            Intimate and adult conversational cadences designed for unfiltered romantic and late-night immersion.
          </Notice>
        ) : null}

        <ScrollView style={s.scroll} contentContainerStyle={s.list}>
          {personas.map((persona) => {
            const isSelected = prefs.personaId === persona.id;
            const isPlaying = previewingId === persona.id;

            return (
              <View
                key={persona.id}
                style={[s.card, isSelected && s.selectedCard]}
              >
                <View style={s.cardHeader}>
                  <View style={s.nameRow}>
                    <Text variant="heading" style={s.name}>
                      {persona.name}
                    </Text>
                    {isSelected ? <Tag label="Active" tone="accent" /> : null}
                    {persona.isNsfw ? <Tag label="18+" tone="danger" /> : null}
                  </View>
                  <Text tone="muted" style={s.subtitle}>
                    {persona.subtitle}
                  </Text>
                </View>

                <Text style={s.description}>{persona.description}</Text>

                <View style={s.tagsRow}>
                  {persona.tags.map((t) => (
                    <Tag key={t} label={t} tone="default" />
                  ))}
                </View>

                <View style={s.cardActions}>
                  <Button
                    label={isPlaying ? 'Stop Preview' : 'Preview Voice'}
                    variant="text"
                    icon={isPlaying ? 'stop' : 'play'}
                    onPress={() => handlePreview(persona)}
                  />
                  {!isSelected ? (
                    <Button
                      label="Use This Voice"
                      variant="primary"
                      onPress={() => handleSelect(persona)}
                    />
                  ) : null}
                </View>
              </View>
            );
          })}
        </ScrollView>
      </View>
    </Sheet>
  );
}

const useStyles = makeStyles(({ colors, space, line }) => ({
  content: {
    paddingBottom: space.lg,
    maxHeight: 520,
    gap: space.md,
  },
  tabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  scroll: {
    maxHeight: 440,
  },
  list: {
    gap: space.md,
    paddingBottom: space.lg,
  },
  card: {
    padding: space.md,
    backgroundColor: colors.surface,
    borderWidth: line,
    borderColor: colors.border,
    gap: space.sm,
  },
  selectedCard: {
    borderColor: colors.accent,
  },
  cardHeader: {
    gap: space.xs,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  name: {
    flex: 1,
  },
  subtitle: {
    fontSize: 13,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.xs,
  },
}));
