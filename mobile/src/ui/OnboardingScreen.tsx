import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MODEL_CATALOG } from '../core/catalog.ts';
import { defaultContext, recommendModel } from '../core/fit.ts';
import { formatBytes } from '../core/format.ts';
import { AlertIcon, CheckIcon, PhoneIcon } from '../components/Icons';
import { getDeviceProfile } from '../services/device.ts';
import { onStorageReady } from '../services/lifecycle.ts';
import { storageStore } from '../services/storage.ts';
import { useSyncExternalStore } from 'react';
import { Btn } from './Btn';
import { Card } from './kit';
import { StoragePicker } from './StoragePicker';
import { colors, font } from './theme';

const NEEDS: Array<{ title: string; text: string }> = [
  { title: 'Storage', text: 'A folder for the AI models (1-7 GB each) and your chats. You choose it in the next step.' },
  { title: 'Internet', text: 'Only to download models from Hugging Face. Chatting never uses the internet.' },
  { title: 'Nothing else', text: 'No microphone, camera, contacts, location or accounts. No analytics.' },
];

/**
 * First run (and any time the saved storage location is missing):
 * 1. Meet the app + see YOUR phone and what the app needs.
 * 2. Pick where data lives. Nothing else is reachable until this is done (ST-1, ST-2).
 */
export function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const storage = useSyncExternalStore(storageStore.subscribe, storageStore.getState);
  const device = getDeviceProfile();
  const recommended = recommendModel(MODEL_CATALOG, device.totalRamBytes);
  // If a location was configured before but is now unusable, skip the welcome and explain.
  const [step, setStep] = useState<1 | 2>(storage.status === 'unavailable' ? 2 : 1);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.logo}>
        <Text style={styles.logoText}>千</Text>
      </View>
      <Text style={styles.h1}>CHIWIWI</Text>
      <Text style={styles.sub}>Private AI that runs entirely on your phone.</Text>
      <Text style={styles.steps}>Step {step} of 2</Text>

      {step === 1 ? (
        <View style={{ gap: 14 }}>
          <Card>
            <View style={styles.row}>
              <PhoneIcon size={22} color={colors.accent} />
              <Text style={styles.cardTitle}>Your phone</Text>
            </View>
            <Text style={styles.deviceName}>{device.name}</Text>
            <Text style={styles.body}>
              {device.osName} {device.osVersion ?? ''}
              {device.totalRamBytes ? ` · ${formatBytes(device.totalRamBytes)} RAM` : ''}
              {device.cpuArchitectures[0] ? ` · ${device.cpuArchitectures[0]}` : ''}
            </Text>
            {device.supported && recommended ? (
              <Text style={styles.body}>
                Best fit for this phone: <Text style={styles.strong}>{recommended.name}</Text> ({formatBytes(recommended.sizeBytes)}, {defaultContext(device.totalRamBytes)}-token memory).
              </Text>
            ) : null}
            {!device.supported ? (
              <View style={styles.row}>
                <AlertIcon size={16} color={colors.bad} />
                <Text style={[styles.body, { color: colors.bad, flex: 1 }]}>{device.unsupportedReason}</Text>
              </View>
            ) : null}
          </Card>

          <Card>
            <Text style={styles.cardTitle}>What CHIWIWI needs</Text>
            {NEEDS.map((n) => (
              <View key={n.title} style={styles.need}>
                <CheckIcon size={15} color={colors.good} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.needTitle}>{n.title}</Text>
                  <Text style={styles.body}>{n.text}</Text>
                </View>
              </View>
            ))}
          </Card>

          <Btn variant="primary" label="Continue" disabled={!device.supported} onPress={() => setStep(2)} />
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <Text style={styles.h2}>Where should CHIWIWI keep its data?</Text>
          {storage.status === 'unavailable' && storage.reason ? (
            <Card style={{ borderColor: colors.warn }}>
              <View style={styles.row}>
                <AlertIcon size={16} />
                <Text style={[styles.body, { color: colors.warn, flex: 1 }]}>{storage.reason}</Text>
              </View>
            </Card>
          ) : null}
          <Text style={styles.body}>Nothing works until you choose. You can change it later.</Text>
          <StoragePicker onDone={onStorageReady} />
          {storage.status !== 'unavailable' ? <Btn variant="ghost" label="Back" onPress={() => setStep(1)} /> : null}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 8 },
  logo: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  logoText: { color: colors.white, fontSize: 30, fontWeight: '800' },
  h1: { color: colors.white, fontSize: font.xxl, fontWeight: '800', letterSpacing: 3, textAlign: 'center', marginTop: 8 },
  sub: { color: colors.muted, fontSize: font.md, textAlign: 'center' },
  steps: { color: colors.faint, fontSize: font.xs, textAlign: 'center', marginTop: 6, marginBottom: 14, textTransform: 'uppercase', letterSpacing: 1.5 },
  h2: { color: colors.text, fontSize: font.xl, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardTitle: { color: colors.text, fontSize: font.lg, fontWeight: '700' },
  deviceName: { color: colors.white, fontSize: font.xl, fontWeight: '700' },
  body: { color: colors.muted, fontSize: font.md, lineHeight: 21 },
  strong: { color: colors.text, fontWeight: '700' },
  need: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  needTitle: { color: colors.text, fontSize: font.md, fontWeight: '600' },
});
