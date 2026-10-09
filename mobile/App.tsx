import React, { useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { getModel } from './src/core/catalog';
import { getDeviceProfile } from './src/services/device';
import { engine, useEngineStatus } from './src/services/engine';
import { bootstrap, recheckStorage, useBoot } from './src/services/lifecycle';
import { isInstalled } from './src/services/modelLibrary';
import { initSecurity, useSecurity } from './src/services/security';
import { useSettings } from './src/services/settings';
import { describeLocation, useStorage } from './src/services/storage';
import { showToast } from './src/services/toast';
import { initVoicePrefs, useVoicePrefs } from './src/services/voice/prefs';
import { refreshSpeechModels } from './src/services/voice/speechModels';
import { ThemeProvider, makeStyles } from './src/theme';
import { BootScreen } from './src/ui/BootScreen';
import { bootSteps } from './src/ui/chatLogic';
import { EmptyState } from './src/ui/EmptyState';
import { LockScreen } from './src/ui/LockScreen';
import { pop, push } from './src/ui/nav';
import { OnboardingScreen } from './src/ui/OnboardingScreen';
import { RouteStack } from './src/ui/Stack';
import { ToastHost } from './src/ui/Toast';

// Hold the native splash until the theme and fonts are ready, so the first painted frame is already themed.
SplashScreen.preventAutoHideAsync().catch(() => {});
let splashHidden = false;
const hideSplash = () => {
  if (splashHidden) return;
  splashHidden = true;
  void SplashScreen.hideAsync().catch(() => {});
};

/** The last model is auto-loaded once per launch, unless the previous run died loading it (Chat then asks first). */
type AutoLoad = { id: string; name: string; done: boolean } | null | undefined;

function BootStageView({
  stage,
  securityLoaded,
  voiceLoaded,
  auto,
  location,
}: {
  stage: ReturnType<typeof useBoot>['stage'];
  securityLoaded: boolean;
  voiceLoaded: boolean;
  auto: AutoLoad;
  location: string | null;
}) {
  const eng = useEngineStatus();
  const loading = auto && !auto.done && eng.modelId === auto.id && (eng.state === 'loading' || eng.state === 'warming');
  const plan = bootSteps({
    stage,
    security: securityLoaded,
    voice: voiceLoaded,
    model: auto ? { name: auto.name, done: auto.done, progress: loading ? (eng.state === 'warming' ? 1 : eng.progress) : 0 } : null,
  });
  return <BootScreen steps={plan.steps} fraction={plan.fraction} location={location} />;
}

function Root() {
  const s = useStyles();
  const settings = useSettings();
  const storage = useStorage();
  const boot = useBoot();
  const security = useSecurity();
  const voice = useVoicePrefs();
  const device = getDeviceProfile();
  const wasGated = useRef(false);
  const [auto, setAuto] = useState<AutoLoad>(undefined);

  // Real boot: app lock and voice prefs alongside settings -> storage -> crash check -> vault data (lifecycle order).
  useEffect(() => {
    void initSecurity();
    void initVoicePrefs();
    void bootstrap();
  }, []);

  // Speech models live in the vault: re-scan whenever the vault becomes ready or moves.
  const ready = storage.status === 'ready';
  const root = storage.config?.rootPath;
  useEffect(() => {
    if (ready) refreshSpeechModels();
  }, [ready, root]);

  // Decide the auto-load once the vault data is in.
  useEffect(() => {
    if (boot.stage !== 'done' || auto !== undefined) return;
    const spec = ready ? getModel(settings.activeModelId) : undefined;
    const st = engine.store.getState();
    if (!spec || !isInstalled(spec) || st.status !== 'unmounted' || st.crashedModelId) {
      setAuto(null);
      return;
    }
    setAuto({ id: spec.id, name: spec.name, done: false });
    void engine.mount(spec).finally(() => setAuto((a) => (a ? { ...a, done: true } : a)));
  }, [boot.stage, auto, ready, settings.activeModelId]);

  // Auto-purge ran at launch: say so once (Settings > Security decides the age).
  useEffect(() => {
    if (boot.stage === 'done' && boot.purgedChats > 0) showToast(`Deleted ${boot.purgedChats} old chat${boot.purgedChats === 1 ? '' : 's'} (auto-delete in Settings > Security).`);
  }, [boot.stage, boot.purgedChats]);

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

  const dataReady = settings.loaded && storage.status !== 'loading' && boot.stage === 'done';
  const gated = dataReady && !ready;

  // First time through the storage gate -> send the user straight to the Model Vault (they have no model yet).
  useEffect(() => {
    if (gated) wasGated.current = true;
    if (ready && wasGated.current) {
      wasGated.current = false;
      push('models');
    }
  }, [gated, ready]);

  const location = storage.config ? describeLocation(storage.config) : null;

  let body: React.ReactNode;
  if (!device.supported) body = <EmptyState brand title="This phone cannot run CHIWIWI" body={device.unsupportedReason ?? 'This device is not supported.'} />;
  else if (!dataReady || !security.loaded) body = <BootStageView stage={boot.stage} securityLoaded={security.loaded} voiceLoaded={voice.loaded} auto={auto} location={location} />;
  else if (!ready) body = <OnboardingScreen />;
  else body = <RouteStack />;

  return (
    <View style={s.root} onLayout={hideSplash}>
      {body}
      <ToastHost />
      <LockScreen />
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
}));
