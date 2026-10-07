import React, { useEffect, useRef } from 'react';
import { AppState, BackHandler, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { getDeviceProfile } from './src/services/device';
import { bootstrap, recheckStorage } from './src/services/lifecycle';
import { useSettings } from './src/services/settings';
import { useStorage } from './src/services/storage';
import { ThemeProvider, makeStyles } from './src/theme';
import { Ambient } from './src/ui/Ambient';
import { EmptyState } from './src/ui/EmptyState';
import { pop, push } from './src/ui/nav';
import { OnboardingScreen } from './src/ui/OnboardingScreen';
import { RouteStack } from './src/ui/Stack';
import { ToastHost } from './src/ui/Toast';
import { Wordmark } from './src/ui/Wordmark';

// Hold the native splash until the theme and fonts are ready, so the first painted frame is already themed.
SplashScreen.preventAutoHideAsync().catch(() => {});
let splashHidden = false;
const hideSplash = () => {
  if (splashHidden) return;
  splashHidden = true;
  void SplashScreen.hideAsync().catch(() => {});
};

function Boot() {
  const s = useStyles();
  return (
    <View style={s.boot}>
      <Ambient />
      <Wordmark breathing />
    </View>
  );
}

function Root() {
  const s = useStyles();
  const settings = useSettings();
  const storage = useStorage();
  const device = getDeviceProfile();
  const wasGated = useRef(false);

  // Startup order is enforced in bootstrap(): settings -> storage -> crash check -> vault data.
  useEffect(() => {
    void bootstrap();
  }, []);

  // Android Back: close the top screen; at Chat let Android minimise the app. (The open drawer/sheet handle Back first.)
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

  // First time through the storage gate -> send the user straight to Models (they have no model yet).
  useEffect(() => {
    if (gated) wasGated.current = true;
    if (ready && wasGated.current) {
      wasGated.current = false;
      push('models');
    }
  }, [gated, ready]);

  let body: React.ReactNode;
  if (!device.supported) body = <EmptyState brand title="This phone cannot run CHIWIWI" body={device.unsupportedReason ?? 'This device is not supported.'} />;
  else if (!settings.loaded || storage.status === 'loading') body = <Boot />;
  else if (!ready) body = <OnboardingScreen />;
  else body = <RouteStack />;

  return (
    <View style={s.root} onLayout={hideSplash}>
      {body}
      <ToastHost />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Root />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  boot: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
}));
