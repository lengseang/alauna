import React, { useState, useSyncExternalStore } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MODEL_CATALOG } from '../core/catalog.ts';
import { defaultContext, recommendModel } from '../core/fit.ts';
import { formatBytes } from '../core/format.ts';
import { getDeviceProfile } from '../services/device.ts';
import { onStorageReady } from '../services/lifecycle.ts';
import { storageStore } from '../services/storage.ts';
import { makeStyles } from '../theme';
import { Ambient } from './Ambient';
import { Button } from './Button';
import { Card } from './Card';
import { Notice } from './Notice';
import { StoragePicker } from './StoragePicker';
import { Text } from './Text';
import { Wordmark } from './Wordmark';

const NEEDS: Array<{ title: string; text: string }> = [
  { title: 'Storage', text: 'A folder for the AI models (1 to 7 GB each) and your chats. You choose it in the next step.' },
  { title: 'Internet', text: 'Only to download models from Hugging Face. Chatting never uses the internet.' },
  { title: 'Nothing else', text: 'No microphone, camera, contacts, location or accounts. No analytics.' },
];

/**
 * First run (and any time the saved storage location is missing):
 * 1. Meet the app, see YOUR phone and what the app needs.
 * 2. Pick where data lives. Nothing else is reachable until this is done (ST-1, ST-2).
 */
export function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const storage = useSyncExternalStore(storageStore.subscribe, storageStore.getState);
  const device = getDeviceProfile();
  const recommended = recommendModel(MODEL_CATALOG, device.totalRamBytes);
  // If a location was configured before but is now unusable, skip the welcome and explain.
  const [step, setStep] = useState<1 | 2>(storage.status === 'unavailable' ? 2 : 1);

  return (
    <View style={s.root}>
      <Ambient />
      <ScrollView contentContainerStyle={[s.content, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <View style={s.brand}>
          <Wordmark />
          <Text tone="muted" style={s.center}>
            Private AI that runs entirely on your phone.
          </Text>
        </View>

        {step === 1 ? (
          <>
            <Card>
              <Text variant="label" tone="accent">
                Your phone
              </Text>
              <Text variant="title">{device.name}</Text>
              <Text tone="muted">
                {device.osName} {device.osVersion ?? ''}
                {device.totalRamBytes ? ` · ${formatBytes(device.totalRamBytes)} memory` : ''}
                {device.cpuArchitectures[0] ? ` · ${device.cpuArchitectures[0]}` : ''}
              </Text>
              {device.supported && recommended ? (
                <Text tone="muted">{`Best fit: ${recommended.name} (${formatBytes(recommended.sizeBytes)}, ${defaultContext(device.totalRamBytes)} tokens of memory).`}</Text>
              ) : null}
              {!device.supported ? <Notice tone="danger">{device.unsupportedReason ?? 'This phone is not supported.'}</Notice> : null}
            </Card>

            <Card>
              <Text variant="title">What CHIWIWI needs</Text>
              {NEEDS.map((n) => (
                <View key={n.title}>
                  <Text variant="strong">{n.title}</Text>
                  <Text tone="muted">{n.text}</Text>
                </View>
              ))}
            </Card>

            <Button label="Continue" disabled={!device.supported} onPress={() => setStep(2)} />
          </>
        ) : (
          <>
            <Text variant="title">Where should CHIWIWI keep its data?</Text>
            {storage.status === 'unavailable' && storage.reason ? <Notice tone="danger">{storage.reason}</Notice> : null}
            <Text tone="muted">Nothing works until you choose. You can change it later.</Text>
            <StoragePicker onDone={onStorageReady} />
            {storage.status !== 'unavailable' ? <Button label="Back" variant="text" onPress={() => setStep(1)} /> : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles(({ colors, space }) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.xl, gap: space.lg },
  brand: { alignItems: 'center', gap: space.sm, marginBottom: space.lg },
  center: { textAlign: 'center' },
}));
