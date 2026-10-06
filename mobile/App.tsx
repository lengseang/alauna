import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, AppState, BackHandler, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { getDeviceProfile } from './src/services/device';
import { bootstrap, recheckStorage } from './src/services/lifecycle';
import { useSettings } from './src/services/settings';
import { useStorage } from './src/services/storage';
import { ChatScreen } from './src/ui/ChatScreen';
import { ToastHost } from './src/ui/kit';
import { ModelsScreen } from './src/ui/ModelsScreen';
import { pop, push, useRoute } from './src/ui/nav';
import { OnboardingScreen } from './src/ui/OnboardingScreen';
import { AboutSettings, AdvancedSettings, MemorySettings, SettingsHome, SoulSettings, StorageSettings } from './src/ui/SettingsScreens';
import { colors } from './src/ui/theme';

function Splash({ message }: { message?: string }) {
  return (
    <View style={styles.center}>
      <Text style={styles.logo}>千</Text>
      <Text style={styles.name}>CHIWIWI</Text>
      <ActivityIndicator color={colors.accent} style={{ marginTop: 20 }} />
      {message ? <Text style={styles.msg}>{message}</Text> : null}
    </View>
  );
}

function Unsupported({ reason }: { reason: string }) {
  return (
    <View style={styles.center}>
      <Text style={styles.name}>CHIWIWI</Text>
      <Text style={[styles.msg, { color: colors.bad, marginTop: 16 }]}>{reason}</Text>
    </View>
  );
}

function Routes() {
  const route = useRoute();
  switch (route) {
    case 'models':
      return <ModelsScreen />;
    case 'settings':
      return <SettingsHome />;
    case 'settings/soul':
      return <SoulSettings />;
    case 'settings/storage':
      return <StorageSettings />;
    case 'settings/memory':
      return <MemorySettings />;
    case 'settings/advanced':
      return <AdvancedSettings />;
    case 'settings/about':
      return <AboutSettings />;
    default:
      return <ChatScreen />;
  }
}

function Root() {
  const settings = useSettings();
  const storage = useStorage();
  const device = getDeviceProfile();
  const wasGated = useRef(false);

  // Startup order is enforced in bootstrap(): settings -> storage -> crash check -> vault data.
  useEffect(() => {
    void bootstrap();
  }, []);

  // Android Back: close screens in order; at the root let Android minimise the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => pop());
    return () => sub.remove();
  }, []);

  // Returning from another app (SD card removed? access revoked?): re-validate the saved folder.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void recheckStorage();
    });
    return () => sub.remove();
  }, []);

  const ready = storage.status === 'ready';
  const gated = settings.loaded && !ready && storage.status !== 'loading';

  // First time through the gate -> send the user straight to the Model Hub (flow step 4).
  useEffect(() => {
    if (gated) wasGated.current = true;
    if (ready && wasGated.current) {
      wasGated.current = false;
      push('models');
    }
  }, [gated, ready]);

  if (!device.supported) return <Unsupported reason={device.unsupportedReason ?? 'This device is not supported.'} />;
  if (!settings.loaded || storage.status === 'loading') return <Splash />;
  if (!ready) return <OnboardingScreen />;
  return <Routes />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <View style={styles.root}>
        <Root />
        <ToastHost />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 32 },
  logo: { color: colors.white, fontSize: 44, fontWeight: '800' },
  name: { color: colors.white, fontSize: 20, fontWeight: '800', letterSpacing: 4, marginTop: 6 },
  msg: { color: colors.muted, fontSize: 14, textAlign: 'center', marginTop: 12 },
});
