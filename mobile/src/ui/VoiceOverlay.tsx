import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getVoicePrefs } from '../services/voice/prefs.ts';
import { downloadSpeechModel } from '../services/voice/speechModels.ts';
import { openAppSettings } from '../services/voice/stt.ts';
import { startVoiceMode, stopVoiceMode, useVoiceMode, type VoiceFix } from '../services/voice/voiceMode.ts';
import { makeStyles } from '../theme';
import { Button } from './Button';
import { Eclipse, type EclipseState } from './Eclipse';
import { IconButton } from './IconButton';
import { Text } from './Text';

const PHASE_LABEL = {
  idle: 'Starting',
  listening: 'Listening',
  transcribing: 'Transcribing',
  thinking: 'Thinking',
  speaking: 'Speaking',
  error: 'Voice mode is not available',
} as const;

const eclipseFor = (phase: keyof typeof PHASE_LABEL): EclipseState => (phase === 'error' ? 'error' : phase === 'listening' ? 'ready' : phase === 'idle' ? 'idle' : 'busy');

/**
 * Full-screen voice loop. All states come from services/voice/voiceMode (listening, transcribing, thinking, speaking);
 * the turn also lands in the chat as a normal message. Close, Android Back or the Stop button end the session and
 * free the speech models. When something is missing (speech model, microphone) it says so and offers the real fix.
 */
export function VoiceOverlay({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const v = useVoiceMode();
  const [fixing, setFixing] = useState(false);

  useEffect(() => {
    if (!visible) return;
    void startVoiceMode();
    return () => void stopVoiceMode();
  }, [visible]);

  const close = () => {
    void stopVoiceMode();
    onClose();
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

  const fixLabel = v.fix === 'download_model' ? 'Download speech model' : v.fix === 'open_settings' ? 'Open app settings' : null;
  const status = PHASE_LABEL[v.phase];

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={close} statusBarTranslucent>
      <View style={[s.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
        <View style={s.top}>
          <IconButton icon="close" label="Close voice mode" onPress={close} />
        </View>
        <View style={s.center}>
          <Eclipse state={eclipseFor(v.phase)} size={96} label={status} />
          <Text variant="heading" accessibilityLiveRegion="polite">
            {status}
          </Text>
          {v.phase === 'error' ? (
            <>
              <Text style={s.mid}>{v.error ?? 'Voice mode could not start.'}</Text>
              {fixLabel ? <Button label={fixLabel} variant="primary" loading={fixing} busyLabel="Downloading" onPress={() => fix(v.fix)} /> : null}
              {v.fix !== 'download_model' && v.fix !== 'open_settings' ? <Button label="Try again" variant="quiet" onPress={() => void startVoiceMode()} /> : null}
            </>
          ) : (
            <ScrollView style={s.scroll} contentContainerStyle={s.text}>
              {v.heard ? <Text tone="muted">{v.heard}</Text> : null}
              {v.reply ? <Text>{v.reply}</Text> : null}
            </ScrollView>
          )}
        </View>
        {v.phase !== 'error' ? <Button label="End voice mode" variant="quiet" icon="stop" onPress={close} /> : null}
      </View>
    </Modal>
  );
}

const useStyles = makeStyles(({ colors, space }) => ({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: space.lg },
  top: { alignItems: 'flex-end' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg },
  mid: { textAlign: 'center' },
  scroll: { alignSelf: 'stretch', maxHeight: 260 },
  text: { gap: space.md },
}));
